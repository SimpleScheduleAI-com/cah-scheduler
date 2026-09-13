/**
 * Unit tests for the pure notification composers in
 * src/lib/notifications/notify.ts. These build the title/body/href for each
 * event — the wording is what tends to regress, so it is worth pinning.
 * The composers import nothing and touch no DB.
 */
import { describe, it, expect, vi } from "vitest";
import {
  composeSchedulePublished,
  composeSwapRequested,
  composeSwapResponse,
  composeSwapDecided,
  composeLeaveDecided,
  composeCalloutPosted,
  composeAssignmentAmended,
  insertNotification,
} from "@/lib/notifications/notify";

describe("composeSchedulePublished", () => {
  it("targets the staffId with schedule name + date range and href /my", () => {
    const d = composeSchedulePublished({
      staffId: "staff-1",
      scheduleName: "March 2026",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(d.staffId).toBe("staff-1");
    expect(d.type).toBe("schedule_published");
    expect(d.title).toBe("New schedule published");
    expect(d.body).toBe("March 2026: 2026-03-01 – 2026-03-31");
    expect(d.href).toBe("/my");
  });
});

describe("composeSwapRequested", () => {
  it("names the requester and shows both shift dates, href /my/swaps", () => {
    const d = composeSwapRequested({
      targetStaffId: "target-1",
      requesterName: "Maria Garcia",
      requesterShiftDate: "2026-03-10",
      targetShiftDate: "2026-03-12",
    });
    expect(d.staffId).toBe("target-1");
    expect(d.type).toBe("swap_requested");
    expect(d.title).toBe("Swap request from Maria Garcia");
    expect(d.body).toBe("2026-03-10 ↔ 2026-03-12");
    expect(d.href).toBe("/my/swaps");
  });

  it("falls back to friendly text when a shift date is missing", () => {
    const d = composeSwapRequested({
      targetStaffId: "target-1",
      requesterName: "Maria Garcia",
      requesterShiftDate: null,
      targetShiftDate: null,
    });
    expect(d.body).toBe("their shift ↔ your shift");
  });
});

describe("composeSwapResponse", () => {
  it("accept notifies the requester with awaiting-manager wording", () => {
    const d = composeSwapResponse({
      requestingStaffId: "req-1",
      targetName: "Maria Garcia",
      action: "accept",
    });
    expect(d.staffId).toBe("req-1");
    expect(d.type).toBe("swap_response");
    expect(d.title).toBe("Maria Garcia accepted your swap");
    expect(d.body).toContain("awaiting manager approval");
    expect(d.href).toBe("/my/swaps");
  });

  it("decline notifies the requester", () => {
    const d = composeSwapResponse({
      requestingStaffId: "req-1",
      targetName: "Maria Garcia",
      action: "decline",
    });
    expect(d.title).toBe("Maria Garcia declined your swap");
    expect(d.body).toContain("declined");
  });
});

describe("composeSwapDecided", () => {
  it("approved outcome", () => {
    const d = composeSwapDecided({ staffId: "s1", outcome: "approved" });
    expect(d.type).toBe("swap_decided");
    expect(d.title).toBe("Swap approved");
    expect(d.href).toBe("/my/swaps");
  });

  it("denied outcome", () => {
    const d = composeSwapDecided({ staffId: "s1", outcome: "denied" });
    expect(d.title).toBe("Swap denied");
  });
});

describe("composeLeaveDecided", () => {
  it("approved leave shows the date range and href /my/leave", () => {
    const d = composeLeaveDecided({
      staffId: "s1",
      outcome: "approved",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
    });
    expect(d.type).toBe("leave_decided");
    expect(d.title).toBe("Leave approved");
    expect(d.body).toBe("2026-04-01 – 2026-04-05");
    expect(d.href).toBe("/my/leave");
  });

  it("denied leave", () => {
    const d = composeLeaveDecided({
      staffId: "s1",
      outcome: "denied",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
    });
    expect(d.title).toBe("Leave denied");
  });
});

describe("insertNotification", () => {
  it("passes the draft fields through to db.insert(table).values(row).run()", () => {
    const run = vi.fn();
    const values = vi.fn(() => ({ run }));
    const insert = vi.fn(() => ({ values }));
    const fakeDb = { insert };
    const table = { __table: "notification" };

    insertNotification(fakeDb, table, {
      staffId: "s1",
      type: "swap_decided",
      title: "Swap approved",
      body: "b",
      href: "/my/swaps",
    });

    expect(insert).toHaveBeenCalledWith(table);
    expect(values).toHaveBeenCalledWith({
      staffId: "s1",
      type: "swap_decided",
      title: "Swap approved",
      body: "b",
      href: "/my/swaps",
    });
    expect(run).toHaveBeenCalledOnce();
  });
});

describe("composeCalloutPosted", () => {
  it("is an urgent notice pointing the nurse at the manager (no board row to raise a hand on)", () => {
    const d = composeCalloutPosted({
      staffId: "staff-9",
      date: "2026-09-17",
      shiftLabel: "Night",
      unit: "ICU",
      daysUntilShift: 4,
    });
    expect(d.staffId).toBe("staff-9");
    expect(d.type).toBe("callout_posted");
    expect(d.title).toBe("Urgent: shift needs coverage");
    expect(d.body).toContain("Night on 2026-09-17 (ICU)");
    expect(d.body).toContain("in 4 days");
    expect(d.body).toContain("Tell your manager");
    expect(d.href).toBe("/my");
  });

  it("says 'tomorrow' for a one-day-out shift", () => {
    const d = composeCalloutPosted({
      staffId: "s",
      date: "2026-09-14",
      shiftLabel: "Day",
      unit: "ER",
      daysUntilShift: 1,
    });
    expect(d.body).toContain("is tomorrow");
    expect(d.body).not.toContain("in 1 days");
  });
});

describe("composeAssignmentAmended", () => {
  it("added: names the shift, unit and the manager's reason", () => {
    const d = composeAssignmentAmended({
      staffId: "staff-2",
      change: "added",
      date: "2026-09-20",
      shiftLabel: "Day",
      unit: "ICU",
      reason: "Covering approved leave",
    });
    expect(d.type).toBe("assignment_amended");
    expect(d.title).toBe("You were added to a published shift");
    expect(d.body).toBe(
      "Day on 2026-09-20 (ICU). Reason: Covering approved leave",
    );
    expect(d.href).toBe("/my");
  });

  it("removed: distinct title, same body shape", () => {
    const d = composeAssignmentAmended({
      staffId: "staff-2",
      change: "removed",
      date: "2026-09-20",
      shiftLabel: "Night",
      unit: "ICU",
      reason: "Low census",
    });
    expect(d.title).toBe("You were removed from a published shift");
    expect(d.body).toBe("Night on 2026-09-20 (ICU). Reason: Low census");
  });
});
