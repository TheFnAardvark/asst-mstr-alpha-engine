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
  Target,
  Beer,
  Coins,
  ArrowRight,
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
import { computeHurdleMetrics } from "@/lib/hurdle-solver";
import { TermExplainer } from "@/components/TermExplainer";
import {
  fmtUsd,
  calcAmplificationPct,
  calcNetAmplificationPct,
} from "@/components/dashboard-shared";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { BreakEvenTab } from "@/components/tabs/BreakEvenTab";
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

function fmtBtcShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) {
    return Math.round(n).toLocaleString("en-US") + " BTC";
  }
  return (
    n.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + " BTC"
  );
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
    "command" | "breakeven" | "yield" | "preferreds" | "sheet_audit"
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

  // Clean Unencumbered vs. Total Vault Hurdle Metrics & "Drink a Beer" Targets
  const asstHurdle = useMemo(
    () =>
      computeHurdleMetrics(
        asstBs,
        asstActive,
        activeSigma,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [asstBs, asstActive, activeSigma, riskFreeRate, tCycle, solvencyCap]
  );

  const mstrHurdle = useMemo(
    () =>
      computeHurdleMetrics(
        mstrBs,
        mstrActive,
        activeSigma,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [mstrBs, mstrActive, activeSigma, riskFreeRate, tCycle, solvencyCap]
  );

  // Chart 1: 4-Year Required Debt-Free Sats/Share Growth Path (Compounded on TRUE Unencumbered Hurdle)
  const yieldConeData = useMemo<YieldConePoint[]>(() => {
    const steps = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
    const aSats0 = asstActive.unencumberedSatsPerSh;
    const mSats0 = mstrActive.unencumberedSatsPerSh;
    const aHurdle =
      (asstHurdle.unencumberedBtcHurdleAnnualPct ??
        asstActive.annualHurdlePct) / 100.0;
    const mHurdle =
      (mstrHurdle.unencumberedBtcHurdleAnnualPct ??
        mstrActive.annualHurdlePct) / 100.0;

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
  }, [coneTarget, asstActive, mstrActive, asstHurdle, mstrHurdle]);

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

    const byDate = new Map<string, HistoricalChartPoint>();
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
  const btcSweepData = useMemo<BtcSweepPoint[]>(() => {
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
      const aGrossRaw = calcAmplificationPct(aRes);
      const mGrossRaw = calcAmplificationPct(mRes);
      const aNetRaw = calcNetAmplificationPct(aRes);
      const mNetRaw = calcNetAmplificationPct(mRes);

      return {
        btcK: "$" + px / 1000 + "k",
        btc: px,
        asstFair: Number(aRes.fairValuePerSh.toFixed(2)),
        asstCebe: Number(aRes.cebePerSh.toFixed(2)),
        asstSats: Math.round(aRes.unencumberedSatsPerSh),
        asstRawSats: Math.round(aRes.rawSatsPerSh),
        asstGrossAmp:
          aGrossRaw !== null && aGrossRaw <= 250
            ? Number(aGrossRaw.toFixed(1))
            : null,
        asstNetAmp:
          aNetRaw !== null && aNetRaw <= 250
            ? Number(aNetRaw.toFixed(1))
            : null,
        mstrFair: Number(mRes.fairValuePerSh.toFixed(2)),
        mstrCebe: Number(mRes.cebePerSh.toFixed(2)),
        mstrSats: Math.round(mRes.unencumberedSatsPerSh),
        mstrRawSats: Math.round(mRes.rawSatsPerSh),
        mstrGrossAmp:
          mGrossRaw !== null && mGrossRaw <= 250
            ? Number(mGrossRaw.toFixed(1))
            : null,
        mstrNetAmp:
          mNetRaw !== null && mNetRaw <= 250
            ? Number(mNetRaw.toFixed(1))
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

  // Dynamic Open-Source AI Audit Payloads
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
    triggerToast("Pinned current snapshot to your local chart preview.");
  };

  const handleResetToLive = () => {
    setBtcPrice(liveFeedPrices.btc);
    setAsstPrice(liveFeedPrices.asst);
    setMstrPrice(liveFeedPrices.mstr);
    setRiskFreeRate(modelConfig.riskFreeRate);
    setVolMode("hv");
    setCustomSigma(hvSigma);
    setIsSandboxOverride(false);
    triggerToast("Reset prices and volatility back to live market data.");
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
    triggerToast("Restored official SEC filing balance sheets.");
  };

  const handleRerunAudit = () => {
    const nextReport = executeInvariantSuite(
      asstBs,
      mstrBs,
      riskFreeRate,
      tCycle
    );
    setAuditReport(nextReport);
    triggerToast(
      "Checked " +
        nextReport.evaluations +
        " scenarios in " +
        nextReport.elapsedMs.toFixed(1) +
        "ms — " +
        (nextReport.allPassed ? "ALL 8 CHECKS PASSED" : "Review warnings")
    );
  };

  const activeVolTermKey =
    volMode === "hv"
      ? "vol_1y_hv"
      : volMode === "cycle"
      ? "vol_cycle"
      : "vol_custom";

  const navTabs: Array<{
    id: "command" | "breakeven" | "yield" | "preferreds" | "sheet_audit";
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeTone?: "emerald" | "orange";
  }> = [
    {
      id: "command",
      label: "Overview & Scorecard",
      icon: BarChart3,
    },
    {
      id: "breakeven",
      label: "Break-Even Simulator",
      icon: Target,
      badge: "4 LEVERS",
      badgeTone: "orange",
    },
    {
      id: "yield",
      label: "BTC Growth Hurdle & Charts",
      icon: TrendingUp,
    },
    {
      id: "preferreds",
      label: "Preferred Stock Waterfall",
      icon: Layers,
    },
    {
      id: "sheet_audit",
      label: "Balance Sheets & Math Checks",
      icon: ShieldCheck,
      badge: auditReport.allPassed ? "8/8 PASS" : "CHECK",
      badgeTone: "emerald",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-orange-500/30 selection:text-orange-200">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-2.5 rounded-lg border border-orange-500/40 bg-slate-900/95 px-4 py-3 text-xs font-medium text-slate-100 shadow-2xl backdrop-blur-md">
          <Zap className="h-4 w-4 shrink-0 text-orange-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER */}
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
                    ASST &amp; MSTR Bitcoin Treasury Alpha Engine
                  </h1>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                    v{modelConfig.engineVersion} Model
                  </span>
                  {(isSandboxOverride || hasBsOverride) && (
                    <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                      WHAT-IF MODE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Live Structural Valuation &bull; Preferred Payout Waterfall
                  &bull; Open-Source Math
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

              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/90 p-0.5 font-mono text-[11px]">
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
                  {(hvSigma * 100).toFixed(1)}% 1Y Vol
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
                  {(cycleSigma * 100).toFixed(1)}% Cycle Vol
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
                    ? (customSigma * 100).toFixed(1) + "% Custom"
                    : "Custom Vol"}
                </button>
                <div className="px-1.5">
                  <TermExplainer
                    termKey={activeVolTermKey}
                    iconOnly
                    iconClassName="h-3.5 w-3.5"
                  />
                </div>
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
                title="Pin the current prices as a temporary point on the historical chart"
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Pin Tick</span>
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

          {/* WHAT-IF STRESS-TEST DRAWER */}
          {sandboxOpen && (
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-200">
                  <Sliders className="h-4 w-4 text-orange-400" />
                  <span>What-If Price &amp; Volatility Stress-Test</span>
                  <span className="font-mono text-[11px] font-normal text-slate-400">
                    (Runs privately in your browser &mdash; never alters live
                    data)
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
                    <span className="text-slate-400">Bitcoin Spot Price</span>
                    <span className="font-bold text-orange-400">
                      {fmtUsd(btcPrice, 0)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15000}
                    max={250000}
                    step={500}
                    aria-label="Bitcoin Spot Price"
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
                    <TermExplainer
                      termKey="vol_custom"
                      className="text-slate-400"
                    >
                      Bitcoin Volatility
                    </TermExplainer>
                    <span className="font-bold text-amber-300">
                      {(activeSigma * 100).toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.18}
                    max={1.5}
                    step={0.005}
                    aria-label="Bitcoin Volatility"
                    value={activeSigma}
                    onChange={(e) => {
                      setCustomSigma(Number(e.target.value));
                      setVolMode("custom");
                      setIsSandboxOverride(true);
                    }}
                    className="w-full accent-amber-400"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>18% Calm</span>
                    <span>50% Cycle</span>
                    <span>150% Wild</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">$ASST Stock Price</span>
                    <span className="font-bold text-white">
                      {fmtUsd(asstPrice)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={85}
                    step={0.1}
                    aria-label="ASST Stock Price"
                    value={asstPrice}
                    onChange={(e) => {
                      setAsstPrice(Number(e.target.value));
                      setIsSandboxOverride(true);
                    }}
                    className="w-full accent-orange-400"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>$2.00</span>
                    <span>Fair: {fmtUsd(asstActive.fairValuePerSh)}</span>
                    <span>$85.00</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">$MSTR Stock Price</span>
                    <span className="font-bold text-sky-400">
                      {fmtUsd(mstrPrice)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={450}
                    step={0.5}
                    aria-label="MSTR Stock Price"
                    value={mstrPrice}
                    onChange={(e) => {
                      setMstrPrice(Number(e.target.value));
                      setIsSandboxOverride(true);
                    }}
                    className="w-full accent-sky-400"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>$20</span>
                    <span>Fair: {fmtUsd(mstrActive.fairValuePerSh)}</span>
                    <span>$450</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PRIMARY NAVIGATION TABS */}
          <nav className="mt-3 flex space-x-1 overflow-x-auto border-t border-slate-800/70 pt-2">
            {navTabs.map((tab) => {
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
                  {tab.badge && (
                    <span
                      className={
                        "rounded px-1.5 py-0.5 font-mono text-[10px] " +
                        (tab.badgeTone === "orange"
                          ? "bg-orange-500/15 text-orange-300"
                          : "bg-emerald-500/15 text-emerald-400")
                      }
                    >
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
            {/* EXACT DEBT-FREE BTC NEEDED & "DRINK A BEER" BREAK-EVEN STRIP */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-orange-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    What Clears Today&apos;s Premium Completely? (Ending Premium
                    = $0)
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("breakeven")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/25"
                >
                  <Target className="h-3.5 w-3.5" />
                  <span>Open 4-Lever Break-Even Simulator</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(
                  [
                    {
                      ticker: "ASST",
                      accent: "border-orange-500/30",
                      tagClass: "text-orange-400",
                      h: asstHurdle,
                    },
                    {
                      ticker: "MSTR",
                      accent: "border-sky-500/30",
                      tagClass: "text-sky-400",
                      h: mstrHurdle,
                    },
                  ] as const
                ).map(({ ticker, accent, tagClass, h }) => (
                  <div
                    key={ticker}
                    className={
                      "rounded-xl border bg-slate-950/65 p-3.5 font-mono text-xs " +
                      accent
                    }
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <span className={"font-bold " + tagClass}>
                        ${ticker} Hurdle Reality Check
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {h.alreadyAtDiscount
                          ? "At/Below Fair Value"
                          : "Unenc. " +
                            (h.unencumberedBtcHurdleAnnualPct !== null
                              ? h.unencumberedBtcHurdleAnnualPct.toFixed(1) +
                                "%/yr"
                              : "N/A") +
                            " • Vault " +
                            h.totalBtcHurdleAnnualPct.toFixed(1) +
                            "%/yr"}
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      <div>
                        <TermExplainer
                          termKey="unencumbered_btc_needed"
                          className="text-[10px] text-slate-400"
                        >
                          Debt-Free BTC
                        </TermExplainer>
                        <div className="mt-0.5 text-sm font-bold text-white tabular-nums">
                          {h.alreadyAtDiscount
                            ? "0 BTC"
                            : "+" + fmtBtcShort(h.unencumberedBtcNeeded)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {h.alreadyAtDiscount
                            ? "Cleared"
                            : "+" +
                              Math.round(
                                h.unencumberedSatsNeededPerSh
                              ).toLocaleString() +
                              " sats/sh"}
                        </div>
                      </div>

                      <div>
                        <TermExplainer
                          termKey="drink_a_beer_btc"
                          className="text-[10px] text-amber-300"
                        >
                          Drink a Beer
                        </TermExplainer>
                        <div className="mt-0.5 flex items-center gap-1 text-sm font-bold text-amber-300 tabular-nums">
                          <Beer className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {h.alreadyAtDiscount
                              ? "Cleared"
                              : h.drinkABeerUsdBtc !== null
                              ? fmtUsd(h.drinkABeerUsdBtc, 0)
                              : "N/A"}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          $0 Prem. USD Even
                        </div>
                      </div>

                      <div>
                        <TermExplainer
                          termKey="beat_spot_btc"
                          className="text-[10px] text-emerald-300"
                        >
                          Beat Spot BTC
                        </TermExplainer>
                        <div className="mt-0.5 text-sm font-bold text-emerald-400 tabular-nums">
                          {h.beatSpotBtc !== null
                            ? h.beatSpotBtc <= btcPrice + 1
                              ? "Now"
                              : fmtUsd(h.beatSpotBtc, 0)
                            : "Needs Issue"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Zero-Issuance Wait
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <OverviewTab
              mounted={mounted}
              constantsSource={constantsSource}
              lastPolledAt={lastPolledAt}
              asstBs={asstBs}
              mstrBs={mstrBs}
              asstActive={asstActive}
              mstrActive={mstrActive}
              asstHv={asstHv}
              asstCycle={asstCycle}
              mstrHv={mstrHv}
              mstrCycle={mstrCycle}
              btcPrice={btcPrice}
              activeSigma={activeSigma}
              hvSigma={hvSigma}
              cycleSigma={cycleSigma}
              riskFreeRate={riskFreeRate}
              tCycle={tCycle}
              auditDrawerOpen={auditDrawerOpen}
              setAuditDrawerOpen={setAuditDrawerOpen}
              auditSubTab={auditSubTab}
              setAuditSubTab={setAuditSubTab}
              copiedAuditKey={copiedAuditKey}
              handleCopyAuditItem={handleCopyAuditItem}
              llmAuditPrompt={llmAuditPrompt}
              stateTraceMarkdown={stateTraceMarkdown}
              pythonVerifierCode={pythonVerifierCode}
              fullAuditBundleText={fullAuditBundleText}
            />
          </div>
        )}

        {activeTab === "breakeven" && (
          <BreakEvenTab
            asstBs={asstBs}
            mstrBs={mstrBs}
            asstActive={asstActive}
            mstrActive={mstrActive}
            btcPrice={btcPrice}
            asstPrice={asstPrice}
            mstrPrice={mstrPrice}
            activeSigma={activeSigma}
            riskFreeRate={riskFreeRate}
            tCycle={tCycle}
            solvencyCap={solvencyCap}
          />
        )}

        {activeTab === "yield" && (
          <YieldChartsTab
            mounted={mounted}
            asstActive={asstActive}
            mstrActive={mstrActive}
            yieldConeData={yieldConeData}
            coneTarget={coneTarget}
            setConeTarget={setConeTarget}
            historicalSeries={historicalSeries}
            historyTimeframe={historyTimeframe}
            setHistoryTimeframe={setHistoryTimeframe}
            historyMetric={historyMetric}
            setHistoryMetric={setHistoryMetric}
            btcSweepData={btcSweepData}
            sweepMode={sweepMode}
            setSweepMode={setSweepMode}
          />
        )}

        {activeTab === "preferreds" && (
          <PreferredsTab
            mounted={mounted}
            asstBs={asstBs}
            mstrBs={mstrBs}
            asstActive={asstActive}
            mstrActive={mstrActive}
            preferredQuotes={preferredQuotes}
            btcSweepData={btcSweepData}
            prefChartIssuer={prefChartIssuer}
            setPrefChartIssuer={setPrefChartIssuer}
          />
        )}

        {activeTab === "sheet_audit" && (
          <LedgerAuditTab
            constantsSource={constantsSource}
            asstBs={asstBs}
            mstrBs={mstrBs}
            showLedgerJson={showLedgerJson}
            setShowLedgerJson={setShowLedgerJson}
            publicConstantsJson={publicConstantsJson}
            copiedAuditKey={copiedAuditKey}
            handleCopyAuditItem={handleCopyAuditItem}
            handleReset8KBaselines={handleReset8KBaselines}
            updateBsField={updateBsField}
            updateTrancheField={updateTrancheField}
            auditReport={auditReport}
            onRerunAudit={handleRerunAudit}
          />
        )}
      </main>
    </div>
  );
}
