/**
 * Test helpers for building RuleContext objects.
 * All rule evaluators are pure functions that take a RuleContext,
 * so we can test them without any database by constructing mock contexts.
 */
import type {
  RuleContext,
  AssignmentInfo,
  StaffInfo,
  ShiftInfo,
  CensusBandInfo,
  UnitConfig,
} from "@/lib/engine/rules/types";

export function makeShift(overrides: Partial<ShiftInfo> = {}): ShiftInfo {
  return {
    id: "shift-1",
    date: "2026-02-10",
    shiftType: "day",
    startTime: "07:00",
    endTime: "19:00",
    durationHours: 12,
    requiredStaffCount: 3,
    requiresChargeNurse: false,
    actualCensus: null,
    unit: "ICU",
    countsTowardStaffing: true,
    acuityLevel: null,
    acuityExtraStaff: 0,
    sitterCount: 0,
    ...overrides,
  };
}

export function makeStaff(overrides: Partial<StaffInfo> = {}): StaffInfo {
  return {
    id: "staff-1",
    firstName: "Alice",
    lastName: "Smith",
    role: "RN",
    employmentType: "full_time",
    icuCompetencyLevel: 3,
    isChargeNurseQualified: false,
    certifications: [],
    fte: 1.0,
    reliabilityRating: 4,
    homeUnit: "ICU",
    crossTrainedUnits: [],
    weekendExempt: false,
    isActive: true,
    preferences: null,
    ...overrides,
  };
}

export function makeAssignment(overrides: Partial<AssignmentInfo> = {}): AssignmentInfo {
  return {
    id: "assign-1",
    shiftId: "shift-1",
    staffId: "staff-1",
    isChargeNurse: false,
    isOvertime: false,
    isFloat: false,
    floatFromUnit: null,
    date: "2026-02-10",
    shiftType: "day",
    startTime: "07:00",
    endTime: "19:00",
    durationHours: 12,
    unit: "ICU",
    ...overrides,
  };
}

export const defaultUnitConfig: UnitConfig = {
  id: "unit-1",
  name: "ICU",
  weekendRuleType: "count_per_period",
  weekendShiftsRequired: 3,
  schedulePeriodWeeks: 6,
  holidayShiftsRequired: 1,
  maxOnCallPerWeek: 1,
  maxOnCallWeekendsPerMonth: 1,
  maxConsecutiveWeekends: 2,
  minStaffDay: 3,
  minStaffNight: 2,
};

export const defaultCensusBand: CensusBandInfo = {
  id: "band-1",
  minPatients: 0,
  maxPatients: 6,
  requiredRNs: 2,
  requiredLPNs: 0,
  requiredCNAs: 1,
  requiredChargeNurses: 1,
  patientToNurseRatio: "3:1",
};

export function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    assignments: [],
    staffMap: new Map(),
    shiftMap: new Map(),
    censusBands: [],
    unitConfig: defaultUnitConfig,
    prnAvailability: [],
    staffLeaves: [],
    publicHolidays: [],
    scheduleStartDate: "2026-02-02",
    scheduleEndDate: "2026-03-15",
    scheduleUnit: "ICU",
    ruleParameters: {},
    ...overrides,
  };
}
