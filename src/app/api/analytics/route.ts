import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  assignment,
  shift,
  schedule,
  staff,
  callout,
  staffHolidayAssignment,
  shiftDefinition,
  censusBand,
  scenario,
} from "@/db/schema";
import { sql, eq, and, desc, inArray, ne } from "drizzle-orm";
import { getEffectiveRequired } from "@/lib/analytics/effective-required";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const paramScheduleId = searchParams.get("scheduleId");

    // Resolve target schedule — use explicit ID if provided, otherwise most recent by start date
    const targetSchedule = paramScheduleId
      ? await db.select().from(schedule).where(eq(schedule.id, paramScheduleId)).limit(1).then(r => r[0] ?? null)
      : await db.select().from(schedule).where(ne(schedule.status, "archived")).orderBy(desc(schedule.startDate)).limit(1).then(r => r[0] ?? null);

    if (!targetSchedule) {
      return NextResponse.json({
        scheduleId: null,
        scheduleName: null,
        scheduleStartDate: null,
        scheduleEndDate: null,
        fillRateTrend: [],
        overtimeByStaff: [],
        calloutTrend: [],
        weekendDistribution: [],
        holidayBalance: [],
        costAnalysis: { overtime: 0, regular: 0, agency: 0 },
        staffWorkload: [],
        complianceMetrics: { hardViolations: 0, softViolations: 0, overtimeInstances: 0, unfilledShifts: 0 },
      });
    }

    const scheduleId = targetSchedule.id;

    // Schedule length in weeks (used for overtime threshold)
    const scheduleWeeks = Math.max(
      1,
      Math.round(
        (new Date(targetSchedule.endDate).getTime() - new Date(targetSchedule.startDate).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
      )
    );

    // Load census bands once (shared by fill rate + unfilled shift calculations)
    const bands = await db.select().from(censusBand).where(eq(censusBand.isActive, true));

    // ─── 1. Fill Rate Trend ───────────────────────────────────────────────────

    // Fetch all shifts with their definition info (unit + fallback required count)
    const shiftsWithData = await db
      .select({
        shiftId: shift.id,
        date: shift.date,
        requiredStaff: shift.requiredStaffCount,
        censusBandId: shift.censusBandId,
        acuityLevel: shift.acuityLevel,
        actualCensus: shift.actualCensus,
        defUnit: shiftDefinition.unit,
        defRequired: shiftDefinition.requiredStaffCount,
      })
      .from(shift)
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(eq(shift.scheduleId, scheduleId));

    // Load active assignment counts per shift (exclude cancelled + called_out)
    const shiftIds = shiftsWithData.map((s) => s.shiftId);
    const activeAssignments =
      shiftIds.length > 0
        ? await db
            .select({ shiftId: assignment.shiftId })
            .from(assignment)
            .where(
              and(
                inArray(assignment.shiftId, shiftIds),
                ne(assignment.status, "cancelled"),
                ne(assignment.status, "called_out")
              )
            )
        : [];

    const activeCountByShift = new Map<string, number>();
    for (const a of activeAssignments) {
      activeCountByShift.set(a.shiftId, (activeCountByShift.get(a.shiftId) ?? 0) + 1);
    }

    // Group by ISO week and calculate fill rate using census-band-derived required counts
    // Use Monday as week start (matching the assignment dialog and schedule grid display)
    const weeklyFillRate: { [key: string]: { total: number; filled: number } } = {};
    for (const s of shiftsWithData) {
      const date = new Date(s.date);
      const weekStart = new Date(date);
      const dow = date.getDay(); // 0=Sun
      weekStart.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekKey = weekStart.toISOString().split("T")[0];

      const base = s.requiredStaff ?? s.defRequired;
      const required = getEffectiveRequired(
        s.censusBandId, s.acuityLevel, s.defUnit, s.actualCensus, base, bands
      );

      if (!weeklyFillRate[weekKey]) weeklyFillRate[weekKey] = { total: 0, filled: 0 };
      weeklyFillRate[weekKey].total += required;
      weeklyFillRate[weekKey].filled += activeCountByShift.get(s.shiftId) ?? 0;
    }

    const fillRateTrend = Object.entries(weeklyFillRate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        label: new Date(week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: data.total > 0 ? Math.round((data.filled / data.total) * 100) : 0,
      }))
      .slice(0, 6);

    // ─── 2. Overtime by Staff (top 10) ────────────────────────────────────────

    const staffWithHours = await db
      .select({
        firstName: staff.firstName,
        lastName: staff.lastName,
        totalHours: sql<number>`sum(${shiftDefinition.durationHours})`,
      })
      .from(assignment)
      .innerJoin(staff, eq(assignment.staffId, staff.id))
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(
        and(
          eq(shift.scheduleId, scheduleId),
          ne(assignment.status, "cancelled"),
          ne(assignment.status, "called_out")
        )
      )
      .groupBy(assignment.staffId, staff.firstName, staff.lastName)
      .orderBy(desc(sql`sum(${shiftDefinition.durationHours})`))
      .limit(10);

    const overtimeThreshold = 40 * scheduleWeeks;
    const overtimeByStaff = staffWithHours.map((s) => {
      const overtimeHours = Math.max(0, s.totalHours - overtimeThreshold);
      return {
        label: `${s.firstName.substring(0, 1)}. ${s.lastName}`,
        value: Math.round(overtimeHours),
        color:
          overtimeHours > overtimeThreshold * 0.2
            ? "#ef4444"
            : overtimeHours > overtimeThreshold * 0.1
            ? "#f59e0b"
            : "#3B82F6",
      };
    });

    // ─── 3. Callout Trend — scoped to selected schedule ───────────────────────

    const callouts = await db
      .select({ date: shift.date })
      .from(callout)
      .innerJoin(shift, eq(callout.shiftId, shift.id))
      .where(eq(shift.scheduleId, scheduleId))
      .orderBy(desc(shift.date))
      .limit(100);

    const weeklyCallouts: { [key: string]: number } = {};
    for (const c of callouts) {
      const date = new Date(c.date);
      const weekStart = new Date(date);
      const cdow = date.getDay(); // 0=Sun
      weekStart.setDate(date.getDate() - (cdow === 0 ? 6 : cdow - 1));
      const weekKey = weekStart.toISOString().split("T")[0];
      weeklyCallouts[weekKey] = (weeklyCallouts[weekKey] || 0) + 1;
    }

    const calloutTrend = Object.entries(weeklyCallouts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({
        label: new Date(week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: count,
      }))
      .slice(-4);

    // ─── 4. Weekend Distribution ──────────────────────────────────────────────

    const weekendAssignments = await db
      .select({
        firstName: staff.firstName,
        lastName: staff.lastName,
        weekendCount: sql<number>`count(${assignment.id})`,
      })
      .from(assignment)
      .innerJoin(staff, eq(assignment.staffId, staff.id))
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(
        and(
          eq(shift.scheduleId, scheduleId),
          ne(assignment.status, "cancelled"),
          ne(assignment.status, "called_out"),
          sql`strftime('%w', ${shift.date}) IN ('0', '6')`
        )
      )
      .groupBy(assignment.staffId, staff.firstName, staff.lastName)
      .orderBy(desc(sql`count(${assignment.id})`))
      .limit(15);

    const weekendDistribution = weekendAssignments.map((s) => ({
      label: `${s.firstName.substring(0, 1)}. ${s.lastName}`,
      value: s.weekendCount,
      color: s.weekendCount > 4 ? "#ef4444" : s.weekendCount > 2 ? "#f59e0b" : "#3B82F6",
    }));

    // ─── 5. Holiday Balance (this year) ──────────────────────────────────────

    const currentYear = new Date().getFullYear();
    const holidayAssignments = await db
      .select({
        firstName: staff.firstName,
        lastName: staff.lastName,
        holidayCount: sql<number>`count(${staffHolidayAssignment.id})`,
      })
      .from(staffHolidayAssignment)
      .innerJoin(staff, eq(staffHolidayAssignment.staffId, staff.id))
      .where(eq(staffHolidayAssignment.year, currentYear))
      .groupBy(staffHolidayAssignment.staffId, staff.firstName, staff.lastName)
      .orderBy(desc(sql`count(${staffHolidayAssignment.id})`))
      .limit(10);

    const holidayBalance = holidayAssignments.map((s) => ({
      label: `${s.firstName.substring(0, 1)}. ${s.lastName}`,
      value: s.holidayCount,
      color: s.holidayCount > 3 ? "#ef4444" : s.holidayCount > 1 ? "#f59e0b" : "#3B82F6",
    }));

    // ─── 6. Cost Analysis (coming soon — kept in API for future use) ──────────
    // Placeholder; the page replaces these cards with "Coming Soon" panels.
    const costAnalysis = { overtime: 0, regular: 0, agency: 0 };

    // ─── 7. Staff Workload ────────────────────────────────────────────────────

    const staffWorkloadRows = await db
      .select({
        firstName: staff.firstName,
        lastName: staff.lastName,
        totalHours: sql<number>`sum(${shiftDefinition.durationHours})`,
      })
      .from(assignment)
      .innerJoin(staff, eq(assignment.staffId, staff.id))
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(
        and(
          eq(shift.scheduleId, scheduleId),
          ne(assignment.status, "cancelled"),
          ne(assignment.status, "called_out")
        )
      )
      .groupBy(staff.firstName, staff.lastName)
      .orderBy(desc(sql`sum(${shiftDefinition.durationHours})`))
      .limit(12);

    const staffWorkload = staffWorkloadRows.map((s) => ({
      label: `${s.firstName.substring(0, 1)}. ${s.lastName}`,
      value: Math.round(s.totalHours),
      color:
        s.totalHours > overtimeThreshold * 1.1
          ? "#ef4444"
          : s.totalHours > overtimeThreshold
          ? "#f59e0b"
          : "#3B82F6",
    }));

    // ─── 8. Compliance Metrics ────────────────────────────────────────────────

    // Violations from most recent scenario for this schedule
    const latestScenario = await db
      .select({ hardViolations: scenario.hardViolations, softViolations: scenario.softViolations })
      .from(scenario)
      .where(eq(scenario.scheduleId, scheduleId))
      .orderBy(desc(scenario.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null);

    const hardViolationCount = Array.isArray(latestScenario?.hardViolations)
      ? latestScenario.hardViolations.length
      : 0;
    const softViolationCount = Array.isArray(latestScenario?.softViolations)
      ? latestScenario.softViolations.length
      : 0;

    // Overtime instances (assignments flagged as overtime)
    const overtimeInstances = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(and(eq(shift.scheduleId, scheduleId), eq(assignment.isOvertime, true)))
      .then((r) => r[0]?.count ?? 0);

    // Unfilled shifts using census-band-derived required counts
    const totalRequired = shiftsWithData.reduce((sum, s) => {
      const base = s.requiredStaff ?? s.defRequired;
      return sum + getEffectiveRequired(s.censusBandId, s.acuityLevel, s.defUnit, s.actualCensus, base, bands);
    }, 0);
    const totalFilled = activeAssignments.length;
    const unfilledShifts = shiftsWithData.filter((s) => {
      const base = s.requiredStaff ?? s.defRequired;
      const required = getEffectiveRequired(s.censusBandId, s.acuityLevel, s.defUnit, s.actualCensus, base, bands);
      return (activeCountByShift.get(s.shiftId) ?? 0) < required;
    }).length;

    return NextResponse.json({
      scheduleId,
      scheduleName: targetSchedule.name,
      scheduleStartDate: targetSchedule.startDate,
      scheduleEndDate: targetSchedule.endDate,
      fillRateTrend,
      overtimeByStaff,
      calloutTrend,
      weekendDistribution,
      holidayBalance,
      costAnalysis,
      staffWorkload,
      complianceMetrics: {
        hardViolations: hardViolationCount,
        softViolations: softViolationCount,
        overtimeInstances,
        unfilledShifts,
      },
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics data" }, { status: 500 });
  }
}
