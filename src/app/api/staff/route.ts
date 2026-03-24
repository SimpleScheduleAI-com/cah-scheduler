import { db } from "@/db";
import { staff, staffPreferences, exceptionLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const allStaff = db
    .select()
    .from(staff)
    .orderBy(staff.lastName, staff.firstName)
    .all();

  return NextResponse.json(allStaff);
}

export async function POST(request: Request) {
  const body = await request.json();

  const newStaff = db
    .insert(staff)
    .values({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email || null,
      phone: body.phone || null,
      role: body.role,
      employmentType: body.employmentType,
      fte: body.fte ?? 1.0,
      hireDate: body.hireDate,
      icuCompetencyLevel: body.icuCompetencyLevel ?? 1,
      isChargeNurseQualified: body.isChargeNurseQualified ?? false,
      certifications: body.certifications ?? [],
      reliabilityRating: body.reliabilityRating ?? 3,
      homeUnit: body.homeUnit || null,
      crossTrainedUnits: body.crossTrainedUnits ?? [],
      weekendExempt: body.weekendExempt ?? false,
      flexHoursYearToDate: body.flexHoursYearToDate ?? 0,
      voluntaryFlexAvailable: body.voluntaryFlexAvailable ?? false,
      notes: body.notes || null,
    })
    .returning()
    .get();

  // Create default preferences
  db.insert(staffPreferences)
    .values({
      staffId: newStaff.id,
    })
    .run();

  db.insert(exceptionLog).values({
    entityType: "staff",
    entityId: newStaff.id,
    action: "created",
    description: `Staff member created: ${newStaff.firstName} ${newStaff.lastName} (${newStaff.role}, ${newStaff.employmentType})`,
    newState: { role: newStaff.role, employmentType: newStaff.employmentType, fte: newStaff.fte },
    performedBy: "nurse_manager",
  }).run();

  return NextResponse.json(newStaff, { status: 201 });
}
