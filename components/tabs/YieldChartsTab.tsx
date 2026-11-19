"use client";

import React from "react";
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
import type { ValuationResult } from "@/lib/v31-alpha-engine";
import { TermExplainer } from "@/components/TermExplainer";
import {
  fmtInt,
  calcAmplificationPct,
  fmtAmpPct,
  CustomChartTooltip,
} from "@/components/dashboard-shared";

export interface YieldConePoint {
  yearLabel: string;
  year: number;
  asstImpliedIdx?: number;
  mstrImpliedIdx?: number;
  bench10Idx?: number;
  bench20Idx?: number;
  flatFloorIdx?: number;
  marketImplied?: number;
  flatFloor?: number;
  bench10?: number;
  bench20?: number;
  rawGrossToday?: number;
}

export interface HistoricalChartPoint {
  date: string;
  btc: number;
  asstPrice: number;
  asstFair: number;
  asstCebe: number;
  asstHurdle: number;
  asstAmp: number | null;
  asstUnencSats: number;
  mstrPrice: number;
  mstrFair: number;
  mstrCebe: number;
  mstrHurdle: number;
  mstrAmp: number | null;
  mstrUnencSats: number;
}

export interface BtcSweepPoint {
  btcK: string;
  btc: number;
  asstFair: number;
  asstCebe: number;
  asstSats: number;
  asstRawSats: number;
  asstGrossAmp: number | null;
  asstNetAmp: number | null;
  mstrFair: number;
  mstrCebe: number;
  mstrSats: number;
  mstrRawSats: number;
  mstrGrossAmp: number | null;
  mstrNetAmp: number | null;
  SATA: number;
  SATS: number;
  STRF_STRE: number;
  STRC: number;
  STRK: number;
  STRD: number;
}

export interface YieldChartsTabProps {
  mounted: boolean;
  asstActive: ValuationResult;
  mstrActive: ValuationResult;
  yieldConeData: YieldConePoint[];
  coneTarget: "ASST" | "MSTR" | "INDEXED";
  setConeTarget: React.Dispatch<
    React.SetStateAction<"ASST" | "MSTR" | "INDEXED">
  >;
  historicalSeries: HistoricalChartPoint[];
  historyTimeframe: "daily" | "intraday";
  setHistoryTimeframe: React.Dispatch<
    React.SetStateAction<"daily" | "intraday">
  >;
  historyMetric: "hurdle" | "amp" | "asst_val" | "mstr_val" | "sats";
  setHistoryMetric: React.Dispatch<
    React.SetStateAction<"hurdle" | "amp" | "asst_val" | "mstr_val" | "sats">
  >;
  btcSweepData: BtcSweepPoint[];
  sweepMode: "sats" | "amp" | "equity_asst" | "equity_mstr";
  setSweepMode: React.Dispatch<
    React.SetStateAction<"sats" | "amp" | "equity_asst" | "equity_mstr">
  >;
}

export function YieldChartsTab({
  mounted,
  asstActive,
  mstrActive,
  yieldConeData,
  coneTarget,
  setConeTarget,
  historicalSeries,
  historyTimeframe,
  setHistoryTimeframe,
  historyMetric,
  setHistoryMetric,
  btcSweepData,
  sweepMode,
  setSweepMode,
}: YieldChartsTabProps) {
  return (
    <div className="space-y-6">
      {/* Chart 1: 4-Year Required Debt-Free Sats/Share Growth Cone */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-orange-400">
                4-YEAR BTC GROWTH TARGET
              </span>
              <h2 className="text-base font-bold text-white">
                <TermExplainer
                  termKey="yield_cone"
                  className="text-base font-bold text-white"
                >
                  4-Year Required Debt-Free Sats per Share Path
                </TermExplainer>
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Shows how fast{" "}
              <strong className="text-slate-200">
                debt-free sats per common share
              </strong>{" "}
              need to compound over the next 4 years for the company to grow
              into today&apos;s stock price.
            </p>
          </div>

          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
            {(
              [
                { id: "ASST", label: "$ASST (Sats/Sh)" },
                { id: "MSTR", label: "$MSTR (Sats/Sh)" },
                { id: "INDEXED", label: "Side-by-Side (Start=100)" },
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
            const activeRes = coneTarget === "ASST" ? asstActive : mstrActive;
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
                    <TermExplainer
                      termKey="raw_sats"
                      className="text-[10px] uppercase text-slate-400"
                    >
                      Gross Vault Sats / Sh
                    </TermExplainer>
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
                    <TermExplainer
                      termKey="amplification"
                      className="text-[10px] uppercase text-slate-400"
                    >
                      Owed to Senior Claims
                    </TermExplainer>
                  </div>
                  <div className="mt-1 text-base font-bold text-rose-400">
                    -{fmtInt(encumberedSats)} sats
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Amplification:{" "}
                    {fmtAmpPct(calcAmplificationPct(activeRes), 1)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono tabular-nums">
                  <div className="text-[10px] uppercase text-slate-400">
                    <TermExplainer
                      termKey="unencumbered_sats"
                      className="text-[10px] uppercase text-slate-400"
                    >
                      Today&apos;s Debt-Free Sats
                    </TermExplainer>
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
                    <TermExplainer
                      termKey="btc_yield_hurdle"
                      className="text-[10px] uppercase text-slate-400"
                    >
                      Priced-In Year-4 Target
                    </TermExplainer>
                  </div>
                  <div className="mt-1 text-base font-bold text-orange-400">
                    {fmtInt(yr4Req)} sats
                  </div>
                  <div className="text-[11px] text-rose-300">
                    Required: {activeRes.annualHurdlePct.toFixed(2)}%/yr
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-orange-500/25 bg-slate-950/70 p-3 font-mono text-xs tabular-nums">
              <span className="font-bold text-orange-400">$ASST</span> Required
              BTC Growth:{" "}
              <strong className="text-white">
                {asstActive.annualHurdlePct.toFixed(2)}%/yr
              </strong>{" "}
              (
              {(
                (Math.pow(1 + asstActive.annualHurdlePct / 100, 4) - 1) *
                100
              ).toFixed(1)}
              % total over 4 years)
            </div>
            <div className="rounded-xl border border-sky-500/25 bg-slate-950/70 p-3 font-mono text-xs tabular-nums">
              <span className="font-bold text-sky-400">$MSTR</span> Required BTC
              Growth:{" "}
              <strong className="text-white">
                {mstrActive.annualHurdlePct.toFixed(2)}%/yr
              </strong>{" "}
              (
              {(
                (Math.pow(1 + mstrActive.annualHurdlePct / 100, 4) - 1) *
                100
              ).toFixed(1)}
              % total over 4 years)
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
                  <Tooltip content={<CustomChartTooltip unitSuffix=" idx" />} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    type="monotone"
                    dataKey="asstImpliedIdx"
                    name="$ASST Required Growth Path"
                    stroke="#fb923c"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mstrImpliedIdx"
                    name="$MSTR Required Growth Path"
                    stroke="#38bdf8"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bench20Idx"
                    name="20%/yr Growth Benchmark"
                    stroke="#34d399"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bench10Idx"
                    name="10%/yr Growth Benchmark"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="flatFloorIdx"
                    name="0%/yr Flat Starting Floor"
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
                    tickFormatter={(v) => (Number(v) / 1000).toFixed(0) + "k"}
                  />
                  <Tooltip
                    content={<CustomChartTooltip unitSuffix=" sats/sh" />}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Area
                    type="monotone"
                    dataKey="marketImplied"
                    name={"$" + coneTarget + " Required Debt-Free Sats/Sh"}
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
                    name="20%/yr Growth Reference"
                    stroke="#34d399"
                    strokeDasharray="5 5"
                    strokeWidth={1.8}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bench10"
                    name="10%/yr Growth Reference"
                    stroke="#a78bfa"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="rawGrossToday"
                    name="Gross Vault Sats/Sh (Before Debt)"
                    stroke="#f43f5e"
                    strokeDasharray="2 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="flatFloor"
                    name="0%/yr Flat Starting Floor"
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

      {/* Chart 2: Historical Price, Amplification & Required Growth Log */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Historical Valuation, Amplification &amp; Growth Hurdle
            </h3>
            <p className="text-xs text-slate-400">
              Tracks daily closes and 30-minute intraday snapshots logged from
              our live sheet plus current quotes.
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
                  { id: "hurdle", label: "Req. Growth (%/yr)" },
                  { id: "amp", label: "Amplification (%)" },
                  { id: "asst_val", label: "$ASST Price vs. Fair Val" },
                  { id: "mstr_val", label: "$MSTR Price vs. Fair Val" },
                  { id: "sats", label: "Debt-Free Sats/Sh" },
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
                    name="$ASST Required BTC Growth"
                    stroke="#fb923c"
                    strokeWidth={2.8}
                    dot={{ r: 3.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mstrHurdle"
                    name="$MSTR Required BTC Growth"
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
                    domain={[0, "auto"]}
                    tickFormatter={(v) => v + "%"}
                  />
                  <Tooltip content={<CustomChartTooltip unitSuffix="%" />} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <ReferenceLine
                    y={60}
                    stroke="#64748b"
                    strokeDasharray="3 3"
                  />
                  <Line
                    type="monotone"
                    dataKey="asstAmp"
                    name="$ASST Amplification Ratio (%)"
                    stroke="#fb923c"
                    strokeWidth={2.8}
                    dot={{ r: 3.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mstrAmp"
                    name="$MSTR Amplification Ratio (%)"
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
                  <Tooltip content={<CustomChartTooltip unitPrefix="$" />} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Area
                    type="monotone"
                    dataKey="asstFair"
                    name="$ASST Model Fair Value"
                    stroke="#34d399"
                    fill="rgba(52, 211, 153, 0.14)"
                    strokeWidth={2.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="asstPrice"
                    name="$ASST Live Share Price"
                    stroke="#fb923c"
                    strokeWidth={3}
                    dot={{ r: 3.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="asstCebe"
                    name="$ASST Hard Floor (CEBE)"
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
                  <Tooltip content={<CustomChartTooltip unitPrefix="$" />} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Area
                    type="monotone"
                    dataKey="mstrFair"
                    name="$MSTR Model Fair Value"
                    stroke="#34d399"
                    fill="rgba(52, 211, 153, 0.14)"
                    strokeWidth={2.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="mstrPrice"
                    name="$MSTR Live Share Price"
                    stroke="#38bdf8"
                    strokeWidth={3}
                    dot={{ r: 3.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mstrCebe"
                    name="$MSTR Hard Floor (CEBE)"
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
                    tickFormatter={(v) => (Number(v) / 1000).toFixed(0) + "k"}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#38bdf8"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (Number(v) / 1000).toFixed(0) + "k"}
                  />
                  <Tooltip
                    content={<CustomChartTooltip unitSuffix=" sats/sh" />}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="asstUnencSats"
                    name="$ASST Debt-Free Sats/Sh (Left)"
                    stroke="#fb923c"
                    strokeWidth={2.8}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="mstrUnencSats"
                    name="$MSTR Debt-Free Sats/Sh (Right)"
                    stroke="#38bdf8"
                    strokeWidth={2.8}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chart 3: BTC Price Simulator ($10k – $200k) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              <TermExplainer
                termKey="de_encumbrance"
                className="text-base font-bold text-white"
              >
                Bitcoin Price Simulator ($10k &ndash; $200k): Debt Shrink,
                Leverage &amp; Safety Cushion
              </TermExplainer>
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              As Bitcoin climbs, fixed-dollar debt and preferred claims take up
              less of the vault &mdash; automatically unlocking more debt-free
              sats per share and cooling down leverage.
            </p>
          </div>

          <div className="flex flex-wrap rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
            {(
              [
                { id: "sats", label: "Debt-Free Sats/Sh" },
                { id: "amp", label: "Amplification Curve (%)" },
                { id: "equity_asst", label: "$ASST Fair Val vs. Floor" },
                { id: "equity_mstr", label: "$MSTR Fair Val vs. Floor" },
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
                    tickFormatter={(v) => (Number(v) / 1000).toFixed(0) + "k"}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#38bdf8"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (Number(v) / 1000).toFixed(0) + "k"}
                  />
                  <Tooltip
                    content={<CustomChartTooltip unitSuffix=" sats/sh" />}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="asstSats"
                    name="$ASST Debt-Free Sats/Sh (Left)"
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
                    dataKey="mstrS
