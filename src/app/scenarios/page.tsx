"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Schedule {
  id: string;
  name: string;
  status: string;
}

interface Scenario {
  id: string;
  scheduleId: string;
  name: string;
  description: string | null;
  overallScore: number | null;
  coverageScore: number | null;
  fairnessScore: number | null;
  costScore: number | null;
  preferenceScore: number | null;
  skillMixScore: number | null;
  status: string;
  hardViolations: unknown[];
  softViolations: unknown[];
}

interface JobStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  currentPhase: string | null;
  error: string | null;
  warnings: {
    shiftId: string;
    date: string;
    shiftType: string;
    unit: string;
    required: number;
    assigned: number;
    reasons: string[];
  }[];
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  if (score === null) return null;
  const pct = Math.round((1 - score) * 100);
  const gradient =
    pct >= 80
      ? "linear-gradient(90deg, #10b981 0%, #059669 100%)"
      : pct >= 60
      ? "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)"
      : "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)";

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden shadow-inner">
        <div
          className="h-3 rounded-full transition-all duration-500 shadow-sm"
          style={{
            width: `${pct}%`,
            background: gradient
          }}
        />
      </div>
      <span className="w-10 text-xs text-right font-semibold">{pct}%</span>
    </div>
  );
}

function ScenariosPageContent() {
  const searchParams = useSearchParams();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(
    searchParams.get("scheduleId") ?? ""
  );
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then(setSchedules);
  }, []);

  const fetchScenarios = useCallback(async (scheduleId: string) => {
    setLoading(true);
    const res = await fetch(`/api/scenarios?scheduleId=${scheduleId}`);
    setScenarios(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedScheduleId) {
      fetchScenarios(selectedScheduleId);
    }
  }, [selectedScheduleId, fetchScenarios]);

  // Stop polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/scenarios/generate/status?jobId=${jobId}`);
      const status: JobStatus = await res.json();
      setJobStatus(status);

      if (status.status === "completed" || status.status === "failed") {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        if (status.status === "completed" && selectedScheduleId) {
          await fetchScenarios(selectedScheduleId);
        }
      }
    }, 2000);
  }

  async function handleGenerate() {
    if (!selectedScheduleId) return;
    setJobStatus({ jobId: "", status: "pending", progress: 0, currentPhase: "Starting…", error: null, warnings: [] });

    const res = await fetch("/api/scenarios/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: selectedScheduleId }),
    });

    if (!res.ok) {
      const err = await res.json();
      setJobStatus((prev) => ({ ...prev!, status: "failed", error: err.error ?? "Unknown error" }));
      return;
    }

    const { jobId } = await res.json();
    setJobStatus((prev) => ({ ...prev!, jobId, status: "pending" }));
    startPolling(jobId);
  }

  async function handleApply(scenarioId: string) {
    setApplyingId(scenarioId);
    setApplyError(null);
    const res = await fetch(`/api/scenarios/${scenarioId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      setApplyError(err.error ?? "Failed to apply scenario");
      setApplyingId(null);
      return;
    }
    await fetchScenarios(selectedScheduleId);
    setApplyingId(null);
  }

  async function handleReject(id: string) {
    await fetch(`/api/scenarios/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    fetchScenarios(selectedScheduleId);
  }

  const isGenerating =
    jobStatus?.status === "pending" || jobStatus?.status === "running";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Scenario Comparison</h1>
        <p className="mt-1 text-muted-foreground">
          Generate and compare schedule variants. The Balanced schedule is applied
          automatically; use Apply to switch to a different variant.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a schedule" />
          </SelectTrigger>
          <SelectContent>
            {schedules.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleGenerate}
          disabled={!selectedScheduleId || isGenerating}
        >
          {isGenerating ? "Generating…" : "Generate Schedule"}
        </Button>
      </div>

      {/* Progress bar while generating */}
      {isGenerating && jobStatus && (
        <div className="mb-6 rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              {jobStatus.currentPhase ?? "Starting…"}
            </span>
            <span className="text-sm text-muted-foreground">{jobStatus.progress}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden shadow-inner">
            <div
              className="h-3 rounded-full gradient-primary transition-all duration-500 shadow-sm relative overflow-hidden"
              style={{ width: `${jobStatus.progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse-slow" />
            </div>
          </div>
          {/* Step tracker — shows which variant is currently being built */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {[
              { label: "Balanced", sub: "All priorities", start: 10, done: 45 },
              { label: "Fairness", sub: "Weekend equity", start: 45, done: 65 },
              { label: "Cost", sub: "Min. overtime", start: 65, done: 85 },
            ].map(({ label, sub, start, done }) => {
              const active = jobStatus.progress >= start && jobStatus.progress < done;
              const complete = jobStatus.progress >= done;
              return (
                <div
                  key={label}
                  className={`rounded-lg px-3 py-2 text-center transition-all duration-300 ${
                    complete
                      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 shadow-sm"
                      : active
                      ? "gradient-primary text-white font-medium shadow-md animate-pulse"
                      : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    {complete && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5"/>
                      </svg>
                    )}
                    {active && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    )}
                    <span>{label}</span>
                  </div>
                  <div className="mt-1 text-[10px] font-normal opacity-75">{sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generation error */}
      {jobStatus?.status === "failed" && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Generation failed: {jobStatus.error}
        </div>
      )}

      {/* Apply error */}
      {applyError && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Could not apply scenario: {applyError}
        </div>
      )}

      {/* Understaffed warnings */}
      {jobStatus?.status === "completed" && jobStatus.warnings.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="mb-2 text-sm font-medium text-yellow-800">
            {jobStatus.warnings.length} shift(s) could not be fully staffed
          </p>
          <ul className="space-y-1 text-xs text-yellow-700">
            {jobStatus.warnings.map((w) => (
              <li key={w.shiftId}>
                {w.date} {w.shiftType} ({w.unit}): {w.assigned}/{w.required} filled
                {w.reasons.length > 0 && ` — ${w.reasons.join("; ")}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading scenarios…</p>
      ) : scenarios.length === 0 && !isGenerating ? (
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </div>
          <p className="text-lg font-medium">No schedule variants yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a schedule above and click Generate Schedule to create three optimized variants
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((s) => {
            const focus: Record<string, string> = {
              "Balanced": "Balances all priorities equally",
              "Fairness Optimized": "Maximises equal weekend & holiday distribution",
              "Cost Optimized": "Minimises overtime and agency/float use",
            };
            return (
            <Card
              key={s.id}
              className={`transition-all duration-300 ${
                s.status === "selected"
                  ? "border-primary shadow-xl ring-2 ring-primary/20 animate-scale-in"
                  : s.status === "rejected"
                  ? "border-red-200 opacity-60"
                  : "hover:shadow-lg hover:-translate-y-1"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <Badge
                    variant={
                      s.status === "selected"
                        ? "default"
                        : s.status === "rejected"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {s.status === "selected" ? "active" : s.status}
                  </Badge>
                </div>
                {focus[s.name] && (
                  <p className="text-xs font-medium text-primary/70">{focus[s.name]}</p>
                )}
                {s.description && (
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <ScoreBar label="Coverage" score={s.coverageScore} />
                  <ScoreBar label="Fairness" score={s.fairnessScore} />
                  <ScoreBar label="Cost" score={s.costScore} />
                  <ScoreBar label="Preference" score={s.preferenceScore} />
                  <ScoreBar label="Skill Mix" score={s.skillMixScore} />
                </div>

                <div className="flex items-center justify-between border-t pt-2">
                  <div>
                    <span className="text-sm font-medium">Overall: </span>
                    <span className="text-lg font-bold">
                      {s.overallScore !== null
                        ? Math.round((1 - s.overallScore) * 100) + "%"
                        : "-"}
                    </span>
                  </div>
                  {s.status === "selected" ? (
                    <span className="text-xs text-green-600 font-medium">Active schedule</span>
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleApply(s.id)}
                        disabled={applyingId === s.id}
                      >
                        {applyingId === s.id ? "Applying…" : "Apply"}
                      </Button>
                      {s.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(s.id)}
                        >
                          Reject
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}
    </div>
  );
}

export default function ScenariosPage() {
  return (
    <Suspense>
      <ScenariosPageContent />
    </Suspense>
  );
}
