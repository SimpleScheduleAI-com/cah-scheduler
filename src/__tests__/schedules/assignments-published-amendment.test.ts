/**
 * Tests for POST/DELETE /api/schedules/[id]/assignments — post-publish
 * amendments.
 *
 * Business rule (2026-09-13, replaces the old "unpublish first" 409 guard):
 * a published schedule is the version of record nurses have seen, and once
 * seen, "unpublishing" has no real-world meaning — a one-person change is an
 * amendment, not a new schedule. So:
 *  - on a published schedule, add/remove WITHOUT a reason → HTTP 400
 *  - WITH a reason → allowed, logged against the SCHEDULE as
 *    `post_publish_amendment` (justification = reason), and ONLY the affected
 *    nurse is notified (`assignment_amended`)
 *  - on a draft schedule nothing changes: no reason needed, no amendment
 *    log, no notification
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const tableGets = vi.hoisted(() => ({
  schedule: vi.fn(),
  shift: vi.fn(),
  shiftDefinition: vi.fn(),
  staff: vi.fn(),
  publicHoliday: vi.fn(),
  assignment: vi.fn(),
  staffHolidayAssignment: vi.fn(),
}));
const mockInsertReturningGet = vi.hoisted(() => vi.fn());
const mockDeleteRun = vi.hoisted(() => vi.fn());
const mockUpdateRun = vi.hoisted(() => vi.fn());
const mockLogAudit = vi.hoisted(() => vi.fn());
const mockInsertNotification = vi.hoisted(() => vi.fn());
const mockComposeAmended = vi.hoisted(() =>
  vi.fn((p: Record<string, unknown>) => ({ _draft: p })),
);

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
  gte: vi.fn((a: unknown, b: unknown) => ({ _gte: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ _lte: [a, b] })),
  ne: vi.fn((a: unknown, b: unknown) => ({ _ne: [a, b] })),
}));

vi.mock("@/db/schema", () => ({
  schedule: { _table: "schedule", id: "sched$id", status: "sched$status" },
  notification: { _table: "notification" },
  shift: {
    _table: "shift",
    id: "shift$id",
    date: "shift$date",
    shiftDefinitionId: "shift$defId",
  },
  shiftDefinition: {
    _table: "shiftDefinition",
    id: "def$id",
    durationHours: "def$durationHours",
  },
  staff: {
    _table: "staff",
    id: "staff$id",
    firstName: "staff$fn",
    lastName: "staff$ln",
    role: "staff$role",
  },
  publicHoliday: {
    _table: "publicHoliday",
    date: "ph$date",
    isActive: "ph$isActive",
  },
  assignment: {
    _table: "assignment",
    id: "assign$id",
    staffId: "assign$staffId",
    shiftId: "assign$shiftId",
    scheduleId: "assign$scheduleId",
    isChargeNurse: "assign$icn",
    status: "assign$status",
  },
  staffHolidayAssignment: {
    _table: "staffHolidayAssignment",
    staffId: "sha$staffId",
    holidayName: "sha$holidayName",
    year: "sha$year",
  },
  // Needed since the DELETE handler appends a staffing summary to its audit
  // entry (src/lib/audit/staffing-context.ts reads census bands to compute the
  // effective requirement). This test stubs describeStaffing below, but the
  // module still resolves schema symbols at import time.
  censusBand: { _table: "censusBand", id: "cb$id", isActive: "cb$isActive" },
}));

// The staffing summary is covered by its own test
// (src/__tests__/audit/staffing-context.test.ts) against a real scratch DB;
// here it would need every census/assignment row mocked to produce a string
// this test never asserts on. Stub it so this stays a guard test.
vi.mock("@/lib/audit/staffing-context", () => ({
  describeStaffing: () => "",
  getStaffingSnapshot: () => null,
}));

vi.mock("@/db", () => {
  const makeFromResult = (table: { _table: keyof typeof tableGets }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = {
      where: () => ({
        get: tableGets[table._table] ?? vi.fn(),
        all: vi.fn(() => []),
      }),
      all: vi.fn(() => []),
    };
    res.innerJoin = () => res;
    return res;
  };
  return {
    db: {
      select: () => ({ from: makeFromResult }),
      insert: () => ({
        values: () => ({
          returning: () => ({ get: mockInsertReturningGet }),
          run: vi.fn(),
        }),
      }),
      update: () => ({
        set: () => ({ where: () => ({ run: mockUpdateRun }) }),
      }),
      delete: () => ({ where: () => ({ run: mockDeleteRun }) }),
    },
  };
});

vi.mock("@/lib/audit/logger", () => ({ logAuditEvent: mockLogAudit }));
vi.mock("@/lib/notifications/notify", () => ({
  insertNotification: mockInsertNotification,
  composeAssignmentAmended: mockComposeAmended,
}));

// ─── Import SUT after mocks ──────────────────────────────────────────────────

import { POST, DELETE } from "@/app/api/schedules/[id]/assignments/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCHEDULE_ID = "sched-001";

function makePost(body: Record<string, unknown>) {
  return new Request(
    `http://localhost/api/schedules/${SCHEDULE_ID}/assignments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeDelete(assignmentId: string, reason?: string) {
  const qs = new URLSearchParams({ assignmentId });
  if (reason !== undefined) qs.set("reason", reason);
  return new Request(
    `http://localhost/api/schedules/${SCHEDULE_ID}/assignments?${qs.toString()}`,
    { method: "DELETE" },
  );
}

const PUBLISHED = {
  id: SCHEDULE_ID,
  name: "September 2026",
  unit: "ICU",
  status: "published",
};
const DRAFT = { ...PUBLISHED, status: "draft" };

function amendmentLogs() {
  return mockLogAudit.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((p) => p.action === "post_publish_amendment");
}

function makeParams() {
  return Promise.resolve({ id: SCHEDULE_ID });
}

describe("assignments route — post-publish amendments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableGets.shift.mockReturnValue({
      id: "shift-001",
      date: "2026-04-01",
      shiftDefinitionId: "def-001",
    });
    tableGets.shiftDefinition.mockReturnValue({
      durationHours: 12,
      name: "Day",
      shiftType: "day",
    });
    tableGets.staff.mockReturnValue({
      firstName: "Jane",
      lastName: "Doe",
      role: "RN",
    });
    tableGets.publicHoliday.mockReturnValue(undefined);
    tableGets.assignment.mockReturnValue({
      id: "assign-001",
      staffId: "staff-001",
      shiftId: "shift-001",
      scheduleId: SCHEDULE_ID,
    });
    mockInsertReturningGet.mockReturnValue({ id: "assign-new" });
  });

  // ── Published: reason required ─────────────────────────────────────────

  it("POST on a published schedule without a reason → 400, nothing written", async () => {
    tableGets.schedule.mockReturnValue(PUBLISHED);
    const res = await POST(
      makePost({ shiftId: "shift-001", staffId: "staff-001" }),
      { params: makeParams() },
    );
    expect((res as { status: number }).status).toBe(400);
    expect(mockInsertReturningGet).not.toHaveBeenCalled();
    expect(mockInsertNotification).not.toHaveBeenCalled();
  });

  it("POST on a published schedule with a whitespace-only reason → 400", async () => {
    tableGets.schedule.mockReturnValue(PUBLISHED);
    const res = await POST(
      makePost({ shiftId: "shift-001", staffId: "staff-001", reason: "   " }),
      { params: makeParams() },
    );
    expect((res as { status: number }).status).toBe(400);
    expect(mockInsertReturningGet).not.toHaveBeenCalled();
  });

  it("DELETE on a published schedule without a reason → 400, row kept", async () => {
    tableGets.schedule.mockReturnValue(PUBLISHED);
    const res = await DELETE(makeDelete("assign-001"));
    expect((res as { status: number }).status).toBe(400);
    expect(mockDeleteRun).not.toHaveBeenCalled();
    expect(mockInsertNotification).not.toHaveBeenCalled();
  });

  // ── Published: amendment with reason ───────────────────────────────────

  it("POST with a reason on a published schedule creates the assignment, logs the amendment against the schedule, and notifies the added nurse", async () => {
    tableGets.schedule.mockReturnValue(PUBLISHED);
    const res = await POST(
      makePost({
        shiftId: "shift-001",
        staffId: "staff-001",
        reason: "Covering approved leave",
      }),
      { params: makeParams() },
    );
    expect((res as { status: number }).status).toBe(201);
    expect(mockInsertReturningGet).toHaveBeenCalled();

    // Regular manual_assignment entry still present (assignment history)…
    const manual = mockLogAudit.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((p) => p.action === "manual_assignment");
    expect(manual).toBeDefined();

    // …plus the amendment against the SCHEDULE with the reason as justification.
    const logs = amendmentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].entityType).toBe("schedule");
    expect(logs[0].entityId).toBe(SCHEDULE_ID);
    expect(logs[0].justification).toBe("Covering approved leave");
    expect(String(logs[0].description)).toContain("Jane Doe");
    expect(String(logs[0].description)).toContain("Covering approved leave");
    expect((logs[0].newState as Record<string, unknown>).change).toBe("added");

    // Exactly one notification — the added nurse, not the whole unit.
    expect(mockInsertNotification).toHaveBeenCalledTimes(1);
    expect(mockComposeAmended).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: "staff-001",
        change: "added",
        date: "2026-04-01",
        unit: "ICU",
        reason: "Covering approved leave",
      }),
    );
  });

  it("DELETE with a reason on a published schedule removes the row, logs the amendment, and notifies the removed nurse", async () => {
    tableGets.schedule.mockReturnValue(PUBLISHED);
    const res = await DELETE(makeDelete("assign-001", "Low census release"));
    expect((res as { status: number }).status).toBe(200);
    expect(mockDeleteRun).toHaveBeenCalled();

    const logs = amendmentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].entityType).toBe("schedule");
    expect(logs[0].entityId).toBe(SCHEDULE_ID);
    expect(logs[0].justification).toBe("Low census release");
    expect((logs[0].previousState as Record<string, unknown>).change).toBe(
      "removed",
    );

    expect(mockInsertNotification).toHaveBeenCalledTimes(1);
    expect(mockComposeAmended).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: "staff-001",
        change: "removed",
        reason: "Low census release",
      }),
    );
  });

  // ── Draft: unchanged behaviour ─────────────────────────────────────────

  it("POST on a draft schedule needs no reason and logs no amendment", async () => {
    tableGets.schedule.mockReturnValue(DRAFT);
    const res = await POST(
      makePost({ shiftId: "shift-001", staffId: "staff-001" }),
      { params: makeParams() },
    );
    expect((res as { status: number }).status).toBe(201);
    expect(amendmentLogs()).toHaveLength(0);
    expect(mockInsertNotification).not.toHaveBeenCalled();
  });

  it("DELETE on a draft schedule needs no reason and logs no amendment", async () => {
    tableGets.schedule.mockReturnValue(DRAFT);
    const res = await DELETE(makeDelete("assign-001"));
    expect((res as { status: number }).status).toBe(200);
    expect(mockDeleteRun).toHaveBeenCalled();
    expect(amendmentLogs()).toHaveLength(0);
    expect(mockInsertNotification).not.toHaveBeenCalled();
  });

  it("POST excludes called-out and cancelled assignments from the weekly OT hours", async () => {
    // The isOvertime computation must not count hours from assignments the
    // nurse is no longer working (called out / cancelled) — otherwise a nurse
    // who called out Monday gets a phantom OT badge on Thursday.
    tableGets.schedule.mockReturnValue({ id: SCHEDULE_ID, status: "draft" });
    const { ne } = await import("drizzle-orm");
    const schema = await import("@/db/schema");
    await POST(makePost({ shiftId: "shift-001", staffId: "staff-001" }), {
      params: makeParams(),
    });
    const neCalls = (ne as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const statusArgs = neCalls
      .filter((c: unknown[]) => c[0] === schema.assignment.status)
      .map((c: unknown[]) => c[1]);
    expect(statusArgs).toContain("called_out");
    expect(statusArgs).toContain("cancelled");
  });
});
