import type { RuleEvaluator, RuleContext, RuleViolation, AssignmentInfo } from "./types";
import { db } from "@/db";
import { staffHolidayAssignment } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Holiday groups - maps individual holiday names to logical holiday groups.
 * Working either Christmas Eve OR Christmas Day counts as "worked Christmas".
 */
const HOLIDAY_GROUPS: Record<string, string> = {
  "Christmas Eve": "Christmas",
  "Christmas Day": "Christmas",
};

/**
 * Get the logical holiday name (merged for grouped holidays like Christmas).
 */
function getLogicalHolidayName(holidayName: string): string {
  return HOLIDAY_GROUPS[holidayName] ?? holidayName;
}

/**
 * Weekend Count Rule (Soft)
 * Flags each weekend assignment beyond the required count per schedule period.
 * Default is 3 weekend shifts per 6-week schedule.
 * Once a staff member has worked the required number of weekends, any additional
 * weekend assignment is flagged on that specific shift — the manager can swap it
 * for a non-weekend shift to reduce the penalty.
 * Staff marked as weekend_exempt are excluded.
 */
export const weekendCountRule: RuleEvaluator = {
  id: "weekend-count",
  name: "Weekend Shifts Required",
  type: "soft",
  category: "fairness",
  evaluate: (context: RuleContext): RuleViolation[] => {
    const violations: RuleViolation[] = [];

    const requiredCount = context.unitConfig?.weekendShiftsRequired ?? 3;

    const isWeekend = (dateStr: string): boolean => {
      const date = new Date(dateStr);
      const day = date.getDay();
      return day === 0 || day === 6;
    };

    // Collect all weekend assignments per staff
    const staffWeekendAssignments = new Map<string, AssignmentInfo[]>();
    for (const a of context.assignments) {
      if (!isWeekend(a.date)) continue;
      const list = staffWeekendAssignments.get(a.staffId) ?? [];
      list.push(a);
      staffWeekendAssignments.set(a.staffId, list);
    }

    // Flag each assignment beyond the required count
    for (const [staffId, assignments] of staffWeekendAssignments) {
      const staffInfo = context.staffMap.get(staffId);
      if (!staffInfo?.isActive || staffInfo.weekendExempt) continue;

      const totalWeekendShifts = assignments.length;
      if (totalWeekendShifts <= requiredCount) continue;

      // Sort chronologically — the first `requiredCount` are the required ones;
      // everything after is excess and gets flagged on its specific shift
      const sorted = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
      const excessAssignments = sorted.slice(requiredCount);

      for (const a of excessAssignments) {
        violations.push({
          ruleId: "weekend-count",
          ruleName: "Weekend Shifts Required",
          ruleType: "soft",
          shiftId: a.shiftId,
          staffId,
          description: `${staffInfo.firstName} ${staffInfo.lastName} already has ${requiredCount} required weekend shifts — this is extra weekend shift ${sorted.indexOf(a) + 1} of ${totalWeekendShifts}. Consider swapping for a weekday shift.`,
          penaltyScore: 0.5,
        });
      }
    }

    return violations;
  },
};

/**
 * Consecutive Weekend Rule (Soft)
 * Penalize staff who work more than the allowed consecutive weekends.
 * Default max is 2 consecutive weekends.
 */
export const consecutiveWeekendRule: RuleEvaluator = {
  id: "consecutive-weekends",
  name: "Consecutive Weekends Penalty",
  type: "soft",
  category: "fairness",
  evaluate: (context: RuleContext): RuleViolation[] => {
    const violations: RuleViolation[] = [];

    const maxConsecutive = context.unitConfig?.maxConsecutiveWeekends ?? 2;

    // Helper to get weekend identifier (year-week)
    // Maps both Saturday AND Sunday to the same identifier by anchoring on Saturday.
    // Without this, Saturday (end of one ISO week) and Sunday (start of next ISO week)
    // would produce different week numbers, incorrectly treating them as separate weekends.
    const getWeekendId = (dateStr: string): string => {
      const date = new Date(dateStr);
      // If Sunday (day 0), shift back to the preceding Saturday so it shares the same week ID
      if (date.getDay() === 0) {
        date.setDate(date.getDate() - 1);
      }
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      return `${date.getFullYear()}-W${weekNum}`;
    };

    // Helper to check if date is weekend
    const isWeekend = (dateStr: string): boolean => {
      const date = new Date(dateStr);
      const day = date.getDay();
      return day === 0 || day === 6;
    };

    // Group weekend shifts by staff
    const staffWeekends = new Map<string, Set<string>>();
    for (const a of context.assignments) {
      if (!isWeekend(a.date)) continue;
      const weekendId = getWeekendId(a.date);
      const existing = staffWeekends.get(a.staffId) ?? new Set();
      existing.add(weekendId);
      staffWeekends.set(a.staffId, existing);
    }

    // Check consecutive weekends for each staff
    for (const [staffId, weekendIds] of staffWeekends) {
      const staffInfo = context.staffMap.get(staffId);
      if (!staffInfo) continue;

      // Sort weekend IDs
      const sorted = [...weekendIds].sort();

      // Count consecutive sequences
      let consecutive = 1;
      let maxFound = 1;

      for (let i = 1; i < sorted.length; i++) {
        const [prevYear, prevWeek] = sorted[i - 1].split("-W").map(Number);
        const [currYear, currWeek] = sorted[i].split("-W").map(Number);

        // Check if consecutive (same year and week diff of 1, or year boundary)
        const isConsecutive =
          (prevYear === currYear && currWeek === prevWeek + 1) ||
          (currYear === prevYear + 1 && prevWeek >= 52 && currWeek === 1);

        if (isConsecutive) {
          consecutive++;
          maxFound = Math.max(maxFound, consecutive);
        } else {
          consecutive = 1;
        }
      }

      if (maxFound > maxConsecutive) {
        const excess = maxFound - maxConsecutive;
        violations.push({
          ruleId: "consecutive-weekends",
          ruleName: "Consecutive Weekends Penalty",
          ruleType: "soft",
          shiftId: "",
          staffId,
          description: `${staffInfo.firstName} ${staffInfo.lastName} is scheduled for ${maxFound} consecutive weekends, exceeding max of ${maxConsecutive}`,
          penaltyScore: excess * 0.8,
        });
      }
    }

    return violations;
  },
};

/**
 * Holiday Fairness Rule (Soft)
 * Tracks holiday fairness ANNUALLY (not per schedule period).
 * Christmas Eve and Christmas Day are merged as a single "Christmas" holiday.
 * Staff should work a fair distribution of holidays throughout the year.
 */
export const holidayFairnessRule: RuleEvaluator = {
  id: "holiday-fairness",
  name: "Holiday Fairness",
  type: "soft",
  category: "fairness",
  evaluate: (context: RuleContext): RuleViolation[] => {
    const violations: RuleViolation[] = [];

    if (context.publicHolidays.length === 0) return violations;

    // Get the year from the schedule. Parse from the string directly:
    // new Date("2026-01-01").getFullYear() returns 2025 on a server west of
    // UTC, pointing the holiday-history query at the wrong year.
    const scheduleYear = context.scheduleStartDate
      ? parseInt(context.scheduleStartDate.slice(0, 4), 10)
      : new Date().getFullYear();

    // Build a map of holiday dates to their logical names (merging Christmas)
    const holidayDateToName = new Map<string, string>();
    for (const h of context.publicHolidays) {
      const logicalName = getLogicalHolidayName(h.name);
      holidayDateToName.set(h.date, logicalName);
    }

    // Get historical holiday assignments for this year from the tracking table
    const historicalAssignments = db
      .select()
      .from(staffHolidayAssignment)
      .where(eq(staffHolidayAssignment.year, scheduleYear))
      .all();

    // Build map of staff -> set of unique holidays worked this year (historical)
    const staffYearlyHolidays = new Map<string, Set<string>>();
    for (const ha of historicalAssignments) {
      const existing = staffYearlyHolidays.get(ha.staffId) ?? new Set();
      existing.add(ha.holidayName);
      staffYearlyHolidays.set(ha.staffId, existing);
    }

    // Add current schedule holiday assignments (using logical names)
    for (const a of context.assignments) {
      const logicalHolidayName = holidayDateToName.get(a.date);
      if (!logicalHolidayName) continue;

      const existing = staffYearlyHolidays.get(a.staffId) ?? new Set();
      existing.add(logicalHolidayName);
      staffYearlyHolidays.set(a.staffId, existing);
    }

    // Calculate the count of unique holidays per staff (for this year)
    const staffHolidayCounts = new Map<string, number>();
    for (const [staffId, holidays] of staffYearlyHolidays) {
      staffHolidayCounts.set(staffId, holidays.size);
    }

    // Calculate average across all active staff
    const activeStaffCount = [...context.staffMap.values()].filter((s) => s.isActive).length;
    if (activeStaffCount === 0) return violations;

    const totalHolidayCount = [...staffHolidayCounts.values()].reduce((a, b) => a + b, 0);
    const average = totalHolidayCount / activeStaffCount;

    // Get unique logical holidays in the current schedule
    const uniqueHolidaysInSchedule = new Set([...holidayDateToName.values()]);

    // Check each active staff for fairness
    for (const [staffId, staffInfo] of context.staffMap) {
      if (!staffInfo.isActive) continue;
      if (staffInfo.weekendExempt) continue; // Use same exemption for holidays

      const count = staffHolidayCounts.get(staffId) ?? 0;

      // Penalize if significantly above average (more than 1 holiday above)
      if (count > average + 1) {
        violations.push({
          ruleId: "holiday-fairness",
          ruleName: "Holiday Fairness (Annual)",
          ruleType: "soft",
          shiftId: "",
          staffId,
          description: `${staffInfo.firstName} ${staffInfo.lastName} has worked ${count} holidays this year, above average of ${average.toFixed(1)}`,
          penaltyScore: (count - average) * 0.4,
        });
      }

      // Penalize if significantly below average (only if they could have worked more)
      if (count < average - 1 && uniqueHolidaysInSchedule.size > 0) {
        violations.push({
          ruleId: "holiday-fairness",
          ruleName: "Holiday Fairness (Annual)",
          ruleType: "soft",
          shiftId: "",
          staffId,
          description: `${staffInfo.firstName} ${staffInfo.lastName} has worked ${count} holidays this year, below average of ${average.toFixed(1)}`,
          penaltyScore: (average - count) * 0.3,
        });
      }
    }

    return violations;
  },
};
