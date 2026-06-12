/**
 * Tests for fill-time hard-rule re-checks.
 *
 * Business rule: open-shift recommendations are computed when the coverage
 * dialog is built — possibly hours before the manager clicks Approve. In the
 * gap, the candidate may have been given another assignment (two managers
 * working in parallel is normal at shift change). The APPROVE/FILL actions
 * must re-run availability (leave, overlap, rest, 60h cap, on-call limits)
 * at the moment of fill and reject with HTTP 422 when it fails. Same for
 * manually filling a callout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const mockCheckAvailability = vi.hoisted(() => vi.fn());
const tableGets = vi.hoisted(() => ({
  openShift: vi.fn(),
  shift: vi.fn(),
  callout: vi.fn(),
  assignment: vi.fn(),
  staff: vi.fn(),
  schedule: vi.fn(),
  joined: vi.fn(),
}));
const mockInsertRun = vi.hoisted(() => vi.fn());
const mockInsertReturningGet = vi.hoisted(() => vi.fn());
const mockUpdateReturningGet = vi.hoisted(() => vi.fn());
const mockUpdateRun = vi.hoisted(() => vi.fn());

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
  ne: vi.fn((a: unknown, b: unknown) => ({ _ne: [a, b] })),
  gte: vi.fn((a: unknown, b: unknown) => ({ _gte: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ _lte: [a, b] })),
}));

vi.mock("@/db/schema", () => {
  const t = (name: string) => ({ _table: name, id: `${name}$id`, date: `${name}$date`, status: `${name}$status` });
  return {
    openShift: t("openShift"),
    assignment: t("assignment"),
    shift: t("shift"),
    shiftDefinition: t("shiftDefinition"),
    schedule: t("schedule"),
    staff: t("staff"),
    callout: t("callout"),
    exceptionLog: t("exceptionLog"),
  };
});

vi.mock("@/db", () => {
  const makeChain = (table?: { _table?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    let joined = false;
    chain.innerJoin = () => {
      joined = true;
      return chain;
    };
    chain.where = () => chain;
    chain.get = () => {
      if (joined) return tableGets.joined();
      const fn = table?._table ? tableGets[table._table as keyof typeof tableGets] : undefined;
      return fn ? fn() : undefined;
    };
    chain.all = () => [];
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (table: { _table?: string }) => makeChain(table) }),
      insert: () => ({
        values: () => ({
          run: mockInsertRun,
          returning: () => ({ get: mockInsertReturningGet }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            run: mockUpdateRun,
            returning: () => ({ get: mockUpdateReturningGet }),
          }),
        }),
      }),
      delete: () => ({ where: () => ({ run: vi.fn() }) }),
    },
  };
});

vi.mock("@/lib/coverage/find-candidates", () => ({
  checkStaffAvailability: mockCheckAvailability,
  findCandidatesForShift: vi.fn(async () => ({ candidates: [], escalationStepsChecked: [] })),
}));

vi.mock("@/lib/audit/logger", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/callout/escalation", () => ({ getEscalationOptions: vi.fn(() => []) }));

// ─── Import SUTs after mocks ─────────────────────────────────────────────────

import { PUT as openShiftPUT } from "@/app/api/open-shifts/[id]/route";
import { PUT as calloutPUT } from "@/app/api/callouts/[id]/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OPEN_SHIFT = {
  id: "os-001",
  shiftId: "shift-001",
  originalStaffId: "staff-orig",
  status: "pending_approval",
  recommendations: [{ staffId: "staff-new", staffName: "Jane Doe", source: "float", isOvertime: false }],
  notes: null,
};

const SHIFT_DETAILS_ROW = {
  id: "shift-001",
  date: "2026-04-01",
  startTime: "07:00",
  endTime: "19:00",
  durationHours: 12,
  unit: "ICU",
  shiftType: "day",
  scheduleId: "sched-001",
};

describe("open-shift approve — fill-time availability re-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableGets.openShift.mockReturnValue(OPEN_SHIFT);
    tableGets.shift.mockReturnValue({ id: "shift-001", scheduleId: "sched-001", date: "2026-04-01" });
    tableGets.joined.mockReturnValue(SHIFT_DETAILS_ROW);
    tableGets.assignment.mockReturnValue({ isChargeNurse: false });
    mockInsertReturningGet.mockReturnValue({ id: "assign-new" });
    mockUpdateReturningGet.mockReturnValue({ ...OPEN_SHIFT, status: "filled" });
  });

  it("returns 422 when the candidate fails availability at approve time", async () => {
    mockCheckAvailability.mockResolvedValue({
      available: false,
      hoursThisWeek: 50,
      reason: "Would exceed 60 hours in 7 days",
    });
    const res = await openShiftPUT(
      makeRequest("http://localhost/api/open-shifts/os-001", {
        action: "approve",
        selectedStaffId: "staff-new",
      }),
      { params: Promise.resolve({ id: "os-001" }) }
    );
    expect((res as { status: number }).status).toBe(422);
    expect(mockInsertReturningGet).not.toHaveBeenCalled();
  });

  it("includes the failure reason in the 422 response", async () => {
    mockCheckAvailability.mockResolvedValue({
      available: false,
      hoursThisWeek: 0,
      reason: "Already assigned to overlapping shift",
    });
    const res = (await openShiftPUT(
      makeRequest("http://localhost/api/open-shifts/os-001", {
        action: "approve",
        selectedStaffId: "staff-new",
      }),
      { params: Promise.resolve({ id: "os-001" }) }
    )) as unknown as { _data: { error: string } };
    expect(res._data.error).toMatch(/overlapping/i);
  });

  it("proceeds with the fill when availability passes", async () => {
    mockCheckAvailability.mockResolvedValue({ available: true, hoursThisWeek: 24 });
    const res = await openShiftPUT(
      makeRequest("http://localhost/api/open-shifts/os-001", {
        action: "approve",
        selectedStaffId: "staff-new",
      }),
      { params: Promise.resolve({ id: "os-001" }) }
    );
    expect((res as { status: number }).status).toBe(200);
    expect(mockCheckAvailability).toHaveBeenCalledWith(
      "staff-new",
      expect.objectContaining({ date: "2026-04-01" })
    );
  });
});

describe("callout fill — fill-time availability re-check", () => {
  const CALLOUT = {
    id: "co-001",
    shiftId: "shift-001",
    staffId: "staff-orig",
    assignmentId: "assign-orig",
    status: "open",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tableGets.callout.mockReturnValue(CALLOUT);
    tableGets.shift.mockReturnValue({ scheduleId: "sched-001", date: "2026-04-01" });
    tableGets.joined.mockReturnValue(SHIFT_DETAILS_ROW);
    tableGets.assignment.mockReturnValue({ isChargeNurse: false });
    tableGets.schedule.mockReturnValue({ unit: "ICU" });
    tableGets.staff.mockReturnValue({ firstName: "Jane", lastName: "Doe", homeUnit: "ICU" });
    mockUpdateReturningGet.mockReturnValue({ ...CALLOUT, status: "filled" });
  });

  it("returns 422 when the replacement fails availability at fill time", async () => {
    mockCheckAvailability.mockResolvedValue({
      available: false,
      hoursThisWeek: 52,
      reason: "Would exceed 60 hours in 7 days",
    });
    const res = await calloutPUT(
      makeRequest("http://localhost/api/callouts/co-001", {
        replacementStaffId: "staff-new",
        replacementSource: "float",
      }),
      { params: Promise.resolve({ id: "co-001" }) }
    );
    expect((res as { status: number }).status).toBe(422);
    expect(mockInsertRun).not.toHaveBeenCalled();
  });

  it("proceeds with the fill when availability passes", async () => {
    mockCheckAvailability.mockResolvedValue({ available: true, hoursThisWeek: 24 });
    const res = await calloutPUT(
      makeRequest("http://localhost/api/callouts/co-001", {
        replacementStaffId: "staff-new",
        replacementSource: "float",
      }),
      { params: Promise.resolve({ id: "co-001" }) }
    );
    expect((res as { status: number }).status).toBe(200);
  });
});
