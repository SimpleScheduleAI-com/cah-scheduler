import { db } from "@/db";
import { staffLeave, staff } from "@/db/schema";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/logger";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");
  const status = searchParams.get("status");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const conditions = [];

  if (staffId) {
    conditions.push(eq(staffLeave.staffId, staffId));
  }
  if (status) {
    conditions.push(
      eq(staffLeave.status, status as "pending" | "approved" | "denied")
    );
  }
  if (startDate && endDate) {
    // Find leaves that overlap with the given date range
    conditions.push(
      or(
        and(gte(staffLeave.startDate, startDate), lte(staffLeave.startDate, endDate)),
        and(gte(staffLeave.endDate, startDate), lte(staffLeave.endDate, endDate)),
        and(lte(staffLeave.startDate, startDate), gte(staffLeave.endDate, endDate))
      )
    );
  }

  const query = db
    .select({
      id: staffLeave.id,
      staffId: staffLeave.staffId,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      leaveType: staffLeave.leaveType,
      startDate: staffLeave.startDate,
      endDate: staffLeave.endDate,
      status: staffLeave.status,
      notes: staffLeave.notes,
      reason: staffLeave.reason,
      submittedAt: staffLeave.submittedAt,
      approvedAt: staffLeave.approvedAt,
      approvedBy: staffLeave.approvedBy,
      denialReason: staffLeave.denialReason,
      createdAt: staffLeave.createdAt,
    })
    .from(staffLeave)
    .leftJoin(staff, eq(staffLeave.staffId, staff.id))
    .orderBy(staffLeave.startDate);

  if (conditions.length > 0) {
    const results = query.where(and(...conditions)).all();
    return NextResponse.json(results);
  }

  return NextResponse.json(query.all());
}

export async function POST(request: Request) {
  const body = await request.json();

  const newLeave = db
    .insert(staffLeave)
    .values({
      staffId: body.staffId,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status ?? "pending",
      notes: body.notes || null,
      reason: body.reason || null,
    })
    .returning()
    .get();

  const staffRecord = db.select({ firstName: staff.firstName, lastName: staff.lastName })
    .from(staff).where(eq(staff.id, body.staffId)).get();
  const staffName = staffRecord
    ? `${staffRecord.firstName} ${staffRecord.lastName}`
    : body.staffId;

  const reasonSuffix = body.reason ? ` — Reason: ${body.reason}` : "";
  logAuditEvent({
    entityType: "leave",
    entityId: newLeave.id,
    action: "leave_requested",
    description: `Leave requested for ${staffName}: ${body.leaveType} from ${body.startDate} to ${body.endDate}${reasonSuffix}`,
    newState: newLeave as unknown as Record<string, unknown>,
    justification: body.notes || undefined,
  });

  return NextResponse.json(newLeave, { status: 201 });
}
