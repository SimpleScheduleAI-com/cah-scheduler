/**
 * Single source of truth for "is this a supervised (ICU/ER-class) unit?".
 *
 * Used by BOTH the scheduler's eligibility gate and the post-hoc rule
 * evaluators — a mismatch between the two lets manually entered assignments
 * pass evaluation that the generator would have rejected (or vice versa).
 */
const SUPERVISED_UNITS = ["ICU", "ER", "ED", "EMERGENCY"];

export function isICUUnit(unitName: string): boolean {
  const words = unitName.toUpperCase().split(/[\s\-_]+/);
  return SUPERVISED_UNITS.some((u) => words.includes(u));
}
