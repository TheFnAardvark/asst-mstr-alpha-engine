"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  RefreshCw,
  Sliders,
  ShieldCheck,
  TrendingUp,
  Layers,
  RotateCcw,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Zap,
} from "lucide-react";
import {
  evaluateBalanceSheet,
  executeInvariantSuite,
  type InvariantSuiteReport,
  type ModelConfig,
  type PreferredTranche,
  type TreasuryBalanceSheet,
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
import { TermExplainer } from "@/components/TermExplainer";
import {
  fmtUsd,
  calcAmplificationPct,
  calcNetAmplificationPct,
} from "@/components/dashboard-shared";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import {
  YieldChartsTab,
  type YieldConePoint,
  type HistoricalChartPoint,
  type BtcSweepPoint,
} from "@/components/tabs/YieldChartsTab";
import { PreferredsTab } from "@/components/tabs/PreferredsTab";
import { LedgerAuditTab } from "@/components/tabs/LedgerAuditTab";

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

export default function AlphaDashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "command" | "yield" | "preferreds" | "sheet_audit"
  >("command");
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Collapsible AI Math Verification Drawer state
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
    "Syncing live prices..."
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

  // Automated Math Checks report
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
              "Synced live prices: BTC " +
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

  // Chart 1: 4-Year Required Debt-Free Sats/Share Growth Path
  const yieldConeData = useMemo<YieldConePoint[]>(() => {
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
  const historicalSeries = useMemo<HistoricalChartPoint[]>(() => {
    const evaluateRawPoint = (
      label: string,
      btc: number,
      asstPx: number,
      mstrPx: number
    ): HistoricalChartPoint => {
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
      const aAmpPct = calcAmplificationPct(aEval);
      const mAmpPct = calcAmplificationPct(mEval);
      return {
        date: label,
        btc: Number(btc.toFixed(2)),
        asstPrice: asstPx,
        asstFair: Number(aEval.fairValuePerSh.toFixed(2)),
        asstCebe: Number(aEval.cebePerSh.toFixed(2)),
        asstHurdle: Number(aEval.annualHurdlePct.toFixed(2)),
        asstAmp: aAmpPct !== null ? Number(aAmpPct.toFixed(1)) : null,
        asstUnencSats: Math.round(aEval.unencumberedSatsPerSh),
        mstrPrice: mstrPx,
        mstrFair: Number(mEval.fairValuePerSh.toFixed(2)),
        mstrCebe: Number(mEval.cebePerSh.toFixed(2)),
        mstrHurdle: Number(mEval.annualHurdlePct.toFixed(2)),
        mstrAmp: mAmpPct !== null ? Number(mAmpPct.toFixed(1)) : null,
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
        if (!key) continue
