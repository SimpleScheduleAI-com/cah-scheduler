/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Variant sanity probe: replicates the runner's exact BALANCED→FAIR→COST
 * derivation across multiple seeds and staffing levels, then checks the
 * variant promises:
 *   - fairness(FAIR) ≥ fairness(BALANCED) and fairness(FAIR) ≥ fairness(COST)
 *   - cost(COST) ≥ cost(BALANCED) and cost(COST) ≥ cost(FAIR)
 * Reports every inversion (e.g. FAIR scoring better on cost than COST).
 * Uses the scratch DB seeded by verify-schedule-periods.ts.
 */
import path from "path";
import os from "os";
process.chdir(path.join(os.tmpdir(), "cah-verify"));

async function main() {
  const { db } = await import("../src/db");
  const s: any = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { generateSchedule, BALANCED, FAIR, COST_OPTIMIZED } = await import("../src/lib/engine/scheduler");
  const { buildSchedulerContext } = await import("../src/lib/engine/scheduler/index");
  const { weekendRedistributionSweep, overtimeReductionSweep, recomputeOvertimeFlags } = await import("../src/lib/engine/scheduler/local-search");
  const { scoreSchedule } = await import("../src/lib/scoring/scorer");
  const { buildShiftInserts } = await import("../src/lib/schedules/build-shifts");
  const { addDays, utcDayOfWeek } = await import("../src/lib/engine/scheduler/state");

  const wipe = () => {
    db.delete(s.assignment).run();
    db.delete(s.prnAvailability).run();
    db.delete(s.staffLeave).run();
    db.delete(s.shift).run();
    db.delete(s.schedule).run();
  };

  const START = "2026-07-06";
  const END = addDays(START, 27); // 4 weeks

  const mkSchedule = () => {
    const sched = db.insert(s.schedule).values({ name: "variant-probe", startDate: START, endDate: END, unit: "ICU", status: "draft" }).returning().get();
    const defs = db.select().from(s.shiftDefinition).all();
    for (const row of buildShiftInserts(sched.id, START, END, defs.map((d: any) => ({ id: d.id, requiredStaffCount: d.requiredStaffCount, requiresChargeNurse: d.requiresChargeNurse })), "green", null)) {
      db.insert(s.shift).values(row).run();
    }
    const mwf: string[] = []; const we: string[] = [];
    for (let d = START; d <= END; d = addDays(d, 1)) {
      const dow = utcDayOfWeek(d);
      if (dow === 1 || dow === 3 || dow === 5) mwf.push(d);
      if (dow === 0 || dow === 6) we.push(d);
    }
    db.insert(s.prnAvailability).values({ staffId: "nurse-18", scheduleId: sched.id, availableDates: mwf }).run();
    db.insert(s.prnAvailability).values({ staffId: "nurse-19", scheduleId: sched.id, availableDates: we }).run();
    return sched.id;
  };

  // Score by writing the drafts to the assignment table and calling the
  // public scoreSchedule(scheduleId), then clearing for the next variant.
  const scoreDrafts = (drafts: any[], schedId: string) => {
    db.delete(s.assignment).where(eq(s.assignment.scheduleId, schedId)).run();
    for (const a of drafts) {
      db.insert(s.assignment).values({
        shiftId: a.shiftId, staffId: a.staffId, scheduleId: schedId,
        isChargeNurse: a.isChargeNurse, isOvertime: a.isOvertime,
        isFloat: a.isFloat, floatFromUnit: a.floatFromUnit,
        assignmentSource: "auto_generated", status: "assigned",
      }).run();
    }
    const score = scoreSchedule(schedId);
    db.delete(s.assignment).where(eq(s.assignment.scheduleId, schedId)).run();
    return score;
  };

  const DEACTIVATE = ["nurse-07", "nurse-08", "nurse-09", "nurse-16", "nurse-17"];
  const rows: string[] = [];
  let inversions = 0;
  let runs = 0;

  for (const pressure of [false, true]) {
    if (pressure) for (const id of DEACTIVATE) db.update(s.staff).set({ isActive: false }).where(eq(s.staff.id, id)).run();
    for (const seed of [11, 22, 33, 44]) {
      wipe();
      const schedId = mkSchedule();
      // Replicate runner: BALANCED full pipeline, then FAIR/COST derived
      const balanced = generateSchedule(schedId, BALANCED, 800, undefined, seed);
      const context = buildSchedulerContext(schedId);

      const fairBase = balanced.assignments.map((a: any) => ({ ...a }));
      const fairAssignments = weekendRedistributionSweep(fairBase, context, FAIR);
      recomputeOvertimeFlags(fairAssignments);

      const costBase = balanced.assignments.map((a: any) => ({ ...a }));
      const afterOT = overtimeReductionSweep(costBase, context, COST_OPTIMIZED);
      recomputeOvertimeFlags(afterOT);
      const costAssignments = weekendRedistributionSweep(afterOT, context, COST_OPTIMIZED);
      recomputeOvertimeFlags(costAssignments);

      const bScore = scoreDrafts(balanced.assignments, schedId);
      const fScore = scoreDrafts(fairAssignments, schedId);
      const cScore = scoreDrafts(costAssignments, schedId);

      runs++;
      const label = `${pressure ? "tight" : "normal"}/seed${seed}`;
      // Scores are penalties: 0.0 = best, 1.0 = worst (scorer.ts contract)
      const issues: string[] = [];
      if (fScore.fairness > bScore.fairness) issues.push(`FAIR made fairness WORSE than Balanced (${fScore.fairness} vs ${bScore.fairness})`);
      if (cScore.cost > bScore.cost) issues.push(`COST made cost WORSE than Balanced (${cScore.cost} vs ${bScore.cost})`);
      if (fScore.cost < cScore.cost) issues.push(`FAIR is the CHEAPER schedule (cost ${fScore.cost} vs COST's ${cScore.cost})`);
      if (cScore.fairness < fScore.fairness) issues.push(`COST is the FAIRER schedule (fairness ${cScore.fairness} vs FAIR's ${fScore.fairness})`);
      const identical = bScore.overall === fScore.overall && bScore.overall === cScore.overall
        && fScore.fairness === bScore.fairness && cScore.cost === bScore.cost;
      if (identical) issues.push(`all three variants IDENTICAL — sweeps found no improvement`);
      inversions += issues.length;
      rows.push(
        `${label}: BAL(f${bScore.fairness}/c${bScore.cost}/o${bScore.overall}) FAIR(f${fScore.fairness}/c${fScore.cost}/o${fScore.overall}) COST(f${cScore.fairness}/c${cScore.cost}/o${cScore.overall})` +
        (issues.length ? `\n    INVERSIONS: ${issues.join("; ")}` : "")
      );
    }
    if (pressure) for (const id of DEACTIVATE) db.update(s.staff).set({ isActive: true }).where(eq(s.staff.id, id)).run();
  }

  console.log(rows.join("\n"));
  console.log(`\n${runs} runs, ${inversions} variant-promise inversions`);
}
main().catch((e) => { console.error(e); process.exit(1); });
