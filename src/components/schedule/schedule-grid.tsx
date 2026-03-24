"use client";

import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { format, parseISO } from "date-fns";

interface ShiftAssignment {
  id: string;
  staffId: string;
  status: string;
  isChargeNurse: boolean;
  isOvertime: boolean;
  staffFirstName: string;
  staffLastName: string;
  staffRole: string;
  staffCompetency: number;
}

interface ShiftData {
  id: string;
  date: string;
  shiftType: string;
  name: string;
  requiredStaffCount: number;
  requiresChargeNurse: boolean;
  actualCensus: number | null;
  acuityLevel: "blue" | "green" | "yellow" | "red" | null;
  assignments: ShiftAssignment[];
}

interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: "hard" | "soft";
  shiftId: string;
  staffId?: string;
  description: string;
  penaltyScore?: number;
}

interface ScheduleGridProps {
  shifts: ShiftData[];
  onShiftClick: (shift: ShiftData) => void;
  onViolationsClick?: (shift: ShiftData, violations: RuleViolation[]) => void;
  violations: Map<string, string[]>;
  violationDetails?: Map<string, RuleViolation[]>;
  softViolations?: Map<string, string[]>;
}

export function ScheduleGrid({ shifts, onShiftClick, onViolationsClick, violations, violationDetails, softViolations }: ScheduleGridProps) {
  // Group shifts by date
  const dateGroups = new Map<string, ShiftData[]>();
  for (const s of shifts) {
    const list = dateGroups.get(s.date) ?? [];
    list.push(s);
    dateGroups.set(s.date, list);
  }

  const sortedDates = [...dateGroups.keys()].sort();

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr className="border-b-2 border-primary/20">
            <th className="sticky left-0 bg-muted/50 px-4 py-3 text-left font-semibold">
              Date
            </th>
            <th className="min-w-62.5 px-4 py-3 text-left font-semibold">
              Day Shift (07:00-19:00)
            </th>
            <th className="min-w-62.5 px-4 py-3 text-left font-semibold">
              Night Shift (19:00-07:00)
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedDates.map((date) => {
            const dayShifts = dateGroups.get(date) ?? [];
            const day = dayShifts.find((s) => s.shiftType === "day");
            const night = dayShifts.find((s) => s.shiftType === "night");
            const dateObj = parseISO(date);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

            return (
              <tr
                key={date}
                className={`border-b transition-colors hover:bg-accent/20 ${isWeekend ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
              >
                <td className={`sticky left-0 px-4 py-3 font-medium whitespace-nowrap ${isWeekend ? "bg-blue-50/50 dark:bg-blue-950/20" : "bg-background"}`}>
                  <div>{format(dateObj, "EEE, MMM d")}</div>
                  {isWeekend && (
                    <span className="text-xs text-muted-foreground">Weekend</span>
                  )}
                </td>
                {[day, night].map((shiftData, i) => (
                  <td key={i} className="px-2 py-1">
                    {shiftData ? (
                      <ShiftCell
                        shift={shiftData}
                        onClick={() => onShiftClick(shiftData)}
                        onViolationsClick={
                          onViolationsClick
                            ? () => onViolationsClick(shiftData, violationDetails?.get(shiftData.id) ?? [])
                            : undefined
                        }
                        violations={violations.get(shiftData.id) ?? []}
                        softViolationCount={softViolations?.get(shiftData.id)?.length ?? 0}
                      />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function ShiftCell({
  shift,
  onClick,
  onViolationsClick,
  violations,
  softViolationCount,
}: {
  shift: ShiftData;
  onClick: () => void;
  onViolationsClick?: () => void;
  violations: string[];
  softViolationCount: number;
}) {
  const activeAssignments = shift.assignments.filter((a) => a.status !== "cancelled");
  const cancelledAssignments = shift.assignments.filter((a) => a.status === "cancelled");
  const staffCount = activeAssignments.length;
  const isFull = staffCount >= shift.requiredStaffCount;
  const isOverstaffed = staffCount > shift.requiredStaffCount;
  const excessCount = isOverstaffed ? staffCount - shift.requiredStaffCount : 0;
  const hasCharge = activeAssignments.some((a) => a.isChargeNurse);
  const hasHardViolations = violations.length > 0;
  const hasSoftViolations = softViolationCount > 0;

  let borderColor = "border-border";
  if (hasHardViolations) {
    borderColor = "border-red-400";
  } else if (hasSoftViolations) {
    borderColor = "border-yellow-400";
  } else if (isOverstaffed) {
    borderColor = "border-blue-400";
  } else if (isFull && (!shift.requiresChargeNurse || hasCharge)) {
    borderColor = "border-green-400";
  } else if (staffCount > 0) {
    borderColor = "border-orange-300";
  }

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border-2 ${borderColor} bg-card p-3 text-left transition-all duration-200 hover:bg-accent hover:shadow-md hover:scale-[1.02]`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {staffCount}/{shift.requiredStaffCount} staff
        </span>
        <div className="flex gap-1">
          {hasHardViolations && (
            <Badge
              variant="destructive"
              className="text-[10px] px-1.5 py-0.5 cursor-pointer hover:bg-red-700 flex items-center gap-0.5"
              onClick={(e) => {
                e.stopPropagation();
                onViolationsClick?.();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
              </svg>
              {violations.length}
            </Badge>
          )}
          {hasSoftViolations && (
            <Badge
              className="text-[10px] px-1.5 py-0.5 bg-yellow-500 text-white cursor-pointer hover:bg-yellow-600 flex items-center gap-0.5"
              onClick={(e) => {
                e.stopPropagation();
                onViolationsClick?.();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
              </svg>
              {softViolationCount}
            </Badge>
          )}
          {isOverstaffed && !hasHardViolations && (
            <Badge className="text-[10px] px-1.5 py-0.5 bg-blue-500 text-white flex items-center gap-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
              </svg>
              {excessCount}
            </Badge>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {activeAssignments.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-xs">
            <Avatar
              firstName={a.staffFirstName}
              lastName={a.staffLastName}
              size="xs"
            />
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <span className="truncate font-medium">
                {a.staffFirstName} {a.staffLastName[0]}.
              </span>
              {a.isChargeNurse && (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 shrink-0">
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
                </svg>
              )}
              {a.isOvertime && (
                <Badge variant="destructive" className="text-[8px] px-1 py-0 shrink-0">
                  OT
                </Badge>
              )}
            </div>
          </div>
        ))}
        {cancelledAssignments.map((a) => (
          <div key={a.id} className="flex items-center gap-1 text-xs opacity-60">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
            <span className="truncate line-through text-muted-foreground">
              {a.staffFirstName} {a.staffLastName[0]}.
            </span>
            <Badge className="text-[9px] px-1 py-0 bg-orange-100 text-orange-700 border border-orange-300">
              Leave
            </Badge>
          </div>
        ))}
        {staffCount === 0 && cancelledAssignments.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            No staff assigned
          </span>
        )}
      </div>
      {shift.actualCensus !== null && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Census: {shift.actualCensus}
        </div>
      )}
      {isOverstaffed && (
        <div className="mt-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {excessCount} excess — click for flex-home suggestions
        </div>
      )}
    </button>
  );
}
