import { db } from "@/db";
import { staffLeave, openShift, callout, shiftSwapRequest } from "@/db/schema";
import { eq, or, count } from "drizzle-orm";
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

  return NextResponse.json({
    pendingLeaveCount: pendingLeave?.count ?? 0,
    openShiftsCount: pendingOpenShifts?.count ?? 0,
    openCallouts: openCallouts?.count ?? 0,
    pendingSwapsCount: pendingSwaps?.count ?? 0,
  });
}
