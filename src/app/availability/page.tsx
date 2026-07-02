"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTip, TERM_HELP } from "@/components/ui/info-tip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PRNAvailability {
  id: string;
  staffId: string;
  staffFirstName: string | null;
  staffLastName: string | null;
  scheduleId: string;
  availableDates: string[];
  notes: string | null;
  submittedAt: string | null;
  createdAt: string;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  employmentType: string;
}

export default function AvailabilityPage() {
  const [availability, setAvailability] = useState<PRNAvailability[]>([]);
  const [prnStaff, setPrnStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [availRes, staffRes] = await Promise.all([
      fetch("/api/prn-availability"),
      fetch("/api/staff"),
    ]);
    const availData = await availRes.json();
    const staffData = await staffRes.json();
    setAvailability(availData);
    setPrnStaff(staffData.filter((s: StaffMember) => s.employmentType === "per_diem"));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group availability by staff
  const availabilityByStaff = new Map<string, PRNAvailability>();
  for (const a of availability) {
    availabilityByStaff.set(a.staffId, a);
  }

  // Find PRN staff who haven't submitted
  const submittedStaffIds = new Set(availability.map(a => a.staffId));
  const missingSubmissions = prnStaff.filter(s => !submittedStaffIds.has(s.id));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          <span className="inline-flex items-center gap-2">
            PRN Availability
            <InfoTip label="What does PRN mean?">{TERM_HELP.prn}</InfoTip>
          </span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          View availability submitted by per diem (PRN) staff for scheduling
        </p>
      </div>

      {missingSubmissions.length > 0 && (
        <Card className="mb-6 border-yellow-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-yellow-600">Missing Submissions</CardTitle>
            <CardDescription>
              The following PRN staff have not submitted their availability
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {missingSubmissions.map(s => (
                <Badge key={s.id} variant="outline">
                  {s.firstName} {s.lastName}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Submitted Availability</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : availability.length === 0 ? (
            <p className="text-muted-foreground">No availability submissions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Available Days</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availability.map((avail) => (
                  <TableRow key={avail.id}>
                    <TableCell className="font-medium">
                      {avail.staffFirstName} {avail.staffLastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {avail.availableDates.length} days
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {avail.availableDates.slice(0, 3).join(", ")}
                          {avail.availableDates.length > 3 && "..."}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{avail.notes || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {avail.submittedAt ? new Date(avail.submittedAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Availability Calendar</CardTitle>
          <CardDescription>Visual overview of PRN availability</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {availability.map((avail) => (
              <div key={avail.id} className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">
                  {avail.staffFirstName} {avail.staffLastName}
                </h4>
                <div className="flex flex-wrap gap-1">
                  {avail.availableDates.map((date) => {
                    const d = new Date(date);
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <Badge
                        key={date}
                        variant={isWeekend ? "default" : "outline"}
                        className="text-xs"
                      >
                        {d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" })}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
