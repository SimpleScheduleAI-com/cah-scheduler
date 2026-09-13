import { db } from "@/db";
import {
  schedule,
  shift,
  shiftDefinition,
  assignment,
  staff,
  censusBand,
  exceptionLog,
  unit,
  notification,
} from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  insertNotification,
  composeSchedulePublished,
} from "@/lib/notifications/notify";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sched = db.select().from(schedule).where(eq(schedule.id, id)).get();
  if (!sched) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  // Get all shifts with their definitions
  const shifts = db
    .select({
      id: shift.id,
      date: shift.date,
      shiftDefinitionId: shift.shiftDefinitionId,
      requiredStaffCount: shift.requiredStaffCount,
      requiresChargeNurse: shift.requiresChargeNurse,
      actualCensus: shift.actualCensus,
      censusBandId: shift.censusBandId,
      acuityLevel: shift.acuityLevel,
      acuityExtraStaff: shift.acuityExtraStaff,
      sitterCount: shift.sitterCount,
      notes: shift.notes,
      defName: shiftDefinition.name,
      defShiftType: shiftDefinition.shiftType,
      defStartTime: shiftDefinition.startTime,
      defEndTime: shiftDefinition.endTime,
      defDurationHours: shiftDefinition.durationHours,
      defRequiredStaff: shiftDefinition.requiredStaffCount,
      defRequiresCharge: shiftDefinition.requiresChargeNurse,
      defCountsTowardStaffing: shiftDefinition.countsTowardStaffing,
      defUnit: shiftDefinition.unit,
    })
    .from(shift)
    .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
    .where(eq(shift.scheduleId, id))
    .orderBy(shift.date, shiftDefinition.shiftType)
    .all();

  // Get all assignments for this schedule
  const assignments = db
    .select({
      id: assignment.id,
      shiftId: assignment.shiftId,
      staffId: assignment.staffId,
      status: assignment.status,
      isChargeNurse: assignment.isChargeNurse,
      isOvertime: assignment.isOvertime,
      assignmentSource: assignment.assignmentSource,
      safeHarborInvoked: assignment.safeHarborInvoked,
      isFloat: assignment.isFloat,
      floatFromUnit: assignment.floatFromUnit,
      agencyReason: assignment.agencyReason,
      notes: assignment.notes,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      staffRole: staff.role,
      staffCompetency: staff.icuCompetencyLevel,
      staffHomeUnit: staff.homeUnit,
    })
    .from(assignment)
    .innerJoin(staff, eq(assignment.staffId, staff.id))
    .where(eq(assignment.scheduleId, id))
    .all();

  // Group assignments by shift; exclude called-out nurses from the grid
  const assignmentsByShift = new Map<string, typeof assignments>();
  for (const a of assignments) {
    if (a.status === "called_out") continue;
    const list = assignmentsByShift.get(a.shiftId) ?? [];
    list.push(a);
    assignmentsByShift.set(a.shiftId, list);
  }

  // Get census bands for calculating effective required count
  const censusBands = db
    .select()
    .from(censusBand)
    .where(eq(censusBand.isActive, true))
    .all();

  // Get unit minimums — the absolute floor regardless of census level
  const schedUnit = db
    .select({
      minStaffDay: unit.minStaffDay,
      minStaffNight: unit.minStaffNight,
    })
    .from(unit)
    .where(eq(unit.name, sched.unit))
    .get();
  const unitMinDay = schedUnit?.minStaffDay ?? 3;
  const unitMinNight = schedUnit?.minStaffNight ?? 2;

  // Helper to calculate effective required staff based on census tier or patient count,
  // then applies the unit's absolute staffing floor: effectiveRequired = max(censusRequired, unitMin).
  // Priority 1: censusBandId direct lookup — census band sets the census-based count.
  // Priority 2: acuityLevel + unit fallback — handles stale censusBandId (e.g. after DB re-seed).
  // Priority 3: actualCensus (legacy numeric patient count path).
  // Floor: unit.minStaffDay (day shifts) or unit.minStaffNight (night/evening). on_call excluded.
  function getEffectiveRequired(
    censusBandId: string | null,
    acuityLevel: string | null,
    unitName: string | null,
    actualCensus: number | null,
    baseRequired: number,
    shiftType: string,
  ): number {
    let censusRequired: number;

    if (censusBandId) {
      const band = censusBands.find((b) => b.id === censusBandId);
      if (band) {
        censusRequired = band.requiredRNs + band.requiredCNAs;
      } else {
        censusRequired = baseRequired;
      }
    } else if (acuityLevel && unitName) {
      const band = censusBands.find(
        (b) => b.color === acuityLevel && b.unit === unitName,
      );
      if (band) {
        censusRequired = band.requiredRNs + band.requiredCNAs;
      } else {
        censusRequired = baseRequired;
      }
    } else if (actualCensus !== null) {
      const band = censusBands.find(
        (b) => actualCensus >= b.minPatients && actualCensus <= b.maxPatients,
      );
      censusRequired = band
        ? Math.max(band.requiredRNs + band.requiredCNAs, baseRequired)
        : baseRequired;
    } else {
      censusRequired = baseRequired;
    }

    // On-call shifts never use census-band staffing — return their base count (typically 1)
    if (shiftType === "on_call") return baseRequired;
    const unitMin = shiftType === "day" ? unitMinDay : unitMinNight;
    return Math.max(censusRequired, unitMin);
  }

  // Build response
  const shiftsWithAssignments = shifts.map((s) => {
    const baseRequired = s.requiredStaffCount ?? s.defRequiredStaff;
    const effectiveRequired = getEffectiveRequired(
      s.censusBandId,
      s.acuityLevel,
      s.defUnit,
      s.actualCensus,
      baseRequired,
      s.defShiftType,
    );

    return {
      id: s.id,
      date: s.date,
      shiftDefinitionId: s.shiftDefinitionId,
      shiftType: s.defShiftType,
      name: s.defName,
      startTime: s.defStartTime,
      endTime: s.defEndTime,
      durationHours: s.defDurationHours,
      requiredStaffCount: effectiveRequired,
      baseRequiredStaffCount: baseRequired,
      requiresChargeNurse: s.requiresChargeNurse ?? s.defRequiresCharge,
      countsTowardStaffing: s.defCountsTowardStaffing,
      actualCensus: s.actualCensus,
      acuityLevel: s.acuityLevel,
      acuityExtraStaff: s.acuityExtraStaff,
      sitterCount: s.sitterCount,
      notes: s.notes,
      assignments: assignmentsByShift.get(s.id) ?? [],
    };
  });

  // How many hand changes were made after publish — drives the "Amended" badge.
  const amendmentCount = db
    .select({ id: exceptionLog.id })
    .from(exceptionLog)
    .where(
      and(
        eq(exceptionLog.entityType, "schedule"),
        eq(exceptionLog.entityId, id),
        eq(exceptionLog.action, "post_publish_amendment"),
      ),
    )
    .all().length;

  return NextResponse.json({
    ...sched,
    amendmentCount,
    shifts: shiftsWithAssignments,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db.select().from(schedule).where(eq(schedule.id, id)).get();

  // Publishing an empty schedule is always a mistake: nurses would see a blank
  // period, and everything downstream that reads "the published schedule"
  // (swaps, callouts, practice mode) starves. The compliance gate can't catch
  // it — an empty schedule has no violations — so guard the transition here.
  if (body.status === "published" && existing?.status !== "published") {
    const hasAssignments = db
      .select({ id: assignment.id })
      .from(assignment)
      .where(eq(assignment.scheduleId, id))
      .all().length;
    if (hasAssignments === 0) {
      return NextResponse.json(
        {
          error:
            "This schedule has no staff assignments yet. Generate drafts and apply one before publishing.",
        },
        { status: 422 },
      );
    }
  }

  // Unpublishing withdraws the version of record from every nurse. It is the
  // wholesale-rework path (a one-person change is an amendment instead), so
  // it must be explained: the reason lands in the audit trail.
  const isUnpublish =
    existing?.status === "published" && body.status === "draft";
  const unpublishReason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  if (isUnpublish && unpublishReason.length === 0) {
    return NextResponse.json(
      {
        error:
          "Give a reason for unpublishing — nurses have already seen this schedule, and the reason is recorded in the audit trail.",
      },
      { status: 400 },
    );
  }

  const updated = db
    .update(schedule)
    .set({
      name: body.name,
      status: body.status,
      notes: body.notes,
      updatedAt: new Date().toISOString(),
      publishedAt:
        body.status === "published" ? new Date().toISOString() : undefined,
    })
    .where(eq(schedule.id, id))
    .returning()
    .get();

  if (updated) {
    const scheduleAction = isUnpublish
      ? "unpublished"
      : body.status === "published"
        ? "published"
        : body.status === "archived"
          ? "archived"
          : "updated";
    db.insert(exceptionLog)
      .values({
        entityType: "schedule",
        entityId: id,
        action: scheduleAction,
        description: isUnpublish
          ? `Schedule unpublished: ${updated.name} — ${unpublishReason}`
          : `Schedule ${scheduleAction}: ${updated.name}`,
        justification: isUnpublish ? unpublishReason : undefined,
        previousState: existing ? { status: existing.status } : undefined,
        newState: { status: updated.status },
        performedBy: "nurse_manager",
      })
      .run();

    // Phase 3 notifications: on a draft→published transition, tell every staff
    // member with a live assignment in this schedule. Best-effort — a notify
    // failure must never break the publish.
    if (
      existing &&
      existing.status !== "published" &&
      updated.status === "published"
    ) {
      try {
        const assignedStaff = db
          .select({ staffId: assignment.staffId })
          .from(assignment)
          .where(
            and(
              eq(assignment.scheduleId, id),
              ne(assignment.status, "cancelled"),
              ne(assignment.status, "called_out"),
            ),
          )
          .all();
        const distinctStaffIds = [
          ...new Set(assignedStaff.map((a) => a.staffId)),
        ];
        for (const sid of distinctStaffIds) {
          insertNotification(
            db,
            notification,
            composeSchedulePublished({
              staffId: sid,
              scheduleName: updated.name,
              startDate: updated.startDate,
              endDate: updated.endDate,
            }),
          );
        }
      } catch (err) {
        console.error("[notify] schedule_published failed", err);
      }
    }
  }

  return NextResponse.json(updated);
}
