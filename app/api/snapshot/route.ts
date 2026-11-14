import { NextRequest, NextResponse } from "next/server";
import {
  appendSheetSnapshots,
  fetchSheetConstants,
  isGoogleSheetsConfigured,
  type SnapshotLedgerRow,
} from "@/lib/google-sheets";
import {
  evaluateBalanceSheet,
  type TreasuryBalanceSheet,
} from "@/lib/v31-alpha-engine";
import { GET as getLivePrices } from "../prices/route";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const querySecret = req.nextUrl.searchParams.get("secret") || "";
  return bearer === expected || querySecret === expected;
}

function buildSnapshotRow(
  timestampUtc: string,
  bs: TreasuryBalanceSheet,
  btcPrice: number,
  stockPrice: number,
  sigma: number,
  r: number,
  tCycle: number,
  solvencyCap: number
): SnapshotLedgerRow {
  const res = evaluateBalanceSheet(
    bs,
    btcPrice,
    sigma,
    stockPrice,
    r,
    tCycle,
    solvencyCap
  );
  const roundedPrefs: Record<string, number> = {};
  for (const [k, v] of Object.entries(res.tranchePrices)) {
    roundedPrefs[k] = Number(v.toFixed(4));
  }
  return {
    timestamp_utc: timestampUtc,
    ticker: bs.ticker,
    filing_effective_date: bs.effectiveDate,
    btc_price: btcPrice,
    live_stock_price: stockPrice,
    sigma_used: sigma,
    s0_m: res.s0,
    cebe_per_sh: res.cebePerSh,
    unencumbered_sats_per_sh: res.unencumberedSatsPerSh,
    carry_debt_adj_per_sh: res.carryDebtAdjPerSh,
    leland_put_per_sh: res.lelandPutPerSh,
    haircuts_per_sh: res.haircutsPerSh,
    fair_value_per_sh: res.fairValuePerSh,
    growth_premium_per_sh: res.growthPremiumPerSh,
    annual_hurdle_pct: res.annualHurdlePct,
    implied_btc_vol_pct: res.impliedBtcVolPct,
    delta_net: res.deltaNet,
    e_model_m: res.eModel,
    senior_claims_m: res.seniorClaimsVal,
    dil_total_m: res.dilTotal,
    alpha_solv: res.alphaSolv,
    tranche_prices_json: JSON.stringify(roundedPrefs),
  };
}

async function handleSnapshot(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized — valid CRON_SECRET required." },
      { status: 401 }
    );
  }
  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets environment variables are not configured." },
      { status: 503 }
    );
  }

  const mode = (req.nextUrl.searchParams.get("mode") || "intraday").toLowerCase();
  const constants = await fetchSheetConstants();
  const priceRes = await getLivePrices();
  const prices = (await priceRes.json()) as {
    btc: number;
    asst: number;
    mstr: number;
  };

  const nowIso = new Date().toISOString();
  const sigma = constants.config.sigmaLiveHvDefault;
  const r = constants.config.riskFreeRate;
  const tCycle = constants.config.cycleHorizonYears;
  const cap = constants.config.solvencyCeilingRatio;

  const rows: SnapshotLedgerRow[] = [
    buildSnapshotRow(nowIso, constants.asst, prices.btc, prices.asst, sigma, r, tCycle, cap),
    buildSnapshotRow(nowIso, constants.mstr, prices.btc, prices.mstr, sigma, r, tCycle, cap),
  ];

  const targets: Array<"Intraday_Snapshots" | "Daily_History"> =
    mode === "daily"
      ? ["Daily_History"]
      : mode === "both"
      ? ["Intraday_Snapshots", "Daily_History"]
      : ["Intraday_Snapshots"];

  let totalAppended = 0;
  for (const tab of targets) {
    totalAppended += await appendSheetSnapshots(tab, rows);
  }

  return NextResponse.json({
    ok: true,
    timestamp: nowIso,
    targets,
    appendedRows: totalAppended,
    prices,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handleSnapshot(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
