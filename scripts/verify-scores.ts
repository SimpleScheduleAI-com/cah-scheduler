/**
 * Verification script: generates all 3 schedule variants and asserts ordering.
 *
 * Assertions:
 *   - cost_score(Cost) <= cost_score(Balanced)     i.e. Cost has better cost
 *   - fairness_score(Fair) <= fairness_score(Balanced)  i.e. Fair has better fairness
 *
 * (Lower score = better penalty; the UI displays 1 - score as a percentage.)
 *
 * Run with:  npx tsx scripts/verify-scores.ts
 * Prereq:    npm run db:seed must have been run first.
 */

import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { generateSchedule, buildSchedulerContext, BALANCED, FAIR, COST_OPTIMIZED } from "../src/lib/engine/scheduler/index";
import { overtimeReductionSweep, weekendRedistributionSweep, recomputeOvertimeFlags } from "../src/lib/engine/scheduler/local-search";
import type { AssignmentDraft, SchedulerContext } from "../src/lib/engine/scheduler/types";

// ─── Inline scoring (mirrors scoreFromDrafts in runner.ts exactly) ────────────

function scoreFromDrafts(drafts: AssignmentDraft[], context: SchedulerContext) {
  let totalSlots = 0, filledSlots = 0, chargeSlots = 0, chargesFilled = 0;
  for (const shift of context.shifts) {
    const n = drafts.filter((d) => d.shiftId === shift.id).length;
    totalSlots += shift.requiredStaffCount;
    filledSlots += Math.min(n, shift.requiredStaffCount);
    if (shift.requiresChargeNurse) {
      chargeSlots++;
      if (drafts.some((d) => d.shiftId === shift.id && d.isChargeNurse)) chargesFilled++;
    }
  }
  const staffFill  = totalSlots  > 0 ? filledSlots  / totalSlots  : 1;
  const chargeFill = chargeSlots > 0 ? chargesFilled / chargeSlots : 1;
  const coverage   = 1 - (staffFill * 0.7 + chargeFill * 0.3);

  const wkCounts = new Map<string, number>();
  const ids = new Set(drafts.map((d) => d.staffId));
  for (const d of drafts) {
    const day = new Date(d.date).getDay();
    if (day === 0 || day === 6) wkCounts.set(d.staffId, (wkCounts.get(d.staffId) ?? 0) + 1);
  }
  for (const id of ids) if (!wkCounts.has(id)) wkCounts.set(id, 0);
  const cnts = [...wkCounts.values()];
  let fairness = 0;
  if (cnts.length >= 2) {
    const mean = cnts.reduce((a, b) => a + b, 0) / cnts.length;
    const variance = cnts.reduce((s, c) => s + (c - mean) ** 2, 0) / cnts.length;
    fairness = Math.min(Math.sqrt(variance) / 3, 1);
  }

  const otCount     = drafts.filter((d) => d.isOvertime).length;
  const agencyCount = drafts.filter((d) => context.staffMap.get(d.staffId)?.employmentType === "agency").length;
  const floatCount  = drafts.filter((d) => d.isFloat).length;
  const costPenalty = drafts.length > 0
    ? (agencyCount * 4.0 + otCount * 1.0 + floatCount * 0.2) / (drafts.length * 4.0)
    : 0;
  const cost = Math.min(costPenalty, 1);

  let prefChecks = 0, mismatches = 0;
  for (const d of drafts) {
    const s = context.staffMap.get(d.staffId);
    if (!s?.preferences) continue;
    const { preferredShift, preferredDaysOff, avoidWeekends } = s.preferences;
    prefChecks++;
    if (preferredShift !== "any" && preferredShift !== d.shiftType) mismatches++;
    if (preferredDaysOff.length > 0) {
      prefChecks++;
      if (preferredDaysOff.includes(new Date(d.date).toLocaleDateString("en-US", { weekday: "long" }))) mismatches++;
    }
    if (avoidWeekends) {
      const day = new Date(d.date).getDay();
      if (day === 0 || day === 6) { prefChecks++; mismatches++; }
    }
  }
  const preference = prefChecks > 0 ? mismatches / prefChecks : 0;

  let totalShifts = 0, poorMix = 0;
  for (const shift of context.shifts) {
    const assigned = drafts.filter((d) => d.shiftId === shift.id);
    if (assigned.length < 2) continue;
    totalShifts++;
    const levels = assigned.map((d) => context.staffMap.get(d.staffId)?.icuCompetencyLevel ?? 0).filter((l) => l > 0);
    if (levels.length >= 2 && Math.max(...levels) - Math.min(...levels) === 0) poorMix++;
  }
  const skillMix = totalShifts > 0 ? poorMix / totalShifts : 0;

  const w = { coverage: 3, fairness: 2, cost: 2, preference: 1.5, skillMix: 1 };
  const tw = Object.values(w).reduce((a, b) => a + b, 0);
  const overall = (coverage * w.coverage + fairness * w.fairness + cost * w.cost + preference * w.preference + skillMix * w.skillMix) / tw;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { overall: r(overall), coverage: r(coverage), fairness: r(fairness), cost: r(cost), preference: r(preference), skillMix: r(skillMix) };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const dbPath = path.join(process.cwd(), "cah-scheduler.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

const allSchedules = db.select().from(schema.schedule).all();
// Skip the PRN import template — it has no shifts, so scores would all be 0
const targets = allSchedules.filter((s) => s.name !== "PRN Import Template");
if (targets.length === 0) {
  console.error("ERROR: No testable schedules found. Run `npm run db:seed` first.");
  process.exit(1);
}

let globalPassed = true;
const SEED = 42;

for (const target of targets) {
  const days = Math.round(
    (new Date(target.endDate).getTime() - new Date(target.startDate).getTime()) / 86_400_000
  ) + 1;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Schedule: "${target.name}" (${days} days, ${target.startDate} → ${target.endDate})`);
  console.log("=".repeat(60));

  const t0 = Date.now();

  const context = buildSchedulerContext(target.id);

  console.log("Generating Balanced (1500 iters)...");
  const balancedResult = generateSchedule(target.id, BALANCED, 1500, undefined, SEED);
  const balancedScore  = scoreFromDrafts(balancedResult.assignments, context);

  console.log("Generating Fair (from Balanced base + weekend sweep)...");
  const fairBase = balancedResult.assignments.map((a) => ({ ...a }));
  const fairFinal = weekendRedistributionSweep(fairBase, context, FAIR);
  recomputeOvertimeFlags(fairFinal);
  const fairScore  = scoreFromDrafts(fairFinal, context);

  console.log("Generating Cost (from Balanced base + Cost sweeps)...");
  const costBase      = balancedResult.assignments.map((a) => ({ ...a }));
  const afterOTSweep  = overtimeReductionSweep(costBase, context, COST_OPTIMIZED);
  recomputeOvertimeFlags(afterOTSweep);
  const costFinal     = weekendRedistributionSweep(afterOTSweep, context, COST_OPTIMIZED);
  recomputeOvertimeFlags(costFinal);
  const costScore = scoreFromDrafts(costFinal, context);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const otB = balancedResult.assignments.filter((a) => a.isOvertime).length;
  const otC = costFinal.filter((a) => a.isOvertime).length;
  const agB = balancedResult.assignments.filter((a) => context.staffMap.get(a.staffId)?.employmentType === "agency").length;
  const agC = costFinal.filter((a) => context.staffMap.get(a.staffId)?.employmentType === "agency").length;
  const flB = balancedResult.assignments.filter((a) => a.isFloat).length;
  const flC = costFinal.filter((a) => a.isFloat).length;

  const pad = (s: string | number) => String(s).padEnd(10);
  console.log(`\n${"Metric".padEnd(14)} ${"Balanced".padEnd(10)} ${"Fair".padEnd(10)} ${"Cost".padEnd(10)}`);
  console.log("─".repeat(46));
  for (const key of ["overall","coverage","fairness","cost","preference","skillMix"] as const) {
    console.log(`${key.padEnd(14)} ${pad(balancedScore[key])} ${pad(fairScore[key])} ${pad(costScore[key])}`);
  }
  console.log(`\nOT assignments:     Balanced=${otB}  Cost=${otC}  (lower=better)`);
  console.log(`Agency assignments: Balanced=${agB}  Cost=${agC}  (lower=better)`);
  console.log(`Float assignments:  Balanced=${flB}  Cost=${flC}  (lower=better)`);
  console.log(`Total assignments:  Balanced=${balancedResult.assignments.length}`);
  console.log(`Generation time:    ${elapsed}s`);

  let passed = true;
  console.log("\n=== ASSERTIONS ===");

  const assert = (label: string, cond: boolean) => {
    console.log(`[${cond ? "PASS" : "FAIL"}] ${label}`);
    if (!cond) { passed = false; globalPassed = false; }
  };

  assert(`cost(Cost)=${costScore.cost} <= cost(Balanced)=${balancedScore.cost}`,                costScore.cost    <= balancedScore.cost);
  assert(`fairness(Fair)=${fairScore.fairness} <= fairness(Balanced)=${balancedScore.fairness}`, fairScore.fairness <= balancedScore.fairness);
  assert(`OT(Cost)=${otC} <= OT(Balanced)=${otB}`,                                              otC <= otB);

  console.log(`\n${passed ? "✓ All assertions passed." : "✗ One or more assertions FAILED."}`);
}

console.log(`\n${"=".repeat(60)}`);
console.log(`OVERALL: ${globalPassed ? "✓ ALL SCHEDULES PASSED." : "✗ ONE OR MORE SCHEDULES FAILED."}\n`);
process.exit(globalPassed ? 0 : 1);
