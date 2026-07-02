"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Small "ⓘ" affordance with a plain-language explanation on hover/focus/tap.
 * For ICP-facing jargon (FTE, PRN, competency levels, census bands) — a nurse
 * manager should never have to guess what a term means.
 */
export function InfoTip({ label, children, className }: {
  /** Accessible name, e.g. "What does FTE mean?" */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="peer inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/40 text-[10px] font-semibold text-muted-foreground/80 hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 align-middle"
      >
        i
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 rounded-md border bg-popover p-2.5 text-xs font-normal normal-case tracking-normal text-popover-foreground shadow-md transition-opacity",
          "opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100",
          open && "opacity-100"
        )}
      >
        {children}
      </span>
    </span>
  );
}

/** Shared plain-language copy so every screen explains terms the same way. */
export const TERM_HELP = {
  fte: "FTE = full-time equivalent. 1.0 FTE is a full-time nurse (40 h/week); 0.5 FTE is half-time (20 h/week).",
  prn: "PRN = as-needed staff (also called per diem). They submit the days they can work each month and are scheduled only on those days.",
  competency: (
    <>
      <span className="mb-1 block font-medium">ICU competency levels</span>
      L1 — new graduate, must work with an L5 preceptor
      <br />
      L2 — needs L4+ supervision on ICU/ER shifts
      <br />
      L3 — works independently
      <br />
      L4 — can supervise L2 staff
      <br />
      L5 — preceptor and charge-nurse capable
    </>
  ),
  censusBands: "Census bands are patient-count tiers (Blue = low, Green = normal, Yellow = elevated, Red = critical) that set how many staff each shift needs.",
} as const;
