import crypto from "node:crypto";
import { unstable_cache } from "next/cache";
import {
  DEFAULT_MODEL_CONFIG,
  INITIAL_ASST_BS,
  INITIAL_MSTR_BS,
} from "./baselines";
import {
  resolveDebtPutYears,
  type ModelConfig,
  type PreferredTranche,
  type TreasuryBalanceSheet,
} from "./v31-alpha-engine";

export interface SnapshotLedgerRow {
  timestamp_utc: string;
  ticker: string;
  filing_effective_date: string;
  btc_price: number;
  live_stock_price: number;
  sigma_used: number;
  s0_m: number;
  cebe_per_sh: number;
  unencumbered_sats_per_sh: number;
  carry_debt_adj_per_sh: number;
  leland_put_per_sh: number;
  haircuts_per_sh: number;
  fair_value_per_sh: number;
  growth_premium_per_sh: number;
  annual_hurdle_pct: number;
  implied_btc_vol_pct: number;
  delta_net: number;
  e_model_m: number;
  senior_claims_m: number;
  dil_total_m: number;
  alpha_solv: number;
  tranche_prices_json: string;
}

type SheetConstantsResult = {
  source: "google_sheets" | "baseline_fallback";
  config: ModelConfig;
  asst: TreasuryBalanceSheet;
  mstr: TreasuryBalanceSheet;
  filingHistory: Record<
    string,
    Array<{
      effectiveDate: string;
      btcHoldings: number;
      basicShares: number;
      filingStamp: string;
    }>
  >;
  syncedAt: string;
};

type SheetHistoryResult = {
  source: "google_sheets" | "seed_only";
  intraday: SnapshotLedgerRow[];
  daily: SnapshotLedgerRow[];
};

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;
let lastGoodConstants: SheetConstantsResult | null = null;
let lastGoodHistory: SheetHistoryResult | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = 6000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(rawKey: string): string {
  let cleaned = rawKey.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  if (!cleaned.includes("BEGIN PRIVATE KEY")) {
    try {
      const decoded = Buffer.from(cleaned, "base64").toString("utf8");
      if (decoded.includes("BEGIN PRIVATE KEY")) {
        cleaned = decoded;
      }
    } catch {
      // Keep original string if not base64
    }
  }
  return cleaned.replace(/\\n/g, "\n");
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY
  );
}

async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAtMs - 60_000) {
    return cachedAccessToken.token;
  }
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !rawPrivateKey) {
    throw new Error("Missing Google Service Account credentials.");
  }
  const privateKey = normalizePrivateKey(rawPrivateKey);
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const unsignedJwt = header + "." + claimSet;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = base64UrlEncode(signer.sign(privateKey));
  const assertion = unsignedJwt + "." + signature;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetchWithTimeout(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    },
    5000
  );

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error("Google OAuth token exchange failed: " + errTxt);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

function rowsToObjects(values?: string[][]): Array<Record<string, string>> {
  if (!values || values.length < 2) return [];
  const headers = values[0].map((h) => String(h || "").trim());
  const out: Array<Record<string, string>> = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.every((cell) => String(cell || "").trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) {
        obj[headers[c]] = row[c] !== undefined ? String(row[c]).trim() : "";
      }
    }
    out.push(obj);
  }
  return out;
}

function toNum(val: string | undefined, fallback: number = 0): number {
  if (val === undefined || val === "") return fallback;
  const cleaned = val.replace(/[$,%\s,]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(val: string | undefined, fallback: boolean = false): boolean {
  if (!val) return fallback;
  const upper = val.trim().toUpperCase();
  if (upper === "TRUE" || upper === "1" || upper === "YES") return true;
  if (upper === "FALSE" || upper === "0" || upper === "NO") return false;
  return fallback;
}

function buildBaselineConstants(): SheetConstantsResult {
  return {
    source: "baseline_fallback",
    config: DEFAULT_MODEL_CONFIG,
    asst: {
      ...INITIAL_ASST_BS,
      debtPutYears: resolveDebtPutYears(INITIAL_ASST_BS),
    },
    mstr: {
      ...INITIAL_MSTR_BS,
      debtPutYears: resolveDebtPutYears(INITIAL_MSTR_BS),
    },
    filingHistory: {
      ASST: [
        {
          effectiveDate: INITIAL_ASST_BS.effectiveDate,
          btcHoldings: INITIAL_ASST_BS.btcHoldings,
          basicShares: INITIAL_ASST_BS.basicShares,
          filingStamp: INITIAL_ASST_BS.filingStamp,
        },
      ],
      MSTR: [
        {
          effectiveDate: INITIAL_MSTR_BS.effectiveDate,
          btcHoldings: INITIAL_MSTR_BS.btcHoldings,
          basicShares: INITIAL_MSTR_BS.basicShares,
          filingStamp: INITIAL_MSTR_BS.filingStamp,
        },
      ],
    },
    syncedAt: new Date().toISOString(),
  };
}

async function loadSheetConstantsUncached(): Promise<SheetConstantsResult> {
  const sheetId = process.env.GOOGLE_SHEET_ID as string;
  const token = await getGoogleAccessToken();
  const url =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    encodeURIComponent(sheetId) +
    "/values:batchGet?ranges=Model_Config!A1:E50&ranges=Balance_Sheets!A1:R500&ranges=Preferred_Tranches!A1:K500";

  const res = await fetchWithTimeout(
    url,
    {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    },
    6000
  );

  if (!res.ok) {
    throw new Error("Sheets batchGet failed with status " + res.status);
  }

  const payload = (await res.json()) as {
    valueRanges?: Array<{ values?: string[][] }>;
  };
  const ranges = payload.valueRanges || [];
  const configRows = rowsToObjects(ranges[0]?.values);
  const bsRows = rowsToObjects(ranges[1]?.values);
  const prefRows = rowsToObjects(ranges[2]?.values);

  const cfgMap: Record<string, string> = {};
  for (const r of configRows) {
    if (r.param_key) cfgMap[r.param_key] = r.param_value;
  }

  const config: ModelConfig = {
    riskFreeRate: toNum(cfgMap.risk_free_rate, DEFAULT_MODEL_CONFIG.riskFreeRate),
    cycleHorizonYears: toNum(
      cfgMap.cycle_horizon_years,
      DEFAULT_MODEL_CONFIG.cycleHorizonYears
    ),
    sigmaCycleAnchor: toNum(
      cfgMap.sigma_cycle_anchor,
      DEFAULT_MODEL_CONFIG.sigmaCycleAnchor
    ),
    sigmaLiveHvDefault: toNum(
      cfgMap.sigma_live_hv_default,
      DEFAULT_MODEL_CONFIG.sigmaLiveHvDefault
    ),
    solvencyCeilingRatio: toNum(
      cfgMap.solvency_ceiling_ratio,
      DEFAULT_MODEL_CONFIG.solvencyCeilingRatio
    ),
    engineVersion: cfgMap.engine_version || DEFAULT_MODEL_CONFIG.engineVersion,
  };

  const buildTickerBs = (
    ticker: "ASST" | "MSTR",
    fallbackBs: TreasuryBalanceSheet
  ): TreasuryBalanceSheet => {
    const matchingBs = bsRows
      .filter(
        (r) =>
          (r.ticker || "").toUpperCase() === ticker &&
          toBool(r.is_active, true)
      )
      .sort((a, b) =>
        (a.effective_date || "").localeCompare(b.effective_date || "")
      );

    const latestBs = matchingBs[matchingBs.length - 1];
    if (!latestBs) {
      return { ...fallbackBs, debtPutYears: resolveDebtPutYears(fallbackBs) };
    }

    const activePrefsById = new Map<string, Record<string, string>>();
    const matchingPrefs = prefRows
      .filter(
        (r) =>
          (r.ticker || "").toUpperCase() === ticker &&
          toBool(r.is_active, true)
      )
      .sort((a, b) =>
        (a.effective_date || "").localeCompare(b.effective_date || "")
      );

    for (const pr of matchingPrefs) {
      if (pr.tranche_id) activePrefsById.set(pr.tranche_id, pr);
    }

    const fallbackPrefMap = new Map(
      fallbackBs.preferreds.map((p) => [p.name, p])
    );

    const preferreds: PreferredTranche[] =
      activePrefsById.size > 0
        ? Array.from(activePrefsById.values())
            .map((pr) => {
              const existing = fallbackPrefMap.get(pr.tranche_id);
              return {
                name: pr.tranche_id,
                label: existing?.label || pr.filing_notes || pr.tranche_id,
                tier: Math.round(toNum(pr.tier, existing?.tier || 1)),
                parTotal: toNum(pr.par_total_m, existing?.parTotal || 0),
                couponRate: toNum(
                  pr.coupon_rate,
                  existing?.couponRate || 0.1
                ),
                rho: toNum(pr.rho, existing?.rho || 0.09),
                lambdaBase: toNum(
                  pr.lambda_base,
                  existing?.lambdaBase || 0.7
                ),
                variableParCap: toBool(
                  pr.variable_par_cap,
                  existing?.variableParCap || false
                ),
                liveMarketPrice: existing?.liveMarketPrice,
              };
            })
            .sort((a, b) => a.tier - b.tier)
        : fallbackBs.preferreds;

    const assembled: TreasuryBalanceSheet = {
      ticker,
      companyName: fallbackBs.companyName,
      cik: fallbackBs.cik,
      effectiveDate: latestBs.effective_date || fallbackBs.effectiveDate,
      filingStamp: latestBs.filing_stamp || fallbackBs.filingStamp,
      btcHoldings: toNum(latestBs.btc_holdings, fallbackBs.btcHoldings),
      cashReserves: toNum(latestBs.cash_reserves_m, fallbackBs.cashReserves),
      basicShares: toNum(latestBs.basic_shares_m, fallbackBs.basicShares),
      equityIv30d: toNum(latestBs.equity_iv_30d, fallbackBs.equityIv30d),
      debtPutFace: toNum(latestBs.debt_put_face_m, fallbackBs.debtPutFace),
      debtPutCoupon: toNum(
        latestBs.debt_put_coupon_m,
        fallbackBs.debtPutCoupon
      ),
      debtPutMaturityDate:
        latestBs.debt_put_maturity_date !== undefined
          ? latestBs.debt_put_maturity_date
          : fallbackBs.debtPutMaturityDate,
      debtPutYears: fallbackBs.debtPutYears,
      debtLongFace: toNum(latestBs.debt_long_face_m, fallbackBs.debtLongFace),
      debtLongCoupon: toNum(
        latestBs.debt_long_coupon_m,
        fallbackBs.debtLongCoupon
      ),
      convNoteShares: toNum(
        latestBs.conv_note_shares_m,
        fallbackBs.convNoteShares
      ),
      convNoteStrike: toNum(
        latestBs.conv_note_strike,
        fallbackBs.convNoteStrike
      ),
      strkParInTiers: toNum(
        latestBs.strk_par_in_tiers_m,
        fallbackBs.strkParInTiers
      ),
      preferreds,
    };
    assembled.debtPutYears = resolveDebtPutYears(assembled);
    return assembled;
  };

  const buildHistoryList = (ticker: string) =>
    bsRows
      .filter(
        (r) =>
          (r.ticker || "").toUpperCase() === ticker &&
          toBool(r.is_active, true)
      )
      .sort((a, b) =>
        (a.effective_date || "").localeCompare(b.effective_date || "")
      )
      .map((r) => ({
        effectiveDate: r.effective_date || "",
        btcHoldings: toNum(r.btc_holdings, 0),
        basicShares: toNum(r.basic_shares_m, 0),
        filingStamp: r.filing_stamp || "",
      }));

  return {
    source: "google_sheets",
    config,
    asst: buildTickerBs("ASST", INITIAL_ASST_BS),
    mstr: buildTickerBs("MSTR", INITIAL_MSTR_BS),
    filingHistory: {
      ASST: buildHistoryList("ASST"),
      MSTR: buildHistoryList("MSTR"),
    },
    syncedAt: new Date().toISOString(),
  };
}

const getCachedSheetConstants = unstable_cache(
  loadSheetConstantsUncached,
  ["alpha-engine-sheet-constants-v31"],
  { revalidate: 300 }
);

export async function fetchSheetConstants(): Promise<SheetConstantsResult> {
  if (!isGoogleSheetsConfigured()) {
    return buildBaselineConstants();
  }
  try {
    const data = await getCachedSheetConstants();
    lastGoodConstants = data;
    return data;
  } catch {
    if (lastGoodConstants) return lastGoodConstants;
    return buildBaselineConstants();
  }
}

function parseSnapshotRows(
  rawRows: Array<Record<string, string>>
): SnapshotLedgerRow[] {
  return rawRows.map((r) => ({
    timestamp_utc: r.timestamp_utc || "",
    ticker: r.ticker || "",
    filing_effective_date: r.filing_effective_date || "",
    btc_price: toNum(r.btc_price),
    live_stock_price: toNum(r.live_stock_price),
    sigma_used: toNum(r.sigma_used),
    s0_m: toNum(r.s0_m),
    cebe_per_sh: toNum(r.cebe_per_sh),
    unencumbered_sats_per_sh: toNum(r.unencumbered_sats_per_sh),
    carry_debt_adj_per_sh: toNum(r.carry_debt_adj_per_sh),
    leland_put_per_sh: toNum(r.leland_put_per_sh),
    haircuts_per_sh: toNum(r.haircuts_per_sh),
    fair_value_per_sh: toNum(r.fair_value_per_sh),
    growth_premium_per_sh: toNum(r.growth_premium_per_sh),
    annual_hurdle_pct: toNum(r.annual_hurdle_pct),
    implied_btc_vol_pct: toNum(r.implied_btc_vol_pct),
    delta_net: toNum(r.delta_net),
    e_model_m: toNum(r.e_model_m),
    senior_claims_m: toNum(r.senior_claims_m),
    dil_total_m: toNum(r.dil_total_m),
    alpha_solv: toNum(r.alpha_solv, 1.0),
    tranche_prices_json: r.tranche_prices_json || "{}",
  }));
}

async function loadSheetHistoryUncached(): Promise<SheetHistoryResult> {
  const sheetId = process.env.GOOGLE_SHEET_ID as string;
  const token = await getGoogleAccessToken();
  const url =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    encodeURIComponent(sheetId) +
    "/values:batchGet?ranges=Intraday_Snapshots!A1:V1500&ranges=Daily_History!A1:V1500";

  const res = await fetchWithTimeout(
    url,
    {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    },
    6000
  );
  if (!res.ok) {
    throw new Error("Sheets history batchGet failed with status " + res.status);
  }
  const payload = (await res.json()) as {
    valueRanges?: Array<{ values?: string[][] }>;
  };
  const ranges = payload.valueRanges || [];
  return {
    source: "google_sheets",
    intraday: parseSnapshotRows(rowsToObjects(ranges[0]?.values)),
    daily: parseSnapshotRows(rowsToObjects(ranges[1]?.values)),
  };
}

const getCachedSheetHistory = unstable_cache(
  loadSheetHistoryUncached,
  ["alpha-engine-sheet-history-v31"],
  { revalidate: 120 }
);

export async function fetchSheetHistory(): Promise<SheetHistoryResult> {
  if (!isGoogleSheetsConfigured()) {
    return { source: "seed_only", intraday: [], daily: [] };
  }
  try {
    const data = await getCachedSheetHistory();
    lastGoodHistory = data;
    return data;
  } catch {
    if (lastGoodHistory) return lastGoodHistory;
    return { source: "seed_only", intraday: [], daily: [] };
  }
}

export async function appendSheetSnapshots(
  tabName: "Intraday_Snapshots" | "Daily_History",
  rows: SnapshotLedgerRow[]
): Promise<number> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID is not configured.");
  const token = await getGoogleAccessToken();

  const values = rows.map((r) => [
    r.timestamp_utc,
    r.ticker,
    r.filing_effective_date,
    Number(r.btc_price.toFixed(2)),
    Number(r.live_stock_price.toFixed(2)),
    Number(r.sigma_used.toFixed(4)),
    Number(r.s0_m.toFixed(4)),
    Number(r.cebe_per_sh.toFixed(4)),
    Math.round(r.unencumbered_sats_per_sh),
    Number(r.carry_debt_adj_per_sh.toFixed(4)),
    Number(r.leland_put_per_sh.toFixed(4)),
    Number(r.haircuts_per_sh.toFixed(4)),
    Number(r.fair_value_per_sh.toFixed(4)),
    Number(r.growth_premium_per_sh.toFixed(4)),
    Number(r.annual_hurdle_pct.toFixed(4)),
    Number(r.implied_btc_vol_pct.toFixed(4)),
    Number(r.delta_net.toFixed(6)),
    Number(r.e_model_m.toFixed(4)),
    Number(r.senior_claims_m.toFixed(4)),
    Number(r.dil_total_m.toFixed(4)),
    Number(r.alpha_solv.toFixed(6)),
    r.tranche_prices_json,
  ]);

  const url =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    encodeURIComponent(sheetId) +
    "/values/" +
    encodeURIComponent(tabName + "!A1:V1") +
    ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS";

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
      cache: "no-store",
    },
    8000
  );

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error("Sheets append failed (" + tabName + "): " + errTxt);
  }
  return values.length;
}
