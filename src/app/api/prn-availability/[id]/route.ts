import { db } from "@/db";
import { prnAvailability, assignment, shift } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit/logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const availability = db
    .select()
    .from(prnAvailability)
    .where(eq(prnAvailability.id, id))
    .get();

  if (!availability) {
    return NextResponse.json(
      { error: "PRN availability not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(availability);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updated = db
    .update(prnAvailability)
    .set({
      availableDates: body.availableDates,
      notes: body.notes,
      submittedAt: new Date().toISOString(),
    })
    .where(eq(prnAvailability.id, id))
    .returning()
    .get();

  if (!updated) {
    return NextResponse.json(
      { error: "PRN availability not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = db
    .select()
    .from(prnAvailability)
    .where(eq(prnAvailability.id, id))
    .get();
  if (!existing) {
    return NextResponse.json({ error: "PRN availability not found" }, { status: 404 });
  }

  // Block deletion while the PRN nurse has active assignments on the submitted
  // dates: the "PRN staff can only work submitted dates" hard rule would flag
  // those assignments as violations, and the nurse would silently disappear
  // from coverage candidate lists for the rest of the period.
  const dates = new Set(existing.availableDates ?? []);
  if (dates.size > 0) {
    const activeOnDates = db
      .select({ id: assignment.id, date: shift.date })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(
        and(
          eq(assignment.staffId, existing.staffId),
          ne(assignment.status, "cancelled"),
          ne(assignment.status, "called_out")
        )
      )
      .all()
      .filter((a) => dates.has(a.date));

    if (activeOnDates.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: the staff member has ${activeOnDates.length} active assignment(s) on submitted dates (first: ${activeOnDates[0].date}). Remove or reassign those first.`,
        },
        { status: 409 }
      );
    }
  }

  db.delete(prnAvailability).where(eq(prnAvailability.id, id)).run();

  logAuditEvent({
    entityType: "prn_availability",
    entityId: id,
    action: "deleted",
    description: `PRN availability deleted for staff ${existing.staffId} (${existing.availableDates?.length ?? 0} dates)`,
    previousState: existing as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ success: true });
}
