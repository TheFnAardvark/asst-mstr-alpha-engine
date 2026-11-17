"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  RefreshCw,
  Sliders,
  ShieldCheck,
  TrendingUp,
  Layers,
  Database,
  Copy,
  Check,
  RotateCcw,
  PlusCircle,
  Terminal,
  Info,
  ChevronDown,
  ChevronUp,
  Play,
  BookOpen,
  Cpu,
  BarChart3,
  Clock,
  Zap,
  Lock,
  Unlock,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  evaluateBalanceSheet,
  executeInvariantSuite,
  type InvariantSuiteReport,
  type ModelConfig,
  type PreferredTranche,
  type TreasuryBalanceSheet,
  type ValuationResult,
} from "@/lib/v31-alpha-engine";
import {
  DEFAULT_MODEL_CONFIG,
  HISTORICAL_SEED,
  INITIAL_ASST_BS,
  INITIAL_MARKET_PRICES,
  INITIAL_MSTR_BS,
  type HistoricalSeedPoint,
} from "@/lib/baselines";
import {
  buildFullAuditBundle,
  buildLlmAuditPrompt,
  buildPythonVerifierScript,
  buildStateTraceMarkdown,
} from "@/lib/llm-audit";

interface ApiSnapshotRow {
  timestamp_utc: string;
  ticker: string;
  filing_effective_date: string;
  btc_price: number;
  live_stock_price: number;
  sigma_used: number;
  cebe_per_sh: number;
  unencumbered_sats_per_sh: number;
  fair_value_per_sh: number;
  annual_hurdle_pct: number;
}

interface PricesApiResponse {
  source: string;
  updatedAt: string;
  btc: number;
  btcChange24h: number;
  btcRealizedVol30d: number | null;
  asst: number;
  asstChangePct?: number;
  mstr: number;
  mstrChangePct?: number;
  preferredQuotes?: Record<string, number>;
}

interface ConstantsApiResponse {
  source: "google_sheets" | "baseline_fallback";
  warning?: string;
  config: ModelConfig;
  asst: TreasuryBalanceSheet;
  mstr: TreasuryBalanceSheet;
  syncedAt: string;
}

interface HistoryApiResponse {
  source: "google_sheets" | "seed_only";
  seed: HistoricalSeedPoint[];
  intraday: ApiSnapshotRow[];
  daily: ApiSnapshotRow[];
}

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

function fmtUsd(val: number | undefined, decimals: number = 2): string {
  const num = Number(val) || 0;
  const clean = Math.abs(num) < 1e-9 ? 0 : num;
  return (
    "$" +
    clean.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function fmtSignedUsd(val: number | undefined, decimals: number = 2): string {
  const num = Number(val) || 0;
  if (Math.abs(num) < 1e-9) {
    return "$0." + "0".repeat(decimals);
  }
  const sign = num > 0 ? "+" : "-";
  return (
    sign +
    "$" +
    Math.abs(num).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

function fmtInt(val: number | undefined): string {
  return Math.round(Number(val) || 0).toLocaleString("en-US");
}

function fmtPct(val: number | undefined, decimals: number = 1): string {
  const num = Number(val) || 0;
  return num.toFixed(decimals) + "%";
}

function calcCebeAmp(
  res: Pick<ValuationResult, "v0" | "s0" | "k0GrossPar">
): number | null {
  const netReserve = res.s0 - res.k0GrossPar;
  if (netReserve <= 0 || res.v0 <= 0) return null;
  return res.v0 / netReserve;
}

function calcStructuralAmp(
  res: Pick<ValuationResult, "v0" | "deltaNet" | "eModel">
): number | null {
  if (res.eModel <= 0 || res.v0 * res.deltaNet <= 0) return null;
  return (res.v0 * res.deltaNet) / res.eModel;
}

function fmtAmp(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "N/A";
  return val.toFixed(2) + "x";
}

async function copyTextSafe(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== "undefined") {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  }
  throw new Error("Clipboard unavailable");
}

function CustomChartTooltip({
  active,
  payload,
  label,
  unitPrefix = "",
  unitSuffix = "",
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  unitPrefix?: string;
  unitSuffix?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 font-mono text-xs shadow-2xl backdrop-blur-md">
      <div className="mb-1.5 border-b border-slate-800 pb-1 font-semibold text-slate-200">
        {label}
      </div>
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div
            key={(entry.dataKey || entry.name || "item") + "-" + idx}
            className="flex items-center justify-between gap-4 tabular-nums"
          >
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color || "#38bdf8" }}
              />
              {entry.name}:
            </span>
            <span className="font-bold text-white">
              {unitPrefix}
              {typeof entry.value === "number"
                ? entry.value.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })
                : entry.value}
              {unitSuffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AlphaDashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "command" | "yield" | "preferreds" | "sheet_audit"
  >("command");
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Collapsible LLM Math Audit Drawer state
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [auditSubTab, setAuditSubTab] = useState<"prompt" | "trace" | "python">(
    "prompt"
  );
  const [copiedAuditKey, setCopiedAuditKey] = useState<string | null>(null);
  const [showLedgerJson, setShowLedgerJson] = useState(false);

  // Backend Constants & Balance Sheet state
  const [modelConfig, setModelConfig] =
    useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [constantsSource, setConstantsSource] = useState<
    "google_sheets" | "baseline_fallback"
  >("baseline_fallback");
  const [serverAsstBs, setServerAsstBs] =
    useState<TreasuryBalanceSheet>(INITIAL_ASST_BS);
  const [serverMstrBs, setServerMstrBs] =
    useState<TreasuryBalanceSheet>(INITIAL_MSTR_BS);
  const [asstBs, setAsstBs] = useState<TreasuryBalanceSheet>(INITIAL_ASST_BS);
  const [mstrBs, setMstrBs] = useState<TreasuryBalanceSheet>(INITIAL_MSTR_BS);
  const [hasBsOverride, setHasBsOverride] = useState(false);

  // Live Market & Sandbox Override state
  const [liveFeedPrices, setLiveFeedPrices] = useState(INITIAL_MARKET_PRICES);
  const [btcPrice, setBtcPrice] = useState<number>(INITIAL_MARKET_PRICES.btc);
  const [asstPrice, setAsstPrice] = useState<number>(
    INITIAL_MARKET_PRICES.asst
  );
  const [mstrPrice, setMstrPrice] = useState<number>(
    INITIAL_MARKET_PRICES.mstr
  );
  const [preferredQuotes, setPreferredQuotes] = useState<
    Record<string, number>
  >(INITIAL_MARKET_PRICES.preferredQuotes);
  const [isSandboxOverride, setIsSandboxOverride] = useState(false);

  // Volatility & Model Parameters
  const [volMode, setVolMode] = useState<"hv" | "cycle" | "custom">("hv");
  const [customSigma, setCustomSigma] = useState<number>(
    DEFAULT_MODEL_CONFIG.sigmaLiveHvDefault
  );
  const [riskFreeRate, setRiskFreeRate] = useState<number>(
    DEFAULT_MODEL_CONFIG.riskFreeRate
  );
  const tCycle = modelConfig.cycleHorizonYears || 4.0;
  const hvSigma = modelConfig.sigmaLiveHvDefault || 0.423;
  const cycleSigma = modelConfig.sigmaCycleAnchor || 0.5;
  const solvencyCap = modelConfig.solvencyCeilingRatio || 0.95;

  const activeSigma =
    volMode === "hv" ? hvSigma : volMode === "cycle" ? cycleSigma : customSigma;

  // Live Polling & History Status
  const [feedStatus, setFeedStatus] = useState<"POLLING" | "LIVE" | "FALLBACK">(
    "LIVE"
  );
  const [lastPolledAt, setLastPolledAt] = useState<string>(
    "Syncing live feeds..."
  );
  const [sheetIntradayRows, setSheetIntradayRows] = useState<ApiSnapshotRow[]>(
    []
  );
  const [sheetDailyRows, setSheetDailyRows] = useState<ApiSnapshotRow[]>([]);
  const [localSnapshots, setLocalSnapshots] = useState<
    Array<{ date: string; btc: number; asst: number; mstr: number }>
  >([]);

  // Chart controls
  const [coneTarget, setConeTarget] = useState<"ASST" | "MSTR" | "INDEXED">(
    "ASST"
  );
  const [historyTimeframe, setHistoryTimeframe] = useState<
    "daily" | "intraday"
  >("daily");
  const [historyMetric, setHistoryMetric] = useState<
    "hurdle" | "amp" | "asst_val" | "mstr_val" | "sats"
  >("hurdle");
  const [sweepMode, setSweepMode] = useState<
    "sats" | "amp" | "equity_asst" | "equity_mstr"
  >("sats");
  const [prefChartIssuer, setPrefChartIssuer] = useState<
    "ALL" | "ASST" | "MSTR"
  >("ALL");

  // Invariant Torture Suite report
  const [auditReport, setAuditReport] = useState<InvariantSuiteReport>(() =>
    executeInvariantSuite(INITIAL_ASST_BS, INITIAL_MSTR_BS, 0.045, 4.0)
  );

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const syncAllServerData = useCallback(
    async (manual: boolean = false) => {
      setFeedStatus("POLLING");
      try {
        const [priceRes, constRes, histRes] = await Promise.all([
          fetch("/api/prices", { cache: "no-store" }),
          fetch("/api/constants", { cache: "no-store" }),
          fetch("/api/history", { cache: "no-store" }),
        ]);

        if (constRes.ok) {
          const cData = (await constRes.json()) as ConstantsApiResponse;
          setConstantsSource(cData.source);
          setModelConfig(cData.config);
          setServerAsstBs(cData.asst);
          setServerMstrBs(cData.mstr);
          if (!hasBsOverride) {
            setAsstBs(cData.asst);
            setMstrBs(cData.mstr);
          }
          if (!isSandboxOverride) {
            setRiskFreeRate(cData.config.riskFreeRate);
          }
        }

        if (histRes.ok) {
          const hData = (await histRes.json()) as HistoryApiResponse;
          setSheetIntradayRows(hData.intraday || []);
          setSheetDailyRows(hData.daily || []);
        }

        if (priceRes.ok) {
          const pData = (await priceRes.json()) as PricesApiResponse;
          const nextQuotes = {
            ...INITIAL_MARKET_PRICES.preferredQuotes,
            ...(pData.preferredQuotes || {}),
          };
          setLiveFeedPrices({
            btc: pData.btc,
            btcChange24h: pData.btcChange24h,
            asst: pData.asst,
            mstr: pData.mstr,
            preferredQuotes: nextQuotes,
          });
          setPreferredQuotes(nextQuotes);
          if (!isSandboxOverride || manual) {
            setBtcPrice(pData.btc);
            setAsstPrice(pData.asst);
            setMstrPrice(pData.mstr);
            if (manual) setIsSandboxOverride(false);
          }
          const stamp = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          setLastPolledAt("Synced " + stamp);
          setFeedStatus(
            pData.source === "verified_baseline" ? "FALLBACK" : "LIVE"
          );
          if (manual) {
            triggerToast(
              "Synced live market quotes: BTC " +
                fmtUsd(pData.btc) +
                " | ASST " +
                fmtUsd(pData.asst) +
                " | MSTR " +
                fmtUsd(pData.mstr)
            );
          }
        } else {
          setFeedStatus("FALLBACK");
        }
      } catch {
        setFeedStatus("FALLBACK");
        if (manual) {
          triggerToast("Network busy — using verified SEC & market baseline.");
        }
      }
    },
    [hasBsOverride, isSandboxOverride, triggerToast]
  );

  useEffect(() => {
    setMounted(true);
    syncAllServerData(false);
    const timer = setInterval(() => syncAllServerData(false), 300_000);
    return () => clearInterval(timer);
  }, [syncAllServerData]);

  // Core Memoized Engine Evaluations
  const asstActive = useMemo(
    () =>
      evaluateBalanceSheet(
        asstBs,
        btcPrice,
        activeSigma,
        asstPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [asstBs, btcPrice, activeSigma, asstPrice, riskFreeRate, tCycle, solvencyCap]
  );

  const mstrActive = useMemo(
    () =>
      evaluateBalanceSheet(
        mstrBs,
        btcPrice,
        activeSigma,
        mstrPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [mstrBs, btcPrice, activeSigma, mstrPrice, riskFreeRate, tCycle, solvencyCap]
  );

  const asstHv = useMemo(
    () =>
      evaluateBalanceSheet(
        asstBs,
        btcPrice,
        hvSigma,
        asstPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [asstBs, btcPrice, hvSigma, asstPrice, riskFreeRate, tCycle, solvencyCap]
  );

  const asstCycle = useMemo(
    () =>
      evaluateBalanceSheet(
        asstBs,
        btcPrice,
        cycleSigma,
        asstPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [asstBs, btcPrice, cycleSigma, asstPrice, riskFreeRate, tCycle, solvencyCap]
  );

  const mstrHv = useMemo(
    () =>
      evaluateBalanceSheet(
        mstrBs,
        btcPrice,
        hvSigma,
        mstrPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [mstrBs, btcPrice, hvSigma, mstrPrice, riskFreeRate, tCycle, solvencyCap]
  );

  const mstrCycle = useMemo(
    () =>
      evaluateBalanceSheet(
        mstrBs,
        btcPrice,
        cycleSigma,
        mstrPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [mstrBs, btcPrice, cycleSigma, mstrPrice, riskFreeRate, tCycle, solvencyCap]
  );

  // Chart 1: 4-Year Market-Implied Unencumbered Sats/Share Trajectory Cone
  const yieldConeData = useMemo(() => {
    const steps = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
    const aSats0 = asstActive.unencumberedSatsPerSh;
    const mSats0 = mstrActive.unencumberedSatsPerSh;
    const aHurdle = asstActive.annualHurdlePct / 100.0;
    const mHurdle = mstrActive.annualHurdlePct / 100.0;

    return steps.map((yr) => {
      if (coneTarget === "INDEXED") {
        return {
          yearLabel: yr === 0 ? "Today (Y0)" : "Year " + yr.toFixed(1),
          year: yr,
          asstImpliedIdx: Number((100 * Math.pow(1 + aHurdle, yr)).toFixed(2)),
          mstrImpliedIdx: Number((100 * Math.pow(1 + mHurdle, yr)).toFixed(2)),
          bench10Idx: Number((100 * Math.pow(1.1, yr)).toFixed(2)),
          bench20Idx: Number((100 * Math.pow(1.2, yr)).toFixed(2)),
          flatFloorIdx: 100,
        };
      }
      const sats0 = coneTarget === "ASST" ? aSats0 : mSats0;
      const hurdle = coneTarget === "ASST" ? aHurdle : mHurdle;
      const rawVaultSats =
        coneTarget === "ASST"
          ? asstActive.rawSatsPerSh
          : mstrActive.rawSatsPerSh;
      return {
        yearLabel: yr === 0 ? "Today (Y0)" : "Year " + yr.toFixed(1),
        year: yr,
        marketImplied: Math.round(sats0 * Math.pow(1 + hurdle, yr)),
        flatFloor: Math.round(sats0),
        bench10: Math.round(sats0 * Math.pow(1.1, yr)),
        bench20: Math.round(sats0 * Math.pow(1.2, yr)),
        rawGrossToday: Math.round(rawVaultSats),
      };
    });
  }, [coneTarget, asstActive, mstrActive]);

  // Chart 2: Merged Historical Series (Google Sheet Daily/Intraday + Seed + Live)
  const historicalSeries = useMemo(() => {
    const evaluateRawPoint = (
      label: string,
      btc: number,
      asstPx: number,
      mstrPx: number
    ) => {
      const aEval = evaluateBalanceSheet(
        asstBs,
        btc,
        activeSigma,
        asstPx,
        riskFreeRate,
        tCycle,
        solvencyCap
      );
      const mEval = evaluateBalanceSheet(
        mstrBs,
        btc,
        activeSigma,
        mstrPx,
        riskFreeRate,
        tCycle,
        solvencyCap
      );
      const aCebeAmp = calcCebeAmp(aEval);
      const mCebeAmp = calcCebeAmp(mEval);
      return {
        date: label,
        btc: Number(btc.toFixed(2)),
        asstPrice: asstPx,
        asstFair: Number(aEval.fairValuePerSh.toFixed(2)),
        asstCebe: Number(aEval.cebePerSh.toFixed(2)),
        asstHurdle: Number(aEval.annualHurdlePct.toFixed(2)),
        asstAmp: aCebeAmp !== null ? Number(aCebeAmp.toFixed(2)) : null,
        asstUnencSats: Math.round(aEval.unencumberedSatsPerSh),
        mstrPrice: mstrPx,
        mstrFair: Number(mEval.fairValuePerSh.toFixed(2)),
        mstrCebe: Number(mEval.cebePerSh.toFixed(2)),
        mstrHurdle: Number(mEval.annualHurdlePct.toFixed(2)),
        mstrAmp: mCebeAmp !== null ? Number(mCebeAmp.toFixed(2)) : null,
        mstrUnencSats: Math.round(mEval.unencumberedSatsPerSh),
      };
    };

    const pairSheetRows = (rows: ApiSnapshotRow[], sliceLen: number) => {
      const grouped = new Map<
        string,
        { asst?: ApiSnapshotRow; mstr?: ApiSnapshotRow }
      >();
      for (const r of rows) {
        const key = (r.timestamp_utc || "").slice(0, sliceLen);
        if (!key) continue;
        const prev = grouped.get(key) || {};
        if (r.ticker.toUpperCase() === "ASST") prev.asst = r;
        if (r.ticker.toUpperCase() === "MSTR") prev.mstr = r;
        grouped.set(key, prev);
      }
      return Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, pair]) => {
          const btc = pair.asst?.btc_price || pair.mstr?.btc_price || btcPrice;
          const aPx = pair.asst?.live_stock_price || asstPrice;
          const mPx = pair.mstr?.live_stock_price || mstrPrice;
          const label = sliceLen > 10 ? key.replace("T", " ") : key.slice(5);
          return evaluateRawPoint(label, btc, aPx, mPx);
        });
    };

    if (historyTimeframe === "intraday" && sheetIntradayRows.length > 0) {
      const intra = pairSheetRows(sheetIntradayRows, 16);
      const localPts = localSnapshots.map((s) =>
        evaluateRawPoint(s.date, s.btc, s.asst, s.mstr)
      );
      return [
        ...intra,
        ...localPts,
        evaluateRawPoint("Live", btcPrice, asstPrice, mstrPrice),
      ];
    }

    const byDate = new Map<string, ReturnType<typeof evaluateRawPoint>>();
    for (const s of HISTORICAL_SEED) {
      byDate.set(
        s.date,
        evaluateRawPoint(s.date.slice(5), s.btc, s.asst, s.mstr)
      );
    }
    if (sheetDailyRows.length > 0) {
      const groupedDaily = new Map<
        string,
        { asst?: ApiSnapshotRow; mstr?: ApiSnapshotRow }
      >();
      for (const r of sheetDailyRows) {
        const dKey = (r.timestamp_utc || "").slice(0, 10);
        if (!dKey) continue;
        const prev = groupedDaily.get(dKey) || {};
        if (r.ticker.toUpperCase() === "ASST") prev.asst = r;
        if (r.ticker.toUpperCase() === "MSTR") prev.mstr = r;
        groupedDaily.set(dKey, prev);
      }
      for (const [dKey, pair] of Array.from(groupedDaily.entries())) {
        const btc = pair.asst?.btc_price || pair.mstr?.btc_price || btcPrice;
        const aPx = pair.asst?.live_stock_price || asstPrice;
        const mPx = pair.mstr?.live_stock_price || mstrPrice;
        byDate.set(dKey, evaluateRawPoint(dKey.slice(5), btc, aPx, mPx));
      }
    }
    const sortedDaily = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, val]) => val);
    const localPts = localSnapshots.map((s) =>
      evaluateRawPoint(s.date, s.btc, s.asst, s.mstr)
    );
    return [
      ...sortedDaily,
      ...localPts,
      evaluateRawPoint("Live", btcPrice, asstPrice, mstrPrice),
    ];
  }, [
    asstBs,
    mstrBs,
    btcPrice,
    asstPrice,
    mstrPrice,
    activeSigma,
    riskFreeRate,
    tCycle,
    solvencyCap,
    historyTimeframe,
    sheetIntradayRows,
    sheetDailyRows,
    localSnapshots,
  ]);

  // Chart 3: BTC Price Sweep ($10k - $200k)
  const btcSweepData = useMemo(() => {
    const grid: number[] = [];
    for (let px = 10000; px <= 200000; px += 5000) {
      grid.push(px);
    }
    return grid.map((px) => {
      const aRes = evaluateBalanceSheet(
        asstBs,
        px,
        activeSigma,
        asstPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      );
      const mRes = evaluateBalanceSheet(
        mstrBs,
        px,
        activeSigma,
        mstrPrice,
        riskFreeRate,
        tCycle,
        solvencyCap
      );
      const aCebeRaw = calcCebeAmp(aRes);
      const mCebeRaw = calcCebeAmp(mRes);
      const aStructRaw = calcStructuralAmp(aRes);
      const mStructRaw = calcStructuralAmp(mRes);

      return {
        btcK: "$" + px / 1000 + "k",
        btc: px,
        asstFair: Number(aRes.fairValuePerSh.toFixed(2)),
        asstCebe: Number(aRes.cebePerSh.toFixed(2)),
        asstSats: Math.round(aRes.unencumberedSatsPerSh),
        asstRawSats: Math.round(aRes.rawSatsPerSh),
        asstCebeAmp:
          aCebeRaw !== null && aCebeRaw <= 8
            ? Number(aCebeRaw.toFixed(2))
            : null,
        asstStructAmp:
          aStructRaw !== null && aStructRaw <= 8
            ? Number(aStructRaw.toFixed(2))
            : null,
        mstrFair: Number(mRes.fairValuePerSh.toFixed(2)),
        mstrCebe: Number(mRes.cebePerSh.toFixed(2)),
        mstrSats: Math.round(mRes.unencumberedSatsPerSh),
        mstrRawSats: Math.round(mRes.rawSatsPerSh),
        mstrCebeAmp:
          mCebeRaw !== null && mCebeRaw <= 8
            ? Number(mCebeRaw.toFixed(2))
            : null,
        mstrStructAmp:
          mStructRaw !== null && mStructRaw <= 8
            ? Number(mStructRaw.toFixed(2))
            : null,
        SATA: Number((aRes.tranchePrices["SATA"] ?? 0).toFixed(2)),
        SATS: Number((aRes.tranchePrices["SATS"] ?? 0).toFixed(2)),
        STRF_STRE: Number((mRes.tranchePrices["STRF_STRE"] ?? 0).toFixed(2)),
        STRC: Number((mRes.tranchePrices["STRC"] ?? 0).toFixed(2)),
        STRK: Number((mRes.tranchePrices["STRK"] ?? 0).toFixed(2)),
        STRD: Number((mRes.tranchePrices["STRD"] ?? 0).toFixed(2)),
      };
    });
  }, [
    asstBs,
    mstrBs,
    activeSigma,
    asstPrice,
    mstrPrice,
    riskFreeRate,
    tCycle,
    solvencyCap,
  ]);

  // Dynamic Open-Source LLM Audit Payloads
  const auditInput = useMemo(
    () => ({
      asstBs,
      mstrBs,
      btcPrice,
      asstPrice,
      mstrPrice,
      activeSigma,
      hvSigma,
      cycleSigma,
      riskFreeRate,
      tCycle,
      asstActive,
      mstrActive,
      asstHv,
      asstCycle,
      mstrHv,
      mstrCycle,
    }),
    [
      asstBs,
      mstrBs,
      btcPrice,
      asstPrice,
      mstrPrice,
      activeSigma,
      hvSigma,
      cycleSigma,
      riskFreeRate,
      tCycle,
      asstActive,
      mstrActive,
      asstHv,
      asstCycle,
      mstrHv,
      mstrCycle,
    ]
  );

  const llmAuditPrompt = useMemo(
    () => buildLlmAuditPrompt(auditInput),
    [auditInput]
  );
  const stateTraceMarkdown = useMemo(
    () =>
      buildStateTraceMarkdown({
        asstBs,
        mstrBs,
        btcPrice,
        activeSigma,
        riskFreeRate,
        asstActive,
        mstrActive,
      }),
    [
      asstBs,
      mstrBs,
      btcPrice,
      activeSigma,
      riskFreeRate,
      asstActive,
      mstrActive,
    ]
  );
  const pythonVerifierCode = useMemo(
    () =>
      buildPythonVerifierScript({
        asstBs,
        mstrBs,
        btcPrice,
        asstPrice,
        mstrPrice,
        activeSigma,
        hvSigma,
        cycleSigma,
        riskFreeRate,
        tCycle,
      }),
    [
      asstBs,
      mstrBs,
      btcPrice,
      asstPrice,
      mstrPrice,
      activeSigma,
      hvSigma,
      cycleSigma,
      riskFreeRate,
      tCycle,
    ]
  );
  const fullAuditBundleText = useMemo(
    () => buildFullAuditBundle(auditInput),
    [auditInput]
  );

  const publicConstantsJson = useMemo(
    () =>
      JSON.stringify(
        {
          endpoint: "/api/constants",
          source: constantsSource,
          config: modelConfig,
          issuers: { ASST: asstBs, MSTR: mstrBs },
        },
        null,
        2
      ),
    [constantsSource, modelConfig, asstBs, mstrBs]
  );

  const handleCopyAuditItem = useCallback(
    async (key: string, text: string, label: string) => {
      try {
        await copyTextSafe(text);
        setCopiedAuditKey(key);
        triggerToast("Copied " + label + " to clipboard.");
        setTimeout(() => {
          setCopiedAuditKey((prev) => (prev === key ? null : prev));
        }, 2500);
      } catch {
        triggerToast("Select text directly to copy.");
      }
    },
    [triggerToast]
  );

  const handleLogLocalSnapshot = () => {
    const label = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLocalSnapshots((prev) => [
      ...prev,
      {
        date: "Tick " + label,
        btc: btcPrice,
        asst: asstPrice,
        mstr: mstrPrice,
      },
    ]);
    triggerToast("Appended live session tick to chart preview.");
  };

  const handleResetToLive = () => {
    setBtcPrice(liveFeedPrices.btc);
    setAsstPrice(liveFeedPrices.asst);
    setMstrPrice(liveFeedPrices.mstr);
    setRiskFreeRate(modelConfig.riskFreeRate);
    setVolMode("hv");
    setCustomSigma(hvSigma);
    setIsSandboxOverride(false);
    triggerToast("Reset market & volatility parameters to live feed.");
  };

  const updateBsField = (
    ticker: "ASST" | "MSTR",
    field: "btcHoldings" | "cashReserves" | "basicShares" | "equityIv30d",
    rawVal: string
  ) => {
    const num = Number(rawVal);
    if (Number.isNaN(num) || num < 0) return;
    setHasBsOverride(true);
    if (ticker === "ASST") {
      setAsstBs((prev) => ({ ...prev, [field]: num }));
    } else {
      setMstrBs((prev) => ({ ...prev, [field]: num }));
    }
  };

  const updateTrancheField = (
    ticker: "ASST" | "MSTR",
    trancheName: string,
    field: "parTotal" | "couponRate",
    rawVal: string
  ) => {
    const num = Number(rawVal);
    if (Number.isNaN(num) || num < 0) return;
    setHasBsOverride(true);
    const updater = (prev: TreasuryBalanceSheet): TreasuryBalanceSheet => ({
      ...prev,
      strkParInTiers:
        trancheName === "STRK" && field === "parTotal"
          ? num
          : prev.strkParInTiers,
      preferreds: prev.preferreds.map((t: PreferredTranche) =>
        t.name === trancheName ? { ...t, [field]: num } : t
      ),
    });
    if (ticker === "ASST") {
      setAsstBs(updater);
    } else {
      setMstrBs(updater);
    }
  };

  const handleReset8KBaselines = () => {
    setAsstBs(serverAsstBs);
    setMstrBs(serverMstrBs);
    setHasBsOverride(false);
    triggerToast("Restored active SEC Form 8-K & 424B5 ledger baselines.");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-orange-500/30 selection:text-orange-200">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-2.5 rounded-lg border border-orange-500/40 bg-slate-900/95 px-4 py-3 text-xs font-medium text-slate-100 shadow-2xl backdrop-blur-md">
          <Zap className="h-4 w-4 shrink-0 text-orange-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP INSTITUTIONAL HEADER */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/40 bg-gradient-to-br from-orange-500/20 to-amber-500/5 text-orange-400 shadow-inner">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">
                    ASST &amp; MSTR Institutional Alpha Engine
                  </h1>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                    v{modelConfig.engineVersion} ODE
                  </span>
                  {(isSandboxOverride || hasBsOverride) && (
                    <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                      SANDBOX MODE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  3-Regime Smooth-Pasting Leland (1994) &bull; SEC Form 424B5
                  Waterfall &bull; Open-Source Audit
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center divide-x divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 font-mono text-xs tabular-nums">
                <div className="flex items-center gap-1.5 pr-2.5">
                  <span
                    className={
                      "h-2 w-2 rounded-full " +
                      (isSandboxOverride
                        ? "bg-amber-400"
                        : feedStatus === "LIVE"
                        ? "bg-emerald-400 animate-pulse"
                        : "bg-sky-400")
                    }
                  />
                  <span className="text-slate-400">BTC</span>
                  <span className="font-semibold text-orange-400">
                    {fmtUsd(btcPrice, 2)}
                  </span>
                </div>
                <div className="px-2.5">
                  <span className="text-slate-400">ASST </span>
                  <span className="font-semibold text-white">
                    {fmtUsd(asstPrice)}
                  </span>
                </div>
                <div className="pl-2.5">
                  <span className="text-slate-400">MSTR </span>
                  <span className="font-semibold text-sky-400">
                    {fmtUsd(mstrPrice)}
                  </span>
                </div>
              </div>

              <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/90 p-0.5 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setVolMode("hv")}
                  className={
                    "rounded-md px-2.5 py-1 transition " +
                    (volMode === "hv"
                      ? "bg-slate-800 font-semibold text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200")
                  }
                >
                  {(hvSigma * 100).toFixed(1)}% 1Y HV
                </button>
                <button
                  type="button"
                  onClick={() => setVolMode("cycle")}
                  className={
                    "rounded-md px-2.5 py-1 transition " +
                    (volMode === "cycle"
                      ? "bg-slate-800 font-semibold text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200")
                  }
                >
                  {(cycleSigma * 100).toFixed(1)}% Cycle
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVolMode("custom");
                    setSandboxOpen(true);
                  }}
                  className={
                    "rounded-md px-2.5 py-1 transition " +
                    (volMode === "custom"
                      ? "bg-orange-500/20 font-semibold text-orange-300"
                      : "text-slate-400 hover:text-slate-200")
                  }
                >
                  {volMode === "custom"
                    ? (customSigma * 100).toFixed(1) + "% Vol"
                    : "Custom σ"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => syncAllServerData(true)}
                title={lastPolledAt}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
              >
                <RefreshCw
                  className={
                    "h-3.5 w-3.5 " +
                    (feedStatus === "POLLING"
                      ? "animate-spin text-orange-400"
                      : "")
                  }
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleLogLocalSnapshot}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Test Tick</span>
              </button>

              <button
                type="button"
                onClick={() => setSandboxOpen((prev) => !prev)}
                className={
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition " +
                  (sandboxOpen || isSandboxOverride
                    ? "border-orange-500/50 bg-orange-500/15 text-orange-300"
                    : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white")
                }
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Stress-Test</span>
                {sandboxOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* SANDBOX STRESS-TEST DRAWER */}
          {sandboxOpen && (
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <Sliders className="h-4 w-4 text-orange-400" />
                  <span>
                    Interactive Market &amp; Volatility Stress-Test Sandbox
                  </span>
                  <span className="font-mono text-[11px] font-normal text-slate-400">
                    (Client-side simulation — never modifies backend ledger)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { label: "Crash $25k", btc: 25000, sig: 0.75 },
                    { label: "Bear $45k", btc: 45000, sig: 0.55 },
                    { label: "Breakout $100k", btc: 100000, sig: 0.5 },
                    { label: "Supercycle $150k", btc: 150000, sig: 0.6 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setBtcPrice(preset.btc);
                        setCustomSigma(preset.sig);
                        setVolMode("custom");
                        setIsSandboxOverride(true);
                      }}
                      className="rounded border border-slate-700 bg-slate-800/80 px-2 py-1 font-mono text-[11px] text-slate-300 transition hover:border-orange-500/40 hover:text-orange-300"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleResetToLive}
                    className="flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-300"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset Live
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">BTC Spot Price</span>
                    <span className="font-bold text-orange-400">
                      {fmtUsd(btcPrice, 0)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15000}
                    max={250000}
                    step={500}
                    value={btcPrice}
                    onChange={(e) => {
                      setBtcPrice(Number(e.target.value));
                      setIsSandboxOverride(true);
                    }}
                    className="w-full accent-orange-500"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>$15k</span>
                    <span>$100k</span>
                    <span>$250k</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">BTC Volatility (σ)</span>
                    <span className="font-bold text-amber-300">
                      {(activeSigma * 100).toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.18}
                    max={1.5}
                    step={0.005}
                    value={activeSigma}
                    onChange={(e) => {
                      setCustomSigma(Number(e.target.value));
                      setVolMode("custom");
                      setIsSandboxOverride(true);
                    }}
                    className="w-full accent-amber-400"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>18%</span>
                    <span>50% Cycle</span>
                    <span>150%</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">$ASST Market Px</span>
                    <span className="font-bold text-white">
                      {fmtUsd(asstPrice)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={85}
                    step={0.1}
                    value={asstPrice}
                    onChange={(e) => {
                      setAsstPrice(Number(e.target.value));
                      setIsSandboxOverride(true);
                    }}
                    className="w-full accent-orange-400"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>$2.00</span>
                    <span>FV: {fmtUsd(asstActive.fairValuePerSh)}</span>
                    <span>$85.00</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">$MSTR Market Px</span>
                    <span className="font-bold text-sky-400">
                      {fmtUsd(mstrPrice)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={450}
                    step={0.5}
                    value={mstrPrice}
                    onChange={(e) => {
                      setMstrPrice(Number(e.target.value));
                      setIsSandboxOverride(true);
                    }}
                    className="w-full accent-sky-400"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>$20</span>
                    <span>FV: {fmtUsd(mstrActive.fairValuePerSh)}</span>
                    <span>$450</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRIMARY TABS */}
          <nav className="mt-3 flex space-x-1 overflow-x-auto border-t border-slate-800/70 pt-2">
            {(
              [
                {
                  id: "command",
                  label: "Command Center & Scorecards",
                  icon: BarChart3,
                },
                {
                  id: "yield",
                  label: "Unencumbered BTC Yield & Charts",
                  icon: TrendingUp,
                },
                {
                  id: "preferreds",
                  label: "424B5 Preferred Waterfall",
                  icon: Layers,
                },
                {
                  id: "sheet_audit",
                  label: "SEC 8-K Ledger & Invariant Suite",
                  icon: ShieldCheck,
                  badge: auditReport.allPassed ? "8/8 PASS" : "CHECK",
                },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition " +
                    (isActive
                      ? "bg-slate-800/95 text-white shadow-sm ring-1 ring-slate-700"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200")
                  }
                >
                  <Icon
                    className={
                      "h-4 w-4 " +
                      (isActive ? "text-orange-400" : "text-slate-500")
                    }
                  />
                  <span>{tab.label}</span>
                  {"badge" in tab && tab.badge && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === "command" && (
          <div className="space-y-6">
            {/* Filing Stamp Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-900/50 px-4 py-2.5 text-xs text-slate-300">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
                  <Clock className="h-3.5 w-3.5" />
                  {constantsSource === "google_sheets"
                    ? "GOOGLE SHEET 8-K LIVE"
                    : "VERIFIED SEC 8-K ANCHORS"}
                </span>
                <span>
                  <strong className="text-orange-300">$ASST:</strong>{" "}
                  {asstBs.filingStamp}
                </span>
                <span className="hidden text-slate-600 md:inline">|</span>
                <span>
                  <strong className="text-sky-300">$MSTR:</strong>{" "}
                  {mstrBs.filingStamp}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                {mounted ? lastPolledAt : "Ready"}
              </span>
            </div>

            {/* Hero Treasury Cards ($ASST & $MSTR) */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {[
                {
                  bs: asstBs,
                  res: asstActive,
                  borderCls: "border-orange-500/30",
                  badgeCls:
                    "bg-orange-500/15 text-orange-300 border-orange-500/30",
                  barCls: "bg-orange-400",
                },
                {
                  bs: mstrBs,
                  res: mstrActive,
                  borderCls: "border-sky-500/30",
                  badgeCls: "bg-sky-500/15 text-sky-300 border-sky-500/30",
                  barCls: "bg-sky-400",
                },
              ].map(({ bs, res, borderCls, badgeCls, barCls }) => {
                const unencPct =
                  res.rawSatsPerSh > 0
                    ? Math.min(
                        100,
                        (res.unencumberedSatsPerSh / res.rawSatsPerSh) * 100
                      )
                    : 0;
                const netClaimsPct =
                  res.v0 > 0
                    ? Math.min(
                        100,
                        (Math.max(0, res.k0GrossPar - res.c0) / res.v0) * 100
                      )
                    : 0;
                const cebeAmp = calcCebeAmp(res);
                const structAmp = calcStructuralAmp(res);
                const isDiscount = res.growthPremiumPerSh <= 0;

                return (
                  <div
                    key={bs.ticker}
                    className={
                      "rounded-2xl border " +
                      borderCls +
                      " bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-xl"
                    }
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "rounded-md border px-2 py-0.5 font-mono text-xs font-bold " +
                              badgeCls
                            }
                          >
                            ${bs.ticker}
                          </span>
                          <h2 className="text-lg font-bold text-white">
                            {bs.companyName} Treasury Vault
                          </h2>
                        </div>
                        <p className="mt-1 font-mono text-xs text-slate-400 tabular-nums">
                          {fmtInt(bs.btcHoldings)} BTC ({fmtUsd(res.v0, 1)}M) +{" "}
                          {fmtUsd(bs.cashReserves, 1)}M Cash &bull;{" "}
                          {bs.basicShares.toFixed(2)}M Basic Sh
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-[11px] uppercase tracking-wider text-slate-400">
                          Live Stock Price
                        </div>
                        <div className="text-2xl font-bold text-white">
                          {fmtUsd(res.livePrice)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Simple mNAV: {res.mNavMultiple.toFixed(2)}x
                        </div>
                      </div>
                    </div>

                    {/* Primary 4 KPIs Including Amplification */}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3 font-mono tabular-nums">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          v3.1 Fair Value
                        </div>
                        <div className="mt-1 text-lg font-bold text-emerald-400 sm:text-xl">
                          {fmtUsd(res.fairValuePerSh)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          CEBE: {fmtUsd(res.cebePerSh)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3 font-mono tabular-nums">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Growth Premium
                        </div>
                        <div
                          className={
                            "mt-1 text-lg font-bold sm:text-xl " +
                            (isDiscount ? "text-emerald-400" : "text-amber-300")
                          }
                        >
                          {fmtSignedUsd(res.growthPremiumPerSh)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {res.fairValuePerSh > 0
                            ? (res.livePrice / res.fairValuePerSh).toFixed(2) +
                              "x v3.1 FV"
                            : "Underwater"}
                        </div>
                      </div>

                      <div
                        title="CEBE Amplification = BTC Reserve / Net Reserve (Strategy & CEBE standard). v3.1 ODE = Option-adjusted Fair Value elasticity."
                        className="rounded-xl border border-violet-500/25 bg-slate-950/70 p-3 font-mono tabular-nums"
                      >
                        <div className="text-[10px] uppercase tracking-wider text-violet-300">
                          Amplification
                        </div>
                        <div className="mt-1 text-lg font-bold text-violet-300 sm:text-xl">
                          {fmtAmp(cebeAmp)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          v3.1 ODE: {fmtAmp(structAmp)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3 font-mono tabular-nums">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          BTC-Yield Hurdle
                        </div>
                        <div className="mt-1 text-lg font-bold text-rose-400 sm:text-xl">
                          {res.annualHurdlePct > 0
                            ? res.annualHurdlePct.toFixed(1) + "%/yr"
                            : "0.0%/yr"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {tCycle.toFixed(0)}Y Cycle Req
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-slate-300">
                          <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                          Unencumbered Common Sats / Share
                        </span>
                        <span className="font-mono font-bold text-white tabular-nums">
                          {fmtInt(res.unencumberedSatsPerSh)}{" "}
                          <span className="font-normal text-slate-400">
                            / {fmtInt(res.rawSatsPerSh)} gross sats
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={
                            "h-full rounded-full transition-all duration-300 " +
                            barCls
                          }
                          style={{ width: unencPct + "%" }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-400 tabular-nums">
                        <span>
                          {unencPct.toFixed(1)}% Unencumbered (
                          {netClaimsPct.toFixed(1)}% Net Claims)
                        </span>
                        <span>
                          Δ_net: {res.deltaNet.toFixed(3)} &bull; Eq-Imp BTC
                          Vol: {res.impliedBtcVolPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5-Column Additive Structural Scorecard Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-white sm:text-base">
                    v3.1 Additive Structural Scorecard (Live 1Y HV vs.{" "}
                    {(cycleSigma * 100).toFixed(1)}% Cycle Vol)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Every column sums strictly from Spot CEBE Floor to v3.1
                    Structural Fair Value across all regimes — underwater or
                    in-the-money.
                  </p>
                </div>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-300 tabular-nums">
                  r = {(riskFreeRate * 100).toFixed(2)}% &bull; T ={" "}
                  {tCycle.toFixed(1)}y
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3 font-sans font-semibold text-slate-300">
                        Valuation Component (Per Basic Share)
                      </th>
                      <th className="px-4 py-3 text-right text-orange-300">
                        $ASST ({(hvSigma * 100).toFixed(1)}% HV)
                      </th>
                      <th className="px-4 py-3 text-right text-orange-400">
                        $ASST ({(cycleSigma * 100).toFixed(1)}% Vol)
                      </th>
                      <th className="px-4 py-3 text-right text-sky-300">
                        $MSTR ({(hvSigma * 100).toFixed(1)}% HV)
                      </th>
                      <th className="px-4 py-3 text-right text-sky-400">
                        $MSTR ({(cycleSigma * 100).toFixed(1)}% Vol)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans text-slate-200">
                        <div className="font-medium">Spot CEBE Floor</div>
                        <div className="text-[11px] text-slate-500">
                          max(0, Vault Assets − Gross Debt &amp; Preferred Par)
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {fmtUsd(asstHv.cebePerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {fmtUsd(asstCycle.cebePerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {fmtUsd(mstrHv.cebePerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {fmtUsd(mstrCycle.cebePerSh)}
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans text-slate-200">
                        <div className="font-medium">
                          + Perpetual Carry &amp; Straight Debt PV Adj
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Sub-market coupon discount (STRK 8%, dated notes) vs.
                          high-coupon drag (SATS 15%)
                        </div>
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right " +
                          (asstHv.carryDebtAdjPerSh >= 0
                            ? "text-emerald-400"
                            : "text-rose-400")
                        }
                      >
                        {fmtSignedUsd(asstHv.carryDebtAdjPerSh)}
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right " +
                          (asstCycle.carryDebtAdjPerSh >= 0
                            ? "text-emerald-400"
                            : "text-rose-400")
                        }
                      >
                        {fmtSignedUsd(asstCycle.carryDebtAdjPerSh)}
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right " +
                          (mstrHv.carryDebtAdjPerSh >= 0
                            ? "text-emerald-400"
                            : "text-rose-400")
                        }
                      >
                        {fmtSignedUsd(mstrHv.carryDebtAdjPerSh)}
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right " +
                          (mstrCycle.carryDebtAdjPerSh >= 0
                            ? "text-emerald-400"
                            : "text-rose-400")
                        }
                      >
                        {fmtSignedUsd(mstrCycle.carryDebtAdjPerSh)}
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans text-slate-200">
                        <div className="font-medium">
                          + Leland Dividend-Suspension Put
                        </div>
                        <div className="text-[11px] text-slate-500">
                          3-regime C¹ smooth-pasting option to suspend preferred
                          coupons in drawdowns
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {fmtSignedUsd(asstHv.lelandPutPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {fmtSignedUsd(asstCycle.lelandPutPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {fmtSignedUsd(mstrHv.lelandPutPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {fmtSignedUsd(mstrCycle.lelandPutPerSh)}
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans text-slate-200">
                        <div className="font-medium">
                          − Barrier &amp; Ingersoll Convert Dilution
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Down-and-out Black-Cox calls (24.21M MSTR notes @
                          $277.50 + STRK @ $1,000)
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        -{fmtUsd(asstHv.haircutsPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        -{fmtUsd(asstCycle.haircutsPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-rose-400">
                        -{fmtUsd(mstrHv.haircutsPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-rose-400">
                        -{fmtUsd(mstrCycle.haircutsPerSh)}
                      </td>
                    </tr>

                    <tr className="bg-emerald-500/10 font-bold text-white">
                      <td className="px-5 py-3.5 font-sans text-emerald-300">
                        = v3.1 Structural Fair Value
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-emerald-300">
                        {fmtUsd(asstHv.fairValuePerSh)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-emerald-300">
                        {fmtUsd(asstCycle.fairValuePerSh)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-emerald-300">
                        {fmtUsd(mstrHv.fairValuePerSh)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm text-emerald-300">
                        {fmtUsd(mstrCycle.fairValuePerSh)}
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans font-medium text-slate-300">
                        Live Stock Price
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">
                        {fmtUsd(asstHv.livePrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">
                        {fmtUsd(asstCycle.livePrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">
                        {fmtUsd(mstrHv.livePrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">
                        {fmtUsd(mstrCycle.livePrice)}
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans font-medium text-slate-300">
                        Implied Growth Premium
                      </td>
                      <td className="px-4 py-3 text-right text-amber-300">
                        {fmtSignedUsd(asstHv.growthPremiumPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-300">
                        {fmtSignedUsd(asstCycle.growthPremiumPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-300">
                        {fmtSignedUsd(mstrHv.growthPremiumPerSh)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-300">
                        {fmtSignedUsd(mstrCycle.growthPremiumPerSh)}
                      </td>
                    </tr>

                    <tr className="bg-violet-500/5 hover:bg-violet-500/10">
                      <td className="px-5 py-3 font-sans text-violet-200">
                        <div className="font-semibold">
                          CEBE Amplification (BTC Reserve &divide; Net Reserve)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          % move in Spot CEBE backing per 1% BTC move (Strategy
                          &amp; CEBE standard)
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-violet-300">
                        {fmtAmp(calcCebeAmp(asstHv))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-violet-300">
                        {fmtAmp(calcCebeAmp(asstCycle))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-violet-300">
                        {fmtAmp(calcCebeAmp(mstrHv))}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-violet-300">
                        {fmtAmp(calcCebeAmp(mstrCycle))}
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans text-slate-200">
                        <div className="font-medium">
                          v3.1 Structural Amplification (V_0 &middot; Δ_net
                          &divide; E_model)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Option-adjusted v3.1 Fair Value elasticity after
                          Leland put &amp; convert dilution
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-violet-200">
                        {fmtAmp(calcStructuralAmp(asstHv))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-violet-200">
                        {fmtAmp(calcStructuralAmp(asstCycle))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-violet-200">
                        {fmtAmp(calcStructuralAmp(mstrHv))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-violet-200">
                        {fmtAmp(calcStructuralAmp(mstrCycle))}
                      </td>
                    </tr>

                    <tr className="bg-slate-950/60 font-semibold">
                      <td className="px-5 py-3 font-sans text-rose-300">
                        Annual BTC-Yield Hurdle ({tCycle.toFixed(0)}Y Cycle)
                      </td>
                      <td className="px-4 py-3 text-right text-rose-400">
                        {fmtPct(asstHv.annualHurdlePct, 2)}/yr
                      </td>
                      <td className="px-4 py-3 text-right text-rose-400">
                        {fmtPct(asstCycle.annualHurdlePct, 2)}/yr
                      </td>
                      <td className="px-4 py-3 text-right text-rose-400">
                        {fmtPct(mstrHv.annualHurdlePct, 2)}/yr
                      </td>
                      <td className="px-4 py-3 text-right text-rose-400">
                        {fmtPct(mstrCycle.annualHurdlePct, 2)}/yr
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-800/30">
                      <td className="px-5 py-3 font-sans text-slate-300">
                        Equity-Implied Unlevered BTC Volatility
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {fmtPct(asstHv.impliedBtcVolPct, 1)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {fmtPct(asstCycle.impliedBtcVolPct, 1)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {fmtPct(mstrHv.impliedBtcVolPct, 1)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {fmtPct(mstrCycle.impliedBtcVolPct, 1)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* COLLAPSIBLE AUDIT OUR MATH — OPEN-SOURCE LLM VERIFICATION BUNDLE */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl transition-all">
              <div
                onClick={() => setAuditDrawerOpen((prev) => !prev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setAuditDrawerOpen((prev) => !prev);
                  }
                }}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-800/40"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white sm:text-base">
                        Audit Our Math — Open-Source LLM Verification Bundle
                        (v3.1 Leland ODE &amp; 424B5 Waterfall)
                      </h3>
                      <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
                        ZERO-TRUST VERIFIABLE
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Copy our live inputs, closed-form ODE equations,
                      intermediate state variables, and zero-dependency Python
                      verifier straight into ChatGPT, Claude, or Gemini to audit
                      every number.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyAuditItem(
                        "bundle-header",
                        fullAuditBundleText,
                        "Full LLM Audit Bundle"
                      );
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                  >
                    {copiedAuditKey === "bundle-header" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-300" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Full LLM Audit Bundle</span>
                      </>
                    )}
                  </button>

                  <span className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-300">
                    <span>{auditDrawerOpen ? "Hide" : "Inspect"}</span>
                    {auditDrawerOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </span>
                </div>
              </div>

              {auditDrawerOpen && (
                <div className="border-t border-slate-800 bg-slate-950/60 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs">
                      {(
                        [
                          {
                            id: "prompt",
                            label: "LLM Adversarial Audit Prompt",
                            icon: BookOpen,
                          },
                          {
                            id: "trace",
                            label: "Live Intermediate State Trace",
                            icon: Cpu,
                          },
                          {
                            id: "python",
                            label: "Self-Contained Python Verifier",
                            icon: Terminal,
                          },
                        ] as const
                      ).map((st) => {
                        const SubIcon = st.icon;
                        const active = auditSubTab === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setAuditSubTab(st.id)}
                            className={
                              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition " +
                              (active
                                ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-700"
                                : "text-slate-400 hover:text-slate-200")
                            }
                          >
                            <SubIcon
                              className={
                                "h-3.5 w-3.5 " +
                                (active ? "text-emerald-400" : "text-slate-500")
                              }
                            />
                            <span>{st.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {auditSubTab === "prompt" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyAuditItem(
                              "sub-prompt",
                              llmAuditPrompt,
                              "LLM Adversarial Audit Prompt"
                            )
                          }
                          className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/25"
                        >
                          {copiedAuditKey === "sub-prompt" ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy Adversarial Prompt</span>
                            </>
                          )}
                        </button>
                      )}
                      {auditSubTab === "trace" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyAuditItem(
                              "sub-trace",
                              stateTraceMarkdown,
                              "Live Intermediate State Trace"
                            )
                          }
                          className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/25"
                        >
                          {copiedAuditKey === "sub-trace" ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy State Trace</span>
                            </>
                          )}
                        </button>
                      )}
                      {auditSubTab === "python" && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyAuditItem(
                              "sub-python",
                              pythonVerifierCode,
                              "audit_v31.py Python Verifier"
                            )
                          }
                          className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/25"
                        >
                          {copiedAuditKey === "sub-python" ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy audit_v31.py</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {auditSubTab === "prompt" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Dynamically synced with active UI inputs (BTC{" "}
                          {fmtUsd(btcPrice, 2)}, σ ={" "}
                          {(activeSigma * 100).toFixed(1)}%, r ={" "}
                          {(riskFreeRate * 100).toFixed(2)}%).
                        </span>
                        <span className="font-mono text-slate-500">
                          Markdown &bull; Ready for ChatGPT / Claude / Gemini
                        </span>
                      </div>
                      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
                        {llmAuditPrompt}
                      </pre>
                    </div>
                  )}

                  {auditSubTab === "trace" && (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                      {[
                        {
                          bs: asstBs,
                          res: asstActive,
                          accent: "text-orange-400",
                          borderCls: "border-orange-500/25",
                        },
                        {
                          bs: mstrBs,
                          res: mstrActive,
                          accent: "text-sky-400",
                          borderCls: "border-sky-500/25",
                        },
                      ].map(({ bs, res, accent, borderCls }) => (
                        <div
                          key={bs.ticker}
                          className={
                            "rounded-xl border " +
                            borderCls +
                            " bg-slate-900/80 p-4"
                          }
                        >
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <h4
                              className={"font-mono text-xs font-bold " + accent}
                            >
                              ${bs.ticker} Internal ODE &amp; Waterfall State (σ
                              = {(activeSigma * 100).toFixed(1)}%)
                            </h4>
                            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                              α_solv = {res.alphaSolv.toFixed(6)}
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                V_0 ($M)
                              </div>
                              <div className="font-semibold text-white">
                                ${res.v0.toFixed(2)}M
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                C_0 ($M)
                              </div>
                              <div className="font-semibold text-white">
                                ${res.c0.toFixed(2)}M
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                S_0 ($M)
                              </div>
                              <div className="font-semibold text-emerald-300">
                                ${res.s0.toFixed(2)}M
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                B_PV ($M)
                              </div>
                              <div className="font-semibold text-slate-200">
                                ${res.bPv.toFixed(2)}M
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                H_0 ($M)
                              </div>
                              <div className="font-semibold text-rose-300">
                                ${res.h0DebtBtc.toFixed(2)}M
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                X_0 ($M)
                              </div>
                              <div className="font-semibold text-orange-300">
                                ${res.x0.toFixed(2)}M
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                CEBE Amp
                              </div>
                              <div className="font-semibold text-violet-300">
                                {fmtAmp(calcCebeAmp(res))}
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                Dil_Total ($M)
                              </div>
                              <div className="font-semibold text-amber-300">
                                ${res.dilTotal.toFixed(2)}M
                              </div>
                            </div>
                            <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                              <div className="text-[10px] text-slate-500">
                                Delta_Net
                              </div>
                              <div className="font-semibold text-emerald-400">
                                {res.deltaNet.toFixed(5)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
                            <table className="w-full border-collapse text-left font-mono text-[11px] tabular-nums">
                              <thead>
                                <tr className="border-b border-slate-800 bg-slate-950 text-[10px] uppercase text-slate-400">
                                  <th className="px-2.5 py-2">Tranche</th>
                                  <th className="px-2 py-2 text-right">
                                    γ / β+ / w
                                  </th>
                                  <th className="px-2 py-2 text-right">
                                    Par_BTC
                                  </th>
                                  <th className="px-2 py-2 text-right">
                                    X_S_eff / X_cap
                                  </th>
                                  <th className="px-2 py-2">Regime</th>
                                  <th className="px-2.5 py-2 text-right">
                                    $/sh
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/70 bg-slate-950/50">
                                {bs.preferreds.map((t) => {
                                  const d = res.trancheDetails[t.name];
                                  return (
                                    <tr key={d.name}>
                                      <td className="px-2.5 py-2 font-semibold text-white">
                                        {d.name}
                                      </td>
                                      <td className="px-2 py-2 text-right text-slate-300">
                                        {d.roots.gamma.toFixed(3)} /{" "}
                                        {d.roots.betaPos.toFixed(3)} /{" "}
                                        {d.roots.w.toFixed(3)}
                                      </td>
                                      <td className="px-2 py-2 text-right text-slate-300">
                                        ${d.parBtc.toFixed(1)}M
                                      </td>
                                      <td className="px-2 py-2 text-right text-slate-300">
                                        ${d.xsEff.toFixed(0)}M /{" "}
                                        {d.xCap && Number.isFinite(d.xCap)
                                          ? "$" + d.xCap.toFixed(0) + "M"
                                          : "∞"}
                                      </td>
                                      <td className="px-2 py-2">
                                        <span className="inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200">
                                          {d.regime}
                                        </span>
                                      </td>
                                      <td className="px-2.5 py-2 text-right font-bold text-emerald-400">
                                        ${d.modelPrice.toFixed(2)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {auditSubTab === "python" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Zero external dependencies (Python 3 standard library
                          only) — pre-populated with active UI inputs.
                        </span>
                        <span className="font-mono text-emerald-400">
                          audit_v31.py
                        </span>
                      </div>
                      <pre className="max-h-96 overflow-y-auto whitespace-pre rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-200/90">
                        {pythonVerifierCode}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: UNENCUMBERED BTC YIELD & RECHARTS SUITE */}
        {activeTab === "yield" && (
          <div className="space-y-6">
            {/* Chart 1: 4-Year Market-Implied Unencumbered Sats/Share Yield Cone */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-orange-400">
                      MARKET-IMPLIED BTC YIELD CONE
                    </span>
                    <h2 className="text-base font-bold text-white">
                      4-Year Market-Implied Unencumbered Bitcoin-per-Share Yield
                      Trajectory
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Plots the compounding path of{" "}
                    <strong>unencumbered sats per common share</strong> required
                    over the 4-year cycle to justify current share prices at
                    v3.1 Fair Value.
                  </p>
                </div>

                <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
                  {(
                    [
                      { id: "ASST", label: "$ASST (Sats/Sh)" },
                      { id: "MSTR", label: "$MSTR (Sats/Sh)" },
                      { id: "INDEXED", label: "Normalized (Idx=100)" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setConeTarget(opt.id)}
                      className={
                        "rounded-md px-3 py-1.5 transition " +
                        (coneTarget === opt.id
                          ? "bg-slate-800 font-semibold text-white"
                          : "text-slate-400 hover:text-slate-200")
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {coneTarget !== "INDEXED" ? (
                (() => {
                  const activeRes =
                    coneTarget === "ASST" ? asstActive : mstrActive;
                  const encumberedSats = Math.max(
                    0,
                    activeRes.rawSatsPerSh - activeRes.unencumberedSatsPerSh
                  );
                  const yr4Req = Math.round(
                    activeRes.unencumberedSatsPerSh *
                      Math.pow(1 + activeRes.annualHurdlePct / 100, 4)
                  );
                  return (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono tabular-nums">
                        <div className="text-[10px] uppercase text-slate-400">
                          Gross Vault Sats / Sh
                        </div>
                        <div className="mt-1 text-base font-bold text-slate-200">
                          {fmtInt(activeRes.rawSatsPerSh)} sats
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Before debt &amp; preferreds
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono tabular-nums">
                        <div className="text-[10px] uppercase text-slate-400">
                          Senior Claim Encumbrance
                        </div>
                        <div className="mt-1 text-base font-bold text-rose-400">
                          -{fmtInt(encumberedSats)} sats
                        </div>
                        <div className="text-[11px] text-slate-500">
                          CEBE Amp: {fmtAmp(calcCebeAmp(activeRes))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono tabular-nums">
                        <div className="text-[10px] uppercase text-slate-400">
                          Spot Unencumbered Sats
                        </div>
                        <div className="mt-1 text-base font-bold text-emerald-400">
                          {fmtInt(activeRes.unencumberedSatsPerSh)} sats
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Year-0 common floor
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono tabular-nums">
                        <div className="text-[10px] uppercase text-slate-400">
                          Priced-In Year-4 Target
                        </div>
                        <div className="mt-1 text-base font-bold text-orange-400">
                          {fmtInt(yr4Req)} sats
                        </div>
                        <div className="text-[11px] text-rose-300">
                          Hurdle: {activeRes.annualHurdlePct.toFixed(2)}%/yr
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-orange-500/25 bg-slate-950/70 p-3 font-mono text-xs tabular-nums">
                    <span className="font-bold text-orange-400">$ASST</span>{" "}
                    Market-Implied Hurdle:{" "}
                    <strong className="text-white">
                      {asstActive.annualHurdlePct.toFixed(2)}%/yr
                    </strong>{" "}
                    (
                    {(
                      (Math.pow(1 + asstActive.annualHurdlePct / 100, 4) - 1) *
                      100
                    ).toFixed(1)}
                    % cumulative 4Y expansion)
                  </div>
                  <div className="rounded-xl border border-sky-500/25 bg-slate-950/70 p-3 font-mono text-xs tabular-nums">
                    <span className="font-bold text-sky-400">$MSTR</span>{" "}
                    Market-Implied Hurdle:{" "}
                    <strong className="text-white">
                      {mstrActive.annualHurdlePct.toFixed(2)}%/yr
                    </strong>{" "}
                    (
                    {(
                      (Math.pow(1 + mstrActive.annualHurdlePct / 100, 4) - 1) *
                      100
                    ).toFixed(1)}
                    % cumulative 4Y expansion)
                  </div>
                </div>
              )}

              <div className="mt-5 h-80 w-full">
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    {coneTarget === "INDEXED" ? (
                      <LineChart
                        data={yieldConeData}
                        margin={{ top: 10, right: 24, left: 8, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="yearLabel"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitSuffix=" idx" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Line
                          type="monotone"
                          dataKey="asstImpliedIdx"
                          name="$ASST Market-Implied Yield"
                          stroke="#fb923c"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="mstrImpliedIdx"
                          name="$MSTR Market-Implied Yield"
                          stroke="#38bdf8"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="bench20Idx"
                          name="20%/yr Accretive Benchmark"
                          stroke="#34d399"
                          strokeDasharray="5 5"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="bench10Idx"
                          name="10%/yr Accretive Benchmark"
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="flatFloorIdx"
                          name="0%/yr Flat Vault Floor"
                          stroke="#475569"
                          strokeDasharray="2 2"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    ) : (
                      <ComposedChart
                        data={yieldConeData}
                        margin={{ top: 10, right: 24, left: 12, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="yearLabel"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            (Number(v) / 1000).toFixed(0) + "k"
                          }
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitSuffix=" sats/sh" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Area
                          type="monotone"
                          dataKey="marketImplied"
                          name={
                            "$" +
                            coneTarget +
                            " Market-Implied Unencumbered Sats/Sh"
                          }
                          stroke={coneTarget === "ASST" ? "#fb923c" : "#38bdf8"}
                          fill={
                            coneTarget === "ASST"
                              ? "rgba(251, 146, 60, 0.14)"
                              : "rgba(56, 189, 248, 0.14)"
                          }
                          strokeWidth={3}
                        />
                        <Line
                          type="monotone"
                          dataKey="bench20"
                          name="20%/yr Yield Reference"
                          stroke="#34d399"
                          strokeDasharray="5 5"
                          strokeWidth={1.8}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="bench10"
                          name="10%/yr Yield Reference"
                          stroke="#a78bfa"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="rawGrossToday"
                          name="Gross Vault Sats/Sh (Pre-Debt)"
                          stroke="#f43f5e"
                          strokeDasharray="2 4"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="flatFloor"
                          name="0%/yr Flat Spot Floor"
                          stroke="#64748b"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Historical Valuation, Amplification & Hurdle Log */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Historical Valuation, Amplification &amp; Hurdle Time-Series
                  </h3>
                  <p className="text-xs text-slate-400">
                    Automatically plots logged rows from Google Sheets (
                    <code>Daily_History</code> &amp;{" "}
                    <code>Intraday_Snapshots</code>) plus live quotes.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => setHistoryTimeframe("daily")}
                      className={
                        "rounded-md px-2.5 py-1.5 transition " +
                        (historyTimeframe === "daily"
                          ? "bg-slate-800 font-semibold text-white"
                          : "text-slate-400 hover:text-slate-200")
                      }
                    >
                      Daily Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTimeframe("intraday")}
                      className={
                        "rounded-md px-2.5 py-1.5 transition " +
                        (historyTimeframe === "intraday"
                          ? "bg-slate-800 font-semibold text-white"
                          : "text-slate-400 hover:text-slate-200")
                      }
                    >
                      Intraday (30m)
                    </button>
                  </div>

                  <div className="flex flex-wrap rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
                    {(
                      [
                        { id: "hurdle", label: "BTC-Yield Hurdle (%/yr)" },
                        { id: "amp", label: "Amplification (x)" },
                        { id: "asst_val", label: "$ASST Px vs. Fair Val" },
                        { id: "mstr_val", label: "$MSTR Px vs. Fair Val" },
                        { id: "sats", label: "Unencumbered Sats/Sh" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setHistoryMetric(m.id)}
                        className={
                          "rounded-md px-2.5 py-1.5 transition " +
                          (historyMetric === m.id
                            ? "bg-slate-800 font-semibold text-white"
                            : "text-slate-400 hover:text-slate-200")
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 h-80 w-full">
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    {historyMetric === "hurdle" ? (
                      <LineChart
                        data={historicalSeries}
                        margin={{ top: 10, right: 24, left: 8, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => v + "%"}
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitSuffix="%/yr" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Line
                          type="monotone"
                          dataKey="asstHurdle"
                          name="$ASST Implied BTC-Yield Hurdle"
                          stroke="#fb923c"
                          strokeWidth={2.8}
                          dot={{ r: 3.5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="mstrHurdle"
                          name="$MSTR Implied BTC-Yield Hurdle"
                          stroke="#38bdf8"
                          strokeWidth={2.8}
                          dot={{ r: 3.5 }}
                        />
                      </LineChart>
                    ) : historyMetric === "amp" ? (
                      <LineChart
                        data={historicalSeries}
                        margin={{ top: 10, right: 24, left: 8, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          domain={[1, "auto"]}
                          tickFormatter={(v) => v + "x"}
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitSuffix="x" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <ReferenceLine
                          y={1}
                          stroke="#64748b"
                          strokeDasharray="3 3"
                        />
                        <Line
                          type="monotone"
                          dataKey="asstAmp"
                          name="$ASST CEBE Amplification"
                          stroke="#fb923c"
                          strokeWidth={2.8}
                          dot={{ r: 3.5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="mstrAmp"
                          name="$MSTR CEBE Amplification"
                          stroke="#38bdf8"
                          strokeWidth={2.8}
                          dot={{ r: 3.5 }}
                        />
                      </LineChart>
                    ) : historyMetric === "asst_val" ? (
                      <ComposedChart
                        data={historicalSeries}
                        margin={{ top: 10, right: 24, left: 8, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => "$" + v}
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitPrefix="$" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Area
                          type="monotone"
                          dataKey="asstFair"
                          name="$ASST v3.1 Structural Fair Value"
                          stroke="#34d399"
                          fill="rgba(52, 211, 153, 0.14)"
                          strokeWidth={2.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="asstPrice"
                          name="$ASST Market Share Price"
                          stroke="#fb923c"
                          strokeWidth={3}
                          dot={{ r: 3.5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="asstCebe"
                          name="$ASST Spot CEBE Floor"
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          strokeWidth={1.8}
                          dot={false}
                        />
                      </ComposedChart>
                    ) : historyMetric === "mstr_val" ? (
                      <ComposedChart
                        data={historicalSeries}
                        margin={{ top: 10, right: 24, left: 8, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => "$" + v}
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitPrefix="$" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Area
                          type="monotone"
                          dataKey="mstrFair"
                          name="$MSTR v3.1 Structural Fair Value"
                          stroke="#34d399"
                          fill="rgba(52, 211, 153, 0.14)"
                          strokeWidth={2.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="mstrPrice"
                          name="$MSTR Market Share Price"
                          stroke="#38bdf8"
                          strokeWidth={3}
                          dot={{ r: 3.5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="mstrCebe"
                          name="$MSTR Spot CEBE Floor"
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          strokeWidth={1.8}
                          dot={false}
                        />
                      </ComposedChart>
                    ) : (
                      <LineChart
                        data={historicalSeries}
                        margin={{ top: 10, right: 24, left: 12, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="date"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#fb923c"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            (Number(v) / 1000).toFixed(0) + "k"
                          }
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#38bdf8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            (Number(v) / 1000).toFixed(0) + "k"
                          }
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitSuffix=" sats/sh" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="asstUnencSats"
                          name="$ASST Unencumbered Sats/Sh (Left)"
                          stroke="#fb923c"
                          strokeWidth={2.8}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="mstrUnencSats"
                          name="$MSTR Unencumbered Sats/Sh (Right)"
                          stroke="#38bdf8"
                          strokeWidth={2.8}
                        />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 3: BTC Spot Sweep */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    BTC Price Sweep ($10k – $200k): Bull De-Encumbrance,
                    Amplification &amp; Leland Cushion
                  </h3>
                  <p className="text-xs text-slate-400">
                    Rising BTC spot shrinks fixed-dollar senior encumbrance —
                    expanding unencumbered sats/share and naturally compressing
                    leverage amplification at higher prices.
                  </p>
                </div>

                <div className="flex flex-wrap rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
                  {(
                    [
                      { id: "sats", label: "De-Encumbrance (Sats/Sh)" },
                      { id: "amp", label: "Amplification Curve (x)" },
                      { id: "equity_asst", label: "$ASST Fair Val vs. CEBE" },
                      { id: "equity_mstr", label: "$MSTR Fair Val vs. CEBE" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSweepMode(opt.id)}
                      className={
                        "rounded-md px-2.5 py-1.5 transition " +
                        (sweepMode === opt.id
                          ? "bg-slate-800 font-semibold text-white"
                          : "text-slate-400 hover:text-slate-200")
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 h-80 w-full">
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    {sweepMode === "sats" ? (
                      <LineChart
                        data={btcSweepData}
                        margin={{ top: 10, right: 24, left: 12, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="btcK"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#fb923c"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            (Number(v) / 1000).toFixed(0) + "k"
                          }
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#38bdf8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            (Number(v) / 1000).toFixed(0) + "k"
                          }
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitSuffix=" sats/sh" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="asstSats"
                          name="$ASST Unencumbered Sats/Sh (Left)"
                          stroke="#fb923c"
                          strokeWidth={2.8}
                          dot={false}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="asstRawSats"
                          name="$ASST Gross Vault Ceiling (Left)"
                          stroke="#fb923c"
                          strokeDasharray="3 3"
                          strokeWidth={1.2}
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="mstrSats"
                          name="$MSTR Unencumbered Sats/Sh (Right)"
                          stroke="#38bdf8"
                          strokeWidth={2.8}
                          dot={false}
                        />
                      </LineChart>
                    ) : sweepMode === "amp" ? (
                      <LineChart
                        data={btcSweepData}
                        margin={{ top: 10, right: 24, left: 12, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="btcK"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          domain={[1, "auto"]}
                          tickFormatter={(v) => v + "x"}
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitSuffix="x" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <ReferenceLine
                          y={1}
                          stroke="#64748b"
                          strokeDasharray="3 3"
                        />
                        <Line
                          type="monotone"
                          dataKey="asstCebeAmp"
                          name="$ASST CEBE Amplification"
                          stroke="#fb923c"
                          strokeWidth={2.8}
                          dot={false}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="asstStructAmp"
                          name="$ASST v3.1 ODE Amplification"
                          stroke="#fb923c"
                          strokeDasharray="4 4"
                          strokeWidth={1.8}
                          dot={false}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="mstrCebeAmp"
                          name="$MSTR CEBE Amplification"
                          stroke="#38bdf8"
                          strokeWidth={2.8}
                          dot={false}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="mstrStructAmp"
                          name="$MSTR v3.1 ODE Amplification"
                          stroke="#38bdf8"
                          strokeDasharray="4 4"
                          strokeWidth={1.8}
                          dot={false}
                          connectNulls={false}
                        />
                      </LineChart>
                    ) : (
                      <ComposedChart
                        data={btcSweepData}
                        margin={{ top: 10, right: 24, left: 12, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="btcK"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => "$" + v}
                        />
                        <Tooltip
                          content={<CustomChartTooltip unitPrefix="$" />}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Area
                          type="monotone"
                          dataKey={
                            sweepMode === "equity_asst"
                              ? "asstFair"
                              : "mstrFair"
                          }
                          name="v3.1 Structural Fair Value (Includes Leland Put)"
                          stroke="#34d399"
                          fill="rgba(52, 211, 153, 0.16)"
                          strokeWidth={2.8}
                        />
                        <Line
                          type="monotone"
                          dataKey={
                            sweepMode === "equity_asst"
                              ? "asstCebe"
                              : "mstrCebe"
                          }
                          name="Hard Spot CEBE Floor"
                          stroke="#f43f5e"
                          strokeDasharray="4 4"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 424B5 PREFERRED WATERFALL */}
        {activeTab === "preferreds" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { bs: asstBs, res: asstActive, color: "text-orange-400" },
                { bs: mstrBs, res: mstrActive, color: "text-sky-400" },
              ].map(({ bs, res, color }) => (
                <div
                  key={bs.ticker}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className={"text-sm font-bold " + color}>
                      ${bs.ticker} Top-Down Strict-Priority Cash &amp; BTC
                      Waterfall
                    </h3>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      α_solv(σ) = {res.alphaSolv.toFixed(4)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs tabular-nums sm:grid-cols-3">
                    <div className="rounded-lg bg-slate-950/70 p-2.5">
                      <div className="text-[10px] text-slate-400">
                        Fiat Cash Reserve (C_0)
                      </div>
                      <div className="mt-0.5 font-bold text-white">
                        {fmtUsd(res.c0, 1)}M
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/70 p-2.5">
                      <div className="text-[10px] text-slate-400">
                        Cash -&gt; Senior Debt PV
                      </div>
                      <div className="mt-0.5 font-bold text-emerald-400">
                        {fmtUsd(res.cashToDebt, 1)}M
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/70 p-2.5">
                      <div className="text-[10px] text-slate-400">
                        Cash -&gt; Tier 1/2 Prefs
                      </div>
                      <div className="mt-0.5 font-bold text-emerald-400">
                        {fmtUsd(res.cashToPrefs, 1)}M
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/70 p-2.5">
                      <div className="text-[10px] text-slate-400">
                        Senior Debt Barrier (H_0)
                      </div>
                      <div className="mt-0.5 font-bold text-rose-400">
                        {fmtUsd(res.h0DebtBtc, 1)}M
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/70 p-2.5">
                      <div className="text-[10px] text-slate-400">
                        Post-Debt BTC Pool (X_0)
                      </div>
                      <div className="mt-0.5 font-bold text-orange-300">
                        {fmtUsd(res.x0, 1)}M
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-950/70 p-2.5">
                      <div className="text-[10px] text-slate-400">
                        Senior Claims Model Val
                      </div>
                      <div className="mt-0.5 font-bold text-white">
                        {fmtUsd(res.seniorClaimsVal, 1)}M
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
              <div className="border-b border-slate-800 px-5 py-4">
                <h3 className="text-sm font-bold text-white sm:text-base">
                  SEC Form 424B5 Perpetual Preferred Tranches — Model vs. Live
                  Market
                </h3>
                <p className="text-xs text-slate-400">
                  Variable rate-resetting tranches (<code>SATA</code>,{" "}
                  <code>STRC</code>) obey the exact 3-regime smooth-pasting ODE
                  and pin strictly at $100.00 par when X_0 &ge; X_cap.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] uppercase text-slate-400">
                      <th className="px-4 py-3 font-sans">Tranche</th>
                      <th className="px-3 py-3 text-center">Tier</th>
                      <th className="px-3 py-3 text-right">Par ($M)</th>
                      <th className="px-3 py-3 text-right">BTC Par ($M)</th>
                      <th className="px-3 py-3 text-right">c_0 / ρ_i</th>
                      <th className="px-3 py-3 text-right">Barrier X_S</th>
                      <th className="px-3 py-3 text-right">Pin X_cap</th>
                      <th className="px-3 py-3">Live ODE Regime</th>
                      <th className="px-4 py-3 text-right text-emerald-300">
                        v3.1 Model
                      </th>
                      <th className="px-4 py-3 text-right text-white">
                        Live Mkt
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {[
                      ...asstBs.preferreds.map((t) => ({
                        issuer: "ASST",
                        detail: asstActive.trancheDetails[t.name],
                        liveMkt:
                          preferredQuotes[t.name] ?? t.liveMarketPrice,
                      })),
                      ...mstrBs.preferreds.map((t) => ({
                        issuer: "MSTR",
                        detail: mstrActive.trancheDetails[t.name],
                        liveMkt:
                          preferredQuotes[t.name] ?? t.liveMarketPrice,
                      })),
                    ].map(({ issuer, detail, liveMkt }) => (
                      <tr
                        key={issuer + "-" + detail.name}
                        className="hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3 font-sans">
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            <span
                              className={
                                "rounded px-1.5 py-0.5 font-mono text-[10px] " +
                                (issuer === "ASST"
                                  ? "bg-orange-500/15 text-orange-300"
                                  : "bg-sky-500/15 text-sky-300")
                              }
                            >
                              {issuer}
                            </span>
                            <span>{detail.name}</span>
                            {detail.variableParCap && (
                              <Lock className="h-3 w-3 text-amber-400" />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {detail.label}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-slate-300">
                          T{detail.tier}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-300">
                          ${detail.parTotal.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-300">
                          ${detail.parBtc.toFixed(1)}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-300">
                          {(detail.couponRate * 100).toFixed(2)}% /{" "}
                          {(detail.rho * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-3 text-right text-slate-400">
                          ${detail.xsEff.toFixed(0)}M
                        </td>
                        <td className="px-3 py-3 text-right text-slate-400">
                          {detail.xCap && Number.isFinite(detail.xCap)
                            ? "$" + detail.xCap.toFixed(0) + "M"
                            : "Uncapped"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-block rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                            {detail.regime}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-400">
                          <div>{fmtUsd(detail.modelPrice)}</div>
                          {detail.hybridModelPrice !== undefined && (
                            <div className="text-[10px] font-normal text-sky-300">
                              +Warrant: {fmtUsd(detail.hybridModelPrice)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-white">
                          {fmtUsd(liveMkt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    3-Regime &amp; 2-Regime C¹ Smooth-Pasting Preferred Curves
                    ($10k – $200k BTC)
                  </h3>
                  <p className="text-xs text-slate-400">
                    <code>SATA</code> and <code>STRC</code> paste smoothly with
                    zero slope kink into the $100.00 Par line, while fixed
                    uncapped tiers approach their perpetual ceilings.
                  </p>
                </div>
                <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
                  {(
                    [
                      { id: "ALL", label: "All Tranches" },
                      { id: "ASST", label: "$ASST (SATA / SATS)" },
                      {
                        id: "MSTR",
                        label: "$MSTR (STRF / STRC / STRK / STRD)",
                      },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPrefChartIssuer(f.id)}
                      className={
                        "rounded-md px-2.5 py-1.5 transition " +
                        (prefChartIssuer === f.id
                          ? "bg-slate-800 font-semibold text-white"
                          : "text-slate-400 hover:text-slate-200")
                      }
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 h-80 w-full">
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={btcSweepData}
                      margin={{ top: 10, right: 24, left: 8, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="btcK"
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        domain={[0, 150]}
                        tickFormatter={(v) => "$" + v}
                      />
                      <Tooltip
                        content={<CustomChartTooltip unitPrefix="$" />}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      <ReferenceLine
                        y={100}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                      />
                      {(prefChartIssuer === "ALL" ||
                        prefChartIssuer === "ASST") && (
                        <>
                          <Line
                            type="monotone"
                            dataKey="SATA"
                            name="SATA (13.25% Variable Par-Cap)"
                            stroke="#fb923c"
                            strokeWidth={2.8}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="SATS"
                            name="SATS (15.0% Fixed Uncapped)"
                            stroke="#facc15"
                            strokeWidth={2.2}
                            dot={false}
                          />
                        </>
                      )}
                      {(prefChartIssuer === "ALL" ||
                        prefChartIssuer === "MSTR") && (
                        <>
                          <Line
                            type="monotone"
                            dataKey="STRF_STRE"
                            name="STRF/STRE (10% Tier 1)"
                            stroke="#34d399"
                            strokeWidth={2.2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="STRC"
                            name="STRC (12% Variable Par-Cap)"
                            stroke="#38bdf8"
                            strokeWidth={2.8}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="STRK"
                            name="STRK (8% Straight Floor)"
                            stroke="#a78bfa"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="STRD"
                            name="STRD (10% Junior Non-Cum)"
                            stroke="#f43f5e"
                            strokeWidth={2}
                            dot={false}
                          />
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PUBLIC SEC 8-K LEDGER & INVARIANT TORTURE SUITE */}
        {activeTab === "sheet_audit" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-white">
                        Public SEC Form 8-K &amp; 424B5 Constants Ledger
                      </h2>
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                        {constantsSource === "google_sheets"
                          ? "GOOGLE SHEETS CONNECTED"
                          : "VERIFIED SEC SEED"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-300">
                      Weekly Monday SEC Form 8-K share counts, BTC holdings,
                      debt schedules, and Form 424B5 preferred terms are served
                      read-only via <code>/api/constants</code>. Edit any field
                      below to test What-If scenarios locally in your browser.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset8KBaselines}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset 8-K Baseline
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLedgerJson((prev) => !prev)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs font-medium text-slate-200 transition hover:border-slate-600"
                  >
                    <span>
                      {showLedgerJson ? "Hide JSON" : "Inspect /api/constants"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyAuditItem(
                        "constants-json",
                        publicConstantsJson,
                        "/api/constants JSON"
                      )
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                  >
                    {copiedAuditKey === "constants-json" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-300" />
                        <span>Copied JSON!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Ledger JSON</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              {showLedgerJson && (
                <pre className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300">
                  {publicConstantsJson}
                </pre>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {(
                [
                  {
                    bs: asstBs,
                    ticker: "ASST",
                    accent: "text-orange-400",
                    border: "border-orange-500/25",
                  },
                  {
                    bs: mstrBs,
                    ticker: "MSTR",
                    accent: "text-sky-400",
                    border: "border-sky-500/25",
                  },
                ] as const
              ).map(({ bs, ticker, accent, border }) => (
                <div
                  key={ticker}
                  className={
                    "rounded-2xl border " +
                    border +
                    " bg-slate-900/60 p-5 shadow-lg"
                  }
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h3 className={"text-sm font-bold " + accent}>
                        ${ticker} — Local What-If Balance Sheet Sandbox
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        CIK {bs.cik} &bull; Effective {bs.effectiveDate}
                      </p>
                    </div>
                    <span className="rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-400">
                      CLIENT-SIDE SANDBOX
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
                    <label className="block">
                      <span className="text-[11px] text-slate-400">
                        btc_holdings (BTC)
                      </span>
                      <input
                        type="number"
                        step="100"
                        value={bs.btcHoldings}
                        onChange={(e) =>
                          updateBsField(ticker, "btcHoldings", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-slate-400">
                        cash_reserves ($M)
                      </span>
                      <input
                        type="number"
                        step="10"
                        value={bs.cashReserves}
                        onChange={(e) =>
                          updateBsField(ticker, "cashReserves", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-slate-400">
                        basic_shares (Millions)
                      </span>
                      <input
                        type="number"
                        step="0.5"
                        value={bs.basicShares}
                        onChange={(e) =>
                          updateBsField(ticker, "basicShares", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-slate-400">
                        equity_iv_30d (Decimal)
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={bs.equityIv30d}
                        onChange={(e) =>
                          updateBsField(ticker, "equityIv30d", e.target.value)
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="mt-4 border-t border-slate-800 pt-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Form 424B5 Preferred Tranches ($M Par &amp; Annual Coupon)
                    </div>
                    <div className="space-y-2">
                      {bs.preferreds.map((t) => (
                        <div
                          key={t.name}
                          className="grid grid-cols-3 items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 font-mono text-xs"
                        >
                          <div>
                            <div className="font-semibold text-white">
                              {t.name}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Tier {t.tier} &bull;{" "}
                              {t.variableParCap ? "Var Cap" : "Fixed"}
                            </div>
                          </div>
                          <label className="block">
                            <span className="text-[10px] text-slate-500">
                              par_total ($M)
                            </span>
                            <input
                              type="number"
                              step="25"
                              value={t.parTotal}
                              onChange={(e) =>
                                updateTrancheField(
                                  ticker,
                                  t.name,
                                  "parTotal",
                                  e.target.value
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-white focus:border-orange-500 focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-slate-500">
                              coupon_rate
                            </span>
                            <input
                              type="number"
                              step="0.0025"
                              value={t.couponRate}
                              onChange={(e) =>
                                updateTrancheField(
                                  ticker,
                                  t.name,
                                  "couponRate",
                                  e.target.value
                                )
                              }
                              className="mt-0.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-white focus:border-orange-500 focus:outline-none"
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Browser Invariant Torture Suite */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-white">
                      Open-Source Physics &amp; Financial Invariant Torture
                      Suite
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Executes all 8 mathematical proofs across BTC [$500 –
                    $1,000,000] &times; Vol [25% – 150%] directly in your
                    browser.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right font-mono text-[11px] text-slate-400 tabular-nums">
                    <div>
                      {auditReport.evaluations} grid evaluations in{" "}
                      {auditReport.elapsedMs.toFixed(1)}ms
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextReport = executeInvariantSuite(
                        asstBs,
                        mstrBs,
                        riskFreeRate,
                        tCycle
                      );
                      setAuditReport(nextReport);
                      triggerToast(
                        "Executed " +
                          nextReport.evaluations +
                          " ODE states in " +
                          nextReport.elapsedMs.toFixed(1) +
                          "ms — " +
                          (nextReport.allPassed
                            ? "ALL 8 INVARIANTS PASSED"
                            : "Check warnings")
                      );
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Re-Run Torture Suite</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {auditReport.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 p-3.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-400">
                          {chk.id}
                        </span>
                        <h4 className="text-xs font-bold text-white">
                          {chk.title}
                        </h4>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400">
                        {chk.formula}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-emerald-400">
                        {chk.metric}
                      </div>
                    </div>
                    <span
                      className={
                        "shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] font-bold " +
                        (chk.passed
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-rose-500/40 bg-rose-500/15 text-rose-300")
                      }
                    >
                      {chk.passed ? "PASSED" : "FAILED"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-400">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                <div>
                  <strong className="text-slate-200">
                    Open-Source Verification:
                  </strong>{" "}
                  All valuation math runs from{" "}
                  <code>lib/v31-alpha-engine.ts</code> with zero external
                  dependencies, fed by 5-minute cached server quotes (
                  <code>/api/prices</code>) and weekly SEC Form 8-K &amp; 424B5
                  constants (<code>/api/constants</code>).
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
