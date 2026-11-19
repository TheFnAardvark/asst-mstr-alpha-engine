
"use client";

import React from "react";
import type { ValuationResult } from "@/lib/v31-alpha-engine";
import type { PlainRegimeBadge } from "@/lib/glossary";

export interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

export function fmtUsd(val: number | undefined, decimals: number = 2): string {
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

export function fmtSignedUsd(
  val: number | undefined,
  decimals: number = 2
): string {
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

export function fmtInt(val: number | undefined): string {
  return Math.round(Number(val) || 0).toLocaleString("en-US");
}

export function fmtPct(val: number | undefined, decimals: number = 1): string {
  const num = Number(val) || 0;
  return num.toFixed(decimals) + "%";
}

/**
 * Strive Amplification Ratio (%):
 * (Total Debt + Stated Preferred Notional Outstanding) / Market Value of BTC Holdings
 */
export function calcAmplificationPct(
  res: Pick<ValuationResult, "v0" | "k0GrossPar">
): number | null {
  if (res.v0 <= 0) return null;
  return (res.k0GrossPar / res.v0) * 100.0;
}

/**
 * Ex-Cash Amplification Ratio (%):
 * max(0, Total Debt + Stated Preferred Notional - Fiat Cash Reserve) / BTC Market Value
 */
export function calcNetAmplificationPct(
  res: Pick<ValuationResult, "v0" | "c0" | "k0GrossPar">
): number | null {
  if (res.v0 <= 0) return null;
  return (Math.max(0, res.k0GrossPar - res.c0) / res.v0) * 100.0;
}

export function fmtAmpPct(
  val: number | null | undefined,
  decimals: number = 1
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "N/A";
  return val.toFixed(decimals) + "%";
}

export function regimeBadgeClass(tone: PlainRegimeBadge["tone"]): string {
  switch (tone) {
    case "emerald":
      return "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
    case "sky":
      return "border border-sky-500/30 bg-sky-500/15 text-sky-300";
    case "amber":
      return "border border-amber-500/30 bg-amber-500/15 text-amber-300";
    case "rose":
      return "border border-rose-500/30 bg-rose-500/15 text-rose-300";
    default:
      return "border border-slate-700 bg-slate-800 text-slate-200";
  }
}

export function CustomChartTooltip({
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
