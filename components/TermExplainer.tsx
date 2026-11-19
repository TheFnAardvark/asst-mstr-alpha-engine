
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X, Lightbulb, Calculator, BookOpen } from "lucide-react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

interface TermExplainerProps {
  termKey: GlossaryKey;
  children?: React.ReactNode;
  className?: string;
  iconOnly?: boolean;
  iconClassName?: string;
}

export function TermExplainer({
  termKey,
  children,
  className = "",
  iconOnly = false,
  iconClassName = "h-3 w-3",
}: TermExplainerProps) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[termKey];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!entry) {
    return <span className={className}>{children}</span>;
  }

  const labelContent = children ?? entry.term;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`Click to explain: ${entry.term}`}
        aria-label={`Explain ${entry.term}`}
        className={
          "group inline-flex items-center gap-1 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-400/70 rounded " +
          (iconOnly
            ? "text-slate-400 hover:text-orange-300"
            : "underline decoration-dotted decoration-slate-600 underline-offset-4 hover:text-white hover:decoration-orange-400") +
          (className ? " " + className : "")
        }
      >
        {!iconOnly && <span>{labelContent}</span>}
        <HelpCircle
          className={
            "shrink-0 text-slate-500 transition-colors group-hover:text-orange-400 " +
            iconClassName
          }
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`glossary-title-${termKey}`}
            onClick={() => setOpen(false)}
          >
            <div
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-900 text-slate-100 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-5 py-4">
                <div>
                  <h4
                    id={`glossary-title-${termKey}`}
                    className="text-base font-bold text-white"
                  >
                    {entry.term}
                  </h4>
                  <div className="mt-1 inline-block rounded border border-slate-700/80 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                    Quant name: {entry.mathName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close explanation"
                  className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 px-5 py-4 text-sm leading-relaxed">
                <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-400">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>In Plain English</span>
                  </div>
                  <p className="text-slate-200">{entry.plainEnglish}</p>
                </div>

                <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    <Lightbulb className="h-3.5 w-3.5" />
                    <span>Why It Matters</span>
                  </div>
                  <p className="text-slate-300">{entry.whyItMatters}</p>
                </div>

                <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-400">
                    <Calculator className="h-3.5 w-3.5" />
                    <span>Under the Hood</span>
                  </div>
                  <p className="font-mono text-xs leading-relaxed text-slate-300">
                    {entry.underTheHood}
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end border-t border-slate-800 bg-slate-950/50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-orange-500/40 bg-orange-500/15 px-4 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/25"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
