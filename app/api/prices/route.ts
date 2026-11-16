import { NextResponse } from "next/server";
import { INITIAL_MARKET_PRICES } from "@/lib/baselines";

export const revalidate = 60;

type MarketSession = "PRE" | "REGULAR" | "POST" | "CLOSED";

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

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json",
};

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
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    clearTimeout(timer);
    if (!res.ok) return { price: null, changePct: 0, closes: [] };
    const json = (await res.json()) as {
      chart?: { result?: YahooChartResult[] };
    };
    const item = json.chart?.result?.[0];
    if (!item) return { price: null, changePct: 0, closes: [] };

    const raw
