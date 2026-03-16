"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart } from "@/components/ui/line-chart";
import { BarChart } from "@/components/ui/bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
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

interface AnalyticsData {
  fillRateTrend: { label: string; value: number }[];
  overtimeByStaff: { label: string; value: number; color: string }[];
  calloutTrend: { label: string; value: number }[];
  weekendDistribution: { label: string; value: number; color: string }[];
  holidayBalance: { label: string; value: number; color: string }[];
  costAnalysis: { overtime: number; regular: number; agency: number };
  staffWorkload: { label: string; value: number; color: string }[];
  complianceMetrics: {
    violations: number;
    overtimeInstances: number;
    unfilledShifts: number;
  };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch("/api/analytics");
        const analyticsData = await res.json();
        setData(analyticsData);
      } catch (error) {
        console.error("Failed to fetch analytics:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics & Insights</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive scheduling metrics and trends
          </p>
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

  const totalCost = data.costAnalysis.overtime + data.costAnalysis.regular + data.costAnalysis.agency;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Analytics & Insights
        </h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive scheduling metrics, trends, and compliance data
        </p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Fill Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.fillRateTrend.length > 0
                ? Math.round(
                    data.fillRateTrend.reduce((sum, d) => sum + d.value, 0) / data.fillRateTrend.length
                  )
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last 6 weeks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Violations</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.complianceMetrics.violations}</div>
            <p className="text-xs text-muted-foreground mt-1">Current schedule period</p>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Labor Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(totalCost / 1000).toFixed(1)}k</div>
            <p className="text-xs text-muted-foreground mt-1">Current schedule period</p>
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
            <CardDescription>Weekly fill rate over the last 6 weeks</CardDescription>
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
            <CardDescription>Top 10 staff members by overtime (last 6 weeks)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.overtimeByStaff.length > 0 ? (
              <BarChart
                data={data.overtimeByStaff}
                width={500}
                height={250}
                yAxisLabel="Hours"
              />
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
            <CardDescription>Weekly callouts over the last 4 weeks</CardDescription>
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
              <Calendar className="h-5 w-5 text-purple-600" />
              Weekend Distribution
            </CardTitle>
            <CardDescription>Weekend assignments per staff (current period)</CardDescription>
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

        {/* Cost Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Labor Cost Breakdown
            </CardTitle>
            <CardDescription>Cost distribution by type (current period)</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={[
                { label: "Regular", value: data.costAnalysis.regular, color: "#3B82F6" },
                { label: "Overtime", value: data.costAnalysis.overtime, color: "#f59e0b" },
                { label: "Agency", value: data.costAnalysis.agency, color: "#ef4444" },
              ]}
              width={500}
              height={250}
              yAxisLabel="Cost ($)"
            />
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Cost:</span>
                <span className="font-semibold">${totalCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Regular:</span>
                <span>{((data.costAnalysis.regular / totalCost) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Overtime:</span>
                <span>{((data.costAnalysis.overtime / totalCost) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Agency:</span>
                <span>{((data.costAnalysis.agency / totalCost) * 100).toFixed(1)}%</span>
              </div>
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
            <CardDescription>Total hours worked per staff (top 12)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.staffWorkload.length > 0 ? (
              <BarChart
                data={data.staffWorkload}
                width={500}
                height={250}
                yAxisLabel="Hours"
              />
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
            <CardDescription>Current schedule period compliance status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <div>
                  <p className="text-sm font-medium">Rule Violations</p>
                  <p className="text-xs text-muted-foreground">Hard and soft rule breaks</p>
                </div>
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {data.complianceMetrics.violations}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                <div>
                  <p className="text-sm font-medium">Overtime Instances</p>
                  <p className="text-xs text-muted-foreground">Assignments exceeding 40 hrs/week</p>
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
