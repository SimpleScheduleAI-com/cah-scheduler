import { db } from "@/db";
import { unit, staff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const allUnits = db.select().from(unit).orderBy(unit.name).all();

  // Count active staff per unit by homeUnit name (homeUnit is a text field, not a FK)
  const activeStaff = db
    .select({ homeUnit: staff.homeUnit })
    .from(staff)
    .where(eq(staff.isActive, true))
    .all();

  const staffCountByUnit: Record<string, number> = {};
  for (const s of activeStaff) {
    if (s.homeUnit) {
      staffCountByUnit[s.homeUnit] = (staffCountByUnit[s.homeUnit] ?? 0) + 1;
    }
  }

  return NextResponse.json(
    allUnits.map((u) => ({ ...u, staffCount: staffCountByUnit[u.name] ?? 0 }))
  );
}

export async function POST(request: Request) {
  const body = await request.json();

  const newUnit = db
    .insert(unit)
    .values({
      name: body.name,
      description: body.description || null,
      weekendRuleType: body.weekendRuleType ?? "count_per_period",
      weekendShiftsRequired: body.weekendShiftsRequired ?? 3,
      schedulePeriodWeeks: body.schedulePeriodWeeks ?? 6,
      holidayShiftsRequired: body.holidayShiftsRequired ?? 1,
      escalationSequence: body.escalationSequence ?? [
        "float",
        "per_diem",
        "overtime",
        "agency",
      ],
      acuityYellowExtraStaff: body.acuityYellowExtraStaff ?? 1,
      acuityRedExtraStaff: body.acuityRedExtraStaff ?? 2,
      lowCensusOrder: body.lowCensusOrder ?? [
        "agency",
        "overtime",
        "per_diem",
        "full_time",
      ],
      otApprovalThreshold: body.otApprovalThreshold ?? 4,
      maxOnCallPerWeek: body.maxOnCallPerWeek ?? 1,
      maxOnCallWeekendsPerMonth: body.maxOnCallWeekendsPerMonth ?? 1,
      maxConsecutiveWeekends: body.maxConsecutiveWeekends ?? 2,
      minStaffDay: body.minStaffDay ?? 3,
      minStaffNight: body.minStaffNight ?? 2,
    })
    .returning()
    .get();

  return NextResponse.json(newUnit, { status: 201 });
}
