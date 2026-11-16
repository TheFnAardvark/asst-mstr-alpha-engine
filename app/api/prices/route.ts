import { NextResponse } from "next/server";
import { INITIAL_MARKET_PRICES } from "@/lib/baselines";

export const dynamic = "force-dynamic";

type MarketSession = "OVERNIGHT" | "PRE" | "REGULAR" | "POST" | "CLOSED";

interface QuoteSnapshot {
  price: number | null;
  regularPrice: number | null;
  changePct: number;
  extChangePct: number;
  session: MarketSession;
  provider: string;
}

interface RobinhoodQuoteItem {
  symbol?: string;
  last_trade_price?: string | null;
  last_extended_hours_trade_price?: string | null;
  last_non_reg_trade_price?: string | null;
  venue_last_trade_time?: string | null;
  venue_last_non_reg_trade_time?: string | null;
  previous_close?: string | null;
  adjusted_previous_close?: string | null;
  updated_at?: string | null;
}

interface TradingPeriodWindow {
  start?: number;
  end?: number;
}

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    currentTradingPeriod?: {
      pre?: TradingPeriodWindow;
      regular?: TradingPeriodWindow;
      post?: TradingPeriodWindow;
    };
  };
  timestamp?: Array<number | null>;
  indicators?: {
    quote?: Array<{ close?: Array<number | null> }>;
  };
}

const EMPTY_QUOTE: QuoteSnapshot = {
  price: null,
  regularPrice: null,
  changePct: 0,
  extChangePct: 0,
  session: "CLOSED",
  provider: "baseline",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const YAHOO_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
};

function toPosNum(val: unknown): number | null {
  if (typeof val === "number") {
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  if (typeof val === "string" && val.trim().length > 0) {
    const parsed = Number(val);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function toUnixSec(iso: unknown): number {
  if (typeof iso !== "string" || iso.length === 0) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

// Determine current US equity session in America/New_York (handles EST/EDT automatically)
function getCurrentEtSession(): MarketSession {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  // Saturday is closed all day
  if (weekday === "Sat") return "CLOSED";

  // Sunday opens at 8:00 PM ET (1200 mins) on Blue Ocean ATS
  if (weekday === "Sun") {
    return mins >= 20 * 60 ? "OVERNIGHT" : "CLOSED";
  }

  // Monday - Friday intraday & extended windows
  if (mins < 4 * 60) return "OVERNIGHT"; // 12:00 AM - 4:00 AM ET
  if (mins < 9 * 60 + 30) return "PRE"; // 4:00 AM - 9:30 AM ET
  if (mins < 16 * 60) return "REGULAR"; // 9:30 AM - 4:00 PM ET
  if (mins < 20 * 60) return "POST"; // 4:00 PM - 8:00 PM ET

  // After 8:00 PM ET: Friday closes for the weekend; Mon-Thu roll into Overnight
  return weekday === "Fri" ? "CLOSED" : "OVERNIGHT";
}

// Layer 1: Robinhood public 24/5 marketdata feed (includes Blue Ocean ATS 8 PM - 4 AM ET)
async function fetchRobinhood24hQuotes(
  symbols: readonly string[],
  etSession: MarketSession
): Promise<Record<string, QuoteSnapshot>> {
  const out: Record<string, QuoteSnapshot> = {};
  const joined = encodeURIComponent(symbols.join(","));
  const urls = [
    `https://api.robinhood.com/marketdata/quotes/?symbols=${joined}&bounds=24_5`,
    `https://api.robinhood.com/quotes/?symbols=${joined}&bounds=24_5`,
  ];

  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3800);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          Origin: "https://robinhood.com",
          Referer: "https://robinhood.com/",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const json = (await res.json()) as {
        results?: Array<RobinhoodQuoteItem | null>;
      };
      if (!Array.isArray(json.results) || json.results.length === 0) continue;

      for (const item of json.results) {
        if (!item || !item.symbol) continue;
        const sym = item.symbol.toUpperCase();

        const regPrice = toPosNum(item.last_trade_price);
        const nonRegPrice =
          toPosNum(item.last_non_reg_trade_price) ??
          toPosNum(item.last_extended_hours_trade_price);
        const prevClose =
          toPosNum(item.adjusted_previous_close) ??
          toPosNum(item.previous_close) ??
          regPrice;

        const regTime = toUnixSec(item.venue_last_trade_time);
        const nonRegTime =
          toUnixSec(item.venue_last_non_reg_trade_time) ||
          (etSession !== "REGULAR" && nonRegPrice !== null
            ? toUnixSec(item.updated_at)
            : 0);

        const useNonReg =
          etSession !== "REGULAR" &&
          nonRegPrice !== null &&
          (regPrice === null || nonRegTime > regTime);

        const activePrice = useNonReg ? nonRegPrice : regPrice ?? nonRegPrice;
        if (activePrice === null) continue;

        // When an extended/overnight print is active, compare against the 4:00 PM regular close (matches TradingView 24h)
        const baseClose =
          useNonReg && regPrice !== null ? regPrice : prevClose;

        const changePct =
          baseClose && baseClose > 0
            ? ((activePrice - baseClose) / baseClose) * 100
            : 0;

        const extChangePct =
          regPrice && regPrice > 0 && activePrice !== regPrice
            ? ((activePrice - regPrice) / regPrice) * 100
            : 0;

        out[sym] = {
          price: activePrice,
          regularPrice: regPrice ?? activePrice,
          changePct,
          extChangePct,
          session: etSession,
          provider: useNonReg ? "robinhood_24_5_ext" : "robinhood_reg",
        };
      }

      if (Object.keys(out).length > 0) return out;
    } catch {
      clearTimeout(timer);
    }
  }

  return out;
}

// Layer 2: TradingView public Scanner API (reads BOATS:ASST & BOATS:MSTR directly during Overnight)
async function fetchTradingViewQuotes(
  etSession: MarketSession
): Promise<Record<string, QuoteSnapshot>> {
  const out: Record<string, QuoteSnapshot> = {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3800);

  try {
    const tickers = [
      "NASDAQ:ASST",
      "NASDAQ:MSTR",
      "NYSE:SATA",
      "AMEX:SATA",
      "NASDAQ:SATA",
      "NASDAQ:STRF",
      "NASDAQ:STRC",
      "NASDAQ:STRK",
      "NASDAQ:STRD",
      ...(etSession === "OVERNIGHT" ? ["BOATS:ASST", "BOATS:MSTR"] : []),
    ];

    const body = JSON.stringify({
      symbols: { tickers, query: { types: [] } },
      columns: [
        "close",
        "change",
        "premarket_close",
        "postmarket_close",
        "volume",
      ],
    });

    const res = await fetch("https://scanner.tradingview.com/america/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return out;

    const json = (await res.json()) as {
      data?: Array<{ s?: string; d?: Array<number | null> }>;
    };
    if (!Array.isArray(json.data)) return out;

    const primaryRows: Record<
      string,
      {
        close: number | null;
        change: number;
        preClose: number | null;
        postClose: number | null;
      }
    > = {};
    const boatsRows: Record<
      string,
      { close: number; change: number; volume: number }
    > = {};

    for (const row of json.data) {
      if (!row.s || !Array.isArray(row.d)) continue;
      const parts = row.s.split(":");
      const exchange = (parts[0] || "").toUpperCase();
      const sym = (parts[1] || "").toUpperCase();
      if (!sym) continue;

      const close = toPosNum(row.d[0]);
      const change = typeof row.d[1] === "number" ? row.d[1] : 0;
      const preClose = toPosNum(row.d[2]);
      const postClose = toPosNum(row.d[3]);
      const volume = typeof row.d[4] === "number" ? row.d[4] : 0;

      if (exchange === "BOATS") {
        if (close !== null && volume > 0) {
          boatsRows[sym] = { close, change, volume };
        }
      } else if (close !== null) {
        primaryRows[sym] = { close, change, preClose, postClose };
      }
    }

    for (const [sym, base] of Object.entries(primaryRows)) {
      const regPrice = base.close;
      if (regPrice === null) continue;

      let activePrice = regPrice;
      let changePct = base.change;
      let provider = "tradingview_rth";

      const boats = boatsRows[sym];
      if (etSession === "OVERNIGHT" && boats) {
        activePrice = boats.close;
        changePct = ((activePrice - regPrice) / regPrice) * 100;
        provider = "tradingview_boats";
      } else if (etSession === "PRE" && base.preClose !== null) {
        activePrice = base.preClose;
        changePct = ((activePrice - regPrice) / regPrice) * 100;
        provider = "tradingview_pre";
      } else if (
        (etSession === "POST" ||
          etSession === "CLOSED" ||
          etSession === "OVERNIGHT") &&
        base.postClose !== null
      ) {
        activePrice = base.postClose;
        changePct = ((activePrice - regPrice) / regPrice) * 100;
        provider = "tradingview_post";
      }

      const extChangePct =
        activePrice !== regPrice
          ? ((activePrice - regPrice) / regPrice) * 100
          : 0;

      out[sym] = {
        price: activePrice,
        regularPrice: regPrice,
        changePct,
        extChangePct,
        session: etSession,
        provider,
      };
    }

    return out;
  } catch {
    clearTimeout(timer);
    return out;
  }
}

// Layer 3: Keyless Yahoo v8 chart fallback (regular + pre + post)
async function fetchYahooV8Fallback(
  symbol: string,
  etSession: MarketSession
): Promise<QuoteSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3800);
  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?interval=5m&range=1d&includePrePost=true";
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return EMPTY_QUOTE;

    const json = (await res.json()) as {
      chart?: { result?: YahooChartResult[] };
    };
    const item = json.chart?.result?.[0];
    if (!item) return EMPTY_QUOTE;

    const regPrice = toPosNum(item.meta?.regularMarketPrice);
    const regTime = item.meta?.regularMarketTime ?? 0;
    const prevClose =
      toPosNum(item.meta?.previousClose) ??
      toPosNum(item.meta?.chartPreviousClose) ??
      regPrice;

    const timestamps = item.timestamp || [];
    const rawCloses = item.indicators?.quote?.[0]?.close || [];

    let lastBarPrice: number | null = null;
    let lastBarTime = 0;
    for (let i = rawCloses.length - 1; i >= 0; i--) {
      const c = toPosNum(rawCloses[i]);
      const t = timestamps[i];
      if (c !== null && typeof t === "number") {
        lastBarPrice = c;
        lastBarTime = t;
        break;
      }
    }

    const period = item.meta?.currentTradingPeriod;
    let activePrice = regPrice ?? lastBarPrice;
    let baseClose = prevClose;

    if (etSession === "PRE") {
      const hasPreTrade =
        lastBarPrice !== null &&
        period?.pre?.start !== undefined &&
        lastBarTime >= period.pre.start;
      activePrice = hasPreTrade ? lastBarPrice : regPrice;
      baseClose = hasPreTrade ? regPrice ?? prevClose : prevClose;
    } else if (etSession !== "REGULAR") {
      const hasPostTrade =
        lastBarPrice !== null &&
        ((period?.post?.start !== undefined &&
          lastBarTime >= period.post.start) ||
          (regTime > 0 && lastBarTime > regTime + 60));
      activePrice = hasPostTrade ? lastBarPrice : regPrice ?? lastBarPrice;
      baseClose = hasPostTrade ? regPrice ?? prevClose : prevClose;
    }

    const changePct =
      activePrice && baseClose && baseClose > 0
        ? ((activePrice - baseClose) / baseClose) * 100
        : 0;

    const extChangePct =
      activePrice && regPrice && regPrice > 0 && activePrice !== regPrice
        ? ((activePrice - regPrice) / regPrice) * 100
        : 0;

    return {
      price: activePrice,
      regularPrice: regPrice,
      changePct,
      extChangePct,
      session: etSession,
      provider: "yahoo_v8",
    };
  } catch {
    clearTimeout(timer);
    return EMPTY_QUOTE;
  }
}

async function fetchYahooBtcDaily(): Promise<{
  price: number | null;
  changePct: number;
  closes: number[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=1d&range=35d";
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { price: null, changePct: 0, closes: [] };

    const json = (await res.json()) as {
      chart?: { result?: YahooChartResult[] };
    };
    const item = json.chart?.result?.[0];
    if (!item) return { price: null, changePct: 0, closes: [] };

    const rawCloses = item.indicators?.quote?.[0]?.close || [];
    const closes = rawCloses.filter(
      (c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0
    );

    const price =
      toPosNum(item.meta?.regularMarketPrice) ??
      (closes.length > 0 ? (closes[closes.length - 1] ?? null) : null);

    const prev =
      toPosNum(item.meta?.previousClose) ??
      (closes.length > 1
        ? (closes[closes.length - 2] ?? null)
        : toPosNum(item.meta?.chartPreviousClose) ?? price);

    const changePct =
      price && prev && prev > 0 ? ((price - prev) / prev) * 100 : 0;

    return { price, changePct, closes };
  } catch {
    clearTimeout(timer);
    return { price: null, changePct: 0, closes: [] };
  }
}

function computeAnnualizedRealizedVol(closes: number[]): number | null {
  if (closes.length < 15) return null;
  const logRets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (cur && prev) logRets.push(Math.log(cur / prev));
  }
  if (logRets.length < 2) return null;
  const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
  const variance =
    logRets.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) /
    (logRets.length - 1);
  return Math.sqrt(variance * 365.0);
}

async function fetchCoinGeckoBtc(): Promise<{
  price: number | null;
  changePct: number;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
      { cache: "no-store", signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return { price: null, changePct: 0 };
    const data = (await res.json()) as {
      bitcoin?: { usd?: number; usd_24h_change?: number };
    };
    return {
      price: toPosNum(data.bitcoin?.usd),
      changePct: Number(data.bitcoin?.usd_24h_change || 0),
    };
  } catch {
    clearTimeout(timer);
    return { price: null, changePct: 0 };
  }
}

export async function GET() {
  const equitySymbols = [
    "ASST",
    "MSTR",
    "SATA",
    "STRF",
    "STRC",
    "STRK",
    "STRD",
  ] as const;

  const etSession = getCurrentEtSession();

  const [btcResult, rhQuotes, tvQuotes] = await Promise.all([
    fetchYahooBtcDaily(),
    fetchRobinhood24hQuotes(equitySymbols, etSession),
    fetchTradingViewQuotes(etSession),
  ]);

  const bySym: Record<string, QuoteSnapshot> = {};

  // Priority during OVERNIGHT:
  // 1) Robinhood 24_5 extended print  2) TradingView BOATS print  3) Robinhood/TV regular or post  4) Yahoo v8
  for (const s of equitySymbols) {
    const rh = rhQuotes[s];
    const tv = tvQuotes[s];

    if (rh && rh.provider === "robinhood_24_5_ext") {
      bySym[s] = rh;
    } else if (tv && tv.provider === "tradingview_boats") {
      bySym[s] = tv;
    } else if (rh && rh.price !== null) {
      bySym[s] = rh;
    } else if (tv && tv.price !== null) {
      bySym[s] = tv;
    }
  }

  const missingSymbols = equitySymbols.filter((s) => !bySym[s]?.price);
  if (missingSymbols.length > 0) {
    const fallbacks = await Promise.all(
      missingSymbols.map((s) => fetchYahooV8Fallback(s, etSession))
    );
    missingSymbols.forEach((s, idx) => {
      bySym[s] = fallbacks[idx] ?? EMPTY_QUOTE;
    });
  }

  let btcPrice = btcResult.price;
  let btcChange24h = btcResult.changePct;
  let feedSource = "multi_24_5_overnight";

  if (!btcPrice) {
    const cg = await fetchCoinGeckoBtc();
    if (cg.price) {
      btcPrice = cg.price;
      btcChange24h = cg.changePct;
      feedSource = "coingecko_plus_24_5";
    } else {
      btcPrice = INITIAL_MARKET_PRICES.btc;
      feedSource = "verified_baseline";
    }
  }

  const realizedVol30d = computeAnnualizedRealizedVol(btcResult.closes);
  const asstQ = bySym["ASST"] ?? EMPTY_QUOTE;
  const mstrQ = bySym["MSTR"] ?? EMPTY_QUOTE;

  const quoteSources: Record<string, string> = {};
  for (const s of equitySymbols) {
    quoteSources[s] = bySym[s]?.provider ?? "baseline";
  }

  const payload = {
    source: feedSource,
    updatedAt: new Date().toISOString(),
    marketSession: etSession,
    quoteSources,
    btc: btcPrice,
    btcChange24h,
    btcRealizedVol30d: realizedVol30d,
    asst: asstQ.price ?? INITIAL_MARKET_PRICES.asst,
    asstRegularClose: asstQ.regularPrice ?? INITIAL_MARKET_PRICES.asst,
    asstChangePct: asstQ.changePct,
    asstExtChangePct: asstQ.extChangePct,
    mstr: mstrQ.price ?? INITIAL_MARKET_PRICES.mstr,
    mstrRegularClose: mstrQ.regularPrice ?? INITIAL_MARKET_PRICES.mstr,
    mstrChangePct: mstrQ.changePct,
    mstrExtChangePct: mstrQ.extChangePct,
    preferredQuotes: {
      SATA:
        (bySym["SATA"] ?? EMPTY_QUOTE).price ??
        INITIAL_MARKET_PRICES.preferredQuotes.SATA,
      SATS: INITIAL_MARKET_PRICES.preferredQuotes.SATS,
      STRF_STRE:
        (bySym["STRF"] ?? EMPTY_QUOTE).price ??
        INITIAL_MARKET_PRICES.preferredQuotes.STRF_STRE,
      STRC:
        (bySym["STRC"] ?? EMPTY_QUOTE).price ??
        INITIAL_MARKET_PRICES.preferredQuotes.STRC,
      STRK:
        (bySym["STRK"] ?? EMPTY_QUOTE).price ??
        INITIAL_MARKET_PRICES.preferredQuotes.STRK,
      STRD:
        (bySym["STRD"] ?? EMPTY_QUOTE).price ??
        INITIAL_MARKET_PRICES.preferredQuotes.STRD,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      "Vercel-CDN-Cache-Control":
        "public, s-maxage=60, stale-while-revalidate=60",
    },
  });
}
