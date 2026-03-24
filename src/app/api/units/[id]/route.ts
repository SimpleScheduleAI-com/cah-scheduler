import { db } from "@/db";
import { unit } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const unitConfig = db.select().from(unit).where(eq(unit.id, id)).get();

  if (!unitConfig) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  return NextResponse.json(unitConfig);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updated = db
    .update(unit)
    .set({
      name: body.name,
      description: body.description,
      weekendRuleType: body.weekendRuleType,
      weekendShiftsRequired: body.weekendShiftsRequired,
      schedulePeriodWeeks: body.schedulePeriodWeeks,
      holidayShiftsRequired: body.holidayShiftsRequired,
      escalationSequence: body.escalationSequence,
      acuityYellowExtraStaff: body.acuityYellowExtraStaff,
      acuityRedExtraStaff: body.acuityRedExtraStaff,
      lowCensusOrder: body.lowCensusOrder,
      otApprovalThreshold: body.otApprovalThreshold,
      maxOnCallPerWeek: body.maxOnCallPerWeek,
      maxOnCallWeekendsPerMonth: body.maxOnCallWeekendsPerMonth,
      maxConsecutiveWeekends: body.maxConsecutiveWeekends,
      minStaffDay: body.minStaffDay,
      minStaffNight: body.minStaffNight,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(unit.id, id))
    .returning()
    .get();

  if (!updated) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  db.delete(unit).where(eq(unit.id, id)).run();
  return NextResponse.json({ success: true });
}
