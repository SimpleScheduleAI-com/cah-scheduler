/**
 * Tests for PUT /api/staff-leave/[id] — leave approval audit trail.
 *
 * Critical invariants:
 *  1. When leave is approved and an affected assignment falls within the
 *     callout threshold, a callout record is created and the audit event
 *     must use the NEW CALLOUT's id (not the assignment id) as entityId.
 *  2. The audit description must contain the staff member's name, not their
 *     UUID (which is unreadable in the UI).
 *  3. When an affected assignment is beyond the threshold, an open_shift is
 *     created and logged with the open_shift's id as entityId.
 *
 * These bugs were NOT covered by denial-validation.test.ts because that file
 * mocks all() to return [] — handleLeaveApproval never processes any
 * assignments in those tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted variables ────────────────────────────────────────────────────────

const mockSelectGet = vi.hoisted(() => vi.fn());
const mockSelectAll = vi.hoisted(() => vi.fn());
const mockUpdateRetGet = vi.hoisted(() => vi.fn());
const mockUpdateRun = vi.hoisted(() => vi.fn());
const mockInsertRetGet = vi.hoisted(() => vi.fn());
const mockInsertRun = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  or: vi.fn((...args: unknown[]) => ({ _or: args })),
  gte: vi.fn((a: unknown, b: unknown) => ({ _gte: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ _lte: [a, b] })),
}));

vi.mock("@/db/schema", () => ({
  staffLeave: { id: "sl$id", staffId: "sl$staffId", status: "sl$status" },
  exceptionLog: { id: "el$id" },
  assignment: {
    id: "assign$id",
    staffId: "assign$staffId",
    status: "assign$status",
    shiftId: "assign$shiftId",
    scheduleId: "assign$scheduleId",
  },
  shift: { id: "shift$id", date: "shift$date", scheduleId: "shift$scheduleId" },
  schedule: { id: "sched$id", unit: "sched$unit" },
  shiftDefinition: {
    id: "def$id",
    name: "def$name",
    shiftType: "def$type",
    unit: "def$unit",
  },
  notification: { id: "notif$id" },
  unit: {
    id: "unit$id",
    name: "unit$name",
    calloutThresholdDays: "unit$threshold",
  },
  openShift: { id: "os$id" },
  callout: { id: "co$id" },
  staff: {
    id: "staff$id",
    firstName: "staff$firstName",
    lastName: "staff$lastName",
  },
  shiftSwapRequest: {
    id: "ssr$id",
    status: "ssr$status",
    requestingAssignmentId: "ssr$reqAssign",
    targetAssignmentId: "ssr$tgtAssign",
  },
}));

vi.mock("@/db", () => {
  // Self-referential chain so .innerJoin().innerJoin().where() works
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromResult: any = {
    where: () => ({ get: mockSelectGet, all: mockSelectAll }),
    all: mockSelectAll,
    leftJoin: () => ({
      orderBy: () => ({ all: vi.fn(() => []) }),
      where: () => ({ all: mockSelectAll }),
    }),
  };
  fromResult.innerJoin = () => fromResult;
  return {
    db: {
      select: () => ({
        from: () => fromResult,
        leftJoin: () => ({
          where: () => ({ all: mockSelectAll }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => ({ get: mockUpdateRetGet }),
            run: mockUpdateRun,
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          run: mockInsertRun,
          returning: () => ({ get: mockInsertRetGet }),
        }),
      }),
      delete: () => ({ where: () => ({ run: vi.fn() }) }),
      transaction: (fn: () => unknown) => fn(),
    },
  };
});

const mockFindCandidates = vi.hoisted(() =>
  vi.fn(async () => ({
    candidates: [] as { staffId: string; source: string }[],
    escalationStepsChecked: [] as string[],
  })),
);
vi.mock("@/lib/coverage/find-candidates", () => ({
  findCandidatesForShift: mockFindCandidates,
}));

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { PUT } from "@/app/api/staff-leave/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEAVE_ID = "leave-001";
const STAFF_ID = "staff-uuid-001";
const ASSIGN_ID = "assign-001";
const SHIFT_ID = "shift-001";
const SCHED_ID = "sched-001";
const CALLOUT_ID = "callout-new-001";
const OPEN_SHIFT_ID = "open-shift-new-001";

const pendingLeave = {
  id: LEAVE_ID,
  staffId: STAFF_ID,
  leaveType: "vacation",
  startDate: "2026-04-01",
  endDate: "2026-04-05",
  status: "pending",
  notes: null,
  approvedAt: null,
  approvedBy: null,
  denialReason: null,
  createdAt: "2026-03-01T10:00:00Z",
};

/** Shift date that is within callout threshold (3 days from today proxy) */
const URGENT_SHIFT_DATE = "2026-03-02"; // within 7-day default threshold
/** Shift date that is beyond threshold (30 days out) */
const FUTURE_SHIFT_DATE = "2026-04-10";

function makeRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/staff-leave/${LEAVE_ID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return Promise.resolve({ id: LEAVE_ID });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PUT /api/staff-leave/[id] — leave approval audit trail", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: leave record found on first .get(), approved leave on update
    mockSelectGet.mockReturnValue(pendingLeave);
    mockUpdateRetGet.mockReturnValue({
      ...pendingLeave,
      status: "approved",
      approvedAt: new Date().toISOString(),
    });

    // Staff name lookup (called when logging leave_approved)
    // These are sequential .get() calls inside the PUT handler
    // Call 1: existing leave record (already covered by mockSelectGet default)
  });

  // ── Urgent callout (within threshold) ────────────────────────────────────

  describe("when affected assignment is within callout threshold (urgent)", () => {
    beforeEach(() => {
      // selectGet sequence for approval flow:
      //  1. existing leave record
      //  2. staff name (for leave_approved log)
      mockSelectGet
        .mockReturnValueOnce(pendingLeave) // existing leave
        .mockReturnValueOnce({ firstName: "Alice", lastName: "Johnson" }) // staff name
        .mockReturnValueOnce({ calloutThresholdDays: 7 }); // unit config

      // affectedAssignments query (.all())
      mockSelectAll.mockReturnValue([
        {
          assignmentId: ASSIGN_ID,
          shiftId: SHIFT_ID,
          shiftDate: URGENT_SHIFT_DATE,
          scheduleId: SCHED_ID,
          scheduleUnit: "ICU",
        },
      ]);

      // insert callout → .returning().get() must return the new callout with its id
      mockInsertRetGet.mockReturnValue({ id: CALLOUT_ID });
      // insert exceptionLog → .run()
      mockInsertRun.mockReturnValue(undefined);
    });

    it("audit event for the created callout uses the callout id (not the assignment id) as entityId", async () => {
      // Capture all insert().values() calls
      const capturedInserts: {
        entityType?: string;
        entityId?: string;
        action?: string;
        description?: string;
      }[] = [];
      const { db } = await import("@/db");
      const origInsert = db.insert.bind(db);
      vi.spyOn(db, "insert").mockImplementation(
        (_table: unknown) =>
          ({
            values: (vals: Record<string, unknown>) => {
              capturedInserts.push(
                vals as {
                  entityType?: string;
                  entityId?: string;
                  action?: string;
                  description?: string;
                },
              );
              return {
                run: mockInsertRun,
                returning: () => ({ get: mockInsertRetGet }),
              };
            },
          }) as ReturnType<typeof origInsert>,
      );

      await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
        params: makeParams(),
      });

      const calloutAudit = capturedInserts.find(
        (v) => v.action === "callout_logged",
      );
      expect(calloutAudit).toBeDefined();
      // entityId MUST be the callout id, not the assignment id
      expect(calloutAudit?.entityId).toBe(CALLOUT_ID);
      expect(calloutAudit?.entityId).not.toBe(ASSIGN_ID);
    });

    it("audit description contains the staff member's name (not UUID)", async () => {
      const capturedInserts: {
        entityType?: string;
        entityId?: string;
        action?: string;
        description?: string;
      }[] = [];
      const { db } = await import("@/db");
      vi.spyOn(db, "insert").mockImplementation(
        (_table: unknown) =>
          ({
            values: (vals: Record<string, unknown>) => {
              capturedInserts.push(
                vals as {
                  entityType?: string;
                  entityId?: string;
                  action?: string;
                  description?: string;
                },
              );
              return {
                run: mockInsertRun,
                returning: () => ({ get: mockInsertRetGet }),
              };
            },
          }) as ReturnType<typeof db.insert>,
      );

      await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
        params: makeParams(),
      });

      const calloutAudit = capturedInserts.find(
        (v) => v.action === "callout_logged",
      );
      expect(calloutAudit?.description).toContain("Alice Johnson");
      // Must NOT contain the raw UUID
      expect(calloutAudit?.description).not.toContain(STAFF_ID);
    });

    it("audit event entityType is 'callout'", async () => {
      const capturedInserts: {
        entityType?: string;
        entityId?: string;
        action?: string;
      }[] = [];
      const { db } = await import("@/db");
      vi.spyOn(db, "insert").mockImplementation(
        (_table: unknown) =>
          ({
            values: (vals: Record<string, unknown>) => {
              capturedInserts.push(
                vals as {
                  entityType?: string;
                  entityId?: string;
                  action?: string;
                },
              );
              return {
                run: mockInsertRun,
                returning: () => ({ get: mockInsertRetGet }),
              };
            },
          }) as ReturnType<typeof db.insert>,
      );

      await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
        params: makeParams(),
      });

      const calloutAudit = capturedInserts.find(
        (v) => v.action === "callout_logged",
      );
      expect(calloutAudit?.entityType).toBe("callout");
    });
  });

  // ── Urgent callout ≥ 1 day out: eligible nurses are told ───────────────
  //
  // 2026-09-13 (Dr. Tara demo): a night charge nurse's leave 6 days out went
  // down the callout path and NO nurse heard the shift was vacant, because
  // notifications only fired on the open-shift (> threshold) path. Now an
  // urgent callout with at least one full day to go also posts a
  // `callout_posted` notice to every rule-eligible nurse. Same-day/past
  // shifts stay silent — with hours left, the manager is on the phone.

  // LOCAL calendar date, not toISOString(): the route parses "YYYY-MM-DD"
  // as local midnight, and a UTC slice is a day behind east of Greenwich.
  function isoDaysFromToday(n: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function captureInserts() {
    const captured: Record<string, unknown>[] = [];
    return {
      captured,
      install: async () => {
        const { db } = await import("@/db");
        vi.spyOn(db, "insert").mockImplementation(
          (_table: unknown) =>
            ({
              values: (vals: Record<string, unknown>) => {
                captured.push(vals);
                return {
                  run: mockInsertRun,
                  returning: () => ({ get: mockInsertRetGet }),
                };
              },
            }) as unknown as ReturnType<typeof db.insert>,
        );
      },
    };
  }

  describe("urgent callout notifications", () => {
    beforeEach(() => {
      mockSelectGet
        .mockReturnValueOnce(pendingLeave) // existing leave
        .mockReturnValueOnce({ firstName: "Alice", lastName: "Johnson" }) // staff name
        .mockReturnValueOnce({ calloutThresholdDays: 7 }); // unit config
      mockInsertRetGet.mockReturnValue({ id: CALLOUT_ID });
      mockFindCandidates.mockResolvedValue({
        candidates: [
          { staffId: "nurse-james", source: "float" },
          { staffId: "agency-placeholder", source: "agency" },
          { staffId: STAFF_ID, source: "regular" }, // the nurse going on leave
        ],
        escalationStepsChecked: [],
      });
    });

    // The defInfo lookup (.get #4) only happens on the notify path — queue it
    // per test so an unconsumed value cannot leak into the next test.
    const DEF_INFO = { name: "Night", shiftType: "night", unit: "ICU" };

    it("4 days out (inside the 7-day threshold): creates a callout AND posts callout_posted to eligible nurses only", async () => {
      mockSelectGet.mockReturnValueOnce(DEF_INFO);
      mockSelectAll.mockReturnValue([
        {
          assignmentId: ASSIGN_ID,
          shiftId: SHIFT_ID,
          shiftDate: isoDaysFromToday(4),
          scheduleId: SCHED_ID,
          scheduleUnit: "ICU",
        },
      ]);
      const { captured, install } = captureInserts();
      await install();

      await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
        params: makeParams(),
      });

      expect(captured.some((v) => v.action === "callout_logged")).toBe(true);
      expect(mockFindCandidates).toHaveBeenCalled();
      const posted = captured.filter((v) => v.type === "callout_posted");
      expect(posted.map((v) => v.staffId)).toEqual(["nurse-james"]); // no agency, not the leaver
      expect(String(posted[0].title)).toMatch(/urgent/i);
      expect(String(posted[0].body)).toContain("in 4 days");
      expect(captured.some((v) => v.type === "open_shift_posted")).toBe(false);
    });

    it("same-day shift: callout only, nobody is notified", async () => {
      mockSelectAll.mockReturnValue([
        {
          assignmentId: ASSIGN_ID,
          shiftId: SHIFT_ID,
          shiftDate: isoDaysFromToday(0),
          scheduleId: SCHED_ID,
          scheduleUnit: "ICU",
        },
      ]);
      const { captured, install } = captureInserts();
      await install();

      await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
        params: makeParams(),
      });

      expect(captured.some((v) => v.action === "callout_logged")).toBe(true);
      expect(mockFindCandidates).not.toHaveBeenCalled();
      expect(captured.some((v) => v.type === "callout_posted")).toBe(false);
    });

    it("beyond the threshold: open-shift path is unchanged (open_shift_posted, not callout_posted)", async () => {
      mockSelectGet.mockReturnValueOnce(DEF_INFO);
      mockSelectAll.mockReturnValue([
        {
          assignmentId: ASSIGN_ID,
          shiftId: SHIFT_ID,
          shiftDate: isoDaysFromToday(20),
          scheduleId: SCHED_ID,
          scheduleUnit: "ICU",
        },
      ]);
      mockInsertRetGet.mockReturnValue({ id: OPEN_SHIFT_ID });
      const { captured, install } = captureInserts();
      await install();

      await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
        params: makeParams(),
      });

      expect(captured.some((v) => v.type === "open_shift_posted")).toBe(true);
      expect(captured.some((v) => v.type === "callout_posted")).toBe(false);
    });
  });

  // ── No-op when status unchanged ──────────────────────────────────────────

  it("does not call handleLeaveApproval when status is unchanged", async () => {
    // existing leave is already approved — status doesn't change
    const alreadyApproved = { ...pendingLeave, status: "approved" };
    mockSelectGet.mockReturnValueOnce(alreadyApproved);
    mockUpdateRetGet.mockReturnValue(alreadyApproved);

    // affectedAssignments should never be queried
    await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
      params: makeParams(),
    });

    // selectAll would only be called inside handleLeaveApproval
    expect(mockSelectAll).not.toHaveBeenCalled();
  });
});
