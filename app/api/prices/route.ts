import { NextResponse } from "next/server";
import { INITIAL_MARKET_PRICES } from "@/lib/baselines";

export const dynamic = "force-dynamic";

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
  };
  indicators?: {
    quote?: Array<{ close?: Array<number | null> }>;
  };
}

const YAHOO_HOSTS = [
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
] as const;

async function fetchYahooFromHost(
  host: string,
  symbol: string
): Promise<{ price: number | null; changePct: number; closes: number[] } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const url =
      `https://${host}/v8/finance/chart/` +
      encodeURIComponent(symbol) +
      "?interval=1d&range=35d";
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const json = (await res.json()) as {
      chart?: { result?: YahooChartResult[] };
    };
    const item = json.chart?.result?.[0];
    if (!item) return null;

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
      item.meta?.chartPreviousClose ??
      (closes.length > 1 ? closes[closes.length - 2] : price);
    const changePct =
      price && prev && prev > 0 ? ((price - prev) / prev) * 100 : 0;

    return { price, changePct, closes };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchYahooSymbol(symbol: string): Promise<{
  price: number | null;
  changePct: number;
  closes: number[];
}> {
  for (const host of YAHOO_HOSTS) {
    const hit = await fetchYahooFromHost(host, symbol);
    if (hit && hit.price !== null) return hit;
  }
  return { price: null, changePct: 0, closes: [] };
}

function computeAnnualizedRealizedVol(closes: number[]): number | null {
  // Exclude trailing partial intraday UTC bar and use last 30 completed daily returns
  const completed =
    closes.length > 20 ? closes.slice(0, -1).slice(-31) : closes;
  if (completed.length < 15) return null;

  const logRets: number[] = [];
  for (let i = 1; i < completed.length; i++) {
    logRets.push(Math.log(completed[i] / completed[i - 1]));
  }
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
      { signal: controller.signal, cache: "no-store" }
    );
    clearTimeout(timer);
    if (!res.ok) return { price: null, changePct: 0 };
    const data = (await res.json()) as {
      bitcoin?: { usd?: number; usd_24h_change?: number };
    };
    return {
      price: typeof data.bitcoin?.usd === "number" ? data.bitcoin.usd : null,
      changePct: Number(data.bitcoin?.usd_24h_change || 0),
    };
  } catch {
    clearTimeout(timer);
    return { price: null, changePct: 0 };
  }
}

export async function GET() {
  const symbols = [
    "BTC-USD",
    "ASST",
    "MSTR",
    "SATA",
    "STRF",
    "STRC",
    "STRK",
    "STRD",
  ];
  const results = await Promise.all(symbols.map((s) => fetchYahooSymbol(s)));
  const bySym: Record<
    string,
    { price: number | null; changePct: number; closes: number[] }
  > = {};
  symbols.forEach((s, idx) => {
    bySym[s] = results[idx];
  });

  let btcPrice = bySym["BTC-USD"].price;
  let btcChange24h = bySym["BTC-USD"].changePct;
  let feedSource = "yahoo_finance";

  if (!btcPrice) {
    const cg = await fetchCoinGeckoBtc();
    if (cg.price) {
      btcPrice = cg.price;
      btcChange24h = cg.changePct;
      feedSource = "coingecko_plus_fallback";
    } else {
      btcPrice = INITIAL_MARKET_PRICES.btc;
      feedSource = "verified_baseline";
    }
  }

  const partialFallback =
    bySym["ASST"].price === null || bySym["MSTR"].price === null;
  const isDegraded = feedSource === "verified_baseline" || partialFallback;

  const realizedVol30d = computeAnnualizedRealizedVol(
    bySym["BTC-USD"].closes
  );

  const payload = {
    source: feedSource,
    partialFallback,
    updatedAt: new Date().toISOString(),
    btc: btcPrice,
    btcChange24h,
    btcRealizedVol30d: realizedVol30d,
    asst: bySym["ASST"].price ?? INITIAL_MARKET_PRICES.asst,
    asstChangePct: bySym["ASST"].changePct,
    mstr: bySym["MSTR"].price ?? INITIAL_MARKET_PRICES.mstr,
    mstrChangePct: bySym["MSTR"].changePct,
    preferredQuotes: {
      SATA: bySym["SATA"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.SATA,
      SATS: INITIAL_MARKET_PRICES.preferredQuotes.SATS,
      STRF_STRE:
        bySym["STRF"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRF_STRE,
      STRC: bySym["STRC"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRC,
      STRK: bySym["STRK"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRK,
      STRD: bySym["STRD"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRD,
    },
  };

  const cdnCacheHeader = isDegraded
    ? "public, s-maxage=15, stale-while-revalidate=30"
    : "public, s-maxage=60, stale-while-revalidate=240, stale-if-error=3600";

  return NextResponse.json(payload, {
    headers: {
      "CDN-Cache-Control": cdnCacheHeader,
      "Cache-Control": isDegraded
        ? "public, max-age=5, s-maxage=15"
        : "public, max-age=15, s-maxage=60, stale-while-revalidate=240",
    },
  });
}
