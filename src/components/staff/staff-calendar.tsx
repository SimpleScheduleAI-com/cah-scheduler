"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isWeekend } from "date-fns";

interface ShiftData {
  assignmentId: string;
  shiftId: string;
  date: string;
  shiftType: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  unit: string;
  isChargeNurse: boolean;
  isOvertime: boolean;
  isFloat: boolean;
  floatFromUnit: string | null;
  status: string;
  scheduleName: string;
  scheduleId: string;
}

interface LeaveData {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
}

interface DayData {
  date: string;
  shifts: ShiftData[];
  leave: LeaveData | null;
}

interface StaffCalendarProps {
  staffId: string;
  defaultDate?: Date;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick",
  maternity: "Maternity",
  medical: "Medical",
  personal: "Personal",
  bereavement: "Bereavement",
  other: "Other",
};

export function StaffCalendar({ staffId, defaultDate }: StaffCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(defaultDate || new Date());
  const [days, setDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const startDate = format(start, "yyyy-MM-dd");
    const endDate = format(end, "yyyy-MM-dd");

    try {
      const res = await fetch(
        `/api/staff/${staffId}/schedule?startDate=${startDate}&endDate=${endDate}`
      );
      const data = await res.json();
      setDays(data.days || []);
    } catch (error) {
      console.error("Failed to fetch staff schedule:", error);
      setDays([]);
    }
    setLoading(false);
  }, [staffId, currentMonth]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const calendarDays = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  // Get the day of week for the first day (0 = Sunday)
  const firstDayOfWeek = startOfMonth(currentMonth).getDay();

  // Create a map for quick lookup
  const dayDataMap = new Map<string, DayData>();
  for (const d of days) {
    dayDataMap.set(d.date, d);
  }

  return (
    <div className="w-full">
      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 bg-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells for days before the first of the month */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] border-t border-r bg-muted/30" />
            ))}

            {/* Actual days */}
            {calendarDays.map((date) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const dayData = dayDataMap.get(dateStr);
              const weekend = isWeekend(date);

              return (
                <DayCell
                  key={dateStr}
                  date={date}
                  dayData={dayData}
                  isWeekend={weekend}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-[#2d5a4a]" />
          <span>Day Shift</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-[#1a2332]" />
          <span>Night Shift</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-green-500" />
          <span>Leave/PTO</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded border border-dashed border-gray-400 bg-gray-100" />
          <span>Off</span>
        </div>
      </div>
    </div>
  );
}

function DayCell({
  date,
  dayData,
  isWeekend,
}: {
  date: Date;
  dayData?: DayData;
  isWeekend: boolean;
}) {
  const hasShifts = dayData && dayData.shifts.length > 0;
  const hasLeave = dayData && dayData.leave;
  const isOff = !hasShifts && !hasLeave;

  return (
    <div
      className={`min-h-[80px] border-t border-r p-1 ${
        isWeekend ? "bg-muted/20" : ""
      }`}
    >
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {format(date, "d")}
      </div>

      {hasLeave && (
        <div className="mb-1 rounded bg-green-100 px-1 py-0.5 text-[10px] text-green-800">
          {LEAVE_TYPE_LABELS[dayData.leave!.leaveType] || dayData.leave!.leaveType}
        </div>
      )}

      {hasShifts && (
        <div className="space-y-0.5">
          {dayData.shifts.map((shift) => (
            <div
              key={shift.assignmentId}
              className={`rounded px-1 py-0.5 text-[10px] text-white ${
                shift.shiftType === "day" ? "bg-[#2d5a4a]" :
                shift.shiftType === "night" ? "bg-[#1a2332]" : "bg-gray-500"
              }`}
            >
              <div className="flex items-center gap-0.5">
                <span>{shift.shiftType === "day" ? "D" : shift.shiftType === "night" ? "N" : "E"}</span>
                {shift.isChargeNurse && (
                  <Badge variant="secondary" className="h-3 px-0.5 text-[8px]">C</Badge>
                )}
                {shift.isOvertime && (
                  <Badge variant="destructive" className="h-3 px-0.5 text-[8px]">OT</Badge>
                )}
              </div>
              <div className="truncate text-[9px] opacity-90">{shift.unit}</div>
            </div>
          ))}
        </div>
      )}

      {isOff && (
        <div className="text-[10px] italic text-muted-foreground">Off</div>
      )}
    </div>
  );
}
