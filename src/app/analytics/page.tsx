"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart } from "@/components/ui/line-chart";
import { BarChart } from "@/components/ui/bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Clock,
  PhoneOff,
  Calendar,
  Star,
  DollarSign,
  Users,
  AlertTriangle,
} from "lucide-react";

interface Schedule {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface AnalyticsData {
  scheduleId: string;
  scheduleName: string;
  scheduleStartDate: string;
  scheduleEndDate: string;
  fillRateTrend: { label: string; value: number }[];
  overtimeByStaff: { label: string; value: number; color: string }[];
  calloutTrend: { label: string; value: number }[];
  weekendDistribution: { label: string; value: number; color: string }[];
  holidayBalance: { label: string; value: number; color: string }[];
  costAnalysis: { overtime: number; regular: number; agency: number };
  staffWorkload: { label: string; value: number; color: string }[];
  complianceMetrics: {
    hardViolations: number;
    softViolations: number;
    overtimeInstances: number;
    unfilledShifts: number;
  };
}

function fmtPeriod(startDate: string, endDate: string) {
  return `${format(parseISO(startDate), "MMM d")} – ${format(parseISO(endDate), "MMM d, yyyy")}`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Fetch schedules list once on mount
  useEffect(() => {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then((list: Schedule[]) => setSchedules(list))
      .catch(() => {});
  }, []);

  // Fetch analytics whenever selected schedule changes (empty string = default = most recent)
  useEffect(() => {
    setLoading(true);
    const url = selectedScheduleId
      ? `/api/analytics?scheduleId=${selectedScheduleId}`
      : "/api/analytics";
    fetch(url)
      .then((r) => r.json())
      .then((d: AnalyticsData) => {
        setData(d);
        // Initialise selector to the schedule the API resolved
        if (!selectedScheduleId && d.scheduleId) {
          setSelectedScheduleId(d.scheduleId);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedScheduleId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics & Insights</h1>
          <p className="text-muted-foreground mt-2">Comprehensive scheduling metrics and trends</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">No analytics data available</p>
      </div>
    );
  }

  const avgFillRate =
    data.fillRateTrend.length > 0
      ? Math.round(data.fillRateTrend.reduce((sum, d) => sum + d.value, 0) / data.fillRateTrend.length)
      : 0;

  const periodLabel = data.scheduleStartDate && data.scheduleEndDate
    ? fmtPeriod(data.scheduleStartDate, data.scheduleEndDate)
    : "Current period";

  const allOvertimeZero = data.overtimeByStaff.length > 0 && data.overtimeByStaff.every((d) => d.value === 0);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-linear-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Analytics & Insights
          </h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive scheduling metrics, trends, and compliance data
          </p>
        </div>
        {schedules.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Schedule:</span>
            <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select schedule" />
              </SelectTrigger>
              <SelectContent>
                {[...schedules].reverse().map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span>{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(s.startDate), "MMM d")}–{format(parseISO(s.endDate), "MMM d")}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Fill Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgFillRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Compliance Rules Broken</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                data.complianceMetrics.hardViolations > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {data.complianceMetrics.hardViolations}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.complianceMetrics.softViolations > 0
                ? `+ ${data.complianceMetrics.softViolations} soft`
                : "No violations"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unfilled Shifts</CardTitle>
            <Calendar className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.complianceMetrics.unfilledShifts}</div>
            <p className="text-xs text-muted-foreground mt-1">Require coverage</p>
          </CardContent>
        </Card>

        {/* Labor Cost — Coming Soon */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Labor Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground/40" />
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Coming Soon
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">Requires staff hourly rates</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Fill Rate Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Fill Rate Trend
            </CardTitle>
            <CardDescription>Weekly fill rate — {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.fillRateTrend.length > 0 ? (
              <LineChart
                data={data.fillRateTrend}
                width={500}
                height={250}
                color="#3B82F6"
                showDots={true}
                fillArea={true}
                yAxisLabel="Fill Rate (%)"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overtime by Staff */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Overtime Hours by Staff
            </CardTitle>
            <CardDescription>Hours above standard threshold — {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {allOvertimeZero ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-green-600"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p className="font-medium text-green-700">No overtime this period</p>
                <p className="text-sm text-muted-foreground">All staff worked within standard hours</p>
              </div>
            ) : data.overtimeByStaff.length > 0 ? (
              <BarChart data={data.overtimeByStaff} width={500} height={250} yAxisLabel="Hours" />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No overtime data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Callout Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneOff className="h-5 w-5 text-red-600" />
              Callout Frequency
            </CardTitle>
            <CardDescription>Weekly callouts — {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.calloutTrend.length > 0 ? (
              <LineChart
                data={data.calloutTrend}
                width={500}
                height={250}
                color="#ef4444"
                showDots={true}
                fillArea={true}
                yAxisLabel="Callouts"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No callout data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekend Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Weekend Distribution
            </CardTitle>
            <CardDescription>Weekend assignments per staff — {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.weekendDistribution.length > 0 ? (
              <BarChart
                data={data.weekendDistribution}
                width={500}
                height={250}
                yAxisLabel="Weekends"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No weekend data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Holiday Balance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-600" />
              Holiday Assignment Balance
            </CardTitle>
            <CardDescription>Holiday shifts per staff (this year)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.holidayBalance.length > 0 ? (
              <BarChart
                data={data.holidayBalance}
                width={500}
                height={250}
                yAxisLabel="Holidays"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No holiday data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Labor Cost Breakdown — Coming Soon */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground/40" />
              Labor Cost Breakdown
            </CardTitle>
            <CardDescription>Cost distribution by type (current period)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <DollarSign className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="font-medium">Coming Soon</p>
              <p className="text-sm text-muted-foreground">
                Labor cost tracking requires staff hourly rates.
                <br />
                Configure rates per staff member to enable this report.
              </p>
              <Badge variant="outline" className="text-xs">
                Requires hourly rate configuration
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Staff Workload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Staff Workload Distribution
            </CardTitle>
            <CardDescription>Total hours per staff — {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.staffWorkload.length > 0 ? (
              <BarChart data={data.staffWorkload} width={500} height={250} yAxisLabel="Hours" />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No workload data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compliance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Compliance Overview
            </CardTitle>
            <CardDescription>{periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
                <div>
                  <p className="text-sm font-medium">Compliance Rules Broken</p>
                  <p className="text-xs text-muted-foreground">Safety / legal rule breaks (must fix)</p>
                </div>
                <div
                  className={`text-2xl font-bold ${
                    data.complianceMetrics.hardViolations > 0
                      ? "text-red-700 dark:text-red-400"
                      : "text-green-700 dark:text-green-400"
                  }`}
                >
                  {data.complianceMetrics.hardViolations}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div>
                  <p className="text-sm font-medium">Fairness Flags</p>
                  <p className="text-xs text-muted-foreground">Fairness / preference rule breaks</p>
                </div>
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {data.complianceMetrics.softViolations}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                <div>
                  <p className="text-sm font-medium">Overtime Instances</p>
                  <p className="text-xs text-muted-foreground">Assignments flagged as overtime</p>
                </div>
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                  {data.complianceMetrics.overtimeInstances}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
                <div>
                  <p className="text-sm font-medium">Unfilled Shifts</p>
                  <p className="text-xs text-muted-foreground">Shifts without coverage</p>
                </div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {data.complianceMetrics.unfilledShifts}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
