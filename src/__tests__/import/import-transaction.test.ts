/**
 * Tests for POST /api/import — atomic replace.
 *
 * Business rule: the import is a destructive full-replace (deleteAllData then
 * importData). If any insert fails partway, the delete must be rolled back —
 * otherwise a malformed spreadsheet leaves the hospital with an EMPTY
 * database (schedules, staff, audit history all gone).
 *
 * The delete and all inserts must therefore run inside a single
 * db.transaction() call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted state ───────────────────────────────────────────────────────────

const txState = vi.hoisted(() => ({
  inTransaction: false,
  transactionCalls: 0,
  deleteRunsInTx: [] as boolean[],
  insertRunsInTx: [] as boolean[],
}));

vi.mock("next/server", () => ({
  NextResponse: Object.assign(
    function (this: unknown) {},
    {
      json: (data: unknown, init?: { status?: number }) => ({
        _data: data,
        status: init?.status ?? 200,
        json: async () => data,
      }),
    }
  ),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
}));

vi.mock("@/db/schema", () => {
  const t = (name: string) => ({ _table: name, id: `${name}$id` });
  return {
    exceptionLog: t("exceptionLog"),
    scenario: t("scenario"),
    callout: t("callout"),
    shiftSwapRequest: t("shiftSwapRequest"),
    openShift: t("openShift"),
    assignment: t("assignment"),
    staffHolidayAssignment: t("staffHolidayAssignment"),
    prnAvailability: t("prnAvailability"),
    staffLeave: t("staffLeave"),
    shift: t("shift"),
    shiftDefinition: t("shiftDefinition"),
    schedule: t("schedule"),
    staffPreferences: t("staffPreferences"),
    staff: t("staff"),
    censusBand: t("censusBand"),
    rule: t("rule"),
    publicHoliday: t("publicHoliday"),
    unit: t("unit"),
    generationJob: t("generationJob"),
  };
});

vi.mock("@/db", () => {
  const recordDelete = () => txState.deleteRunsInTx.push(txState.inTransaction);
  const recordInsert = () => txState.insertRunsInTx.push(txState.inTransaction);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    where: () => chain,
    all: () => [],
    get: () => undefined,
    innerJoin: () => chain,
  };
  const dbMock = {
    select: () => ({ from: () => chain }),
    delete: () => ({ run: recordDelete, where: () => ({ run: recordDelete }) }),
    insert: () => ({
      values: () => ({
        run: recordInsert,
        returning: () => ({
          get: () => {
            recordInsert();
            return { id: "new-id" };
          },
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ run: vi.fn() }) }) }),
    transaction: (fn: (tx: unknown) => unknown) => {
      txState.transactionCalls += 1;
      txState.inTransaction = true;
      try {
        return fn(dbMock);
      } finally {
        txState.inTransaction = false;
      }
    },
  };
  return { db: dbMock };
});

vi.mock("@/lib/import/parse-excel", () => ({
  parseExcelFile: vi.fn(() => ({
    staff: [],
    units: [
      {
        name: "ICU",
        description: "Intensive care",
        weekendShiftsRequired: 3,
        holidayShiftsRequired: 1,
        minStaffDay: 3,
        minStaffNight: 2,
      },
    ],
    holidays: [],
    censusBands: [],
    leaves: [],
    prnSubmissions: [],
    errors: [],
    warnings: [],
  })),
  generateTemplate: vi.fn(() => new ArrayBuffer(0)),
}));

// ─── Import SUT after mocks ──────────────────────────────────────────────────

import { POST } from "@/app/api/import/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeImportRequest(): Request {
  const form = new FormData();
  const file = new File([new Uint8Array([0x50, 0x4b])], "data.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  form.append("file", file);
  return new Request("http://localhost/api/import", { method: "POST", body: form });
}

describe("POST /api/import — atomic replace", () => {
  beforeEach(() => {
    txState.inTransaction = false;
    txState.transactionCalls = 0;
    txState.deleteRunsInTx = [];
    txState.insertRunsInTx = [];
  });

  it("wraps the destructive replace in a single transaction", async () => {
    const res = (await POST(makeImportRequest())) as { status: number; _data: unknown };
    expect(res.status).toBe(200);
    expect(txState.transactionCalls).toBe(1);
  });

  it("runs every delete inside the transaction", async () => {
    await POST(makeImportRequest());
    expect(txState.deleteRunsInTx.length).toBeGreaterThan(0);
    expect(txState.deleteRunsInTx.every(Boolean)).toBe(true);
  });

  it("runs every insert inside the transaction", async () => {
    await POST(makeImportRequest());
    expect(txState.insertRunsInTx.length).toBeGreaterThan(0);
    expect(txState.insertRunsInTx.every(Boolean)).toBe(true);
  });
});
