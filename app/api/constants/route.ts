import { NextResponse } from "next/server";
import {
  DEFAULT_MODEL_CONFIG,
  INITIAL_ASST_BS,
  INITIAL_MSTR_BS,
} from "@/lib/baselines";
import { fetchSheetConstants } from "@/lib/google-sheets";
import { resolveDebtPutYears } from "@/lib/v31-alpha-engine";

export const revalidate = 300;

export async function GET() {
  try {
    const data = await fetchSheetConstants();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        source: "baseline_fallback",
        warning: "Fell back to verified SEC baseline (" + message + ")",
        config: DEFAULT_MODEL_CONFIG,
        asst: { ...INITIAL_ASST_BS, debtPutYears: resolveDebtPutYears(INITIAL_ASST_BS) },
        mstr: { ...INITIAL_MSTR_BS, debtPutYears: resolveDebtPutYears(INITIAL_MSTR_BS) },
        filingHistory: {},
        syncedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
      }
    );
  }
}
