/**
 * Shared utility for computing the effective required staff count for a shift,
 * applying the census-band priority cascade used by both the dashboard and analytics APIs.
 *
 * Priority order:
 * 1. If the shift has an explicit censusBandId, use that band's totals
 * 2. If the shift has an acuityLevel + unit, find the matching band by color + unit
 * 3. If the shift has an actualCensus, find the band whose patient range contains it
 * 4. Fall back to the base requiredStaffCount from the shift / shift definition
 */

export interface CensusBandLite {
  id: string;
  color: string;
  unit: string;
  minPatients: number;
  maxPatients: number;
  requiredRNs: number;
  requiredCNAs: number;
}

export function getEffectiveRequired(
  cbId: string | null,
  acuityLevel: string | null,
  unitName: string | null,
  actualCensus: number | null,
  base: number,
  bands: CensusBandLite[]
): number {
  if (cbId) {
    const b = bands.find((b) => b.id === cbId);
    if (b) return b.requiredRNs + b.requiredCNAs;
  }
  if (acuityLevel && unitName) {
    const b = bands.find((b) => b.color === acuityLevel && b.unit === unitName);
    if (b) return b.requiredRNs + b.requiredCNAs;
  }
  if (actualCensus !== null) {
    const b = bands.find(
      (b) => actualCensus >= b.minPatients && actualCensus <= b.maxPatients
    );
    if (b) return Math.max(b.requiredRNs + b.requiredCNAs, base);
  }
  return base;
}
