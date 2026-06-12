/**
 * Schedule-period verification harness.
 *
 * Generates ~3 months of schedules under four period layouts:
 *   A) six 2-week periods   B) three 4-week periods
 *   C) two 6-week periods   D) mixed 2w + 4w + 6w
 *
 * For each layout it runs the real generation engine period-by-period
 * (each period sees the previous ones in the DB, exactly like production),
 * then verifies hard rules with an INDEPENDENT checker (no engine code) over
 * the entire continuous timeline — so violations that span period boundaries
 * cannot hide. Also runs the engine's own evaluator per period, a determinism
 * check, and a negative control (injected violation must be caught).
 *
 * Run with:  npx tsx scripts/verify-schedule-periods.ts
 * Uses a SCRATCH database in %TEMP%/cah-verify — never the dev database.
 * Prerequisite: npx drizzle-kit push --config=scripts/drizzle.verify.config.ts --force
 */

import path from "path";
import os from "os";
import fs from "fs";

const SCRATCH = path.join(os.tmpdir(), "cah-verify");
if (!fs.existsSync(path.join(SCRATCH, "cah-scheduler.db"))) {
  console.error("Scratch DB missing. Run: npx drizzle-kit push --config=scripts/drizzle.verify.config.ts --force");
  process.exit(1);
}
// @/db resolves its file from process.cwd() — switch BEFORE importing it.
process.chdir(SCRATCH);

/* eslint-disable @typescript-eslint/no-explicit-any */
// Modules are loaded dynamically (after chdir) so the DB opens in SCRATCH.
let db: any;
let s: any;
let eq: any;
let generateSchedule: any;
let BALANCED: any;
let evaluateSchedule: any;
let buildShiftInserts: any;
let addDays: (d: string, n: number) => string;
let utcDayOfWeek: (d: string) => number;

async function loadModules() {
  ({ db } = await import("../src/db"));
  s = await import("../src/db/schema");
  ({ eq } = await import("drizzle-orm"));
  ({ generateSchedule, BALANCED } = await import("../src/lib/engine/scheduler"));
  ({ evaluateSchedule } = await import("../src/lib/engine/rule-engine"));
  ({ buildShiftInserts } = await import("../src/lib/schedules/build-shifts"));
  ({ addDays, utcDayOfWeek } = await import("../src/lib/engine/scheduler/state"));
}

// ─── Reporting ────────────────────────────────────────────────────────────────

interface CheckResult {
  scenario: string;
  check: string;
  pass: boolean;
  detail: string;
}
const results: CheckResult[] = [];
function record(scenario: string, check: string, pass: boolean, detail: string) {
  results.push({ scenario, check, pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${check} — ${detail}`);
}

// ─── Seed data (once) ─────────────────────────────────────────────────────────

const UNIT = "ICU";

function seedStatic() {
  db.insert(s.unit).values({
    name: UNIT,
    description: "Intensive Care",
    weekendShiftsRequired: 3,
    holidayShiftsRequired: 1,
    schedulePeriodWeeks: 6,
    minStaffDay: 3,
    minStaffNight: 2,
    maxOnCallPerWeek: 1,
    maxOnCallWeekendsPerMonth: 1,
    maxConsecutiveWeekends: 2,
    calloutThresholdDays: 7,
  }).run();

  // Same hard/soft rule rows the Excel import creates (createDefaultRules)
  const rules = [
    { name: "Minimum Staff Per Shift", ruleType: "hard", category: "staffing", parameters: { evaluator: "min-staff" }, weight: 1.0 },
    { name: "Charge Nurse Required", ruleType: "hard", category: "staffing", parameters: { evaluator: "charge-nurse" }, weight: 1.0 },
    { name: "Patient-to-Licensed-Staff Ratio", ruleType: "hard", category: "staffing", parameters: { evaluator: "patient-ratio" }, weight: 1.0 },
    { name: "Minimum Rest Between Shifts", ruleType: "hard", category: "rest", parameters: { evaluator: "rest-hours", minRestHours: 10 }, weight: 1.0 },
    { name: "Maximum Consecutive Days", ruleType: "hard", category: "rest", parameters: { evaluator: "max-consecutive", maxConsecutiveDays: 5 }, weight: 1.0 },
    { name: "ICU Competency Minimum", ruleType: "hard", category: "skill", parameters: { evaluator: "icu-competency", minLevel: 2 }, weight: 1.0 },
    { name: "Level 1 Preceptor Required", ruleType: "hard", category: "skill", parameters: { evaluator: "level1-preceptor" }, weight: 1.0 },
    { name: "Level 2 ICU/ER Supervision", ruleType: "hard", category: "skill", parameters: { evaluator: "level2-supervision" }, weight: 1.0 },
    { name: "No Overlapping Shifts", ruleType: "hard", category: "rest", parameters: { evaluator: "no-overlapping-shifts" }, weight: 1.0 },
    { name: "PRN Availability", ruleType: "hard", category: "preference", parameters: { evaluator: "prn-availability" }, weight: 1.0 },
    { name: "Staff On Leave", ruleType: "hard", category: "preference", parameters: { evaluator: "staff-on-leave" }, weight: 1.0 },
    { name: "On-Call Limits", ruleType: "hard", category: "rest", parameters: { evaluator: "on-call-limits" }, weight: 1.0 },
    { name: "Maximum 60 Hours in 7 Days", ruleType: "hard", category: "rest", parameters: { evaluator: "max-hours-60", maxHours: 60 }, weight: 1.0 },
    { name: "Overtime & Extra Hours", ruleType: "soft", category: "cost", parameters: { evaluator: "overtime-v2", actualOtPenaltyWeight: 1.0, extraHoursPenaltyWeight: 0.3 }, weight: 8.0 },
    { name: "Staff Preference Match", ruleType: "soft", category: "preference", parameters: { evaluator: "preference-match" }, weight: 5.0 },
    { name: "Weekend Shifts Required", ruleType: "soft", category: "fairness", parameters: { evaluator: "weekend-count" }, weight: 7.0 },
    { name: "Consecutive Weekends Penalty", ruleType: "soft", category: "fairness", parameters: { evaluator: "consecutive-weekends" }, weight: 6.0 },
    { name: "Holiday Fairness", ruleType: "soft", category: "fairness", parameters: { evaluator: "holiday-fairness" }, weight: 7.0 },
    { name: "Skill Mix Diversity", ruleType: "soft", category: "skill", parameters: { evaluator: "skill-mix" }, weight: 3.0 },
    { name: "Minimize Float Assignments", ruleType: "soft", category: "preference", parameters: { evaluator: "float-penalty" }, weight: 4.0 },
    { name: "Charge Nurse Distribution", ruleType: "soft", category: "skill", parameters: { evaluator: "charge-clustering" }, weight: 4.0 },
  ] as const;
  for (const r of rules) {
    db.insert(s.rule).values({ ...r, description: r.name, isActive: true } as never).run();
  }

  // Census bands (so patient-ratio/min-staff have config; shifts use green default)
  const bands = [
    { name: "Low Census", color: "blue", unit: UNIT, minPatients: 1, maxPatients: 4, requiredRNs: 2, requiredLPNs: 0, requiredCNAs: 0, requiredChargeNurses: 1, patientToNurseRatio: "2:1" },
    { name: "Normal Census", color: "green", unit: UNIT, minPatients: 5, maxPatients: 8, requiredRNs: 4, requiredLPNs: 0, requiredCNAs: 0, requiredChargeNurses: 1, patientToNurseRatio: "2:1" },
    { name: "High Census", color: "yellow", unit: UNIT, minPatients: 9, maxPatients: 10, requiredRNs: 5, requiredLPNs: 0, requiredCNAs: 0, requiredChargeNurses: 1, patientToNurseRatio: "2:1" },
  ] as const;
  for (const b of bands) db.insert(s.censusBand).values(b as never).run();

  // Shift definitions: 12h day (4 staff + charge) and 12h night (3 staff + charge)
  db.insert(s.shiftDefinition).values({
    name: "Day Shift", shiftType: "day", startTime: "07:00", endTime: "19:00",
    durationHours: 12, unit: UNIT, requiredStaffCount: 4, requiresChargeNurse: true, countsTowardStaffing: true,
  }).run();
  db.insert(s.shiftDefinition).values({
    name: "Night Shift", shiftType: "night", startTime: "19:00", endTime: "07:00",
    durationHours: 12, unit: UNIT, requiredStaffCount: 3, requiresChargeNurse: true, countsTowardStaffing: true,
  }).run();

  // 19 nurses: 6 charge-qualified (L4/L5), 11 core (L2/L3), 2 PRN, 1 weekend-exempt
  const staffRows: { id: string; level: number; type: string; charge: boolean; weekendExempt?: boolean }[] = [];
  let n = 0;
  const mk = (level: number, type: "full_time" | "part_time" | "per_diem", charge: boolean, weekendExempt = false) => {
    n += 1;
    const id = `nurse-${String(n).padStart(2, "0")}`;
    staffRows.push({ id, level, type, charge, weekendExempt });
    db.insert(s.staff).values({
      id,
      firstName: "Nurse",
      lastName: `${String(n).padStart(2, "0")}-L${level}`,
      role: "RN",
      employmentType: type,
      fte: type === "full_time" ? 0.9 : type === "part_time" ? 0.6 : 0,
      hireDate: "2024-01-01",
      icuCompetencyLevel: level,
      isChargeNurseQualified: charge,
      certifications: [],
      reliabilityRating: 4,
      homeUnit: UNIT,
      crossTrainedUnits: [],
      weekendExempt,
      isActive: true,
    }).run();
  };
  mk(5, "full_time", true); mk(5, "full_time", true); mk(5, "full_time", true);
  mk(4, "full_time", true); mk(4, "full_time", true); mk(4, "full_time", true);
  for (let i = 0; i < 8; i++) mk(3, "full_time", false);
  mk(3, "full_time", false, true); // weekend-exempt
  mk(2, "full_time", false); mk(2, "full_time", false);
  mk(3, "per_diem", false); mk(2, "per_diem", false);

  return staffRows;
}

// ─── Per-scenario helpers ─────────────────────────────────────────────────────

function wipeScheduleData() {
  db.delete(s.assignment).run();
  db.delete(s.prnAvailability).run();
  db.delete(s.staffLeave).run();
  db.delete(s.shift).run();
  db.delete(s.schedule).run();
}

/** Approved leave + PRN availability covering the whole timeline. */
function seedDynamic(firstScheduleId: string, timelineStart: string, timelineEnd: string) {
  // nurse-10 on approved leave for days 10–16 of the timeline
  db.insert(s.staffLeave).values({
    staffId: "nurse-10",
    leaveType: "vacation",
    startDate: addDays(timelineStart, 9),
    endDate: addDays(timelineStart, 15),
    status: "approved",
    submittedAt: new Date().toISOString(),
  }).run();

  // PRN nurses available Mon/Wed/Fri (nurse-18) and weekends (nurse-19)
  const monWedFri: string[] = [];
  const weekends: string[] = [];
  for (let d = timelineStart; d <= timelineEnd; d = addDays(d, 1)) {
    const dow = utcDayOfWeek(d);
    if (dow === 1 || dow === 3 || dow === 5) monWedFri.push(d);
    if (dow === 0 || dow === 6) weekends.push(d);
  }
  db.insert(s.prnAvailability).values({ staffId: "nurse-18", scheduleId: firstScheduleId, availableDates: monWedFri }).run();
  db.insert(s.prnAvailability).values({ staffId: "nurse-19", scheduleId: firstScheduleId, availableDates: weekends }).run();
}

function createSchedule(name: string, startDate: string, endDate: string): string {
  const sched = db.insert(s.schedule).values({
    name, startDate, endDate, unit: UNIT, status: "draft",
  }).returning().get();
  const defs = db.select().from(s.shiftDefinition).all();
  const inserts = buildShiftInserts(
    sched.id, startDate, endDate,
    defs.map((d) => ({ id: d.id, requiredStaffCount: d.requiredStaffCount, requiresChargeNurse: d.requiresChargeNurse })),
    "green", null,
  );
  for (const row of inserts) db.insert(s.shift).values(row).run();
  return sched.id;
}

function generateAndWrite(scheduleId: string, seed: number) {
  const result = generateSchedule(scheduleId, BALANCED, 800, undefined, seed);
  for (const a of result.assignments) {
    db.insert(s.assignment).values({
      shiftId: a.shiftId,
      staffId: a.staffId,
      scheduleId,
      isChargeNurse: a.isChargeNurse,
      isOvertime: a.isOvertime,
      isFloat: a.isFloat,
      floatFromUnit: a.floatFromUnit,
      assignmentSource: "auto_generated",
      status: "assigned",
    }).run();
  }
  return result;
}

// ─── Independent timeline checker (no engine code) ───────────────────────────

interface Row {
  staffId: string;
  date: string;
  startTime: string;
  durationHours: number;
  shiftId: string;
  requiresChargeNurse: boolean;
  isChargeNurse: boolean;
  level: number;
  employmentType: string;
  weekendExempt: boolean;
}

function loadTimeline(): Row[] {
  return db
    .select({
      staffId: s.assignment.staffId,
      date: s.shift.date,
      startTime: s.shiftDefinition.startTime,
      durationHours: s.shiftDefinition.durationHours,
      shiftId: s.shift.id,
      requiresChargeNurse: s.shift.requiresChargeNurse,
      isChargeNurse: s.assignment.isChargeNurse,
      level: s.staff.icuCompetencyLevel,
      employmentType: s.staff.employmentType,
      weekendExempt: s.staff.weekendExempt,
    })
    .from(s.assignment)
    .innerJoin(s.shift, eq(s.assignment.shiftId, s.shift.id))
    .innerJoin(s.shiftDefinition, eq(s.shift.shiftDefinitionId, s.shiftDefinition.id))
    .innerJoin(s.staff, eq(s.assignment.staffId, s.staff.id))
    .where(eq(s.assignment.status, "assigned"))
    .all() as Row[];
}

function epoch(date: string, time: string): number {
  return new Date(`${date}T${time}:00Z`).getTime();
}

function checkTimeline(scenario: string, rows: Row[], boundaries: string[], expectShortage = false) {
  const byStaff = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byStaff.get(r.staffId) ?? [];
    list.push(r);
    byStaff.set(r.staffId, list);
  }

  // 1. Max consecutive days ≤ 5 over the WHOLE timeline
  let worstRun = 0;
  let runViolations = 0;
  const boundaryRuns: string[] = [];
  for (const [staffId, list] of byStaff) {
    const dates = [...new Set(list.map((r) => r.date))].sort();
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      run = dates[i] === addDays(dates[i - 1], 1) ? run + 1 : 1;
      worstRun = Math.max(worstRun, run);
      if (run > 5) runViolations++;
      // record runs of 3+ that cross any boundary (evidence the check is non-vacuous)
      if (run >= 3 && boundaries.some((b) => dates[i - run + 1] < b && dates[i] >= b)) {
        boundaryRuns.push(`${staffId}:${dates[i - run + 1]}→${dates[i]}(${run}d)`);
      }
    }
  }
  record(scenario, "max 5 consecutive days (whole timeline)", runViolations === 0,
    `worst run ${worstRun}d; ${boundaryRuns.length} runs of ≥3d crossing a period boundary (${boundaryRuns.slice(0, 3).join(", ") || "none"})`);

  // 2. ≥10h rest between consecutive shifts; no overlap
  let minRest = Infinity;
  let restViolations = 0;
  let overlaps = 0;
  let boundaryRestSamples = 0;
  for (const [, list] of byStaff) {
    const sorted = [...list].sort((a, b) => epoch(a.date, a.startTime) - epoch(b.date, b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const prevEnd = epoch(prev.date, prev.startTime) + prev.durationHours * 3600_000;
      const curStart = epoch(cur.date, cur.startTime);
      if (curStart < prevEnd) { overlaps++; continue; }
      const rest = (curStart - prevEnd) / 3600_000;
      if (rest < 72) minRest = Math.min(minRest, rest); // only track adjacent-ish gaps
      if (rest < 10) restViolations++;
      if (boundaries.some((b) => prev.date < b && cur.date >= b) && rest < 24) boundaryRestSamples++;
    }
  }
  record(scenario, "no overlapping shifts", overlaps === 0, `${overlaps} overlaps`);
  record(scenario, "≥10h rest between shifts (incl. across boundaries)", restViolations === 0,
    `min observed rest ${minRest === Infinity ? "n/a" : minRest.toFixed(1) + "h"}; ${boundaryRestSamples} tight (<24h) boundary crossings checked`);

  // 3. ≤60h in EVERY rolling 7-day window across the whole timeline
  const allDates = rows.map((r) => r.date).sort();
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];
  let peak = 0;
  let windowViolations = 0;
  for (const [, list] of byStaff) {
    const hoursByDate = new Map<string, number>();
    for (const r of list) hoursByDate.set(r.date, (hoursByDate.get(r.date) ?? 0) + r.durationHours);
    for (let w = minDate; w <= maxDate; w = addDays(w, 1)) {
      let total = 0;
      for (let i = 0; i < 7; i++) total += hoursByDate.get(addDays(w, i)) ?? 0;
      peak = Math.max(peak, total);
      if (total > 60) windowViolations++;
    }
  }
  record(scenario, "≤60h in any rolling 7-day window (incl. boundary windows)", windowViolations === 0,
    `peak window ${peak}h; ${windowViolations} over-limit windows`);

  // 4. Charge nurse: every staffed charge-required shift has a Level 4+ charge
  const byShift = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byShift.get(r.shiftId) ?? [];
    list.push(r);
    byShift.set(r.shiftId, list);
  }
  let chargeGaps = 0;
  let chargeUnderqualified = 0;
  for (const [, list] of byShift) {
    if (!list[0].requiresChargeNurse) continue;
    const charges = list.filter((r) => r.isChargeNurse);
    if (charges.length === 0) chargeGaps++;
    else if (charges.some((c) => c.level < 4)) chargeUnderqualified++;
  }
  // Under shortage, missing-charge gaps are legitimate (reported as staffing
  // violations); an UNDER-QUALIFIED charge is never acceptable.
  record(scenario, expectShortage
      ? "no under-qualified charge nurse (gaps allowed under shortage)"
      : "charge nurse present and Level 4+ on staffed charge shifts",
    (expectShortage || chargeGaps === 0) && chargeUnderqualified === 0,
    `${chargeGaps} staffed shifts missing charge, ${chargeUnderqualified} with under-qualified charge`);

  // 5. ICU competency: nobody below Level 2
  const lowLevel = rows.filter((r) => r.level < 2).length;
  record(scenario, "ICU competency ≥2 for all assignments", lowLevel === 0, `${lowLevel} below-level assignments`);

  // 6. PRN only on submitted dates
  const prnRows = db.select().from(s.prnAvailability).all();
  const prnDates = new Map<string, Set<string>>();
  for (const p of prnRows) prnDates.set(p.staffId, new Set(p.availableDates ?? []));
  let prnViolations = 0;
  for (const r of rows) {
    if (r.employmentType !== "per_diem") continue;
    if (!prnDates.get(r.staffId)?.has(r.date)) prnViolations++;
  }
  const prnCount = rows.filter((r) => r.employmentType === "per_diem").length;
  record(scenario, "PRN staff only on submitted dates", prnViolations === 0,
    `${prnCount} PRN assignments, ${prnViolations} off-availability`);

  // 7. Approved leave respected
  const leaves = db.select().from(s.staffLeave).where(eq(s.staffLeave.status, "approved")).all();
  let leaveViolations = 0;
  for (const r of rows) {
    if (leaves.some((l) => l.staffId === r.staffId && l.startDate <= r.date && l.endDate >= r.date)) leaveViolations++;
  }
  record(scenario, "approved leave blocks scheduling", leaveViolations === 0, `${leaveViolations} assignments during approved leave`);

  // 8. weekendExempt semantics: exemption from the weekend QUOTA (weekend-count
  // and holiday-fairness skip these staff) — NOT a ban on weekend scheduling.
  // Informational: report how often the exempt nurse landed on weekends.
  const weCount = rows.filter((r) => r.weekendExempt && [0, 6].includes(utcDayOfWeek(r.date))).length;
  const weTotal = rows.filter((r) => [0, 6].includes(utcDayOfWeek(r.date))).length;
  record(scenario, "weekend-exempt semantics (informational: quota exemption, not a ban)", true,
    `exempt nurse worked ${weCount} of ${weTotal} weekend slots`);
}

// ─── Scenario runner ─────────────────────────────────────────────────────────

interface PeriodSpec { weeks: number }

async function runScenario(label: string, periods: PeriodSpec[], timelineStart: string, seedBase: number, expectShortage = false) {
  console.log(`\n━━━ Scenario ${label} ━━━`);
  wipeScheduleData();

  // Compute period date ranges
  const ranges: { start: string; end: string }[] = [];
  let cursor = timelineStart;
  for (const p of periods) {
    const end = addDays(cursor, p.weeks * 7 - 1);
    ranges.push({ start: cursor, end });
    cursor = addDays(end, 1);
  }
  const timelineEnd = ranges[ranges.length - 1].end;
  const boundaries = ranges.slice(1).map((r) => r.start);

  // First schedule must exist before PRN availability rows (FK anchor)
  const scheduleIds: string[] = [];
  const firstId = createSchedule(`${label} P1`, ranges[0].start, ranges[0].end);
  scheduleIds.push(firstId);
  seedDynamic(firstId, timelineStart, timelineEnd);

  // Generate period by period — each generation sees prior periods in the DB
  let totalUnderstaffed = 0;
  let totalAssignments = 0;
  for (let i = 0; i < ranges.length; i++) {
    const id = i === 0 ? firstId : createSchedule(`${label} P${i + 1}`, ranges[i].start, ranges[i].end);
    if (i > 0) scheduleIds.push(id);
    const result = generateAndWrite(id, seedBase + i);
    totalUnderstaffed += result.understaffed.length;
    totalAssignments += result.assignments.length;

    // Engine's own evaluator. In normal scenarios: zero hard violations.
    // In shortage scenarios: staffing-class violations (min-staff, charge-nurse,
    // patient-ratio) are EXPECTED — the shortage must surface there and in the
    // understaffed report, but safety-class rules (rest, 60h, overlap,
    // competency, PRN, leave) must never be sacrificed to fill a shift.
    const evaluation = evaluateSchedule(id);
    const hard = evaluation.hardViolations;
    const STAFFING_RULES = new Set(["min-staff", "charge-nurse", "patient-ratio"]);
    const safetyViolations = hard.filter((v: { ruleId: string }) => !STAFFING_RULES.has(v.ruleId));
    if (expectShortage) {
      // A short period may legitimately be coverable even with reduced staff
      // (the cap binds over longer horizons) — assert shortage at timeline
      // level after the loop; per-period numbers are informational.
      record(label, `understaffed reporting in P${i + 1} (${periods[i].weeks}w) — informational`, true,
        `${result.understaffed.length} understaffed slots, ${hard.length} staffing violations reported`);
      record(label, `safety-class rules still clean in P${i + 1} despite shortage`, safetyViolations.length === 0,
        safetyViolations.length === 0 ? "rest/60h/overlap/competency/PRN/leave all clean"
          : safetyViolations.slice(0, 3).map((v: { ruleId: string; description: string }) => `${v.ruleId}: ${v.description}`).join(" | "));
    } else {
      record(label, `engine evaluator: 0 hard violations in P${i + 1} (${periods[i].weeks}w)`, hard.length === 0,
        hard.length === 0 ? `${result.assignments.length} assignments, ${result.understaffed.length} understaffed slots`
          : hard.slice(0, 3).map((v: { ruleId: string; description: string }) => `${v.ruleId}: ${v.description}`).join(" | "));
    }
  }
  console.log(`  (totals: ${totalAssignments} assignments, ${totalUnderstaffed} understaffed slot-reports across ${ranges.length} periods)`);
  if (expectShortage) {
    record(label, "shortage surfaces as understaffed reports somewhere in the timeline",
      totalUnderstaffed > 0, `${totalUnderstaffed} understaffed slot-reports total`);
  }

  // Independent whole-timeline verification
  const rows = loadTimeline();
  checkTimeline(label, rows, boundaries, expectShortage);

  return { scheduleIds, ranges, boundaries };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
await loadModules();

console.log("Seeding static data (unit, rules, census bands, shift definitions, 19 staff)...");
// Idempotency: hard-reset everything
db.delete(s.exceptionLog).run();
db.delete(s.scenario).run();
db.delete(s.generationJob).run();
wipeScheduleData();
db.delete(s.staffPreferences).run();
db.delete(s.staff).run();
db.delete(s.censusBand).run();
db.delete(s.rule).run();
db.delete(s.shiftDefinition).run();
db.delete(s.unit).run();
seedStatic();

const START = "2026-07-06"; // a Monday

await runScenario("A: 6×2-week", Array(6).fill({ weeks: 2 }), START, 1001);
await runScenario("B: 3×4-week", Array(3).fill({ weeks: 4 }), START, 2001);
await runScenario("C: 2×6-week", Array(2).fill({ weeks: 6 }), START, 3001);
await runScenario("D: mixed 2w+4w+6w", [{ weeks: 2 }, { weeks: 4 }, { weeks: 6 }], START, 4001);

// E: same mixed layout but with 5 nurses deactivated — staffing pressure.
// Hard rules must STILL hold; the shortage must surface as understaffed
// reports, never as rule violations.
for (const id of ["nurse-07", "nurse-08", "nurse-09", "nurse-16", "nurse-17"]) {
  db.update(s.staff).set({ isActive: false }).where(eq(s.staff.id, id)).run();
}
await runScenario("E: mixed, 5 nurses short", [{ weeks: 2 }, { weeks: 4 }, { weeks: 6 }], START, 5001);
for (const id of ["nurse-07", "nurse-08", "nurse-09", "nurse-16", "nurse-17"]) {
  db.update(s.staff).set({ isActive: true }).where(eq(s.staff.id, id)).run();
}

// F: severe shortage — 8 nurses deactivated (11 left, incl. 2 limited PRNs).
// Demand (~588 staffed hours/week) cannot be met under the 60h cap, so the
// engine MUST report understaffed slots while keeping safety rules intact.
const F_OUT = ["nurse-07", "nurse-08", "nurse-09", "nurse-10", "nurse-11", "nurse-12", "nurse-16", "nurse-17"];
for (const id of F_OUT) db.update(s.staff).set({ isActive: false }).where(eq(s.staff.id, id)).run();
await runScenario("F: severe shortage (8 out)", [{ weeks: 2 }, { weeks: 4 }], START, 6001, true);
for (const id of F_OUT) db.update(s.staff).set({ isActive: true }).where(eq(s.staff.id, id)).run();

// ─── Determinism check (same seed → identical schedule) ──────────────────────

console.log("\n━━━ Determinism ━━━");
{
  // shiftIds differ between runs (new UUIDs) — compare by (date,startTime,staff).
  // The signature must be captured BEFORE the next wipe deletes the rows.
  const bySig = (id: string) =>
    db.select({ date: s.shift.date, st: s.shiftDefinition.startTime, staffId: s.assignment.staffId })
      .from(s.assignment)
      .innerJoin(s.shift, eq(s.assignment.shiftId, s.shift.id))
      .innerJoin(s.shiftDefinition, eq(s.shift.shiftDefinitionId, s.shiftDefinition.id))
      .where(eq(s.assignment.scheduleId, id))
      .all()
      .map((r: { date: string; st: string; staffId: string }) => `${r.date}T${r.st}:${r.staffId}`)
      .sort()
      .join("|");

  wipeScheduleData();
  const id1 = createSchedule("Det run 1", START, addDays(START, 13));
  seedDynamic(id1, START, addDays(START, 13));
  const r1 = generateAndWrite(id1, 9999);
  const sig1 = bySig(id1);

  wipeScheduleData();
  const id2 = createSchedule("Det run 2", START, addDays(START, 13));
  seedDynamic(id2, START, addDays(START, 13));
  const r2 = generateAndWrite(id2, 9999);
  const sig2 = bySig(id2);

  const same = sig1 === sig2 && sig1.length > 0;
  record("Determinism", "same seed + same inputs → identical schedule (fresh DB rows)", same,
    same ? `${r1.assignments.length} assignments matched exactly` : `schedules differ (${r1.assignments.length} vs ${r2.assignments.length})`);
}

// ─── Negative control: injected boundary violation must be caught ────────────

console.log("\n━━━ Negative control ━━━");
{
  // Rebuild the mixed scenario and inject a 6th consecutive working day for a
  // nurse right after the P1→P2 boundary, then confirm BOTH the engine
  // evaluator (via priorAssignments) and the independent checker flag it.
  wipeScheduleData();
  const p1 = createSchedule("NC P1", START, addDays(START, 13));
  seedDynamic(p1, START, addDays(START, 27));
  generateAndWrite(p1, 5001);

  // Find a nurse working the last 2+ days of P1 so the run crosses the boundary
  const p1End = addDays(START, 13);
  const tail = db
    .select({ staffId: s.assignment.staffId, date: s.shift.date })
    .from(s.assignment)
    .innerJoin(s.shift, eq(s.assignment.shiftId, s.shift.id))
    .where(eq(s.assignment.scheduleId, p1))
    .all();
  const byStaffDates = new Map<string, Set<string>>();
  for (const t of tail) {
    const set = byStaffDates.get(t.staffId) ?? new Set();
    set.add(t.date);
    byStaffDates.set(t.staffId, set);
  }
  // Pick the nurse with the longest run ending exactly at p1End
  let victim: string | null = null;
  let victimRun = 0;
  for (const [staffId, dates] of byStaffDates) {
    let run = 0;
    for (let d = p1End; dates.has(d); d = addDays(d, -1)) run++;
    if (run > victimRun) { victimRun = run; victim = staffId; }
  }

  if (!victim || victimRun === 0) {
    record("NegControl", "setup: nurse with run ending at P1 boundary", false, "no nurse works the final P1 day — cannot run control");
  } else {
    // Create P2 and manually inject assignments continuing the run to 6 days total
    const p2 = createSchedule("NC P2", addDays(p1End, 1), addDays(START, 27));
    const needed = 6 - victimRun;
    const dayDef = db.select().from(s.shiftDefinition).where(eq(s.shiftDefinition.shiftType, "day")).get()!;
    for (let i = 1; i <= needed; i++) {
      const date = addDays(p1End, i);
      const shiftRow = db.select().from(s.shift)
        .where(eq(s.shift.scheduleId, p2))
        .all()
        .find((sh) => sh.date === date && sh.shiftDefinitionId === dayDef.id)!;
      db.insert(s.assignment).values({
        shiftId: shiftRow.id, staffId: victim, scheduleId: p2,
        isChargeNurse: false, isOvertime: false, assignmentSource: "manual", status: "assigned",
      }).run();
    }

    const evaluation = evaluateSchedule(p2);
    const caughtByEngine = evaluation.hardViolations.some(
      (v: { ruleId: string; staffId: string }) => v.ruleId === "max-consecutive" && v.staffId === victim
    );
    record("NegControl", "engine evaluator catches injected 6-day cross-boundary run", caughtByEngine,
      `victim ${victim}, ${victimRun}d in P1 + ${needed}d injected in P2 (engine ${caughtByEngine ? "flagged" : "MISSED"} it)`);

    // Independent checker must also see it
    const rows = loadTimeline();
    const victims = rows.filter((r) => r.staffId === victim);
    const dates = [...new Set(victims.map((r) => r.date))].sort();
    let worst = 1;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      run = dates[i] === addDays(dates[i - 1], 1) ? run + 1 : 1;
      worst = Math.max(worst, run);
    }
    record("NegControl", "independent checker sees the injected run", worst >= 6, `independent max run = ${worst}d`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.pass);
console.log("\n════════ SUMMARY ════════");
console.log(`checks: ${results.length}, passed: ${results.length - failed.length}, failed: ${failed.length}`);
for (const f of failed) console.log(`  FAIL [${f.scenario}] ${f.check} — ${f.detail}`);
fs.writeFileSync(path.join(SCRATCH, "verify-results.json"), JSON.stringify(results, null, 2));
console.log(`results written to ${path.join(SCRATCH, "verify-results.json")}`);
process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
