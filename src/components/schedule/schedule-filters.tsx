"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface ScheduleFilters {
  showViolationsOnly: boolean
  showOvertimeOnly: boolean
  showWeekends: boolean
  viewDensity: "compact" | "comfortable"
}

interface ScheduleFiltersProps {
  filters: ScheduleFilters
  onFiltersChange: (filters: ScheduleFilters) => void
  violationCount?: number
  overtimeCount?: number
}

export function ScheduleFiltersBar({ filters, onFiltersChange, violationCount, overtimeCount }: ScheduleFiltersProps) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg border animate-fade-in">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Filters:</span>

        <button
          onClick={() => onFiltersChange({ ...filters, showViolationsOnly: !filters.showViolationsOnly })}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            filters.showViolationsOnly
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 shadow-sm"
              : "bg-background hover:bg-accent"
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
          </svg>
          Violations Only
          {violationCount !== undefined && violationCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1 py-0">{violationCount}</Badge>
          )}
        </button>

        <button
          onClick={() => onFiltersChange({ ...filters, showOvertimeOnly: !filters.showOvertimeOnly })}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            filters.showOvertimeOnly
              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 shadow-sm"
              : "bg-background hover:bg-accent"
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Overtime Only
          {overtimeCount !== undefined && overtimeCount > 0 && (
            <Badge className="text-[10px] px-1 py-0 bg-orange-500">{overtimeCount}</Badge>
          )}
        </button>

        <button
          onClick={() => onFiltersChange({ ...filters, showWeekends: !filters.showWeekends })}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            filters.showWeekends
              ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 shadow-sm"
              : "bg-background hover:bg-accent"
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>
          </svg>
          Weekends Only
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">View:</span>
        <div className="inline-flex rounded-lg bg-background border p-1">
          <button
            onClick={() => onFiltersChange({ ...filters, viewDensity: "compact" })}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-all",
              filters.viewDensity === "compact"
                ? "gradient-primary text-white shadow-sm"
                : "hover:bg-accent"
            )}
          >
            Compact
          </button>
          <button
            onClick={() => onFiltersChange({ ...filters, viewDensity: "comfortable" })}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-all",
              filters.viewDensity === "comfortable"
                ? "gradient-primary text-white shadow-sm"
                : "hover:bg-accent"
            )}
          >
            Comfortable
          </button>
        </div>
      </div>
    </div>
  )
}
