"use client";

import React from "react";
import {
  Clock,
  Unlock,
  ShieldCheck,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Cpu,
  Terminal,
} from "lucide-react";
import type {
  TreasuryBalanceSheet,
  ValuationResult,
} from "@/lib/v31-alpha-engine";
import { translateRegime } from "@/lib/glossary";
import { TermExplainer } from "@/components/TermExplainer";
import {
  fmtUsd,
  fmtSignedUsd,
  fmtInt,
  fmtPct,
  calcAmplificationPct,
  calcNetAmplificationPct,
  fmtAmpPct,
  regimeBadgeClass,
} from "@/components/dashboard-shared";

export interface OverviewTabProps {
  mounted: boolean;
  constantsSource: "google_sheets" | "baseline_fallback";
  lastPolledAt: string;
  asstBs: TreasuryBalanceSheet;
  mstrBs: TreasuryBalanceSheet;
  asstActive: ValuationResult;
  mstrActive: ValuationResult;
  asstHv: ValuationResult;
  asstCycle: ValuationResult;
  mstrHv: ValuationResult;
  mstrCycle: ValuationResult;
  btcPrice: number;
  activeSigma: number;
  hvSigma: number;
  cycleSigma: number;
  riskFreeRate: number;
  tCycle: number;
  auditDrawerOpen: boolean;
  setAuditDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  auditSubTab: "prompt" | "trace" | "python";
  setAuditSubTab: React.Dispatch<
    React.SetStateAction<"prompt" | "trace" | "python">
  >;
  copiedAuditKey: string | null;
  handleCopyAuditItem: (
    key: string,
    text: string,
    label: string
  ) => Promise<void>;
  llmAuditPrompt: string;
  stateTraceMarkdown: string;
  pythonVerifierCode: string;
  fullAuditBundleText: string;
}

export function OverviewTab({
  mounted,
  constantsSource,
  lastPolledAt,
  asstBs,
  mstrBs,
  asstActive,
  mstrActive,
  asstHv,
  asstCycle,
  mstrHv,
  mstrCycle,
  btcPrice,
  activeSigma,
  hvSigma,
  cycleSigma,
  riskFreeRate,
  tCycle,
  auditDrawerOpen,
  setAuditDrawerOpen,
  auditSubTab,
  setAuditSubTab,
  copiedAuditKey,
  handleCopyAuditItem,
  llmAuditPrompt,
  stateTraceMarkdown,
  pythonVerifierCode,
  fullAuditBundleText,
}: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Filing Stamp Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-900/50 px-4 py-2.5 text-xs text-slate-300">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
            <Clock className="h-3.5 w-3.5" />
            {constantsSource === "google_sheets"
              ? "LIVE SEC FILING SHEET"
              : "VERIFIED SEC FILING DATA"}
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

      {/* Helper hint */}
      <p className="text-xs text-slate-400">
        Tip: Click any{" "}
        <span className="underline decoration-dotted decoration-slate-500 underline-offset-4 text-slate-300">
          dotted label
        </span>{" "}
        with a <span className="font-mono text-orange-400">?</span> icon for a
        plain-English breakdown of what it measures and why it matters.
      </p>

      {/* Hero Treasury Cards ($ASST & $MSTR) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[
          {
            bs: asstBs,
            res: asstActive,
            borderCls: "border-orange-500/30",
            badgeCls: "bg-orange-500/15 text-orange-300 border-orange-500/30",
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
          const grossAmpPct = calcAmplificationPct(res);
          const netAmpPct = calcNetAmplificationPct(res);
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
                      {bs.companyName} Bitcoin Vault
                    </h2>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-400 tabular-nums">
                    {fmtInt(bs.btcHoldings)} BTC ({fmtUsd(res.v0, 1)}M) +{" "}
                    {fmtUsd(bs.cashReserves, 1)}M Cash &bull;{" "}
                    {bs.basicShares.toFixed(2)}M Shares
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Live Stock Price
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {fmtUsd(res.livePrice)}
                  </div>
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                    <TermExplainer
                      termKey="simple_mnav"
                      className="text-[11px] text-slate-400"
                    >
                      Simple mNAV
                    </TermExplainer>
                    <span>: {res.mNavMultiple.toFixed(2)}x</span>
                  </div>
                </div>
              </div>

              {/* Primary 4 KPIs */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3 font-mono tabular-nums">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    <TermExplainer
                      termKey="fair_value"
                      className="text-[10px] uppercase tracking-wider text-slate-400"
                    >
                      Model Fair Value
                    </TermExplainer>
                  </div>
                  <div className="mt-1 text-lg font-bold text-emerald-400 sm:text-xl">
                    {fmtUsd(res.fairValuePerSh)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    <TermExplainer
                      termKey="cebe"
                      className="text-[11px] text-slate-400"
                    >
                      Floor
                    </TermExplainer>
                    : {fmtUsd(res.cebePerSh)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3 font-mono tabular-nums">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    <TermExplainer
                      termKey="growth_premium"
                      className="text-[10px] uppercase tracking-wider text-slate-400"
                    >
                      Growth Premium
                    </TermExplainer>
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
                        "x Fair Val"
                      : "Underwater"}
                  </div>
                </div>

                <div className="rounded-xl border border-violet-500/25 bg-slate-950/70 p-3 font-mono tabular-nums">
                  <div className="text-[10px] uppercase tracking-wider text-violet-300">
                    <TermExplainer
                      termKey="amplification"
                      className="text-[10px] uppercase tracking-wider text-violet-300"
                    >
                      Amplification
                    </TermExplainer>
                  </div>
                  <div className="mt-1 text-lg font-bold text-violet-300 sm:text-xl">
                    {fmtAmpPct(grossAmpPct, 1)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    <TermExplainer
                      termKey="net_amplification"
                      className="text-[11px] text-slate-400"
                    >
                      Ex-Cash
                    </TermExplainer>
                    : {fmtAmpPct(netAmpPct, 1)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3 font-mono tabular-nums">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    <TermExplainer
                      termKey="btc_yield_hurdle"
                      className="text-[10px] uppercase tracking-wider text-slate-400"
                    >
                      Req. BTC Growth
                    </TermExplainer>
                  </div>
                  <div className="mt-1 text-lg font-bold text-rose-400 sm:text-xl">
                    {res.annualHurdlePct > 0
                      ? res.annualHurdlePct.toFixed(1) + "%/yr"
                      : "0.0%/yr"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Over {tCycle.toFixed(0)}Y Cycle
                  </div>
                </div>
              </div>

              {/* Unencumbered Sats Bar */}
              <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-300">
                    <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                    <TermExplainer
                      termKey="unencumbered_sats"
                      className="font-medium text-slate-300"
                    >
                      Debt-Free (Unencumbered) Sats / Share
                    </TermExplainer>
                  </span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {fmtInt(res.unencumberedSatsPerSh)}{" "}
                    <span className="font-normal text-slate-400">
                      / {fmtInt(res.rawSatsPerSh)}{" "}
                      <TermExplainer
                        termKey="raw_sats"
                        className="text-slate-400"
                      >
                        gross sats
                      </TermExplainer>
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
                    {unencPct.toFixed(1)}% Debt-Free ({netClaimsPct.toFixed(1)}%
                    Owed to Senior Claims)
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>
                      <TermExplainer
                        termKey="delta_net"
                        className="text-[11px] text-slate-400"
                      >
                        BTC Sensitivity
                      </TermExplainer>
                      : {res.deltaNet.toFixed(3)}
                    </span>
                    <span>&bull;</span>
                    <span>
                      <TermExplainer
                        termKey="implied_btc_vol"
                        className="text-[11px] text-slate-400"
                      >
                        Options-Implied Vol
                      </TermExplainer>
                      : {res.impliedBtcVolPct.toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5-Column Plain-English Structural Scorecard Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-white sm:text-base">
              Share Value Breakdown (1-Year Vol vs.{" "}
              {(cycleSigma * 100).toFixed(1)}% Cycle Vol)
            </h3>
            <p className="text-xs text-slate-400">
              Every column adds straight down from the Hard Liquidation Floor to
              Model Fair Value — no hidden adjustments.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-300 tabular-nums">
            <TermExplainer
              termKey="risk_free_rate"
              className="text-[11px] text-slate-300"
            >
              Risk-Free: {(riskFreeRate * 100).toFixed(2)}%
            </TermExplainer>
            <span className="text-slate-600">&bull;</span>
            <TermExplainer
              termKey="cycle_horizon"
              className="text-[11px] text-slate-300"
            >
              Horizon: {tCycle.toFixed(1)}y
            </TermExplainer>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-sans font-semibold text-slate-300">
                  Value Piece (Per Basic Share)
                </th>
                <th className="px-4 py-3 text-right text-orange-300">
                  $ASST ({(hvSigma * 100).toFixed(1)}% 1Y Vol)
                </th>
                <th className="px-4 py-3 text-right text-orange-400">
                  $ASST ({(cycleSigma * 100).toFixed(1)}% Cycle)
                </th>
                <th className="px-4 py-3 text-right text-sky-300">
                  $MSTR ({(hvSigma * 100).toFixed(1)}% 1Y Vol)
                </th>
                <th className="px-4 py-3 text-right text-sky-400">
                  $MSTR ({(cycleSigma * 100).toFixed(1)}% Cycle)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              <tr className="hover:bg-slate-800/30">
                <td className="px-5 py-3 font-sans text-slate-200">
                  <div className="font-medium">
                    <TermExplainer termKey="cebe">
                      Hard Liquidation Floor (CEBE)
                    </TermExplainer>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    What&apos;s left per share if BTC + cash paid off every debt
                    and preferred today
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
                    <TermExplainer termKey="carry_debt_adj">
                      + Debt &amp; Dividend Rate Adjustment
                    </TermExplainer>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Bonus from cheap rates (like 8% STRK &amp; low-interest
                    notes) vs. drag from high uncapped dividends (15% SATS)
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
                    <TermExplainer termKey="leland_put">
                      + Downside Safety Cushion (Leland Put)
                    </TermExplainer>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Survival value from being able to pause preferred dividends
                    during severe Bitcoin crashes
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
                    <TermExplainer termKey="convert_dilution">
                      &minus; Convertible Share Dilution
                    </TermExplainer>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Value of future stock conversion rights held by convertible
                    bond &amp; STRK holders
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
                  <TermExplainer
                    termKey="fair_value"
                    className="font-bold text-emerald-300"
                  >
                    = Model Fair Value (Zero Future Growth)
                  </TermExplainer>
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
                  <TermExplainer termKey="growth_premium">
                    Market Growth Premium (or Discount)
                  </TermExplainer>
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
                    <TermExplainer
                      termKey="amplification"
                      className="font-semibold text-violet-200"
                    >
                      Amplification Ratio ((Debt + Prefs) &divide; BTC Value)
                    </TermExplainer>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Total debt and preferred face value as a % of Bitcoin
                    holdings
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-violet-300">
                  {fmtAmpPct(calcAmplificationPct(asstHv), 1)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-violet-300">
                  {fmtAmpPct(calcAmplificationPct(asstCycle), 1)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-violet-300">
                  {fmtAmpPct(calcAmplificationPct(mstrHv), 1)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-violet-300">
                  {fmtAmpPct(calcAmplificationPct(mstrCycle), 1)}
                </td>
              </tr>

              <tr className="hover:bg-slate-800/30">
                <td className="px-5 py-3 font-sans text-slate-200">
                  <div className="font-medium">
                    <TermExplainer termKey="net_amplification">
                      Ex-Cash Amplification (Net Senior Claims &divide; BTC)
                    </TermExplainer>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Debt and preferred face value after subtracting cash
                    reserves, as a % of Bitcoin
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-violet-200">
                  {fmtAmpPct(calcNetAmplificationPct(asstHv), 1)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-violet-200">
                  {fmtAmpPct(calcNetAmplificationPct(asstCycle), 1)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-violet-200">
                  {fmtAmpPct(calcNetAmplificationPct(mstrHv), 1)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-violet-200">
                  {fmtAmpPct(calcNetAmplificationPct(mstrCycle), 1)}
                </td>
              </tr>

              <tr className="bg-slate-950/60 font-semibold">
                <td className="px-5 py-3 font-sans text-rose-300">
                  <TermExplainer
                    termKey="btc_yield_hurdle"
                    className="font-semibold text-rose-300"
                  >
                    Required Annual BTC Growth ({tCycle.toFixed(0)}Y Cycle)
                  </TermExplainer>
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
                  <TermExplainer termKey="implied_btc_vol">
                    Options-Implied Unlevered BTC Volatility
                  </TermExplainer>
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

      {/* COLLAPSIBLE AUDIT OUR MATH — OPEN-SOURCE AI VERIFICATION BUNDLE */}
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
                  Check Our Math — Open-Source AI Verification Bundle
                </h3>
                <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
                  DON&apos;T TRUST, VERIFY
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Copy our live numbers, exact formulas, intermediate steps, and a
                standalone Python checker straight into ChatGPT, Claude, or
                Gemini to double-check every dollar.
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
                  "Full AI Audit Bundle"
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
                  <span>Copy Full Audit Bundle</span>
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
                      label: "AI Fact-Check Prompt",
                      icon: BookOpen,
                    },
                    {
                      id: "trace",
                      label: "Under-the-Hood Numbers",
                      icon: Cpu,
                    },
                    {
                      id: "python",
                      label: "Standalone Python Checker",
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
                        "AI Fact-Check Prompt"
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
                        <span>Copy Fact-Check Prompt</span>
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
                        "Under-the-Hood Numbers"
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
                        <span>Copy Raw Numbers</span>
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
                        "audit_v31.py Python Checker"
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
                    Synced to your active view (BTC {fmtUsd(btcPrice, 2)}, Vol ={" "}
                    {(activeSigma * 100).toFixed(1)}%, Risk-Free ={" "}
                    {(riskFreeRate * 100).toFixed(2)}%).
                  </span>
                  <span className="font-mono text-slate-500">
                    Paste into ChatGPT / Claude / Gemini
                  </span>
                </div>
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
                  {llmAuditPrompt}
                </pre>
              </div>
            )}

            {auditSubTab === "trace" && (
              <div className="space-y-3">
                <div className="text-xs text-slate-400">
                  <TermExplainer termKey="audit_trace_vars">
                    What are these under-the-hood engine numbers?
                  </TermExplainer>
                </div>
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
                          ${bs.ticker} Engine Readout (Vol ={" "}
                          {(activeSigma * 100).toFixed(1)}%)
                        </h4>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          <TermExplainer
                            termKey="solvency_buffer"
                            className="text-[11px] text-slate-400"
                          >
                            Solvency Buffer
                          </TermExplainer>
                          : {res.alphaSolv.toFixed(4)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            BTC Value (V₀)
                          </div>
                          <div className="font-semibold text-white">
                            ${res.v0.toFixed(2)}M
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            Cash (C₀)
                          </div>
                          <div className="font-semibold text-white">
                            ${res.c0.toFixed(2)}M
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            Total Assets (S₀)
                          </div>
                          <div className="font-semibold text-emerald-300">
                            ${res.s0.toFixed(2)}M
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            Debt Today (B_PV)
                          </div>
                          <div className="font-semibold text-slate-200">
                            ${res.bPv.toFixed(2)}M
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            Debt Barrier (H₀)
                          </div>
                          <div className="font-semibold text-rose-300">
                            ${res.h0DebtBtc.toFixed(2)}M
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            Post-Debt BTC (X₀)
                          </div>
                          <div className="font-semibold text-orange-300">
                            ${res.x0.toFixed(2)}M
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            Amplification
                          </div>
                          <div className="font-semibold text-violet-300">
                            {fmtAmpPct(calcAmplificationPct(res), 1)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            Conv. Dilution
                          </div>
                          <div className="font-semibold text-amber-300">
                            ${res.dilTotal.toFixed(2)}M
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-800/80 bg-slate-950/80 p-2">
                          <div className="text-[10px] text-slate-500">
                            BTC Delta (Δ)
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
                                ODE Roots (γ/β/w)
                              </th>
                              <th className="px-2 py-2 text-right">
                                BTC Par
                              </th>
                              <th className="px-2 py-2 text-right">
                                Pause / Cap
                              </th>
                              <th className="px-2 py-2">Status</th>
                              <th className="px-2.5 py-2 text-right">$/sh</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70 bg-slate-950/50">
                            {bs.preferreds.map((t) => {
                              const d = res.trancheDetails[t.name];
                              const badge = translateRegime(d.regime);
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
                                    <span
                                      className={
                                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold " +
                                        regimeBadgeClass(badge.tone)
                                      }
                                    >
                                      {badge.label}
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
              </div>
            )}

            {auditSubTab === "python" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Zero external packages needed (Python 3 standard library
                    only) — pre-loaded with your current numbers.
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
  );
}
