/**
 * The annual holiday ledger (`staff_holiday_assignment`, read by the
 * "Holiday Fairness (Annual)" rule) must always match the chosen schedule.
 *
 * Regression (2026-10-15 review):
 *   - regenerating a schedule deleted its assignments but kept the old ledger
 *     rows, and the unique index (staff, holiday, year) then silently kept the
 *     stale owner;
 *   - applying the Fairness/Cost draft replaced assignments but never touched
 *     the ledger.
 * Either way a nurse could be credited with a holiday the posted schedule
 * gave to someone else.
 *
 * Expected rows are computed here with raw SQL straight from the assignment
 * table — NOT via the helpers under test — so the assertion is independent.
 *
 * Scratch-DB pattern: src/__tests__/schedules/dashboard-schedule-coverage.test.ts.
 * Never touches cah-scheduler.db.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type { AssignmentDraft } from "@/lib/engine/scheduler/types";

vi.setConfig({ testTimeout: 60_000 });

// The optimizer is stubbed so each test decides exactly who works the holiday
// (deterministic, and seconds instead of minutes on the full seed). Everything
// this fix touches stays real: runner's clear -> write -> scenario rows, and
// the scenario apply route.
// Registered with vi.doMock AFTER each vi.resetModules() (see seededDb): a
// hoisted vi.mock factory result survives resetModules and would keep the
// previous test's (closed) @/db connection.
const stub = { drafts: [] as AssignmentDraft[] };
function installEngineStubs() {
  vi.doMock("@/lib/engine/scheduler/index", async (importOriginal) => {
    const actual =
      await importOriginal<typeof import("@/lib/engine/scheduler/index")>();
    return {
      ...actual,
      generateSchedule: () => ({
        assignments: stub.drafts.map((d) => ({ ...d })),
        understaffed: [],
      }),
    };
  });
  vi.doMock("@/lib/engine/scheduler/local-search", async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/engine/scheduler/local-search")
      >();
    return {
      ...actual,
      overtimeReductionSweep: (a: AssignmentDraft[]) => a,
      weekendRedistributionSweep: (a: AssignmentDraft[]) => a,
      recomputeOvertimeFlags: () => {},
    };
  });
}

const ORIGINAL_ENV = { ...process.env };
const PRESIDENTS_DAY = "2026-02-16"; // inside the seeded Feb 2 – Mar 15 schedule

let baseDir: string;
let templateDbPath: string;
let testSeq = 0;
let openHandles: import("better-sqlite3").Database[] = [];

beforeAll(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "holiday-ledger-test-"));
  templateDbPath = path.join(baseDir, "template.db");
  const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DATABASE_PATH: templateDbPath },
  });
  if (push.status !== 0) {
    throw new Error(
      `drizzle-kit push failed for template DB: ${push.stdout}\n${push.stderr}`,
    );
  }
}, 120_000);

beforeEach(() => {
  const scratch = path.join(baseDir, `scratch-${testSeq++}.db`);
  fs.copyFileSync(templateDbPath, scratch);
  process.env.DATABASE_PATH = scratch;
});

afterEach(() => {
  for (const handle of openHandles) {
    try {
      handle.close();
    } catch {
      // already closed
    }
  }
  openHandles = [];
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

type Sqlite = import("better-sqlite3").Database;

/** Fresh @/db on the scratch file, seeded with the canonical test dataset. */
async function seededDb() {
  vi.resetModules();
  installEngineStubs();
  const dbMod = await import("@/db");
  openHandles.push(dbMod.sqlite);
  const { seedDatabase } = await import("@/db/seed-core");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await seedDatabase(dbMod.sqlite, dbMod.db);
  log.mockRestore();
  const scheduleId = (
    dbMod.sqlite
      .prepare(
        "SELECT id FROM schedule WHERE start_date <= ? AND end_date >= ?",
      )
      .get(PRESIDENTS_DAY, PRESIDENTS_DAY) as { id: string }
  ).id;
  return { ...dbMod, scheduleId };
}

type Key = { staffId: string; holidayName: string; year: number };
const toKeys = (rows: Key[]) =>
  rows.map((r) => `${r.staffId}|${r.holidayName}|${r.year}`).sort();

/** (staff|holiday|year) triples the live assignments of `scheduleId` produce. */
function expectedKeys(sqlite: Sqlite, scheduleId: string): string[] {
  return toKeys(
    sqlite
      .prepare(
        `SELECT DISTINCT a.staff_id AS staffId,
                CASE WHEN ph.name IN ('Christmas Eve','Christmas Day')
                     THEN 'Christmas' ELSE ph.name END AS holidayName,
                CAST(substr(s.date, 1, 4) AS INTEGER) AS year
           FROM assignment a
           JOIN shift s ON s.id = a.shift_id
           JOIN public_holiday ph ON ph.date = s.date AND ph.is_active = 1
          WHERE s.schedule_id = ?
            AND a.status NOT IN ('called_out','cancelled','swapped')`,
      )
      .all(scheduleId) as Key[],
  );
}

/** Ledger rows tied to `scheduleId`'s shifts. */
function ledgerKeys(sqlite: Sqlite, scheduleId: string): string[] {
  return toKeys(
    sqlite
      .prepare(
        `SELECT staff_id AS staffId, holiday_name AS holidayName, year
           FROM staff_holiday_assignment
          WHERE shift_id IN (SELECT id FROM shift WHERE schedule_id = ?)`,
      )
      .all(scheduleId) as Key[],
  );
}

function allLedgerKeys(sqlite: Sqlite): string[] {
  return toKeys(
    sqlite
      .prepare(
        "SELECT staff_id AS staffId, holiday_name AS holidayName, year FROM staff_holiday_assignment",
      )
      .all() as Key[],
  );
}

/** Runs the real runGenerationJob with the stub returning `drafts`. */
async function generate(
  dbMod: Awaited<ReturnType<typeof seededDb>>,
  drafts: AssignmentDraft[],
): Promise<void> {
  stub.drafts = drafts;
  const { runGenerationJob } = await import("@/lib/engine/scheduler/runner");
  const jobId = crypto.randomUUID();
  dbMod.sqlite
    .prepare(
      "INSERT INTO generation_job (id, schedule_id, status) VALUES (?, ?, 'pending')",
    )
    .run(jobId, dbMod.scheduleId);
  await runGenerationJob(jobId, dbMod.scheduleId);
  const job = dbMod.sqlite
    .prepare("SELECT status, error FROM generation_job WHERE id = ?")
    .get(jobId) as { status: string; error: string | null };
  // runGenerationJob swallows errors into the job row — surface them.
  expect(job.error).toBeNull();
  expect(job.status).toBe("completed");
}

function draft(
  sqlite: Sqlite,
  shiftId: string,
  staffId: string,
): AssignmentDraft {
  const { date } = sqlite
    .prepare("SELECT date FROM shift WHERE id = ?")
    .get(shiftId) as { date: string };
  return {
    shiftId,
    staffId,
    date,
    shiftType: "day",
    startTime: "07:00",
    endTime: "19:00",
    durationHours: 12,
    unit: "ICU",
    isChargeNurse: false,
    isOvertime: false,
    isFloat: false,
    floatFromUnit: null,
  };
}

/** Three distinct active ICU nurses, a Presidents' Day shift, another shift. */
function fixture(sqlite: Sqlite, scheduleId: string) {
  const nurses = (
    sqlite
      .prepare(
        "SELECT id FROM staff WHERE is_active = 1 AND home_unit = 'ICU' ORDER BY id LIMIT 3",
      )
      .all() as { id: string }[]
  ).map((r) => r.id);
  expect(nurses).toHaveLength(3);
  const holidayShift = (
    sqlite
      .prepare("SELECT id FROM shift WHERE schedule_id = ? AND date = ?")
      .get(scheduleId, PRESIDENTS_DAY) as { id: string } | undefined
  )?.id;
  expect(holidayShift).toBeTruthy();
  const otherShift = (
    sqlite
      .prepare(
        "SELECT id FROM shift WHERE schedule_id = ? AND date <> ? LIMIT 1",
      )
      .get(scheduleId, PRESIDENTS_DAY) as { id: string }
  ).id;
  return { nurses, holidayShift: holidayShift!, otherShift };
}

const PD = (staffId: string) => `${staffId}|Presidents' Day|2026`;

describe("holiday ledger follows the chosen schedule", () => {
  it("regeneration drops the previous run's holiday credit", async () => {
    const dbMod = await seededDb();
    const { sqlite, scheduleId } = dbMod;
    const { nurses, holidayShift, otherShift } = fixture(sqlite, scheduleId);
    const [alice, bob, cara] = nurses;

    // Run 1: Alice works Presidents' Day.
    await generate(dbMod, [
      draft(sqlite, holidayShift, alice),
      draft(sqlite, otherShift, cara),
    ]);
    expect(expectedKeys(sqlite, scheduleId)).toEqual([PD(alice)]);
    expect(allLedgerKeys(sqlite)).toEqual([PD(alice)]);

    // Run 2: regeneration gives the holiday to Bob instead. Pre-fix, Alice
    // kept the credit (her row was never deleted) and Bob got one too.
    await generate(dbMod, [
      draft(sqlite, holidayShift, bob),
      draft(sqlite, otherShift, cara),
    ]);
    expect(expectedKeys(sqlite, scheduleId)).toEqual([PD(bob)]);
    expect(ledgerKeys(sqlite, scheduleId)).toEqual([PD(bob)]);
    expect(allLedgerKeys(sqlite)).toEqual([PD(bob)]);

    // The surviving row points at the live assignment, not a deleted one.
    const linked = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM staff_holiday_assignment h
           JOIN assignment a ON a.id = h.assignment_id AND a.staff_id = h.staff_id`,
      )
      .get() as { n: number };
    expect(linked.n).toBe(1);
  });

  it("applying a different draft rewrites the holiday credit", async () => {
    const dbMod = await seededDb();
    const { sqlite, scheduleId } = dbMod;
    const { nurses, holidayShift, otherShift } = fixture(sqlite, scheduleId);
    const [alice, bob, cara] = nurses;

    // Balanced (written to the live table) gives the holiday to Alice.
    await generate(dbMod, [
      draft(sqlite, holidayShift, alice),
      draft(sqlite, otherShift, cara),
    ]);
    expect(allLedgerKeys(sqlite)).toEqual([PD(alice)]);

    // The Fairness draft gives it to Bob.
    const scenarioId = (name: string) =>
      (
        sqlite
          .prepare("SELECT id FROM scenario WHERE schedule_id = ? AND name = ?")
          .get(scheduleId, name) as { id: string }
      ).id;
    const fairId = scenarioId("Fairness Optimized");
    sqlite
      .prepare("UPDATE scenario SET assignment_snapshot = ? WHERE id = ?")
      .run(
        JSON.stringify([
          {
            shiftId: holidayShift,
            staffId: bob,
            isChargeNurse: false,
            isOvertime: false,
          },
          {
            shiftId: otherShift,
            staffId: cara,
            isChargeNurse: false,
            isOvertime: false,
          },
        ]),
        fairId,
      );

    const route = await import("@/app/api/scenarios/[id]/route");
    const apply = async (id: string) => {
      const res = await route.PUT(
        new Request(`http://test/api/scenarios/${id}`, {
          method: "PUT",
          body: JSON.stringify({ action: "apply" }),
        }),
        { params: Promise.resolve({ id }) },
      );
      expect(res.status).toBe(200);
    };

    // Choose Fairness: Bob gets the credit, Alice loses it.
    await apply(fairId);
    expect(expectedKeys(sqlite, scheduleId)).toEqual([PD(bob)]);
    expect(allLedgerKeys(sqlite)).toEqual([PD(bob)]);

    // Switch back to Balanced: the credit returns to Alice.
    await apply(scenarioId("Balanced"));
    expect(expectedKeys(sqlite, scheduleId)).toEqual([PD(alice)]);
    expect(allLedgerKeys(sqlite)).toEqual([PD(alice)]);
  });

  it("hands Christmas credit to the other schedule when one period drops it", async () => {
    const dbMod = await seededDb();
    const { sqlite, db } = dbMod;
    const { syncScheduleHolidayRows } =
      await import("@/lib/holidays/holiday-tracking");

    // Two periods that split Christmas: A ends on Eve, B starts on Day.
    const defId = (
      sqlite.prepare("SELECT id FROM shift_definition LIMIT 1").get() as {
        id: string;
      }
    ).id;
    const nurse = (
      sqlite
        .prepare("SELECT id FROM staff WHERE is_active = 1 LIMIT 1")
        .get() as { id: string }
    ).id;
    const mk = (id: string, start: string, end: string, day: string) => {
      sqlite
        .prepare(
          "INSERT INTO schedule (id, name, start_date, end_date, unit) VALUES (?, ?, ?, ?, 'ICU')",
        )
        .run(id, id, start, end);
      const shiftId = crypto.randomUUID();
      sqlite
        .prepare(
          "INSERT INTO shift (id, schedule_id, shift_definition_id, date) VALUES (?, ?, ?, ?)",
        )
        .run(shiftId, id, defId, day);
      const asgId = crypto.randomUUID();
      sqlite
        .prepare(
          "INSERT INTO assignment (id, shift_id, staff_id, schedule_id) VALUES (?, ?, ?, ?)",
        )
        .run(asgId, shiftId, nurse, id);
      return { shiftId, asgId };
    };
    const a = mk("schA", "2026-12-01", "2026-12-24", "2026-12-24");
    const b = mk("schB", "2026-12-25", "2027-01-20", "2026-12-25");

    db.transaction(() => {
      syncScheduleHolidayRows("schA");
      syncScheduleHolidayRows("schB");
    });
    const christmasRows = () =>
      sqlite
        .prepare(
          "SELECT shift_id AS shiftId FROM staff_holiday_assignment WHERE staff_id = ? AND holiday_name = 'Christmas' AND year = 2026",
        )
        .all(nurse) as { shiftId: string }[];
    // One Christmas, not two.
    expect(christmasRows()).toEqual([{ shiftId: a.shiftId }]);

    // Period A is regenerated without this nurse on Eve.
    sqlite.prepare("DELETE FROM assignment WHERE id = ?").run(a.asgId);
    db.transaction(() => syncScheduleHolidayRows("schA"));
    expect(christmasRows()).toEqual([{ shiftId: b.shiftId }]);

    // Idempotent.
    db.transaction(() => syncScheduleHolidayRows("schA"));
    expect(christmasRows()).toEqual([{ shiftId: b.shiftId }]);
  });

  it("repair plan fixes pre-existing drift and is idempotent", async () => {
    const dbMod = await seededDb();
    const { sqlite, scheduleId, db } = dbMod;
    const { nurses, holidayShift } = fixture(sqlite, scheduleId);
    const [alice, bob, cara] = nurses;
    await generate(dbMod, [
      draft(sqlite, holidayShift, alice),
      draft(sqlite, holidayShift, bob),
    ]);
    const truth = allLedgerKeys(sqlite);
    expect(truth).toEqual([PD(alice), PD(bob)].sort());

    // Simulate pre-fix damage: Alice's row lost, a stale row for Cara (not on
    // the holiday), and Bob's row linked to an assignment that no longer exists.
    sqlite
      .prepare("DELETE FROM staff_holiday_assignment WHERE staff_id = ?")
      .run(alice);
    sqlite
      .prepare(
        "INSERT INTO staff_holiday_assignment (id, staff_id, holiday_name, year, shift_id) VALUES (?, ?, 'Presidents'' Day', 2026, ?)",
      )
      .run(crypto.randomUUID(), cara, holidayShift);
    sqlite.pragma("foreign_keys = OFF");
    sqlite
      .prepare(
        "UPDATE staff_holiday_assignment SET assignment_id = 'gone' WHERE staff_id = ?",
      )
      .run(bob);
    sqlite.pragma("foreign_keys = ON");

    const { planLedgerRepair, applyLedgerRepair } =
      await import("@/lib/holidays/holiday-tracking");
    const plan = planLedgerRepair();
    expect(plan.remove.map((r) => r.staffId)).toEqual([cara]);
    expect(plan.add.map((w) => w.staffId)).toEqual([alice]);
    expect(plan.repoint.map((p) => p.row.staffId)).toEqual([bob]);

    db.transaction(() => applyLedgerRepair(plan));
    expect(allLedgerKeys(sqlite)).toEqual(truth);
    const dangling = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM staff_holiday_assignment WHERE assignment_id NOT IN (SELECT id FROM assignment)",
      )
      .get() as { n: number };
    expect(dangling.n).toBe(0);

    const again = planLedgerRepair();
    expect(again.remove.length + again.add.length + again.repoint.length).toBe(
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// Daily operations (2026-10-16): swaps, callouts, coverage fills, leave
// approval and manual edits change WHO works a holiday shift after the
// schedule is chosen. Before this fix none of them touched the ledger, so a
// nurse swapped off a holiday kept the credit and her replacement got none.
// Each test drives the real route and asserts the ledger equals the truth
// computed independently from the assignment table.
// ---------------------------------------------------------------------------

/** Three full-time Level 4+ ICU RNs, none on leave over the holiday. */
function fullTimeFixture(sqlite: Sqlite, scheduleId: string) {
  const nurses = (
    sqlite
      .prepare(
        // Exclude anyone the seed put on leave over the holiday — the seed's
        // ids are random, so without this the fill route's hard-rule recheck
        // rejects the replacement on some runs (flaky 422).
        `SELECT id FROM staff
          WHERE is_active = 1 AND home_unit = 'ICU' AND employment_type = 'full_time'
            -- Same role, Level 4+: any two can legally swap (the swap route
            -- enforces role compatibility and Level 2 supervision).
            AND role = 'RN' AND icu_competency_level >= 4
            AND id NOT IN (SELECT staff_id FROM staff_leave
                            WHERE start_date <= ? AND end_date >= ?)
          ORDER BY id LIMIT 3`,
      )
      .all(PRESIDENTS_DAY, PRESIDENTS_DAY) as { id: string }[]
  ).map((r) => r.id);
  expect(nurses).toHaveLength(3);
  const base = fixture(sqlite, scheduleId);
  return { ...base, nurses };
}

function assignmentId(sqlite: Sqlite, shiftId: string, staffId: string) {
  return (
    sqlite
      .prepare("SELECT id FROM assignment WHERE shift_id = ? AND staff_id = ?")
      .get(shiftId, staffId) as { id: string }
  ).id;
}

function req(url: string, method: string, body?: unknown) {
  return new Request(`http://test${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Alice holds Presidents' Day; Cara holds another shift. Ledger = Alice. */
async function holidayHeldByAlice() {
  const dbMod = await seededDb();
  const { sqlite, scheduleId } = dbMod;
  const f = fullTimeFixture(sqlite, scheduleId);
  const [alice, , cara] = f.nurses;
  await generate(dbMod, [
    draft(sqlite, f.holidayShift, alice),
    draft(sqlite, f.otherShift, cara),
  ]);
  expect(allLedgerKeys(sqlite)).toEqual([PD(alice)]);
  return { dbMod, ...f };
}

function expectLedgerMatchesTruth(sqlite: Sqlite, scheduleId: string) {
  expect(ledgerKeys(sqlite, scheduleId)).toEqual(
    expectedKeys(sqlite, scheduleId),
  );
  expect(allLedgerKeys(sqlite)).toEqual(expectedKeys(sqlite, scheduleId));
}

describe("holiday ledger follows daily operations", () => {
  it("callout logged then filled moves the credit to the replacement", async () => {
    const { dbMod, nurses, holidayShift } = await holidayHeldByAlice();
    const { sqlite, scheduleId } = dbMod;
    const [alice, bob] = nurses;

    const create = await import("@/app/api/callouts/route");
    const res1 = await create.POST(
      req("/api/callouts", "POST", {
        assignmentId: assignmentId(sqlite, holidayShift, alice),
        staffId: alice,
        shiftId: holidayShift,
        reason: "sick",
      }),
    );
    expect(res1.status).toBeLessThan(300);
    const calloutId = ((await res1.json()) as { callout: { id: string } })
      .callout.id;
    // Called out: Alice no longer works the holiday.
    expect(allLedgerKeys(sqlite)).toEqual([]);
    expectLedgerMatchesTruth(sqlite, scheduleId);

    const fill = await import("@/app/api/callouts/[id]/route");
    const res2 = await fill.PUT(
      req(`/api/callouts/${calloutId}`, "PUT", {
        replacementStaffId: bob,
        replacementSource: "overtime",
      }),
      { params: Promise.resolve({ id: calloutId }) },
    );
    expect(res2.status).toBe(200);
    expect(allLedgerKeys(sqlite)).toEqual([PD(bob)]);
    expectLedgerMatchesTruth(sqlite, scheduleId);
  });

  it("coverage request fill moves the credit to the nurse who picks it up", async () => {
    const { dbMod, nurses, holidayShift } = await holidayHeldByAlice();
    const { sqlite, scheduleId } = dbMod;
    const [alice, bob] = nurses;
    const openShiftId = crypto.randomUUID();
    sqlite
      .prepare(
        `INSERT INTO open_shift (id, shift_id, original_staff_id, original_assignment_id, reason, status, priority)
         VALUES (?, ?, ?, ?, 'schedule_change', 'pending_approval', 'normal')`,
      )
      .run(
        openShiftId,
        holidayShift,
        alice,
        assignmentId(sqlite, holidayShift, alice),
      );

    const route = await import("@/app/api/open-shifts/[id]/route");
    const res = await route.PUT(
      req(`/api/open-shifts/${openShiftId}`, "PUT", {
        action: "fill",
        filledByStaffId: bob,
      }),
      { params: Promise.resolve({ id: openShiftId }) },
    );
    if (res.status !== 200) {
      throw new Error(`fill rejected: ${JSON.stringify(await res.json())}`);
    }
    expect(allLedgerKeys(sqlite)).toEqual([PD(bob)]);
    expectLedgerMatchesTruth(sqlite, scheduleId);
  });

  it("approved directed swap moves the credit with the shift", async () => {
    const { dbMod, nurses, holidayShift, otherShift } =
      await holidayHeldByAlice();
    const { sqlite, scheduleId } = dbMod;
    const [alice, , cara] = nurses;
    const swapId = crypto.randomUUID();
    sqlite
      .prepare(
        `INSERT INTO shift_swap_request (id, requesting_assignment_id, requesting_staff_id, target_assignment_id, target_staff_id, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
      )
      .run(
        swapId,
        assignmentId(sqlite, holidayShift, alice),
        alice,
        assignmentId(sqlite, otherShift, cara),
        cara,
      );

    const route = await import("@/app/api/swap-requests/[id]/route");
    const res = await route.PUT(
      req(`/api/swap-requests/${swapId}`, "PUT", {
        status: "approved",
        reviewedBy: "nurse_manager",
      }),
      { params: Promise.resolve({ id: swapId }) },
    );
    if (res.status !== 200) {
      throw new Error(`swap rejected: ${JSON.stringify(await res.json())}`);
    }
    // Cara now works Presidents' Day; Alice does not.
    expect(allLedgerKeys(sqlite)).toEqual([PD(cara)]);
    expectLedgerMatchesTruth(sqlite, scheduleId);
  });

  it("approved open swap removes the credit from the nurse giving it up", async () => {
    const { dbMod, nurses, holidayShift } = await holidayHeldByAlice();
    const { sqlite, scheduleId } = dbMod;
    const [alice] = nurses;
    const swapId = crypto.randomUUID();
    sqlite
      .prepare(
        `INSERT INTO shift_swap_request (id, requesting_assignment_id, requesting_staff_id, status)
         VALUES (?, ?, ?, 'pending')`,
      )
      .run(swapId, assignmentId(sqlite, holidayShift, alice), alice);

    const route = await import("@/app/api/swap-requests/[id]/route");
    const res = await route.PUT(
      req(`/api/swap-requests/${swapId}`, "PUT", {
        status: "approved",
        reviewedBy: "nurse_manager",
      }),
      { params: Promise.resolve({ id: swapId }) },
    );
    expect(res.status).toBe(200);
    expect(allLedgerKeys(sqlite)).toEqual([]);
    expectLedgerMatchesTruth(sqlite, scheduleId);
  });

  it("approved leave over the holiday removes the credit", async () => {
    const { dbMod, nurses } = await holidayHeldByAlice();
    const { sqlite, scheduleId } = dbMod;
    const [alice] = nurses;
    const leaveId = crypto.randomUUID();
    sqlite
      .prepare(
        `INSERT INTO staff_leave (id, staff_id, leave_type, start_date, end_date, status)
         VALUES (?, ?, 'vacation', ?, ?, 'pending')`,
      )
      .run(leaveId, alice, PRESIDENTS_DAY, PRESIDENTS_DAY);

    const route = await import("@/app/api/staff-leave/[id]/route");
    const res = await route.PUT(
      req(`/api/staff-leave/${leaveId}`, "PUT", {
        status: "approved",
        approvedBy: "nurse_manager",
      }),
      { params: Promise.resolve({ id: leaveId }) },
    );
    expect(res.status).toBe(200);
    expect(allLedgerKeys(sqlite)).toEqual([]);
    expectLedgerMatchesTruth(sqlite, scheduleId);
  });

  it("manual add and remove keep Christmas as one credit across Eve and Day", async () => {
    const dbMod = await seededDb();
    const { sqlite } = dbMod;
    const defId = (
      sqlite.prepare("SELECT id FROM shift_definition LIMIT 1").get() as {
        id: string;
      }
    ).id;
    const nurse = (
      sqlite
        .prepare(
          "SELECT id FROM staff WHERE is_active = 1 AND employment_type = 'full_time' LIMIT 1",
        )
        .get() as { id: string }
    ).id;
    sqlite
      .prepare(
        "INSERT INTO schedule (id, name, start_date, end_date, unit, status) VALUES ('xmas', 'xmas', '2026-12-20', '2026-12-31', 'ICU', 'draft')",
      )
      .run();
    const eve = crypto.randomUUID();
    const day = crypto.randomUUID();
    const ins = sqlite.prepare(
      "INSERT INTO shift (id, schedule_id, shift_definition_id, date) VALUES (?, 'xmas', ?, ?)",
    );
    ins.run(eve, defId, "2026-12-24");
    ins.run(day, defId, "2026-12-25");
    // Christmas Eve and Day must be active public holidays for the ledger.
    const hol = sqlite.prepare(
      "INSERT OR IGNORE INTO public_holiday (id, name, date, is_active) VALUES (?, ?, ?, 1)",
    );
    hol.run(crypto.randomUUID(), "Christmas Eve", "2026-12-24");
    hol.run(crypto.randomUUID(), "Christmas Day", "2026-12-25");

    const route = await import("@/app/api/schedules/[id]/assignments/route");
    const add = async (shiftId: string) => {
      const res = await route.POST(
        req("/api/schedules/xmas/assignments", "POST", {
          shiftId,
          staffId: nurse,
        }),
        { params: Promise.resolve({ id: "xmas" }) },
      );
      expect(res.status).toBe(201);
    };
    const christmas = () =>
      (
        sqlite
          .prepare(
            "SELECT COUNT(*) AS n FROM staff_holiday_assignment WHERE staff_id = ? AND holiday_name = 'Christmas' AND year = 2026",
          )
          .get(nurse) as { n: number }
      ).n;

    await add(eve);
    await add(day);
    expect(christmas()).toBe(1);

    // Remove Eve: she still works Christmas Day, so the credit must stay.
    // (Pre-fix the DELETE path removed the Christmas row outright.)
    const res = await route.DELETE(
      req(
        `/api/schedules/xmas/assignments?assignmentId=${assignmentId(sqlite, eve, nurse)}`,
        "DELETE",
      ),
    );
    expect(res.status).toBe(200);
    expect(christmas()).toBe(1);
    expectLedgerMatchesTruth(sqlite, "xmas");
  });
});
