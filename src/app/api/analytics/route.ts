import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  assignment,
  shift,
  schedule,
  staff,
  callout,
  staffHolidayAssignment,
  publicHoliday,
  shiftDefinition
} from "@/db/schema";
import { sql, eq, and, gte, lte, desc } from "drizzle-orm";
import { isWeekend } from "date-fns";

export async function GET() {
  try {
    // Get the most recent schedule
    const recentSchedule = await db
      .select()
      .from(schedule)
      .orderBy(desc(schedule.createdAt))
      .limit(1);

    if (recentSchedule.length === 0) {
      return NextResponse.json({
        fillRateTrend: [],
        overtimeByStaff: [],
        calloutTrend: [],
        weekendDistribution: [],
        holidayBalance: [],
        costAnalysis: { overtime: 0, regular: 0, agency: 0 },
        staffWorkload: [],
        complianceMetrics: { violations: 0, overtimeInstances: 0, unfillsedShifts: 0 },
      });
    }

    const scheduleId = recentSchedule[0].id;

    // 1. Fill Rate Trend (last 6 weeks)
    const shiftsWithAssignments = await db
      .select({
        date: shift.date,
        shiftId: shift.id,
        assignmentCount: sql<number>`count(distinct ${assignment.id})`,
        requiredStaff: shift.requiredStaffCount,
      })
      .from(shift)
      .leftJoin(assignment, eq(shift.id, assignment.shiftId))
      .where(eq(shift.scheduleId, scheduleId))
      .groupBy(shift.date, shift.id, shift.requiredStaffCount)
      .orderBy(shift.date);

    // Group by week and calculate fill rate
    const weeklyFillRate: { [key: string]: { total: number; filled: number } } = {};
    shiftsWithAssignments.forEach((s) => {
      const date = new Date(s.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split("T")[0];

      if (!weeklyFillRate[weekKey]) {
        weeklyFillRate[weekKey] = { total: 0, filled: 0 };
      }
      weeklyFillRate[weekKey].total += s.requiredStaff || 0;
      weeklyFillRate[weekKey].filled += s.assignmentCount;
    });

    const fillRateTrend = Object.entries(weeklyFillRate)
      .map(([week, data]) => ({
        label: new Date(week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: data.total > 0 ? Math.round((data.filled / data.total) * 100) : 0,
      }))
      .slice(0, 6);

    // 2. Overtime by Staff (top 10)
    const staffWithOvertime = await db
      .select({
        staffId: assignment.staffId,
        firstName: staff.firstName,
        lastName: staff.lastName,
        totalHours: sql<number>`sum(${shiftDefinition.durationHours})`,
      })
      .from(assignment)
      .innerJoin(staff, eq(assignment.staffId, staff.id))
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(eq(shift.scheduleId, scheduleId))
      .groupBy(assignment.staffId, staff.firstName, staff.lastName)
      .orderBy(desc(sql`sum(${shiftDefinition.durationHours})`))
      .limit(10);

    const overtimeByStaff = staffWithOvertime.map((s) => ({
      label: `${s.firstName} ${s.lastName}`,
      value: Math.round(Math.max(0, s.totalHours - 40 * 6)), // Overtime over 6 weeks
      color: s.totalHours > 240 ? "#ef4444" : s.totalHours > 200 ? "#f59e0b" : "#3B82F6",
    }));

    // 3. Callout Trend (last 4 weeks)
    const callouts = await db
      .select({
        date: shift.date,
      })
      .from(callout)
      .innerJoin(shift, eq(callout.shiftId, shift.id))
      .orderBy(desc(shift.date))
      .limit(100);

    const weeklyCallouts: { [key: string]: number } = {};
    callouts.forEach((c) => {
      const date = new Date(c.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split("T")[0];
      weeklyCallouts[weekKey] = (weeklyCallouts[weekKey] || 0) + 1;
    });

    const calloutTrend = Object.entries(weeklyCallouts)
      .map(([week, count]) => ({
        label: new Date(week).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: count,
      }))
      .slice(0, 4)
      .reverse();

    // 4. Weekend Distribution (assignments per staff)
    const weekendAssignments = await db
      .select({
        staffId: assignment.staffId,
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

    // 5. Holiday Balance (this year)
    const currentYear = new Date().getFullYear();
    const holidayAssignments = await db
      .select({
        staffId: staffHolidayAssignment.staffId,
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

    // 6. Cost Analysis (simplified - assuming $30/hr regular, $45/hr overtime, $60/hr agency)
    const allAssignments = await db
      .select({
        durationHours: shiftDefinition.durationHours,
        employmentType: staff.employmentType,
        isOvertime: assignment.isOvertime,
      })
      .from(assignment)
      .innerJoin(staff, eq(assignment.staffId, staff.id))
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(eq(shift.scheduleId, scheduleId));

    let regularCost = 0;
    let overtimeCost = 0;
    let agencyCost = 0;

    allAssignments.forEach((a) => {
      if (a.employmentType === "agency") {
        agencyCost += a.durationHours * 60;
      } else if (a.isOvertime) {
        overtimeCost += a.durationHours * 45;
      } else {
        regularCost += a.durationHours * 30;
      }
    });

    const costAnalysis = {
      overtime: Math.round(overtimeCost),
      regular: Math.round(regularCost),
      agency: Math.round(agencyCost),
    };

    // 7. Staff Workload (hours worked per staff, top 12)
    const staffWorkload = await db
      .select({
        firstName: staff.firstName,
        lastName: staff.lastName,
        totalHours: sql<number>`sum(${shiftDefinition.durationHours})`,
        shiftCount: sql<number>`count(${assignment.id})`,
      })
      .from(assignment)
      .innerJoin(staff, eq(assignment.staffId, staff.id))
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .innerJoin(shiftDefinition, eq(shift.shiftDefinitionId, shiftDefinition.id))
      .where(eq(shift.scheduleId, scheduleId))
      .groupBy(staff.firstName, staff.lastName)
      .orderBy(desc(sql`sum(${shiftDefinition.durationHours})`))
      .limit(12);

    const workloadData = staffWorkload.map((s) => ({
      label: `${s.firstName.substring(0, 1)}. ${s.lastName}`,
      value: Math.round(s.totalHours),
      color: s.totalHours > 250 ? "#ef4444" : s.totalHours > 200 ? "#f59e0b" : "#3B82F6",
    }));

    // 8. Compliance Metrics (simplified counts)
    // Count overtime instances
    const overtimeInstances = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(
        and(
          eq(shift.scheduleId, scheduleId),
          eq(assignment.isOvertime, true)
        )
      );

    // Count unfilled shifts
    const allShifts = await db
      .select({
        shiftId: shift.id,
        requiredCount: shift.requiredStaffCount,
        assignmentCount: sql<number>`count(${assignment.id})`
      })
      .from(shift)
      .leftJoin(assignment, eq(shift.id, assignment.shiftId))
      .where(eq(shift.scheduleId, scheduleId))
      .groupBy(shift.id, shift.requiredStaffCount);

    const unfilledCount = allShifts.filter(
      s => (s.requiredCount || 0) > s.assignmentCount
    ).length;

    const complianceMetrics = {
      violations: 0, // Simplified - violations tracked at scenario level
      overtimeInstances: overtimeInstances[0]?.count || 0,
      unfilledShifts: unfilledCount,
    };

    return NextResponse.json({
      fillRateTrend,
      overtimeByStaff,
      calloutTrend,
      weekendDistribution,
      holidayBalance,
      costAnalysis,
      staffWorkload: workloadData,
      complianceMetrics,
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics data" },
      { status: 500 }
    );
  }
}
