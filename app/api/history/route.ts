import { NextResponse } from "next/server";
import { HISTORICAL_SEED } from "@/lib/baselines";
import { fetchSheetHistory } from "@/lib/google-sheets";

export const revalidate = 120;

export async function GET() {
  try {
    const sheetHistory = await fetchSheetHistory();
    return NextResponse.json(
      {
        source: sheetHistory.source,
        seed: HISTORICAL_SEED,
        intraday: sheetHistory.intraday,
        daily: sheetHistory.daily,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({
      source: "seed_only",
      warning: message,
      seed: HISTORICAL_SEED,
      intraday: [],
      daily: [],
      fetchedAt: new Date().toISOString(),
    });
  }
}
