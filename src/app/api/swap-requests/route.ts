import { db } from "@/db";
import { shiftSwapRequest, staff, assignment, shift, exceptionLog } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");
  const status = searchParams.get("status");

  // Get all requests
  const allRequests = db.select().from(shiftSwapRequest).all();

  // Enrich with staff and assignment details
  const enriched = allRequests.map((req) => {
    const requestor = db
      .select()
      .from(staff)
      .where(eq(staff.id, req.requestingStaffId))
      .get();
    const target = req.targetStaffId
      ? db.select().from(staff).where(eq(staff.id, req.targetStaffId)).get()
      : null;
    const requestorAssignment = db
      .select()
      .from(assignment)
      .where(eq(assignment.id, req.requestingAssignmentId))
      .get();
    const targetAssignment = req.targetAssignmentId
      ? db
          .select()
          .from(assignment)
          .where(eq(assignment.id, req.targetAssignmentId))
          .get()
      : null;

    // Get shift dates
    const requestorShift = requestorAssignment
      ? db.select().from(shift).where(eq(shift.id, requestorAssignment.shiftId)).get()
      : null;
    const targetShift = targetAssignment
      ? db.select().from(shift).where(eq(shift.id, targetAssignment.shiftId)).get()
      : null;

    return {
      ...req,
      requestor: requestor
        ? { firstName: requestor.firstName, lastName: requestor.lastName }
        : null,
      target: target
        ? { firstName: target.firstName, lastName: target.lastName }
        : null,
      requestorShiftDate: requestorShift?.date || null,
      targetShiftDate: targetShift?.date || null,
    };
  });

  // Apply filters
  let filtered = enriched;
  if (staffId) {
    filtered = filtered.filter(
      (r) => r.requestingStaffId === staffId || r.targetStaffId === staffId
    );
  }
  if (status) {
    filtered = filtered.filter((r) => r.status === status);
  }

  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const body = await request.json();

  const newRequest = db
    .insert(shiftSwapRequest)
    .values({
      requestingAssignmentId: body.requestingAssignmentId,
      requestingStaffId: body.requestingStaffId,
      targetAssignmentId: body.targetAssignmentId || null,
      targetStaffId: body.targetStaffId || null,
      status: "pending",
      notes: body.notes || null,
    })
    .returning()
    .get();

  // Audit log: swap requested
  const reqStaff = db.select({ firstName: staff.firstName, lastName: staff.lastName })
    .from(staff).where(eq(staff.id, body.requestingStaffId)).get();
  const reqAssn = db.select({ shiftId: assignment.shiftId })
    .from(assignment).where(eq(assignment.id, body.requestingAssignmentId)).get();
  const reqShift = reqAssn
    ? db.select({ date: shift.date }).from(shift).where(eq(shift.id, reqAssn.shiftId)).get()
    : null;
  const tgtStaff = body.targetStaffId
    ? db.select({ firstName: staff.firstName, lastName: staff.lastName })
        .from(staff).where(eq(staff.id, body.targetStaffId)).get()
    : null;
  const tgtAssn = body.targetAssignmentId
    ? db.select({ shiftId: assignment.shiftId })
        .from(assignment).where(eq(assignment.id, body.targetAssignmentId)).get()
    : null;
  const tgtShift = tgtAssn
    ? db.select({ date: shift.date }).from(shift).where(eq(shift.id, tgtAssn.shiftId)).get()
    : null;

  const reqName = reqStaff ? `${reqStaff.firstName} ${reqStaff.lastName}` : body.requestingStaffId;
  const tgtName = tgtStaff ? `${tgtStaff.firstName} ${tgtStaff.lastName}` : null;
  db.insert(exceptionLog).values({
    entityType: "swap_request",
    entityId: newRequest.id,
    action: "swap_requested",
    description: tgtName
      ? `Shift swap requested by ${reqName} (${reqShift?.date ?? "?"}) ↔ ${tgtName} (${tgtShift?.date ?? "?"})`
      : `Open shift swap requested by ${reqName} (${reqShift?.date ?? "?"})`,
    newState: {
      requestingAssignmentId: body.requestingAssignmentId,
      targetAssignmentId: body.targetAssignmentId ?? null,
      notes: body.notes ?? null,
    },
    performedBy: "nurse_manager",
  }).run();

  return NextResponse.json(newRequest, { status: 201 });
}
