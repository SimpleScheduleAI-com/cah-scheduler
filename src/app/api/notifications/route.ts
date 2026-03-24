import { db } from "@/db";
import { staffLeave, openShift, callout, shiftSwapRequest, staff, prnAvailability } from "@/db/schema";
import { eq, or, count, and } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const pendingLeave = db
    .select({ count: count() })
    .from(staffLeave)
    .where(eq(staffLeave.status, "pending"))
    .get();

  const pendingOpenShifts = db
    .select({ count: count() })
    .from(openShift)
    .where(or(eq(openShift.status, "pending_approval"), eq(openShift.status, "no_candidates")))
    .get();

  const openCallouts = db
    .select({ count: count() })
    .from(callout)
    .where(eq(callout.status, "open"))
    .get();

  const pendingSwaps = db
    .select({ count: count() })
    .from(shiftSwapRequest)
    .where(eq(shiftSwapRequest.status, "pending"))
    .get();

  const prnStaff = db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.isActive, true), eq(staff.employmentType, "per_diem")))
    .all();

  const submittedPrnIds = new Set(
    db.select({ staffId: prnAvailability.staffId }).from(prnAvailability).all().map((r) => r.staffId)
  );
  const prnMissingCount = prnStaff.filter((s) => !submittedPrnIds.has(s.id)).length;

  return NextResponse.json({
    pendingLeaveCount: pendingLeave?.count ?? 0,
    openShiftsCount: pendingOpenShifts?.count ?? 0,
    openCallouts: openCallouts?.count ?? 0,
    pendingSwapsCount: pendingSwaps?.count ?? 0,
    prnMissingCount,
  });
}
