import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns a hex color for a staff ICU competency level (1–5). */
export function staffLevelColor(level: number): string {
  if (level >= 4) return "#16a34a"; // green-600 — senior/charge qualified
  if (level >= 3) return "#ca8a04"; // amber-600 — mid-level
  return "#dc2626";                  // red-600 — orientee/junior
}
