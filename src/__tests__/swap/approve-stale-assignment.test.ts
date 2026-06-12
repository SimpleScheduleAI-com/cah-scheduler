/**
 * Tests for PUT /api/swap-requests/[id] — stale-assignment guard.
 *
 * Business rule: a pending swap references two assignment IDs. If either
 * assignment has since been cancelled (e.g. leave approved → assignment
 * cancelled) or called out, approving the swap would mutate a dead
 * assignment: the grid hides cancelled rows, so both nurses silently vanish
 * from the schedule and the shift is doubly uncovered. Approval must be
 * rejected with HTTP 422 when either assignment is no longer active.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const mockSwapGet = vi.hoisted(() => vi.fn());
const mockAssignmentGet = vi.hoisted(() => vi.fn());
const mockGenericGet = vi.hoisted(() => vi.fn());
const mockUpdateRun = vi.hoisted(() => vi.fn());
const mockInsertRun = vi.hoisted(() => vi.fn());

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
    shiftSwapRequest: t("shiftSwapRequest"),
    assignment: t("assignment"),
    shift: t("shift"),
    shiftDefinition: t("shiftDefinition"),
    staff: t("staff"),
    staffLeave: t("staffLeave"),
    openShift: t("openShift"),
    exceptionLog: t("exceptionLog"),
  };
});

vi.mock("@/db", () => {
  const makeChain = (table?: { _table?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    chain.innerJoin = () => chain;
    chain.where = () => chain;
    chain.get = (() => {
      if (table?._table === "shiftSwapRequest") return mockSwapGet();
      if (table?._table === "assignment") return mockAssignmentGet();
      return mockGenericGet();
    }) as () => unknown;
    chain.all = () => [];
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (table: { _table?: string }) => makeChain(table) }),
      update: () => ({ set: () => ({ where: () => ({ run: mockUpdateRun }) }) }),
      insert: () => ({ values: () => ({ run: mockInsertRun }) }),
    },
  };
});

// ─── Import SUT after mocks ──────────────────────────────────────────────────

import { PUT } from "@/app/api/swap-requests/[id]/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SWAP_ID = "swap-001";

const directedSwap = {
  id: SWAP_ID,
  status: "pending",
  requestingStaffId: "staff-req",
  targetStaffId: "staff-tgt",
  requestingAssignmentId: "assign-req",
  targetAssignmentId: "assign-tgt",
  notes: null,
};

function makeRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/swap-requests/${SWAP_ID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return Promise.resolve({ id: SWAP_ID });
}

describe("PUT /api/swap-requests/[id] — stale-assignment guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSwapGet.mockReturnValue(directedSwap);
    mockGenericGet.mockReturnValue(undefined);
  });

  it("returns 422 when the requesting assignment was cancelled (e.g. by leave approval)", async () => {
    mockAssignmentGet
      .mockReturnValueOnce({ id: "assign-req", shiftId: "shift-1", status: "cancelled", isChargeNurse: false })
      .mockReturnValueOnce({ id: "assign-tgt", shiftId: "shift-2", status: "assigned", isChargeNurse: false });
    const res = await PUT(makeRequest({ status: "approved" }), { params: makeParams() });
    expect((res as { status: number }).status).toBe(422);
    expect(mockUpdateRun).not.toHaveBeenCalled();
  });

  it("returns 422 when the target assignment was called out", async () => {
    mockAssignmentGet
      .mockReturnValueOnce({ id: "assign-req", shiftId: "shift-1", status: "assigned", isChargeNurse: false })
      .mockReturnValueOnce({ id: "assign-tgt", shiftId: "shift-2", status: "called_out", isChargeNurse: false });
    const res = await PUT(makeRequest({ status: "approved" }), { params: makeParams() });
    expect((res as { status: number }).status).toBe(422);
    expect(mockUpdateRun).not.toHaveBeenCalled();
  });

  it("explains that the assignment is no longer active", async () => {
    mockAssignmentGet
      .mockReturnValueOnce({ id: "assign-req", shiftId: "shift-1", status: "cancelled", isChargeNurse: false })
      .mockReturnValueOnce({ id: "assign-tgt", shiftId: "shift-2", status: "assigned", isChargeNurse: false });
    const res = (await PUT(makeRequest({ status: "approved" }), { params: makeParams() })) as {
      _data: { error: string };
    };
    expect(res._data.error).toMatch(/no longer active/i);
  });

  it("proceeds past the guard when both assignments are active", async () => {
    mockAssignmentGet
      .mockReturnValueOnce({ id: "assign-req", shiftId: "shift-1", status: "assigned", isChargeNurse: false })
      .mockReturnValueOnce({ id: "assign-tgt", shiftId: "shift-2", status: "assigned", isChargeNurse: false });
    const res = (await PUT(makeRequest({ status: "approved" }), { params: makeParams() })) as {
      _data: { error?: string };
      status: number;
    };
    // Downstream mocks return undefined staff records, so the route exits with
    // its 400 "Cannot validate swap" — what matters is the guard didn't fire.
    expect(res._data.error ?? "").not.toMatch(/no longer active/i);
  });
});
