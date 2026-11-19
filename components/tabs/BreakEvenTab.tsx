"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Beer,
  Target,
  TrendingUp,
  Layers,
  Coins,
  Sliders,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Scale,
  ArrowRight,
  Zap,
} from "lucide-react";
import type {
  TreasuryBalanceSheet,
  ValuationResult,
} from "@/lib/v31-alpha-engine";
import {
  computeHurdleMetrics,
  simulateBreakEvenScenario,
  getPrimaryPrefTranche,
} from "@/lib/hurdle-solver";
import { TermExplainer } from "@/components/TermExplainer";
import {
  fmtUsd,
  calcAmplificationPct,
} from "@/components/dashboard-shared";

export interface BreakEvenTabProps {
  asstBs: TreasuryBalanceSheet;
  mstrBs: TreasuryBalanceSheet;
  asstActive: ValuationResult;
  mstrActive: ValuationResult;
  btcPrice: number;
  asstPrice: number;
  mstrPrice: number;
  activeSigma: number;
  riskFreeRate: number;
  tCycle: number;
  solvencyCap: number;
}

function fmtBtc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) {
    return Math.round(n).toLocaleString("en-US") + " BTC";
  }
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + " BTC";
}

function fmtSats(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US") + " sats";
}

function fmtSignedPct(n: number, decimals: number = 1): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(decimals) + "%";
}

function fmtMillions(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) {
    return "$" + (n / 1000).toFixed(2) + "B";
  }
  return "$" + Math.round(n).toLocaleString("en-US") + "M";
}

function computeLivePremiumPct(livePrice: number, fairValue: number): number {
  if (fairValue <= 0 || livePrice <= fairValue) return 0;
  return Math.min(300, Math.round(((livePrice / fairValue) - 1) * 100));
}

export function BreakEvenTab({
  asstBs,
  mstrBs,
  asstActive,
  mstrActive,
  btcPrice,
  asstPrice,
  mstrPrice,
  activeSigma,
  riskFreeRate,
  tCycle,
  solvencyCap,
}: BreakEvenTabProps) {
  const [ticker, setTicker] = useState<"ASST" | "MSTR">("ASST");

  const activeBs = ticker === "ASST" ? asstBs : mstrBs;
  const activeEval = ticker === "ASST" ? asstActive : mstrActive;
  const liveStockPrice = ticker === "ASST" ? asstPrice : mstrPrice;

  const livePremiumPct = useMemo(
    () => computeLivePremiumPct(liveStockPrice, activeEval.fairValuePerSh),
    [liveStockPrice, activeEval.fairValuePerSh]
  );

  // The 4 timeless tug-of-war levers
  const [futureBtcPrice, setFutureBtcPrice] = useState<number>(btcPrice);
  const [atmDollarsM, setAtmDollarsM] = useState<number>(0);
  const [atmPremiumPct, setAtmPremiumPct] = useState<number>(livePremiumPct);
  const [prefDollarsM, setPrefDollarsM] = useState<number>(0);
  const [hasTouched, setHasTouched] = useState<boolean>(false);

  // Keep defaults synced with live market feed until the user drags a lever
  useEffect(() => {
    if (!hasTouched) {
      setFutureBtcPrice(btcPrice);
      setAtmPremiumPct(livePremiumPct);
    }
  }, [btcPrice, livePremiumPct, hasTouched]);

  const handleSelectTicker = (next: "ASST" | "MSTR") => {
    setTicker(next);
    const nextEval = next === "ASST" ? asstActive : mstrActive;
    const nextPx = next === "ASST" ? asstPrice : mstrPrice;
    setFutureBtcPrice(btcPrice);
    setAtmDollarsM(0);
    setPrefDollarsM(0);
    setAtmPremiumPct(computeLivePremiumPct(nextPx, nextEval.fairValuePerSh));
    setHasTouched(false);
  };

  // Scale ATM / Preferred slider caps sensibly per issuer
  const issuanceMaxM = ticker === "ASST" ? 1500 : 20000;
  const issuanceStepM = ticker === "ASST" ? 10 : 100;

  // Baseline zero-issuance hurdle metrics
  const baseHurdle = useMemo(
    () =>
      computeHurdleMetrics(
        activeBs,
        activeEval,
        activeSigma,
        riskFreeRate,
        tCycle,
        solvencyCap
      ),
    [activeBs, activeEval, activeSigma, riskFreeRate, tCycle, solvencyCap]
  );

  // Live 4-lever simulation
  const sim = useMemo(
    () =>
      simulateBreakEvenScenario({
        bs: activeBs,
        btcPrice0: btcPrice,
        liveStockPrice,
        sigma: activeSigma,
        r: riskFreeRate,
        tCycle,
        solvencyCap,
        futureBtcPrice,
        atmDollarsM,
        atmPremiumPct,
        prefDollarsM,
      }),
    [
      activeBs,
      btcPrice,
      liveStockPrice,
      activeSigma,
      riskFreeRate,
      tCycle,
      solvencyCap,
      futureBtcPrice,
      atmDollarsM,
      atmPremiumPct,
      prefDollarsM,
    ]
  );

  const primaryPref = useMemo(
    () => getPrimaryPrefTranche(activeBs),
    [activeBs]
  );

  const baseAmp = calcAmplificationPct(activeEval);
  const simAmp = calcAmplificationPct(sim.simRes);

  const btcSliderMax = useMemo(() => {
    const highestTarget = Math.max(
      300_000,
      futureBtcPrice,
      baseHurdle.drinkABeerUsdBtc ?? 0
    );
    return Math.min(1_000_000, Math.ceil(highestTarget / 25_000) * 25_000);
  }, [futureBtcPrice, baseHurdle.drinkABeerUsdBtc]);

  const hasIssuancePull = atmDollarsM > 0 || prefDollarsM > 0;
  const btcPctChangeFromSpot =
    btcPrice > 0 ? ((futureBtcPrice / btcPrice) - 1) * 100 : 0;

  // One-click presets
  const applyReset = () => {
    setFutureBtcPrice(btcPrice);
    setAtmDollarsM(0);
    setPrefDollarsM(0);
    setAtmPremiumPct(livePremiumPct);
    setHasTouched(false);
  };

  const applyDrinkABeer = () => {
    const targetBtc = baseHurdle.drinkABeerUsdBtc
      ? Math.ceil(baseHurdle.drinkABeerUsdBtc / 500) * 500
      : btcPrice;
    setAtmDollarsM(0);
    setPrefDollarsM(0);
    setAtmPremiumPct(livePremiumPct);
    setFutureBtcPrice(Math.max(btcPrice, targetBtc));
    setHasTouched(true);
  };

  const applyBeatSpotWait = () => {
    if (!baseHurdle.beatSpotBtc) return;
    const targetBtc = Math.ceil(baseHurdle.beatSpotBtc / 500) * 500;
    setAtmDollarsM(0);
    setPrefDollarsM(0);
    setAtmPremiumPct(livePremiumPct);
    setFutureBtcPrice(targetBtc);
    setHasTouched(true);
  };

  const applyZeroPremiumPrefs = () => {
    setAtmPremiumPct(0);
    setAtmDollarsM(0);
    setPrefDollarsM(ticker === "ASST" ? 250 : 3000);
    setFutureBtcPrice(Math.round((btcPrice * 1.4) / 1000) * 1000);
    setHasTouched(true);
  };

  const accentBorder =
    ticker === "ASST" ? "border-orange-500/40" : "border-sky-500/40";
  const accentText = ticker === "ASST" ? "text-orange-400" : "text-sky-400";

  const clampedBarPct = Math.max(0, Math.min(100, sim.hurdleProgressPct));
  const satsDelta =
    sim.simRes.unencumberedSatsPerSh - activeEval.unencumberedSatsPerSh;

  return (
    <div className="space-y-6">
      {/* TOP BAR: ISSUER SWITCHER + PRESETS */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-orange-300">
                <Sliders className="h-3.5 w-3.5" />
                ZERO-PREMIUM STRESS TEST
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Ending Premium Locked at $0.00 (1.00x Fair Value)
              </span>
            </div>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-white sm:text-xl">
              What Has to Happen to Clear the Hurdle Completely?
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              A 4-year annual hurdle rate sounds intimidating until you see what
              actually clears it. If Bitcoin rips tomorrow, you clear the whole
              hurdle in a day. Pull the four tug-of-war levers below to test
              what clears today&apos;s premium&mdash;even if the market premium
              collapses straight to $0 right after.
            </p>
          </div>

          {/* Ticker Switcher */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => handleSelectTicker("ASST")}
                className={
                  "rounded-lg px-4 py-2 font-bold transition " +
                  (ticker === "ASST"
                    ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40"
                    : "text-slate-400 hover:text-slate-200")
                }
              >
                $ASST ({fmtUsd(asstPrice)})
              </button>
              <button
                type="button"
                onClick={() => handleSelectTicker("MSTR")}
                className={
                  "rounded-lg px-4 py-2 font-bold transition " +
                  (ticker === "MSTR"
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40"
                    : "text-slate-400 hover:text-slate-200")
                }
              >
                $MSTR ({fmtUsd(mstrPrice)})
              </button>
            </div>
          </div>
        </div>

        {/* One-Click Presets */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-4">
          <span className="mr-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Quick Scenarios:
          </span>
          <button
            type="button"
            onClick={applyDrinkABeer}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
          >
            <Beer className="h-3.5 w-3.5" />
            Drink a Beer (Wait for BTC)
          </button>
          <button
            type="button"
            onClick={applyBeatSpotWait}
            disabled={!baseHurdle.beatSpotBtc}
            title={
              baseHurdle.beatSpotBtc
                ? "Snap to exact BTC price where waiting alone beats spot BTC"
                : "At today's price, waiting alone cannot beat spot BTC without issuance"
            }
            className={
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition " +
              (baseHurdle.beatSpotBtc
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-600")
            }
          >
            <Target className="h-3.5 w-3.5" />
            Beat Spot BTC (Wait Only)
          </button>
          <button
            type="button"
            onClick={applyZeroPremiumPrefs}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-300 transition hover:bg-purple-500/20"
          >
            <Layers className="h-3.5 w-3.5" />
            0% Premium ({primaryPref?.name ?? "Prefs"} + BTC)
          </button>
          <button
            type="button"
            onClick={applyReset}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Live
          </button>
        </div>
      </div>

      {/* HEADLINE ZERO-ISSUANCE BASELINE CARDS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Card 1: Exact Unencumbered BTC Needed */}
        <div
          className={
            "rounded-2xl border bg-slate-900/60 p-5 shadow-lg " + accentBorder
          }
        >
          <div className="flex items-center justify-between">
            <TermExplainer
              termKey="unencumbered_btc_needed"
              className="text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Debt-Free BTC Needed (Flat BTC)
            </TermExplainer>
            <Coins className={"h-4 w-4 " + accentText} />
          </div>

          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {baseHurdle.alreadyAtDiscount
              ? "0 BTC"
              : "+" + fmtBtc(baseHurdle.unencumberedBtcNeeded)}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-400">
            {baseHurdle.alreadyAtDiscount
              ? "Already trading at or below Model Fair Value"
              : "+" +
                fmtSats(baseHurdle.unencumberedSatsNeededPerSh) +
                " / share at " +
                fmtUsd(btcPrice, 0) +
                " BTC"}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-3 font-mono text-[11px]">
            <div>
              <TermExplainer
                termKey="unencumbered_btc_hurdle"
                className="text-slate-400"
              >
                Unenc. Hurdle
              </TermExplainer>
              <div className="mt-0.5 font-bold text-white">
                {baseHurdle.unencumberedBtcHurdleAnnualPct !== null
                  ? baseHurdle.unencumberedBtcHurdleAnnualPct.toFixed(1) +
                    "%/yr"
                  : "N/A (Underwater)"}
              </div>
            </div>
            <div>
              <TermExplainer
                termKey="total_btc_hurdle"
                className="text-slate-400"
              >
                Total Vault Hurdle
              </TermExplainer>
              <div className="mt-0.5 font-bold text-slate-200">
                {baseHurdle.totalBtcHurdleAnnualPct.toFixed(1)}%/yr
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: "Drink a Beer" Dollar Break-Even BTC */}
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <TermExplainer
              termKey="drink_a_beer_btc"
              className="text-xs font-semibold uppercase tracking-wider text-amber-300"
            >
              &ldquo;Drink a Beer&rdquo; Break-Even BTC
            </TermExplainer>
            <Beer className="h-4 w-4 text-amber-400" />
          </div>

          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {baseHurdle.alreadyAtDiscount
              ? "Already Cleared"
              : baseHurdle.drinkABeerUsdBtc !== null
              ? fmtUsd(baseHurdle.drinkABeerUsdBtc, 0)
              : "N/A"}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-400">
            {baseHurdle.alreadyAtDiscount
              ? "Fair Value (" +
                fmtUsd(activeEval.fairValuePerSh) +
                ") already beats stock price"
              : baseHurdle.drinkABeerUsdBtc !== null
              ? fmtSignedPct(
                  ((baseHurdle.drinkABeerUsdBtc / btcPrice) - 1) * 100
                ) + " from spot with ZERO issuance"
              : "Above simulation ceiling"}
          </div>

          <div className="mt-3 border-t border-slate-800/80 pt-3 font-mono text-[11px]">
            {hasIssuancePull ? (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">With your sliders now:</span>
                <span className="font-bold text-amber-300">
                  {sim.simDollarBreakEvenBtc !== null
                    ? fmtUsd(sim.simDollarBreakEvenBtc, 0) + " BTC"
                    : "N/A"}
                </span>
              </div>
            ) : (
              <span className="text-slate-500">
                Pull ATM or Preferred sliders to yank this target lower.
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Beat-Spot-BTC Price */}
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <TermExplainer
              termKey="beat_spot_btc"
              className="text-xs font-semibold uppercase tracking-wider text-emerald-300"
            >
              Beat-Spot-BTC Price ($0 Prem.)
            </TermExplainer>
            <Target className="h-4 w-4 text-emerald-400" />
          </div>

          <div className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {baseHurdle.beatSpotBtc !== null
              ? baseHurdle.beatSpotBtc <= btcPrice + 1
                ? "Beats Spot Now"
                : fmtUsd(baseHurdle.beatSpotBtc, 0)
              : "Needs Issuance"}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-400">
            {baseHurdle.beatSpotBtc !== null
              ? baseHurdle.beatSpotBtc <= btcPrice + 1
                ? "Stock already trades below Model Fair Value"
                : fmtSignedPct(((baseHurdle.beatSpotBtc / btcPrice) - 1) * 100) +
                  " from spot — leverage overtakes spot BTC"
              : "Entry exceeds 1.0x gross vault — waiting alone can't beat spot"}
          </div>

          <div className="mt-3 border-t border-slate-800/80 pt-3 font-mono text-[11px]">
            {hasIssuancePull ? (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">With your sliders now:</span>
                <span className="font-bold text-emerald-300">
                  {sim.simBeatSpotBtc !== null
                    ? fmtUsd(sim.simBeatSpotBtc, 0) + " BTC"
                    : "Still Needs More"}
                </span>
              </div>
            ) : (
              <span className="text-slate-500">
                Shows when holding {ticker} beats just buying spot BTC.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* LIVE OUTCOME VERDICT & PROGRESS BAR */}
      <div
        className={
          "rounded-2xl border p-5 shadow-xl transition-colors " +
          (sim.beatsSpotBtc
            ? "border-emerald-500/40 bg-emerald-950/20"
            : sim.clearedDollarBreakEven
            ? "border-amber-500/40 bg-amber-950/20"
            : "border-slate-800 bg-slate-900/70")
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {sim.beatsSpotBtc ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : sim.clearedDollarBreakEven ? (
              <Zap className="h-5 w-5 shrink-0 text-amber-400" />
            ) : (
              <Scale className="h-5 w-5 shrink-0 text-slate-400" />
            )}
            <div>
              <div className="text-sm font-bold text-white">
                {sim.beatsSpotBtc
                  ? "HURDLE SMASHED — Beats Buying Spot BTC (Even at $0 Premium!)"
                  : sim.clearedDollarBreakEven
                  ? "DOLLAR BREAK-EVEN CLEARED — Profitable in USD (Still Trails Spot BTC)"
                  : "HURDLE NOT YET CLEARED — " +
                    fmtUsd(Math.abs(sim.usdPnlPerSh)) +
                    "/sh Short of Break-Even"}
              </div>
              <p className="text-xs text-slate-400">
                If you buy ${ticker} at{" "}
                <span className="font-mono text-slate-200">
                  {fmtUsd(liveStockPrice)}
                </span>{" "}
                today, these levers play out, and the Growth Premium collapses
                to <span className="font-mono text-slate-200">$0.00</span>:
              </p>
            </div>
          </div>

          <div className="font-mono text-right">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Break-Even Progress
            </div>
            <div
              className={
                "text-xl font-bold tabular-nums " +
                (sim.beatsSpotBtc
                  ? "text-emerald-400"
                  : sim.clearedDollarBreakEven
                  ? "text-amber-300"
                  : "text-white")
              }
            >
              {sim.hurdleProgressPct.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={
              "h-full rounded-full transition-all duration-200 " +
              (sim.beatsSpotBtc
                ? "bg-emerald-400"
                : sim.clearedDollarBreakEven
                ? "bg-amber-400"
                : ticker === "ASST"
                ? "bg-orange-400"
                : "bg-sky-400")
            }
            style={{ width: clampedBarPct + "%" }}
          />
        </div>

        {/* 4 Outcome Stat Boxes */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono">
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">
              New Fair Value ($0 Prem.)
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold text-white tabular-nums">
                {fmtUsd(sim.simRes.fairValuePerSh)}
              </span>
              <span
                className={
                  "text-xs font-semibold " +
                  (sim.usdReturnPct >= 0 ? "text-emerald-400" : "text-rose-400")
                }
              >
                {fmtSignedPct(sim.usdReturnPct)}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              vs. {fmtUsd(liveStockPrice)} entry ({sim.usdPnlPerSh >= 0 ? "+" : ""}
              {fmtUsd(sim.usdPnlPerSh)}/sh)
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">
              Same Dollars in Spot BTC
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-200 tabular-nums">
                {fmtUsd(sim.spotEquivValuePerSh)}
              </span>
              <span className="text-xs text-slate-400">
                {fmtSignedPct(sim.spotReturnPct)}
              </span>
            </div>
            <div
              className={
                "mt-0.5 text-[11px] font-semibold " +
                (sim.alphaVsSpotPct >= 0 ? "text-emerald-400" : "text-amber-300")
              }
            >
              {ticker} vs. Spot: {fmtSignedPct(sim.alphaVsSpotPct)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">
              Debt-Free Sats / Share
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white tabular-nums">
              <span className="text-slate-400">
                {Math.round(activeEval.unencumberedSatsPerSh).toLocaleString()}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-lg">
                {Math.round(sim.simRes.unencumberedSatsPerSh).toLocaleString()}
              </span>
            </div>
            <div
              className={
                "mt-0.5 text-[11px] " +
                (satsDelta >= 0 ? "text-emerald-400" : "text-rose-400")
              }
            >
              {satsDelta >= 0 ? "+" : ""}
              {Math.round(satsDelta).toLocaleString()} sats/sh unlocked
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3">
            <div className="text-[11px] text-slate-400">
              Amplification (Leverage Tug)
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white tabular-nums">
              <span className="text-slate-400">
                {baseAmp !== null ? baseAmp.toFixed(1) + "%" : "—"}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-lg">
                {simAmp !== null ? simAmp.toFixed(1) + "%" : "—"}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              BTC &amp; ATM pull down &bull; Prefs pull up
            </div>
          </div>
        </div>
      </div>

      {/* THE 4 TUG-OF-WAR LEVERS (2x2 GRID) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEVER 1: FUTURE BTC PRICE */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-orange-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-orange-300">
                  LEVER 1
                </span>
                <h3 className="text-sm font-bold text-white">
                  Future Bitcoin Price
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Rising BTC shrinks fixed-dollar debt &amp; preferreds, freeing
                up more of the vault for common shares automatically.
              </p>
            </div>
            <div className="text-right font-mono">
              <div className="text-lg font-bold text-orange-400 tabular-nums">
                {fmtUsd(futureBtcPrice, 0)}
              </div>
              <div
                className={
                  "text-[11px] font-semibold " +
                  (btcPctChangeFromSpot >= 0
                    ? "text-emerald-400"
                    : "text-rose-400")
                }
              >
                {fmtSignedPct(btcPctChangeFromSpot)} vs. spot
              </div>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="range"
              min={25000}
              max={btcSliderMax}
              step={500}
              aria-label="Future Bitcoin Price"
              value={futureBtcPrice}
              onChange={(e) => {
                setFutureBtcPrice(Number(e.target.value));
                setHasTouched(true);
              }}
              className="w-full accent-orange-500"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
              <span>$25k</span>
              <span>Spot: {fmtUsd(btcPrice, 0)}</span>
              <span>${Math.round(btcSliderMax / 1000)}k</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              { label: "Spot", px: btcPrice },
              { label: "$100k", px: 100000 },
              { label: "$125k", px: 125000 },
              { label: "$150k", px: 150000 },
              { label: "$200k", px: 200000 },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setFutureBtcPrice(chip.px);
                  setHasTouched(true);
                }}
                className={
                  "rounded-md border px-2.5 py-1 font-mono text-[11px] transition " +
                  (Math.abs(futureBtcPrice - chip.px) < 500
                    ? "border-orange-500/50 bg-orange-500/20 font-semibold text-orange-300"
                    : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200")
                }
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* LEVER 2: COMMON STOCK ATM ISSUANCE */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-sky-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                  LEVER 2
                </span>
                <h3 className="text-sm font-bold text-white">
                  Common Stock ATM Issuance
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Sell new common shares to buy BTC today. Mints debt-free
                sats/share immediately&mdash;<em>only</em> if issued above 0%
                premium (Lever 3).
              </p>
            </div>
            <div className="text-right font-mono">
              <div className="text-lg font-bold text-sky-400 tabular-nums">
                {fmtMillions(atmDollarsM)}
              </div>
              <div className="text-[11px] text-slate-400">
                +{fmtBtc(sim.btcBoughtByAtm)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="range"
              min={0}
              max={issuanceMaxM}
              step={issuanceStepM}
              aria-label="Common Stock ATM Issuance"
              value={atmDollarsM}
              onChange={(e) => {
                setAtmDollarsM(Number(e.target.value));
                setHasTouched(true);
              }}
              className="w-full accent-sky-400"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
              <span>$0 (No ATM)</span>
              <span>{fmtMillions(issuanceMaxM / 2)}</span>
              <span>{fmtMillions(issuanceMaxM)}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 font-mono text-[11px]">
            <span className="text-slate-400">
              Sale Price:{" "}
              <strong className="text-slate-200">
                {fmtUsd(sim.atmSharePrice)}/sh
              </strong>
            </span>
            <span className="text-slate-400">
              New Shares:{" "}
              <strong className="text-slate-200">
                +{sim.newCommonSharesM.toFixed(2)}M
              </strong>{" "}
              (
              {activeBs.basicShares > 0
                ? ((sim.newCommonSharesM / activeBs.basicShares) * 100).toFixed(
                    1
                  )
                : "0.0"}
              % dilution)
            </span>
          </div>
        </div>

        {/* LEVER 3: ATM ISSUANCE PREMIUM */}
        <div
          className={
            "rounded-2xl border p-5 shadow-lg transition-colors " +
            (atmPremiumPct === 0
              ? "border-amber-500/40 bg-amber-950/15"
              : "border-slate-800 bg-slate-900/60")
          }
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                  LEVER 3
                </span>
                <TermExplainer
                  termKey="atm_issuance_premium"
                  className="text-sm font-bold text-white"
                >
                  ATM Issuance Premium (vs. Fair Value)
                </TermExplainer>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Choose what premium management can actually sell common shares
                at. Drag this to 0% to watch common ATM lose all power.
              </p>
            </div>
            <div className="text-right font-mono">
              <div
                className={
                  "text-lg font-bold tabular-nums " +
                  (atmPremiumPct === 0 ? "text-amber-300" : "text-emerald-400")
                }
              >
                {atmPremiumPct}%
              </div>
              <div className="text-[11px] text-slate-400">
                {(1 + atmPremiumPct / 100).toFixed(2)}x Fair Value
              </div>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="range"
              min={0}
              max={250}
              step={1}
              aria-label="ATM Issuance Premium"
              value={atmPremiumPct}
              onChange={(e) => {
                setAtmPremiumPct(Number(e.target.value));
                setHasTouched(true);
              }}
              className="w-full accent-amber-400"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
              <span>0% (Dead ATM)</span>
              <span>Live: {livePremiumPct}%</span>
              <span>250% (3.5x)</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {[
              { label: "0% (No Premium)", val: 0 },
              { label: "Live (" + livePremiumPct + "%)", val: livePremiumPct },
              { label: "50% (1.5x)", val: 50 },
              { label: "100% (2.0x)", val: 100 },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setAtmPremiumPct(chip.val);
                  setHasTouched(true);
                }}
                className={
                  "rounded-md border px-2.5 py-1 font-mono text-[11px] transition " +
                  (atmPremiumPct === chip.val
                    ? "border-amber-500/50 bg-amber-500/20 font-semibold text-amber-200"
                    : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200")
                }
              >
                {chip.label}
              </button>
            ))}
          </div>

          {atmPremiumPct === 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>
                <strong>At 0% premium, common ATM is powerless:</strong> selling
                shares at 1.00x Fair Value adds zero net value per share. You
                must rely on Bitcoin price appreciation (Lever 1) or preferred
                stock (Lever 4).
              </span>
            </div>
          )}
        </div>

        {/* LEVER 4: PREFERRED STOCK ISSUANCE */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-purple-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-300">
                  LEVER 4
                </span>
                <h3 className="text-sm font-bold text-white">
                  Preferred Stock Issuance ({sim.primaryPrefName})
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Raise fixed-dollar Digital Credit to buy BTC with zero common
                dilution. Flat BTC adds $0 net value&mdash;rising BTC multiplies
                your upside past the old vault ceiling.
              </p>
            </div>
            <div className="text-right font-mono">
              <div className="text-lg font-bold text-purple-300 tabular-nums">
                {fmtMillions(prefDollarsM)}
              </div>
              <div className="text-[11px] text-slate-400">
                +{fmtBtc(sim.btcBoughtByPref)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="range"
              min={0}
              max={issuanceMaxM}
              step={issuanceStepM}
              aria-label="Preferred Stock Issuance"
              value={prefDollarsM}
              onChange={(e) => {
                setPrefDollarsM(Number(e.target.value));
                setHasTouched(true);
              }}
              className="w-full accent-purple-400"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
              <span>$0 (No Prefs)</span>
              <span>{fmtMillions(issuanceMaxM / 2)}</span>
              <span>{fmtMillions(issuanceMaxM)}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 font-mono text-[11px]">
            <span className="text-slate-400">
              Modeled Issue Price:{" "}
              <strong className="text-slate-200">
                {fmtUsd(sim.prefIssuePriceUsed)} / $100 par
              </strong>
            </span>
            <span className="text-slate-400">
              New {sim.primaryPrefName} Par:{" "}
              <strong className="text-purple-300">
                +{fmtMillions(sim.prefParCreatedM)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM PRO-FORMA VAULT SUMMARY */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 font-mono text-xs text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className={"h-4 w-4 " + accentText} />
            <span className="font-semibold text-slate-200">
              Simulated {ticker} Vault:
            </span>
            <span>
              {fmtBtc(activeBs.btcHoldings)} &rarr;{" "}
              <strong className="text-white">
                {fmtBtc(sim.simBs.btcHoldings)}
              </strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Basic Shares:{" "}
              <strong className="text-slate-200">
                {activeBs.basicShares.toFixed(2)}M &rarr;{" "}
                {sim.simBs.basicShares.toFixed(2)}M
              </strong>
            </span>
            <span>
              New BTC Acquired:{" "}
              <strong className="text-emerald-400">
                +{fmtBtc(sim.btcBoughtTotal)}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
