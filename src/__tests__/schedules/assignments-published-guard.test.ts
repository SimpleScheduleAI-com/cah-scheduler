/**
 * Tests for POST/DELETE /api/schedules/[id]/assignments — published guard.
 *
 * Business rule: a published schedule is the version of record that staff
 * have been notified about. Mutating its assignments without unpublishing
 * silently desynchronizes what staff saw from what the system stores, so
 * both adding and removing assignments must be rejected with HTTP 409.
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
  shift: { _table: "shift", id: "shift$id", date: "shift$date", shiftDefinitionId: "shift$defId" },
  shiftDefinition: { _table: "shiftDefinition", id: "def$id", durationHours: "def$durationHours" },
  staff: { _table: "staff", id: "staff$id", firstName: "staff$fn", lastName: "staff$ln", role: "staff$role" },
  publicHoliday: { _table: "publicHoliday", date: "ph$date", isActive: "ph$isActive" },
  assignment: { _table: "assignment", id: "assign$id", staffId: "assign$staffId", shiftId: "assign$shiftId", scheduleId: "assign$scheduleId", isChargeNurse: "assign$icn", status: "assign$status" },
  staffHolidayAssignment: { _table: "staffHolidayAssignment", staffId: "sha$staffId", holidayName: "sha$holidayName", year: "sha$year" },
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
      update: () => ({ set: () => ({ where: () => ({ run: mockUpdateRun }) }) }),
      delete: () => ({ where: () => ({ run: mockDeleteRun }) }),
    },
  };
});

vi.mock("@/lib/audit/logger", () => ({ logAuditEvent: mockLogAudit }));

// ─── Import SUT after mocks ──────────────────────────────────────────────────

import { POST, DELETE } from "@/app/api/schedules/[id]/assignments/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SCHEDULE_ID = "sched-001";

function makePost(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/schedules/${SCHEDULE_ID}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete(assignmentId: string) {
  return new Request(
    `http://localhost/api/schedules/${SCHEDULE_ID}/assignments?assignmentId=${assignmentId}`,
    { method: "DELETE" }
  );
}

function makeParams() {
  return Promise.resolve({ id: SCHEDULE_ID });
}

describe("assignments route — published-schedule guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableGets.shift.mockReturnValue({ id: "shift-001", date: "2026-04-01", shiftDefinitionId: "def-001" });
    tableGets.shiftDefinition.mockReturnValue({ durationHours: 12, name: "Day", shiftType: "day" });
    tableGets.staff.mockReturnValue({ firstName: "Jane", lastName: "Doe", role: "RN" });
    tableGets.publicHoliday.mockReturnValue(undefined);
    tableGets.assignment.mockReturnValue({
      id: "assign-001",
      staffId: "staff-001",
      shiftId: "shift-001",
      scheduleId: SCHEDULE_ID,
    });
    mockInsertReturningGet.mockReturnValue({ id: "assign-new" });
  });

  it("POST returns 409 when the schedule is published", async () => {
    tableGets.schedule.mockReturnValue({ id: SCHEDULE_ID, status: "published" });
    const res = await POST(makePost({ shiftId: "shift-001", staffId: "staff-001" }), {
      params: makeParams(),
    });
    expect((res as { status: number }).status).toBe(409);
    expect(mockInsertReturningGet).not.toHaveBeenCalled();
  });

  it("POST still creates the assignment on a draft schedule", async () => {
    tableGets.schedule.mockReturnValue({ id: SCHEDULE_ID, status: "draft" });
    const res = await POST(makePost({ shiftId: "shift-001", staffId: "staff-001" }), {
      params: makeParams(),
    });
    expect((res as { status: number }).status).toBe(201);
  });

  it("DELETE returns 409 when the assignment's schedule is published", async () => {
    tableGets.schedule.mockReturnValue({ id: SCHEDULE_ID, status: "published" });
    const res = await DELETE(makeDelete("assign-001"));
    expect((res as { status: number }).status).toBe(409);
    expect(mockDeleteRun).not.toHaveBeenCalled();
  });

  it("DELETE still removes the assignment on a draft schedule", async () => {
    tableGets.schedule.mockReturnValue({ id: SCHEDULE_ID, status: "draft" });
    const res = await DELETE(makeDelete("assign-001"));
    expect((res as { status: number }).status).toBe(200);
    expect(mockDeleteRun).toHaveBeenCalled();
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
