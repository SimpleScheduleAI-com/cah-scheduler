import type { WeightProfile } from "./types";

/**
 * Equal weight across all soft rules.
 * Produces the best overall schedule by balancing all concerns.
 */
export const BALANCED: WeightProfile = {
  overtime: 1.5,     // raised from 1.0 — OT is a real payroll cost (1.5× pay) and should outweigh most single preference violations
  preference: 1.5,   // raised from 1.0 — prefer staff who want this shift type / day
  weekendCount: 1.0,
  consecutiveWeekends: 1.0,
  holidayFairness: 1.0,
  skillMix: 1.0,
  float: 1.0,
  chargeClustering: 1.0,
  agency: 2.5,       // agency markup 2–3× base pay; strong preference for regular/PRN before agency
};

/**
 * Heavily weights fairness dimensions (weekend distribution, holiday fairness,
 * staff preferences). Reduces cost and float penalties.
 * Produces the most equitable schedule for staff.
 */
export const FAIR: WeightProfile = {
  overtime: 0.5,
  preference: 2.0,
  weekendCount: 3.0,
  consecutiveWeekends: 15.0,
  holidayFairness: 3.0,
  skillMix: 1.0,
  float: 0.5,
  chargeClustering: 1.0,
  agency: 1.5,       // lighter than Balanced — equitable distribution accepts agency cost when needed for coverage
};

/**
 * Heavily weights cost dimensions (overtime, agency/float use).
 * Reduces fairness and preference penalties.
 * Produces the most budget-efficient schedule.
 */
export const COST_OPTIMIZED: WeightProfile = {
  overtime: 3.0,
  preference: 0.5,
  weekendCount: 1.0,
  consecutiveWeekends: 1.0,
  holidayFairness: 1.0,
  skillMix: 0.5,
  float: 2.0,    // lowered from 3.0 — float differentials are a flat add-on, cheaper than OT (1.5× base pay)
  chargeClustering: 0.5,
  agency: 5.0,   // highest penalty — agency markup 2–3× base pay; cost profile avoids agency unless no alternative
};
