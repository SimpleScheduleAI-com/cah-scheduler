/**
 * Tests for PUT /api/staff-leave/[id] — leave approval voids pending swaps.
 *
 * Cross-workflow gap: approving leave cancels the nurse's assignments, but a
 * pending swap request still references those assignment IDs. If a manager
 * later approves that swap, it mutates a cancelled assignment — the grid
 * hides cancelled rows, both nurses silently vanish, and the shift is doubly
 * uncovered. Leave approval must therefore deny pending swaps that reference
 * any assignment it cancels (and audit-log the denial).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted variables ────────────────────────────────────────────────────────

const mockSelectGet = vi.hoisted(() => vi.fn());
const mockSelectAll = vi.hoisted(() => vi.fn());
const mockUpdateRetGet = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertRetGet = vi.hoisted(() => vi.fn());

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
  unit: { id: "unit$id", name: "unit$name", calloutThresholdDays: "unit$threshold" },
  openShift: { id: "os$id" },
  callout: { id: "co$id" },
  staff: { id: "staff$id", firstName: "staff$firstName", lastName: "staff$lastName" },
  shiftSwapRequest: {
    id: "ssr$id",
    status: "ssr$status",
    requestingAssignmentId: "ssr$reqAssign",
    targetAssignmentId: "ssr$tgtAssign",
  },
}));

vi.mock("@/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromResult: any = {
    where: () => ({ get: mockSelectGet, all: mockSelectAll }),
    all: mockSelectAll,
  };
  fromResult.innerJoin = () => fromResult;
  return {
    db: {
      select: () => ({ from: () => fromResult }),
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          mockUpdateSet(vals);
          return {
            where: () => ({
              returning: () => ({ get: mockUpdateRetGet }),
              run: vi.fn(),
            }),
          };
        },
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          mockInsertValues(vals);
          return {
            run: vi.fn(),
            returning: () => ({ get: mockInsertRetGet }),
          };
        },
      }),
      delete: () => ({ where: () => ({ run: vi.fn() }) }),
      transaction: (fn: () => unknown) => fn(),
    },
  };
});

vi.mock("@/lib/coverage/find-candidates", () => ({
  findCandidatesForShift: vi.fn(async () => ({ candidates: [], escalationStepsChecked: [] })),
}));

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { PUT } from "@/app/api/staff-leave/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEAVE_ID = "leave-001";
const STAFF_ID = "staff-001";
const ASSIGN_ID = "assign-001";

// A shift 2 days out → within the default callout threshold (7 days)
const soonDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const pendingLeave = {
  id: LEAVE_ID,
  staffId: STAFF_ID,
  leaveType: "vacation",
  startDate: soonDate,
  endDate: soonDate,
  status: "pending",
  approvedAt: null,
  approvedBy: null,
};

function makeRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/staff-leave/${LEAVE_ID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/staff-leave/[id] — voids pending swaps on cancelled assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectGet
      .mockReturnValueOnce(pendingLeave) // 1. fetch leave
      .mockReturnValueOnce({ firstName: "Alice", lastName: "Smith" }) // 2. staff name for audit
      .mockReturnValue({ calloutThresholdDays: 7 }); // 3+. unit config
    mockUpdateRetGet.mockReturnValue({ ...pendingLeave, status: "approved" });
    mockInsertRetGet.mockReturnValue({ id: "new-entity-001" });
    mockSelectAll
      .mockReturnValueOnce([
        // affected assignments during leave
        {
          assignmentId: ASSIGN_ID,
          shiftId: "shift-001",
          shiftDate: soonDate,
          scheduleId: "sched-001",
          scheduleUnit: "ICU",
        },
      ])
      .mockReturnValueOnce([
        // pending swap requests referencing the cancelled assignment
        { id: "swap-001", status: "pending", requestingAssignmentId: ASSIGN_ID, targetAssignmentId: "assign-other" },
      ])
      .mockReturnValue([]);
  });

  it("denies pending swap requests that reference a cancelled assignment", async () => {
    await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
      params: Promise.resolve({ id: LEAVE_ID }),
    });
    const denialUpdates = mockUpdateSet.mock.calls.filter(
      (c) => (c[0] as { status?: string }).status === "denied"
    );
    expect(denialUpdates.length).toBe(1);
    expect((denialUpdates[0][0] as { denialReason?: string }).denialReason).toMatch(/leave/i);
  });

  it("audit-logs the automatic swap denial", async () => {
    await PUT(makeRequest({ status: "approved", approvedBy: "manager" }), {
      params: Promise.resolve({ id: LEAVE_ID }),
    });
    const swapDenialLogs = mockInsertValues.mock.calls.filter(
      (c) => (c[0] as { action?: string }).action === "swap_denied"
    );
    expect(swapDenialLogs.length).toBe(1);
    expect((swapDenialLogs[0][0] as { entityType?: string }).entityType).toBe("swap_request");
  });
});
