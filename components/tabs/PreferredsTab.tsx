
"use client";

import React from "react";
import { Lock } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type {
  TreasuryBalanceSheet,
  ValuationResult,
} from "@/lib/v31-alpha-engine";
import { translateRegime } from "@/lib/glossary";
import { TermExplainer } from "@/components/TermExplainer";
import {
  fmtUsd,
  regimeBadgeClass,
  CustomChartTooltip,
} from "@/components/dashboard-shared";
import type { BtcSweepPoint } from "@/components/tabs/YieldChartsTab";

export interface PreferredsTabProps {
  mounted: boolean;
  asstBs: TreasuryBalanceSheet;
  mstrBs: TreasuryBalanceSheet;
  asstActive: ValuationResult;
  mstrActive: ValuationResult;
  preferredQuotes: Record<string, number>;
  btcSweepData: BtcSweepPoint[];
  prefChartIssuer: "ALL" | "ASST" | "MSTR";
  setPrefChartIssuer: React.Dispatch<
    React.SetStateAction<"ALL" | "ASST" | "MSTR">
  >;
}

export function PreferredsTab({
  mounted,
  asstBs,
  mstrBs,
  asstActive,
  mstrActive,
  preferredQuotes,
  btcSweepData,
  prefChartIssuer,
  setPrefChartIssuer,
}: PreferredsTabProps) {
  return (
    <div className="space-y-6">
      {/* Top-Down Cash & Bitcoin Payout Priority Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { bs: asstBs, res: asstActive, color: "text-orange-400" },
          { bs: mstrBs, res: mstrActive, color: "text-sky-400" },
        ].map(({ bs, res, color }) => (
          <div
            key={bs.ticker}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <h3 className={"text-sm font-bold " + color}>
                ${bs.ticker} Cash &amp; Bitcoin Payout Priority
              </h3>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                <TermExplainer
                  termKey="solvency_buffer"
                  className="text-xs text-slate-400"
                >
                  Solvency Buffer
                </TermExplainer>
                : {res.alphaSolv.toFixed(4)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs tabular-nums sm:grid-cols-3">
              <div className="rounded-lg bg-slate-950/70 p-2.5">
                <div className="text-[10px] text-slate-400">
                  <TermExplainer
                    termKey="cash_reserve"
                    className="text-[10px] text-slate-400"
                  >
                    Cash on Hand
                  </TermExplainer>
                </div>
                <div className="mt-0.5 font-bold text-white">
                  {fmtUsd(res.c0, 1)}M
                </div>
              </div>

              <div className="rounded-lg bg-slate-950/70 p-2.5">
                <div className="text-[10px] text-slate-400">
                  <TermExplainer
                    termKey="cash_to_debt"
                    className="text-[10px] text-slate-400"
                  >
                    Cash Covering Debt
                  </TermExplainer>
                </div>
                <div className="mt-0.5 font-bold text-emerald-400">
                  {fmtUsd(res.cashToDebt, 1)}M
                </div>
              </div>

              <div className="rounded-lg bg-slate-950/70 p-2.5">
                <div className="text-[10px] text-slate-400">
                  <TermExplainer
                    termKey="cash_to_prefs"
                    className="text-[10px] text-slate-400"
                  >
                    Cash Covering Prefs
                  </TermExplainer>
                </div>
                <div className="mt-0.5 font-bold text-emerald-400">
                  {fmtUsd(res.cashToPrefs, 1)}M
                </div>
              </div>

              <div className="rounded-lg bg-slate-950/70 p-2.5">
                <div className="text-[10px] text-slate-400">
                  <TermExplainer
                    termKey="debt_barrier"
                    className="text-[10px] text-slate-400"
                  >
                    BTC Needed for Debt
                  </TermExplainer>
                </div>
                <div className="mt-0.5 font-bold text-rose-400">
                  {fmtUsd(res.h0DebtBtc, 1)}M
                </div>
              </div>

              <div className="rounded-lg bg-slate-950/70 p-2.5">
                <div className="text-[10px] text-slate-400">
                  <TermExplainer
                    termKey="post_debt_pool"
                    className="text-[10px] text-slate-400"
                  >
                    BTC Left for Prefs
                  </TermExplainer>
                </div>
                <div className="mt-0.5 font-bold text-orange-300">
                  {fmtUsd(res.x0, 1)}M
                </div>
              </div>

              <div className="rounded-lg bg-slate-950/70 p-2.5">
                <div className="text-[10px] text-slate-400">
                  <TermExplainer
                    termKey="senior_claims_val"
                    className="text-[10px] text-slate-400"
                  >
                    Modeled Senior Claims
                  </TermExplainer>
                </div>
                <div className="mt-0.5 font-bold text-white">
                  {fmtUsd(res.seniorClaimsVal, 1)}M
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preferred Tranches Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
        <div className="border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-bold text-white sm:text-base">
            Perpetual Preferred Stock Classes &mdash; Model Value vs. Live
            Market
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Variable rate-resetting preferreds (<code>SATA</code>,{" "}
            <code>STRC</code>, marked with a lock icon) cap cleanly at $100.00
            par once Bitcoin climbs past their cap trigger, sending extra upside
            to common shares.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] uppercase text-slate-400">
                <th className="px-4 py-3 font-sans">Preferred Class</th>
                <th className="px-3 py-3 text-center">Rank</th>
                <th className="px-3 py-3 text-right">
                  <TermExplainer
                    termKey="bs_par_total"
                    className="text-[11px] uppercase text-slate-400"
                  >
                    Face Val ($M)
                  </TermExplainer>
                </th>
                <th className="px-3 py-3 text-right">
                  <TermExplainer
                    termKey="btc_backed_par"
                    className="text-[11px] uppercase text-slate-400"
                  >
                    BTC-Backed ($M)
                  </TermExplainer>
                </th>
                <th className="px-3 py-3 text-right">
                  <TermExplainer
                    termKey="coupon_vs_rho"
                    className="text-[11px] uppercase text-slate-400"
                  >
                    Div / Risk Rate
                  </TermExplainer>
                </th>
                <th className="px-3 py-3 text-right">
                  <TermExplainer
                    termKey="pause_trigger"
                    className="text-[11px] uppercase text-slate-400"
                  >
                    Pause Trigger
                  </TermExplainer>
                </th>
                <th className="px-3 py-3 text-right">
                  <TermExplainer
                    termKey="cap_trigger"
                    className="text-[11px] uppercase text-slate-400"
                  >
                    $100 Cap Trigger
                  </TermExplainer>
                </th>
                <th className="px-3 py-3">
                  <TermExplainer
                    termKey="pref_regime"
                    className="text-[11px] uppercase text-slate-400"
                  >
                    Current Status
                  </TermExplainer>
                </th>
                <th className="px-4 py-3 text-right text-emerald-300">
                  Model Price
                </th>
                <th className="px-4 py-3 text-right text-white">Live Mkt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {[
                ...asstBs.preferreds.map((t) => ({
                  issuer: "ASST",
                  detail: asstActive.trancheDetails[t.name],
                  liveMkt: preferredQuotes[t.name] ?? t.liveMarketPrice,
                })),
                ...mstrBs.preferreds.map((t) => ({
                  issuer: "MSTR",
                  detail: mstrActive.trancheDetails[t.name],
                  liveMkt: preferredQuotes[t.name] ?? t.liveMarketPrice,
                })),
              ].map(({ issuer, detail, liveMkt }) => {
                const badge = translateRegime(detail.regime);
                return (
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
                          <span title="Rate-resetting preferred capped at $100 par">
                            <Lock className="h-3 w-3 text-amber-400" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {detail.label}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-300">
                      Tier {detail.tier}
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
                      <span
                        className={
                          "inline-block rounded px-2 py-0.5 text-[10px] font-semibold " +
                          regimeBadgeClass(badge.tone)
                        }
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">
                      <div>{fmtUsd(detail.modelPrice)}</div>
                      {detail.hybridModelPrice !== undefined && (
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-normal text-sky-300">
                          <TermExplainer
                            termKey="strk_hybrid"
                            className="text-[10px] text-sky-300"
                          >
                            + Conversion
                          </TermExplainer>
                          <span>: {fmtUsd(detail.hybridModelPrice)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {fmtUsd(liveMkt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preferred Price Curves Across Bitcoin Prices */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Preferred Share Price Curves Across Bitcoin Prices ($10k &ndash;
              $200k)
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Watch how rate-resetting classes (<code>SATA</code> &amp;{" "}
              <code>STRC</code>) level off smoothly at the $100 par line, while
              fixed-rate classes keep rising toward their yield ceilings.
            </p>
          </div>
          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 font-mono text-xs">
            {(
              [
                { id: "ALL", label: "All Classes" },
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
                <Tooltip content={<CustomChartTooltip unitPrefix="$" />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <ReferenceLine
                  y={100}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />
                {(prefChartIssuer === "ALL" || prefChartIssuer === "ASST") && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="SATA"
                      name="SATA (13.25% Capped at $100)"
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
                {(prefChartIssuer === "ALL" || prefChartIssuer === "MSTR") && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="STRF_STRE"
                      name="STRF/STRE (10% Senior Tier 1)"
                      stroke="#34d399"
                      strokeWidth={2.2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="STRC"
                      name="STRC (12% Capped at $100)"
                      stroke="#38bdf8"
                      strokeWidth={2.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="STRK"
                      name="STRK (8% Straight Income Floor)"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="STRD"
                      name="STRD (10% Junior Non-Cumulative)"
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
  );
}
