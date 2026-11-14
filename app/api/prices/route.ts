import { NextResponse } from "next/server";
import { INITIAL_MARKET_PRICES } from "@/lib/baselines";

export const revalidate = 300;

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

async function fetchYahooSymbol(symbol: string): Promise<{
  price: number | null;
  changePct: number;
  closes: number[];
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?interval=1d&range=35d";
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
      next: { revalidate: 300 },
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
      item.meta?.chartPreviousClose ??
      (closes.length > 1 ? closes[closes.length - 2] : price);
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
    logRets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
  const variance =
    logRets.reduce((acc, r) => acc + (r - mean) * (r - mean), 0) /
    (logRets.length - 1);
  return Math.sqrt(variance * 365.0);
}

async function fetchCoinGeckoBtc(): Promise<{ price: number | null; changePct: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
      { signal: controller.signal, next: { revalidate: 300 } }
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
  const symbols = ["BTC-USD", "ASST", "MSTR", "SATA", "STRF", "STRC", "STRK", "STRD"];
  const results = await Promise.all(symbols.map((s) => fetchYahooSymbol(s)));
  const bySym: Record<string, { price: number | null; changePct: number; closes: number[] }> = {};
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

  const realizedVol30d = computeAnnualizedRealizedVol(bySym["BTC-USD"].closes);

  const payload = {
    source: feedSource,
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
      STRF_STRE: bySym["STRF"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRF_STRE,
      STRC: bySym["STRC"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRC,
      STRK: bySym["STRK"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRK,
      STRD: bySym["STRD"].price ?? INITIAL_MARKET_PRICES.preferredQuotes.STRD,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
