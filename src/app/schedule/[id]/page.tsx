"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GuideNudge } from "@/components/ui/guide-nudge";
import { GuideDot } from "@/components/ui/guide-dot";
import { useToast } from "@/components/ui/toast";
import { useOnboarding } from "@/lib/onboarding/use-onboarding";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { AssignmentDialog } from "@/components/schedule/assignment-dialog";
import { ChangeReasonDialog } from "@/components/schedule/change-reason-dialog";
import { ShiftViolationsModal } from "@/components/schedule/shift-violations-modal";
import { format, parseISO } from "date-fns";
import { fetchJson, FetchJsonError } from "@/lib/fetch-json";

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

interface ScheduleData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  unit: string;
  status: string;
  amendmentCount?: number;
  shifts: ShiftData[];
}

/** A change to a published schedule waiting on the manager's reason. */
type PendingChange =
  | { kind: "assign"; shiftId: string; staffId: string; isChargeNurse: boolean }
  | { kind: "remove"; assignmentId: string }
  | { kind: "unpublish" };

interface RuleViolation {
  ruleId: string;
  ruleName: string;
  ruleType: "hard" | "soft";
  shiftId: string;
  staffId?: string;
  description: string;
  penaltyScore?: number;
}

interface EvalResult {
  isValid: boolean;
  hardViolations: RuleViolation[];
  softViolations: RuleViolation[];
  totalPenalty: number;
}

export default function ScheduleBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const { guide } = useOnboarding();
  const scheduleId = params.id as string;

  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [evaluation, setEvaluation] = useState<EvalResult | null>(null);
  const [selectedShift, setSelectedShift] = useState<ShiftData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [violationsModalOpen, setViolationsModalOpen] = useState(false);
  const [selectedShiftForViolations, setSelectedShiftForViolations] =
    useState<ShiftData | null>(null);
  const [selectedViolations, setSelectedViolations] = useState<RuleViolation[]>(
    [],
  );
  const [publishing, setPublishing] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(
    null,
  );

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSchedule(
        await fetchJson<ScheduleData>(`/api/schedules/${scheduleId}`),
      );
    } catch (err) {
      if (err instanceof FetchJsonError && err.status === 404) {
        setSchedule(null);
      } else {
        setLoadError(
          "Couldn't load the schedule. The server may be restarting — try again in a moment.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  const runEvaluation = useCallback(async () => {
    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId }),
    });
    const data = await res.json();
    setEvaluation(data);
  }, [scheduleId]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  useEffect(() => {
    if (schedule) {
      runEvaluation();
    }
  }, [schedule, runEvaluation]);

  // Re-fetch whenever the user returns to this tab/page (e.g. after changing census).
  // fetchSchedule state change triggers runEvaluation automatically via the effect above.
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) fetchSchedule();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchSchedule]);

  const isPublished = schedule?.status === "published";

  async function submitAssign(
    shiftId: string,
    staffId: string,
    isChargeNurse: boolean,
    reason?: string,
  ) {
    const res = await fetch(`/api/schedules/${scheduleId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shiftId, staffId, isChargeNurse, reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast({
        title: "Could not assign",
        description: data.error ?? "Unknown error",
        variant: "error",
      });
      return;
    }
    if (reason) {
      addToast({
        title: "Published schedule amended",
        description:
          "The nurse has been notified and the change is in the audit trail.",
        variant: "success",
      });
    }
    setDialogOpen(false);
    setSelectedShift(null);
    fetchSchedule();
  }

  async function submitRemove(assignmentId: string, reason?: string) {
    const qs = new URLSearchParams({ assignmentId });
    if (reason) qs.set("reason", reason);
    const res = await fetch(
      `/api/schedules/${scheduleId}/assignments?${qs.toString()}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast({
        title: "Could not remove",
        description: data.error ?? "Unknown error",
        variant: "error",
      });
      return;
    }
    if (reason) {
      addToast({
        title: "Published schedule amended",
        description:
          "The nurse has been notified and the change is in the audit trail.",
        variant: "success",
      });
    }
    setDialogOpen(false);
    setSelectedShift(null);
    fetchSchedule();
  }

  // On a published schedule every hand change is an amendment: ask for the
  // reason first, then submit with it. On a draft, submit straight away.
  function handleAssign(
    shiftId: string,
    staffId: string,
    isChargeNurse: boolean,
  ) {
    if (isPublished) {
      setPendingChange({ kind: "assign", shiftId, staffId, isChargeNurse });
      return;
    }
    void submitAssign(shiftId, staffId, isChargeNurse);
  }

  function handleRemove(assignmentId: string) {
    if (isPublished) {
      setPendingChange({ kind: "remove", assignmentId });
      return;
    }
    void submitRemove(assignmentId);
  }

  async function handleReasonConfirm(reason: string) {
    const change = pendingChange;
    setPendingChange(null);
    if (!change) return;
    if (change.kind === "assign") {
      await submitAssign(
        change.shiftId,
        change.staffId,
        change.isChargeNurse,
        reason,
      );
    } else if (change.kind === "remove") {
      await submitRemove(change.assignmentId, reason);
    } else {
      await submitStatus("draft", reason);
    }
  }

  function handleShiftClick(shift: ShiftData) {
    setSelectedShift(shift);
    setDialogOpen(true);
  }

  function handlePublish() {
    if (schedule?.status === "published") {
      // Unpublish withdraws the schedule from every nurse — needs a reason.
      setPendingChange({ kind: "unpublish" });
      return;
    }
    void submitStatus("published");
  }

  async function submitStatus(
    newStatus: "published" | "draft",
    reason?: string,
  ) {
    setPublishing(true);
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast({
        title: "Could not update schedule",
        description: data.error ?? "Unknown error",
        variant: "error",
      });
      setPublishing(false);
      return;
    }
    await fetchSchedule();
    setPublishing(false);
    if (newStatus === "published") {
      addToast({
        title: "Schedule published — nurses can now see it",
        variant: "success",
      });
    } else {
      addToast({
        title: "Schedule unpublished — back to draft",
        variant: "default",
      });
    }
    // Move the sidebar next-step beacon + dashboard checklist forward.
    window.dispatchEvent(new Event("onboarding-refresh"));
  }

  function handleExport() {
    const a = document.createElement("a");
    a.href = `/api/schedules/${scheduleId}/export`;
    a.download = "";
    a.click();
  }

  function handleViolationsClick(
    shift: ShiftData,
    violations: RuleViolation[],
  ) {
    setSelectedShiftForViolations(shift);
    setSelectedViolations(violations);
    setViolationsModalOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <svg
          className="animate-spin mr-2 h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading schedule...
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3 py-24">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" onClick={fetchSchedule}>
          Try again
        </Button>
      </div>
    );
  }
  if (!schedule) {
    return <p className="text-muted-foreground">Schedule not found.</p>;
  }

  // Build violations maps for the grid
  // hardViolationMap  → red border + "N hard" badge
  // softViolationMap  → yellow border + "N soft" badge (separate from hard)
  // violationDetailsMap → full details for the violations modal
  const hardViolationMap = new Map<string, string[]>();
  const softViolationMap = new Map<string, string[]>();
  const violationDetailsMap = new Map<string, RuleViolation[]>();
  if (evaluation) {
    // Collect staff-level violations (weekend shortfall, overtime, etc.)
    // These have no shiftId — they apply to a staff member across the whole schedule
    const staffViolationMap = new Map<string, RuleViolation[]>();
    for (const v of evaluation.softViolations) {
      if (!v.shiftId && v.staffId) {
        const list = staffViolationMap.get(v.staffId) ?? [];
        list.push({ ...v, ruleType: "soft" });
        staffViolationMap.set(v.staffId, list);
      }
    }

    for (const v of evaluation.hardViolations) {
      if (v.shiftId) {
        const list = hardViolationMap.get(v.shiftId) ?? [];
        list.push(v.description);
        hardViolationMap.set(v.shiftId, list);

        const details = violationDetailsMap.get(v.shiftId) ?? [];
        details.push({ ...v, ruleType: "hard" });
        violationDetailsMap.set(v.shiftId, details);
      }
    }
    for (const v of evaluation.softViolations) {
      if (v.shiftId) {
        const list = softViolationMap.get(v.shiftId) ?? [];
        list.push(v.description);
        softViolationMap.set(v.shiftId, list);

        const details = violationDetailsMap.get(v.shiftId) ?? [];
        details.push({ ...v, ruleType: "soft" });
        violationDetailsMap.set(v.shiftId, details);
      }
    }

    // Attach staff-level violations to each shift the staff member is assigned to.
    // Weekend-specific violations (consecutive-weekends, weekend-fairness) are only
    // relevant on Sat/Sun shifts — showing them on weekday shifts is misleading since
    // there is nothing a manager can do about a consecutive-weekend issue from a Monday shift.
    const WEEKEND_ONLY_RULE_IDS = new Set([
      "consecutive-weekends",
      "weekend-fairness",
    ]);
    for (const shift of schedule.shifts) {
      const isWeekendShift = [0, 6].includes(new Date(shift.date).getDay());
      for (const assignment of shift.assignments) {
        const staffViolations = staffViolationMap.get(assignment.staffId);
        if (!staffViolations?.length) continue;

        const relevantViolations = staffViolations.filter(
          (v) => !WEEKEND_ONLY_RULE_IDS.has(v.ruleId) || isWeekendShift,
        );
        if (!relevantViolations.length) continue;

        const softList = softViolationMap.get(shift.id) ?? [];
        softViolationMap.set(shift.id, [
          ...softList,
          ...relevantViolations.map((v) => v.description),
        ]);

        const details = violationDetailsMap.get(shift.id) ?? [];
        violationDetailsMap.set(shift.id, [...details, ...relevantViolations]);
      }
    }
  }

  const totalAssignments = schedule.shifts.reduce(
    (sum, s) => sum + s.assignments.length,
    0,
  );
  const totalSlots = schedule.shifts.reduce(
    (sum, s) => sum + s.requiredStaffCount,
    0,
  );
  const fillRate =
    totalSlots > 0 ? Math.round((totalAssignments / totalSlots) * 100) : 0;

  return (
    <div>
      <div className="mb-6 -mx-6 -mt-6 px-6 py-6 gradient-primary flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/70 font-semibold mb-1">
            Current Schedule
          </p>
          <h1 className="text-2xl font-bold text-white">{schedule.name}</h1>
          <p className="mt-1 text-sm text-white/80">
            {format(parseISO(schedule.startDate), "MMM d")} -{" "}
            {format(parseISO(schedule.endDate), "MMM d, yyyy")} |{" "}
            {schedule.unit}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-white/20 text-white border-white/30"
          >
            {schedule.status}
          </Badge>
          {isPublished && (schedule.amendmentCount ?? 0) > 0 && (
            <Badge
              variant="secondary"
              className="bg-amber-400/90 text-amber-950 border-amber-300"
              title="Hand changes made after publishing — each one is in the audit trail and the affected nurse was notified"
            >
              Amended ×{schedule.amendmentCount}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/scenarios?scheduleId=${scheduleId}`)}
            className="relative bg-white text-primary hover:bg-white/90 font-medium shadow-sm"
          >
            <GuideDot
              show={guide?.dot === "generate"}
              label="Suggested next step"
            />
            Generate Schedule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={runEvaluation}
            className="bg-white/90 text-primary hover:bg-white font-medium shadow-sm"
          >
            Re-evaluate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="bg-white/90 text-primary hover:bg-white font-medium shadow-sm"
          >
            Export
          </Button>
          {schedule.status !== "published" ? (
            <div className="flex flex-col items-center">
              {(() => {
                const disabledByViolations =
                  evaluation !== null && evaluation.hardViolations.length > 0;
                return (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePublish}
                      disabled={publishing || disabledByViolations}
                      title={
                        disabledByViolations
                          ? `Fix ${evaluation.hardViolations.length} compliance issue${evaluation.hardViolations.length !== 1 ? "s" : ""} before publishing`
                          : undefined
                      }
                      className="relative bg-white/90 text-primary hover:bg-white font-medium shadow-sm disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-primary/40 disabled:shadow-none"
                    >
                      <GuideDot
                        show={guide?.dot === "publish"}
                        label="Suggested next step"
                      />
                      {publishing ? (
                        "Publishing…"
                      ) : (
                        <>
                          {disabledByViolations && (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-1 opacity-60"
                            >
                              <rect
                                width="18"
                                height="11"
                                x="3"
                                y="11"
                                rx="2"
                                ry="2"
                              />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          )}
                          Publish
                        </>
                      )}
                    </Button>
                    {disabledByViolations && (
                      <p className="text-[11px] text-white/70 text-center mt-0.5 leading-tight">
                        {evaluation.hardViolations.length} compliance issue
                        {evaluation.hardViolations.length !== 1 ? "s" : ""} —
                        fix first
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePublish}
              disabled={publishing}
              className="bg-white/90 text-primary hover:bg-white font-medium shadow-sm disabled:bg-white/50 disabled:text-primary/50"
            >
              {publishing ? "Saving…" : "Unpublish"}
            </Button>
          )}
        </div>
      </div>

      <GuideNudge />

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Fill Rate</p>
            <p className="text-2xl font-bold">{fillRate}%</p>
            <p className="text-xs text-muted-foreground">
              {totalAssignments}/{totalSlots} slots filled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Compliance Rules Broken
            </p>
            <p
              className={`text-2xl font-bold ${
                evaluation && evaluation.hardViolations.length > 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {evaluation?.hardViolations.length ?? "-"}
            </p>
            <p className="text-xs text-muted-foreground">
              Must fix before publishing
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Fairness Flags</p>
            <p className="text-2xl font-bold text-yellow-600">
              {evaluation?.softViolations.length ?? "-"}
            </p>
            <p className="text-xs text-muted-foreground">
              Preferences & scheduling quality
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Violations summary — grouped by rule so 60 violations don't look like 60 separate crises */}
      {evaluation &&
        (evaluation.hardViolations.length > 0 ||
          evaluation.softViolations.length > 0) &&
        (() => {
          // Group violations by rule name
          const hardGroups = new Map<string, number>();
          for (const v of evaluation.hardViolations) {
            hardGroups.set(v.ruleName, (hardGroups.get(v.ruleName) ?? 0) + 1);
          }
          const softGroups = new Map<string, number>();
          for (const v of evaluation.softViolations) {
            softGroups.set(v.ruleName, (softGroups.get(v.ruleName) ?? 0) + 1);
          }
          const prefViolations = evaluation.softViolations.filter(
            (v) =>
              v.ruleId?.includes("preference") ||
              v.ruleName?.toLowerCase().includes("preference"),
          ).length;

          // Build staff name lookup from all assignments
          const staffNames = new Map<string, string>();
          for (const shift of schedule.shifts) {
            for (const a of shift.assignments) {
              if (!staffNames.has(a.staffId)) {
                staffNames.set(
                  a.staffId,
                  `${a.staffFirstName} ${a.staffLastName}`,
                );
              }
            }
          }

          // Group soft violations by staff member
          const staffViolationMap = new Map<
            string,
            { name: string; count: number; rules: Set<string> }
          >();
          for (const v of evaluation.softViolations) {
            if (v.staffId) {
              const entry = staffViolationMap.get(v.staffId) ?? {
                name: staffNames.get(v.staffId) ?? v.staffId,
                count: 0,
                rules: new Set<string>(),
              };
              entry.count++;
              entry.rules.add(v.ruleName);
              staffViolationMap.set(v.staffId, entry);
            }
          }
          const staffViolationList = [...staffViolationMap.values()].sort(
            (a, b) => b.count - a.count,
          );

          return (
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              {evaluation.hardViolations.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-red-600">
                      Compliance Rules Broken —{" "}
                      {evaluation.hardViolations.length} total (must fix)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {[...hardGroups.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([rule, count]) => (
                          <li
                            key={rule}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-muted-foreground">
                              {rule}
                            </span>
                            <Badge
                              variant="destructive"
                              className="ml-2 text-xs"
                            >
                              {count}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Click any highlighted shift in the grid below for details
                      and to manually fix it.
                    </p>
                  </CardContent>
                </Card>
              )}

              {evaluation.softViolations.length > 0 && (
                <Card className="border-yellow-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-yellow-700">
                      Fairness Flags — {evaluation.softViolations.length} total
                      (schedule quality)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* By rule type */}
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      By rule:
                    </p>
                    <ul className="space-y-1">
                      {[...softGroups.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([rule, count]) => (
                          <li
                            key={rule}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-muted-foreground">
                              {rule}
                            </span>
                            <Badge variant="secondary" className="ml-2 text-xs">
                              {count}
                            </Badge>
                          </li>
                        ))}
                    </ul>

                    {/* Per-staff breakdown */}
                    {staffViolationList.length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                          Affected staff (most impacted first):
                        </p>
                        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                          {staffViolationList.map(({ name, count, rules }) => (
                            <li key={name} className="text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium truncate">
                                  {name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="shrink-0 text-[9px] px-1 py-0"
                                >
                                  {count}{" "}
                                  {count === 1 ? "violation" : "violations"}
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-muted-foreground truncate">
                                {[...rules].join(" · ")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground">
                      Each count is the number of individual assignment-level
                      mismatches across the full schedule — one nurse working 4
                      non-preferred shifts counts as 4.
                      {prefViolations > 0 && (
                        <>
                          {" "}
                          {prefViolations} preference mismatches: some are
                          unavoidable when ICU supervision requirements limit
                          which staff can work each shift. Regenerating with the
                          Fairness-Optimized variant may reduce this.
                        </>
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })()}

      {/* Schedule grid */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule Grid</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleGrid
            shifts={schedule.shifts}
            onShiftClick={handleShiftClick}
            onViolationsClick={handleViolationsClick}
            violations={hardViolationMap}
            softViolations={softViolationMap}
            violationDetails={violationDetailsMap}
          />
        </CardContent>
      </Card>

      {/* Reason prompt for changes to a published schedule */}
      <ChangeReasonDialog
        open={pendingChange !== null}
        mode={pendingChange?.kind ?? "assign"}
        onCancel={() => setPendingChange(null)}
        onConfirm={handleReasonConfirm}
      />

      {/* Assignment dialog */}
      <AssignmentDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelectedShift(null);
        }}
        shift={selectedShift}
        scheduleId={scheduleId}
        onAssign={handleAssign}
        onRemove={handleRemove}
      />

      {/* Shift violations modal */}
      <ShiftViolationsModal
        open={violationsModalOpen}
        onClose={() => {
          setViolationsModalOpen(false);
          setSelectedShiftForViolations(null);
          setSelectedViolations([]);
        }}
        shift={selectedShiftForViolations}
        violations={selectedViolations}
      />
    </div>
  );
}
