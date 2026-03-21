export type RuleType = "hard" | "soft";
export type RuleCategory = "staffing" | "rest" | "fairness" | "cost" | "skill" | "preference";
export type WeekendRuleType = "count_per_period" | "alternate_weekends";

export interface Rule {
  id: string;
  name: string;
  ruleType: RuleType;
  category: RuleCategory;
  description: string | null;
  parameters: Record<string, unknown>;
  weight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CensusBand {
  id: string;
  name: string;
  unit: string;
  minPatients: number;
  maxPatients: number;
  requiredRNs: number;
  requiredLPNs: number; // Added for Texas units
  requiredCNAs: number;
  requiredChargeNurses: number;
  patientToNurseRatio: string; // Now refers to licensed staff (RN + LPN)
  isActive: boolean;
  createdAt: string;
}

// Unit configuration
export interface Unit {
  id: string;
  name: string;
  description: string | null;
  // Weekend fairness
  weekendRuleType: WeekendRuleType;
  weekendShiftsRequired: number; // per schedule period
  schedulePeriodWeeks: number;
  // Holiday fairness
  holidayShiftsRequired: number;
  // Escalation sequence for callouts
  escalationSequence: string[];
  // Low census policy
  lowCensusOrder: string[];
  // OT approval threshold
  otApprovalThreshold: number;
  // On-call limits
  maxOnCallPerWeek: number;
  maxOnCallWeekendsPerMonth: number;
  // Consecutive weekend penalty
  maxConsecutiveWeekends: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Public Holiday
export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
  isActive: boolean;
  createdAt: string;
}

// Rule violation types
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  category: RuleCategory;
  shiftId?: string;
  staffId?: string;
  description: string;
  penaltyScore?: number; // Only for soft rules
}

export interface EvaluationResult {
  scheduleId: string;
  isValid: boolean; // No hard rule violations
  hardViolations: RuleViolation[];
  softViolations: RuleViolation[];
  totalPenalty: number;
}
