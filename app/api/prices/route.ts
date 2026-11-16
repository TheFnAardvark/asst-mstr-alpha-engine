import { NextResponse } from "next/server";
import { INITIAL_MARKET_PRICES } from "@/lib/baselines";

export const revalidate = 60;

type MarketSession = "OVERNIGHT" | "PRE" | "REGULAR" | "POST" | "CLOSED";

interface QuoteSnapshot {
  price: number | null;
  regularPrice: number | null;
  changePct: number;
  extChangePct: number;
  session: MarketSession;
}

interface YahooV7QuoteItem {
  symbol?: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketPreviousClose?: number;
  preMarketPrice?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketTime?: number;
  overnightMarketPrice?: number;
  overnightMarketTime?: number;
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

const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const YAHOO_HEADERS = {
  "User-Agent": YAHOO_USER_AGENT,
  Accept: "application/json",
};

// Cached in module memory across warm Vercel invocations (30 min TTL)
let cachedYahooAuth: {
  cookie: string;
  crumb: string;
  expiresAt: number;
} | null = null;

function extractCookies(res: Response): string {
  const headersWithSetCookie = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const rawList =
    typeof headersWithSetCookie.getSetCookie === "function"
      ? headersWithSetCookie.getSetCookie()
      : [res.headers.get("set-cookie") || ""].filter(Boolean);

  return rawList
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function getYahooAuth(
  forceRefresh = false
): Promise<{ cookie: string; crumb: string } | null> {
  if (
    !forceRefresh &&
    cachedYahooAuth &&
    Date.now() < cachedYahooAuth.expiresAt
  ) {
    return cachedYahooAuth;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // Step 1: Grab Yahoo A3 session cookie (fc.yahoo.com intentionally returns 404 with Set-Cookie)
    let cookie = "";
    const fcRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": YAHOO_USER_AGENT },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
    cookie = extractCookies(fcRes);

    if (!cookie) {
      const homeRes = await fetch("https://finance.yahoo.com/quote/MSTR", {
        headers: { "User-Agent": YAHOO_USER_AGENT },
        cache: "no-store",
        signal: controller.signal,
      });
      cookie = extractCookies(homeRes);
    }

    if (!cookie) {
      clearTimeout(timer);
      return null;
    }

    // Step 2: Mint CSRF crumb tied to session cookie
    const crumbRes = await fetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      {
        headers: {
          "User-Agent": YAHOO_USER_AGENT,
          Cookie: cookie,
          Accept: "text/plain",
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("{") || crumb.length > 64) return null;

    cachedYahooAuth = {
      cookie,
      crumb,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    return cachedYahooAuth;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function parseYahooV7Item(q: YahooV7QuoteItem): QuoteSnapshot {
  const regPrice =
    typeof q.regularMarketPrice === "number" && q.regularMarketPrice > 0
      ? q.regularMarketPrice
      : null;
  const regTime = q.regularMarketTime ?? 0;
  const prevClose = q.regularMarketPreviousClose ?? regPrice;
  const state = (q.marketState || "").toUpperCase();

  if (state === "REGULAR") {
    const changePct =
      regPrice && prevClose && prevClose > 0
        ? ((regPrice - prevClose) / prevClose) * 100
        : 0;
    return {
      price: regPrice,
      regularPrice: regPrice,
      changePct,
      extChangePct: 0,
      session: "REGULAR",
    };
  }

  // Outside regular hours: pick whichever session has the newest trade timestamp >= regularMarketTime
  type Candidate = {
    session: MarketSession;
    price: number;
    time: number;
  };

  const candidates: Candidate[] = [];
  if (regPrice !== null) {
    candidates.push({ session: "REGULAR", price: regPrice, time: regTime });
  }

  const addExtCandidate = (
    session: MarketSession,
    p?: number,
    t?: number,
    stateMatches = false
  ) => {
    if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) return;
    const effectiveTime =
      typeof t === "number" && t > 0
        ? t
        : stateMatches
        ? regTime + 1
        : 0;
    if (effectiveTime >= regTime && effectiveTime > 0) {
      candidates.push({ session, price: p, time: effectiveTime });
    }
  };

  addExtCandidate(
    "POST",
    q.postMarketPrice,
    q.postMarketTime,
    state === "POST"
  );
  addExtCandidate(
    "OVERNIGHT",
    q.overnightMarketPrice,
    q.overnightMarketTime,
    state === "OVERNIGHT"
  );
  addExtCandidate("PRE", q.preMarketPrice, q.preMarketTime, state === "PRE");

  candidates.sort((a, b) => b.time - a.time);
  const winner = candidates[0];

  const activePrice = winner ? winner.price : regPrice;
  const nowSec = Math.floor(Date.now() / 1000);
  const isStaleWeekend =
    winner !== undefined &&
    nowSec - winner.time > 12 * 3600 &&
    state !== "REGULAR" &&
    state !== "PRE" &&
    state !== "POST" &&
    state !== "OVERNIGHT";

  let session: MarketSession = "CLOSED";
  if (isStaleWeekend) {
    session = "CLOSED";
  } else if (winner && winner.session !== "REGULAR") {
    session = winner.session;
  } else if (state === "OVERNIGHT") {
    session = "OVERNIGHT";
  } else if (state === "PRE") {
    session = "PRE";
  } else if (state === "POST") {
    session = "POST";
  }

  // Measure extended/overnight move relative to Friday's/prior 4 PM close when extended print is active
  const baseClose =
    winner && winner.session !== "REGULAR" && regPrice
      ? regPrice
      : prevClose;

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
    session,
  };
}

// Primary batch quote fetcher (includes Blue Ocean ATS 24/5 overnightMarketPrice)
async function fetchYahooV7BatchQuotes(
  symbols: readonly string[]
): Promise<Record<string, QuoteSnapshot> | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const auth = await getYahooAuth(attempt === 1);
    if (!auth) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const url =
        "https://query2.finance.yahoo.com/v7/finance/quote?symbols=" +
        encodeURIComponent(symbols.join(",")) +
        "&crumb=" +
        encodeURIComponent(auth.crumb);

      const res = await fetch(url, {
        headers: {
          ...YAHOO_HEADERS,
          Cookie: auth.cookie,
        },
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401 || res.status === 403) {
        cachedYahooAuth = null;
        continue;
      }
      if (!res.ok) return null;

      const json = (await res.json()) as {
        quoteResponse?: { result?: YahooV7QuoteItem[] };
      };
      const list = json.quoteResponse?.result;
      if (!Array.isArray(list) || list.length === 0) return null;

      const out: Record<string, QuoteSnapshot> = {};
      for (const item of list) {
        if (item.symbol) {
          out[item.symbol.toUpperCase()] = parseYahooV7Item(item);
        }
      }
      return out;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }
  return null;
}

// Keyless fallback for pre/post/regular if v7 crumb ever gets throttled
async function fetchYahooV8ExtendedFallback(
  symbol: string
): Promise<QuoteSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
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
    if (!res.ok) {
      return {
        price: null,
        regularPrice: null,
        changePct: 0,
        extChangePct: 0,
        session: "CLOSED",
      };
    }

    const json = (await res.json()) as {
      chart?: { result?: YahooChartResult[] };
    };
    const item = json.chart?.result?.[0];
    if (!item) {
      return {
        price: null,
        regularPrice: null,
        changePct: 0,
        extChangePct: 0,
        session: "CLOSED",
      };
    }

    const regPrice =
      typeof item.meta?.regularMarketPrice === "number" &&
      item.meta.regularMarketPrice > 0
        ? item.meta.regularMarketPrice
        : null;
    const regTime = item.meta?.regularMarketTime ?? 0;
    const prevClose =
      item.meta?.previousClose ?? item.meta?.chartPreviousClose ?? regPrice;

    const timestamps = item.timestamp || [];
    const rawCloses = item.indicators?.quote?.[0]?.close || [];

    let lastBarPrice: number | null = null;
    let lastBarTime = 0;
    for (let i = rawCloses.length - 1; i >= 0; i--) {
      const c = rawCloses[i];
      const t = timestamps[i];
      if (
        typeof c === "number" &&
        Number.isFinite(c) &&
        c > 0 &&
        typeof t === "number"
      ) {
        lastBarPrice = c;
        lastBarTime = t;
        break;
      }
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const period = item.meta?.currentTradingPeriod;

    let session: MarketSession = "CLOSED";
    if (
      period?.regular?.start &&
      period?.regular?.end &&
      nowSec >= period.regular.start &&
      nowSec < period.regular.end
    ) {
      session = "REGULAR";
    } else if (
      period?.pre?.start &&
      period?.pre?.end &&
      nowSec >= period.pre.start &&
      nowSec < period.pre.end
    ) {
      session = "PRE";
    } else if (
      period?.post?.start &&
      period?.post?.end &&
      nowSec >= period.post.start &&
      nowSec < period.post.end
    ) {
      session = "POST";
    }

    let activePrice = regPrice ?? lastBarPrice;
    let baseClose = prevClose;

    if (session === "PRE") {
      const hasPreTrade =
        lastBarPrice !== null &&
        period?.pre?.start !== undefined &&
        lastBarTime >= period.pre.start;
      activePrice = hasPreTrade ? lastBarPrice : regPrice;
      baseClose = hasPreTrade ? regPrice ?? prevClose : prevClose;
    } else if (session !== "REGULAR") {
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
      session,
    };
  } catch {
    clearTimeout(timer);
    return {
      price: null,
      regularPrice: null,
      changePct: 0,
      extChangePct: 0,
      session: "CLOSED",
    };
  }
}

// Daily 35d fetch strictly for BTC-USD (24/7 live price + 30d realized vol)
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
      typeof item.meta?.regularMarketPrice === "number"
        ? item.meta.regularMarketPrice
        : closes.length > 0
        ? closes[closes.length - 1]
        : null;

    const prev =
      item.meta?.previousClose ??
      (closes.length > 1
        ? closes[closes.length - 2]
        : item.meta?.chartPreviousClose ?? price);

    const changePct =
      price && prev && prev > 0 ? ((price - prev) / prev) * 100 : 0;

    return { price, changePct, closes };
  } catch {
    clearTimeout(timer);
    return { price: null, changePct: 0, closes: [] };
  }
}

function computeAnnualizedRealizedVol
