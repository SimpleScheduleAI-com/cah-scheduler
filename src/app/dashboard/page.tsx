"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { DoughnutChart } from "@/components/ui/doughnut-chart";

interface DashboardData {
  staffCount: number;
  totalFTE: number;
  unitsCount: number;
  scheduleInfo: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
  } | null;
  totalShifts: number;
  totalAssignments: number;
  totalSlots: number;
  fillRate: number;
  understaffedShifts: number;
  overstaffedShifts: number;
  openCallouts: number;
  pendingSwapsCount: number;
  pendingLeaveCount: number;
  openShiftsCount: number;
  prnMissingCount: number;
  scheduleEndingSoon: { daysUntilEnd: number } | null;
  recentAudit: {
    id: string;
    action: string;
    description: string;
    entityType: string;
    createdAt: string;
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissed] = useState(false);

  // Mock sparkline data (in production, fetch from API)
  const sparklineData = {
    staff: [42, 43, 42, 44, 45, 45, 46],
    fillRate: [75, 78, 82, 80, 85, 83, data?.fillRate || 85],
    understaffed: [8, 6, 5, 7, 4, 3, data?.understaffedShifts || 3],
    overtime: [5, 4, 6, 5, 7, 6, data?.overstaffedShifts || 6],
    callouts: [3, 2, 4, 2, 1, 2, data?.openCallouts || 2],
  };

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
    setGettingStartedDismissed(localStorage.getItem("gettingStartedDismissed") === "true");
  }, []);

  function dismissGettingStarted() {
    localStorage.setItem("gettingStartedDismissed", "true");
    setGettingStartedDismissed(true);
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonCard />
      </div>
    );
  }

  const gettingStartedSteps = [
    { label: "Import your staff roster", done: data.staffCount > 0, href: "/setup" },
    { label: "Configure units & rules", done: data.unitsCount > 0, href: "/settings/units" },
    { label: "Create a schedule period", done: data.scheduleInfo !== null, href: "/schedule" },
  ];
  const allStepsDone = gettingStartedSteps.every((s) => s.done);
  const showGettingStarted = !gettingStartedDismissed && !allStepsDone;

  const attentionItems: { href: string; text: string; urgent: boolean; info?: boolean }[] = [
    ...(data.overstaffedShifts > 0 && data.scheduleInfo
      ? [{
          href: `/schedule/${data.scheduleInfo.id}`,
          text: `${data.overstaffedShifts} shift${data.overstaffedShifts > 1 ? "s have" : " has"} excess staff — consider flex-home or VTO`,
          urgent: false,
          info: true,
        }]
      : []),
    ...(data.pendingLeaveCount > 0
      ? [{ href: "/leave", text: `${data.pendingLeaveCount} leave request${data.pendingLeaveCount > 1 ? "s" : ""} pending approval`, urgent: false }]
      : []),
    ...(data.openShiftsCount > 0
      ? [{ href: "/open-shifts", text: `${data.openShiftsCount} open shift${data.openShiftsCount > 1 ? "s" : ""} need${data.openShiftsCount === 1 ? "s" : ""} coverage`, urgent: true }]
      : []),
    ...(data.openCallouts > 0
      ? [{ href: "/callouts", text: `${data.openCallouts} open callout${data.openCallouts > 1 ? "s" : ""} need${data.openCallouts === 1 ? "s" : ""} attention`, urgent: true }]
      : []),
    ...(data.pendingSwapsCount > 0
      ? [{ href: "/swaps", text: `${data.pendingSwapsCount} shift swap${data.pendingSwapsCount > 1 ? "s" : ""} pending review`, urgent: false }]
      : []),
    ...(data.prnMissingCount > 0
      ? [{ href: "/availability", text: `${data.prnMissingCount} PRN staff haven't submitted availability`, urgent: false }]
      : []),
    ...(data.scheduleEndingSoon
      ? [{
          href: "/schedule",
          text: `Current schedule ends in ${data.scheduleEndingSoon.daysUntilEnd} day${data.scheduleEndingSoon.daysUntilEnd !== 1 ? "s" : ""} — create next period`,
          urgent: true,
        }]
      : []),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* Getting Started checklist — shown until all steps done or dismissed */}
      {showGettingStarted && (
        <Card className="mb-6 border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 shadow-lg animate-slide-up">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-amber-900 dark:text-amber-200">Getting Started</p>
                <p className="mt-0.5 text-sm text-amber-800/70 dark:text-amber-300/70">
                  Complete these steps to create your first schedule.
                </p>
                <ol className="mt-4 space-y-2">
                  {gettingStartedSteps.map((step, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                          step.done
                            ? "gradient-success text-white shadow-md scale-110"
                            : "border-2 border-amber-400 text-amber-700 bg-white"
                        }`}
                      >
                        {step.done ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5"/>
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </span>
                      {step.done ? (
                        <span className="text-sm text-muted-foreground line-through">{step.label}</span>
                      ) : (
                        <Link href={step.href} className="text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700 dark:text-amber-200">
                          {step.label} →
                        </Link>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
              <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-900" onClick={dismissGettingStarted}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current schedule — primary CTA with gradient hero */}
      <Card className="mb-6 overflow-hidden border-0 shadow-lg">
        <div className="gradient-hero p-8">
          <CardContent className="flex items-center justify-between p-0">
            {data.scheduleInfo ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    Current Schedule
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">{data.scheduleInfo.name}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge
                      className="bg-white/20 text-white border-white/30 backdrop-blur-sm"
                    >
                      {data.scheduleInfo.status}
                    </Badge>
                    <span className="text-sm text-white/90">
                      {new Date(data.scheduleInfo.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" – "}
                      {new Date(data.scheduleInfo.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>
                <Link href={`/schedule/${data.scheduleInfo.id}`}>
                  <Button variant="secondary" className="!bg-white !text-primary hover:!bg-white/90 shadow-xl hover:shadow-2xl hover:scale-105 transition-all">
                    Open Schedule Builder →
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    Current Schedule
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">No active schedule</p>
                  <p className="mt-2 text-sm text-white/90">
                    Create a schedule period to get started.
                  </p>
                </div>
                <Link href="/schedule">
                  <Button variant="secondary" className="!bg-white !text-primary hover:!bg-white/90 shadow-xl hover:shadow-2xl hover:scale-105 transition-all">
                    Create Schedule →
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </div>
      </Card>

      {/* Needs Attention */}
      {attentionItems.length === 0 ? (
        <Card className="mb-6 border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 animate-fade-in">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-900 dark:text-green-200">All Clear</p>
                <p className="text-sm text-green-700 dark:text-green-300">Everything looks good — no action needed.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6 border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 animate-fade-in">
          <CardContent className="pt-5 pb-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-orange-900 dark:text-orange-200">
                  Needs Attention
                </p>
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  {attentionItems.length} item{attentionItems.length > 1 ? "s" : ""} require{attentionItems.length === 1 ? "s" : ""} action
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {attentionItems.map((item, i) => (
                <Link
                  key={i}
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-xl border-2 bg-white dark:bg-gray-900 px-4 py-3.5 transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-1 cursor-pointer ${
                    item.urgent
                      ? "border-red-300 hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 shadow-red-100"
                      : item.info
                      ? "border-blue-300 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/30 shadow-blue-100"
                      : "border-yellow-300 hover:border-yellow-400 hover:bg-yellow-50 dark:border-yellow-800 dark:hover:bg-yellow-950/30 shadow-yellow-100"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    item.urgent
                      ? "bg-red-500 text-white"
                      : item.info
                      ? "bg-blue-500 text-white"
                      : "bg-yellow-500 text-white"
                  }`}>
                    {item.urgent ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
                      </svg>
                    ) : item.info ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${
                      item.urgent
                        ? "text-red-900 dark:text-red-100"
                        : item.info
                        ? "text-blue-900 dark:text-blue-100"
                        : "text-yellow-900 dark:text-yellow-100"
                    }`}>
                      {item.text}
                    </p>
                  </div>
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg transition-all group-hover:scale-110 ${
                    item.urgent
                      ? "bg-red-100 dark:bg-red-900/30"
                      : item.info
                      ? "bg-blue-100 dark:bg-blue-900/30"
                      : "bg-yellow-100 dark:bg-yellow-900/30"
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform group-hover:translate-x-0.5 ${
                      item.urgent
                        ? "text-red-600 dark:text-red-400"
                        : item.info
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}>
                      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="animate-fade-in" style={{ animationDelay: "0s" }}>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Staff</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-3xl font-bold animate-slide-up">{data.staffCount}</p>
              <Sparkline
                data={sparklineData.staff}
                width={60}
                height={24}
                color="#3B82F6"
                showArea
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.totalFTE.toFixed(1)} total FTE
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <CardContent className="pt-4 flex flex-col items-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground self-start mb-2">Fill Rate</p>
            <DoughnutChart
              percentage={data.fillRate}
              size={100}
              strokeWidth={10}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {data.totalAssignments}/{data.totalSlots} slots filled
            </p>
          </CardContent>
        </Card>

        <Card className={`animate-fade-in ${data.understaffedShifts > 0 ? "border-yellow-400" : ""}`} style={{ animationDelay: "0.2s" }}>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Understaffed Shifts</p>
            <div className="flex items-end justify-between mt-2">
              <p
                className={`text-3xl font-bold animate-slide-up ${
                  data.understaffedShifts > 0 ? "text-yellow-600" : "text-green-600"
                }`}
              >
                {data.understaffedShifts}
              </p>
              <Sparkline
                data={sparklineData.understaffed}
                width={60}
                height={24}
                color={data.understaffedShifts > 0 ? "#f59e0b" : "#10b981"}
                showArea
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              of {data.totalShifts} total shifts
            </p>
          </CardContent>
        </Card>

        <Card className={`animate-fade-in ${data.overstaffedShifts > 0 ? "border-blue-400" : ""}`} style={{ animationDelay: "0.3s" }}>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Excess Staff Shifts</p>
            <div className="flex items-end justify-between mt-2">
              <p
                className={`text-3xl font-bold animate-slide-up ${
                  data.overstaffedShifts > 0 ? "text-blue-600" : "text-green-600"
                }`}
              >
                {data.overstaffedShifts}
              </p>
              <Sparkline
                data={sparklineData.overtime}
                width={60}
                height={24}
                color="#3b82f6"
                showArea
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.overstaffedShifts > 0 ? "Flex-home candidates" : "Staffing on target"}
            </p>
          </CardContent>
        </Card>

        <Card className={`animate-fade-in ${data.openCallouts > 0 ? "border-red-400" : ""}`} style={{ animationDelay: "0.4s" }}>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open Callouts</p>
            <div className="flex items-end justify-between mt-2">
              <p
                className={`text-3xl font-bold animate-slide-up ${
                  data.openCallouts > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {data.openCallouts}
              </p>
              <Sparkline
                data={sparklineData.callouts}
                width={60}
                height={24}
                color={data.openCallouts > 0 ? "#ef4444" : "#10b981"}
                showArea
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.openCallouts > 0 ? "Needs attention" : "All resolved"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Link href="/staff">
          <Card className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5">
            <CardContent className="pt-4">
              <p className="text-base font-semibold">Manage Staff</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.staffCount} active members
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/callouts">
          <Card className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5">
            <CardContent className="pt-4">
              <p className="text-base font-semibold">Callout Management</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.openCallouts} open
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {data.recentAudit.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {entry.entityType}
                    </Badge>
                    <span className="text-sm">{entry.description}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
