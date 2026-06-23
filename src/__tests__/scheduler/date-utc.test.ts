/**
 * Timezone-safety tests for date arithmetic.
 *
 * All schedule dates are YYYY-MM-DD strings. JavaScript parses bare date
 * strings as UTC midnight, but local-time methods (getDay/setDate/getFullYear)
 * then operate in the server's timezone. On any server west of UTC (e.g. a
 * Texas hospital on America/Chicago), UTC midnight is the EVENING OF THE
 * PREVIOUS LOCAL DAY — so week starts land on the wrong Monday, Saturday and
 * Sunday of one weekend get different weekend IDs, and the day-iteration loop
 * duplicates the DST spring-forward day.
 *
 * These tests are meaningful in any host timezone, but the pre-fix failure
 * mode only manifests west of UTC. Node on Windows ignores the TZ environment
 * variable, so on a Windows dev box these act as regression locks for the
 * UTC-only implementation rather than reproductions; run the suite on a
 * Linux host with TZ=America/Chicago to observe the original failures.
 */

import { describe, it, expect } from "vitest";
import { getWeekStart, getWeekendId, SchedulerState } from "@/lib/engine/scheduler/state";
import { buildShiftInserts } from "@/lib/schedules/build-shifts";
import type { AssignmentDraft } from "@/lib/engine/scheduler/types";

function draft(date: string, overrides: Partial<AssignmentDraft> = {}): AssignmentDraft {
  return {
    shiftId: `shift-${date}`,
    staffId: "staff-001",
    date,
    startTime: "07:00",
    durationHours: 12,
    shiftType: "day",
    unit: "ICU",
    isChargeNurse: false,
    ...overrides,
  } as AssignmentDraft;
}

describe("getWeekStart — UTC safety", () => {
  it("maps a Sunday to the Monday of the same week", () => {
    // 2026-03-08 is a Sunday; its Mon-Sun week starts 2026-03-02
    expect(getWeekStart("2026-03-08")).toBe("2026-03-02");
  });

  it("maps a Monday to itself", () => {
    expect(getWeekStart("2026-03-02")).toBe("2026-03-02");
  });

  it("maps a Saturday to the preceding Monday", () => {
    expect(getWeekStart("2026-03-07")).toBe("2026-03-02");
  });

  it("is correct across the DST spring-forward boundary", () => {
    // US DST starts 2026-03-08; the following Monday is 2026-03-09
    expect(getWeekStart("2026-03-09")).toBe("2026-03-09");
    expect(getWeekStart("2026-03-14")).toBe("2026-03-09");
  });
});

describe("getWeekendId — Sat+Sun pairing", () => {
  it("gives Saturday and Sunday of the same weekend the same ID", () => {
    expect(getWeekendId("2026-03-08")).toBe(getWeekendId("2026-03-07"));
  });

  it("anchors the weekend ID to the Saturday date", () => {
    expect(getWeekendId("2026-03-07")).toBe("2026-03-07");
    expect(getWeekendId("2026-03-08")).toBe("2026-03-07");
  });
});

describe("SchedulerState.getWeekendCount — UTC safety", () => {
  it("counts Sat+Sun of one weekend as a single rotation", () => {
    const state = new SchedulerState();
    state.addAssignment(draft("2026-03-07")); // Saturday
    state.addAssignment(draft("2026-03-08")); // Sunday
    expect(state.getWeekendCount("staff-001")).toBe(1);
  });

  it("counts two separate weekends as two rotations", () => {
    const state = new SchedulerState();
    state.addAssignment(draft("2026-03-07")); // Sat week 1
    state.addAssignment(draft("2026-03-14")); // Sat week 2
    expect(state.getWeekendCount("staff-001")).toBe(2);
  });
});

describe("buildShiftInserts — DST spring-forward", () => {
  const DEFS = [{ id: "def-1", requiredStaffCount: 3, requiresChargeNurse: true }];

  it("emits each calendar day exactly once across the 2026 DST transition", () => {
    const inserts = buildShiftInserts("sched-1", "2026-03-06", "2026-03-10", DEFS);
    const dates = inserts.map((i) => i.date);
    expect(dates).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });

  it("emits each calendar day exactly once across the fall-back transition", () => {
    // US DST ends 2026-11-01
    const inserts = buildShiftInserts("sched-1", "2026-10-31", "2026-11-02", DEFS);
    expect(inserts.map((i) => i.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
