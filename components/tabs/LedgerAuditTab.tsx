
"use client";

import React from "react";
import {
  Database,
  RotateCcw,
  Check,
  Copy,
  ShieldCheck,
  Play,
  Info,
} from "lucide-react";
import type {
  InvariantSuiteReport,
  TreasuryBalanceSheet,
} from "@/lib/v31-alpha-engine";
import { INVARIANT_PLAIN_MAP } from "@/lib/glossary";
import { TermExplainer } from "@/components/TermExplainer";

export interface LedgerAuditTabProps {
  constantsSource: "google_sheets" | "baseline_fallback";
  asstBs: TreasuryBalanceSheet;
  mstrBs: TreasuryBalanceSheet;
  showLedgerJson: boolean;
  setShowLedgerJson: React.Dispatch<React.SetStateAction<boolean>>;
  publicConstantsJson: string;
  copiedAuditKey: string | null;
  handleCopyAuditItem: (
    key: string,
    text: string,
    label: string
  ) => Promise<void>;
  handleReset8KBaselines: () => void;
  updateBsField: (
    ticker: "ASST" | "MSTR",
    field: "btcHoldings" | "cashReserves" | "basicShares" | "equityIv30d",
    rawVal: string
  ) => void;
  updateTrancheField: (
    ticker: "ASST" | "MSTR",
    trancheName: string,
    field: "parTotal" | "couponRate",
    rawVal: string
  ) => void;
  auditReport: InvariantSuiteReport;
  onRerunAudit: () => void;
}

export function LedgerAuditTab({
  constantsSource,
  asstBs,
  mstrBs,
  showLedgerJson,
  setShowLedgerJson,
  publicConstantsJson,
  copiedAuditKey,
  handleCopyAuditItem,
  handleReset8KBaselines,
  updateBsField,
  updateTrancheField,
  auditReport,
  onRerunAudit,
}: LedgerAuditTabProps) {
  return (
    <div className="space-y-6">
      {/* Public SEC Filings Banner */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Public Balance Sheets &amp; SEC Filing Data
                </h2>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  {constantsSource === "google_sheets"
                    ? "LIVE SHEET CONNECTED"
                    : "VERIFIED SEC DATA"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-300">
                Official Bitcoin holdings, share counts, debt schedules, and
                preferred stock terms come straight from SEC filings via{" "}
                <code>/api/constants</code>. Tweak any number below to run
                private What-If tests in your browser.
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
              Reset to SEC Filings
            </button>
            <button
              type="button"
              onClick={() => setShowLedgerJson((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs font-medium text-slate-200 transition hover:border-slate-600"
            >
              <span>{showLedgerJson ? "Hide Raw Data" : "View Raw JSON"}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleCopyAuditItem(
                  "constants-json",
                  publicConstantsJson,
                  "Balance Sheet JSON"
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
                  <span>Copy Raw Data</span>
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

      {/* Local What-If Balance Sheet Editors */}
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
                  ${ticker} &mdash; Local What-If Balance Sheet
                </h3>
                <p className="text-[11px] text-slate-400">
                  SEC CIK {bs.cik} &bull; As of {bs.effectiveDate}
                </p>
              </div>
              <span className="rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-400">
                LOCAL SANDBOX
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="block">
                <div className="mb-1 font-sans text-[11px] text-slate-300">
                  <TermExplainer
                    termKey="bs_btc_holdings"
                    className="text-[11px] text-slate-300"
                  >
                    Bitcoin Holdings (BTC)
                  </TermExplainer>
                </div>
                <input
                  type="number"
                  step="100"
                  aria-label={`${ticker} Bitcoin Holdings`}
                  value={bs.btcHoldings}
                  onChange={(e) =>
                    updateBsField(ticker, "btcHoldings", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="block">
                <div className="mb-1 font-sans text-[11px] text-slate-300">
                  <TermExplainer
                    termKey="bs_cash_reserves"
                    className="text-[11px] text-slate-300"
                  >
                    Cash Reserves ($M)
                  </TermExplainer>
                </div>
                <input
                  type="number"
                  step="10"
                  aria-label={`${ticker} Cash Reserves`}
                  value={bs.cashReserves}
                  onChange={(e) =>
                    updateBsField(ticker, "cashReserves", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="block">
                <div className="mb-1 font-sans text-[11px] text-slate-300">
                  <TermExplainer
                    termKey="bs_basic_shares"
                    className="text-[11px] text-slate-300"
                  >
                    Basic Common Shares (M)
                  </TermExplainer>
                </div>
                <input
                  type="number"
                  step="0.5"
                  aria-label={`${ticker} Basic Common Shares`}
                  value={bs.basicShares}
                  onChange={(e) =>
                    updateBsField(ticker, "basicShares", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="block">
                <div className="mb-1 font-sans text-[11px] text-slate-300">
                  <TermExplainer
                    termKey="bs_equity_iv"
                    className="text-[11px] text-slate-300"
                  >
                    30-Day Stock Options Vol
                  </TermExplainer>
                </div>
                <input
                  type="number"
                  step="0.01"
                  aria-label={`${ticker} 30-Day Stock Options Volatility`}
                  value={bs.equityIv30d}
                  onChange={(e) =>
                    updateBsField(ticker, "equityIv30d", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-white focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 border-t border-slate-800 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Preferred Stock Classes (Face Value $M &amp; Annual Dividend)
              </div>
              <div className="space-y-2">
                {bs.preferreds.map((t) => (
                  <div
                    key={t.name}
                    className="grid grid-cols-3 items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 font-mono text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">{t.name}</div>
                      <div className="text-[10px] text-slate-500">
                        Tier {t.tier} &bull;{" "}
                        {t.variableParCap ? "$100 Cap" : "Fixed Rate"}
                      </div>
                    </div>

                    <div className="block">
                      <div className="mb-0.5 font-sans text-[10px] text-slate-400">
                        <TermExplainer
                          termKey="bs_par_total"
                          className="text-[10px] text-slate-400"
                        >
                          Face Value ($M)
                        </TermExplainer>
                      </div>
                      <input
                        type="number"
                        step="25"
                        aria-label={`${t.name} Face Value`}
                        value={t.parTotal}
                        onChange={(e) =>
                          updateTrancheField(
                            ticker,
                            t.name,
                            "parTotal",
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-white focus:border-orange-500 focus:outline-none"
                      />
                    </div>

                    <div className="block">
                      <div className="mb-0.5 font-sans text-[10px] text-slate-400">
                        <TermExplainer
                          termKey="bs_coupon_rate"
                          className="text-[10px] text-slate-400"
                        >
                          Dividend Rate
                        </TermExplainer>
                      </div>
                      <input
                        type="number"
                        step="0.0025"
                        aria-label={`${t.name} Annual Dividend Rate`}
                        value={t.couponRate}
                        onChange={(e) =>
                          updateTrancheField(
                            ticker,
                            t.name,
                            "couponRate",
                            e.target.value
                          )
                        }
                        className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-white focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Automated Math Integrity Checks */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">
                <TermExplainer
                  termKey="invariant_suite"
                  className="text-base font-bold text-white"
                >
                  Automated Math Integrity Checks (8 Proofs)
                </TermExplainer>
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Stress-tests all 8 core math rules across extreme Bitcoin prices
              ($500 &ndash; $1,000,000) and volatilities (25% &ndash; 150%)
              directly in your browser.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right font-mono text-[11px] text-slate-400 tabular-nums">
              <div>
                {auditReport.evaluations} scenarios checked in{" "}
                {auditReport.elapsedMs.toFixed(1)}ms
              </div>
            </div>
            <button
              type="button"
              onClick={onRerunAudit}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Re-Run Math Checks</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {auditReport.checks.map((chk) => {
            const plain = INVARIANT_PLAIN_MAP[chk.id];
            return (
              <div
                key={chk.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 p-3.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-slate-500">
                      {chk.id}
                    </span>
                    <h4 className="text-xs font-bold text-white">
                      {plain ? plain.plainTitle : chk.title}
                    </h4>
                  </div>
                  {plain && (
                    <p className="mt-1 text-xs text-slate-300">
                      {plain.plainSummary}
                    </p>
                  )}
                  <div className="mt-1.5 font-mono text-[10px] text-slate-500">
                    Rule: {chk.formula}
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
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <div>
            <strong className="text-slate-200">100% Open-Source Math:</strong>{" "}
            Every number runs transparently from{" "}
            <code>lib/v31-alpha-engine.ts</code> with zero black-box APIs,
            powered by 5-minute cached market quotes (<code>/api/prices</code>)
            and weekly SEC filing baselines (<code>/api/constants</code>).
          </div>
        </div>
      </div>
    </div>
  );
}
