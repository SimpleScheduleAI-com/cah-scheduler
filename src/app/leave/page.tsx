"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityHistoryDialog } from "@/components/ui/entity-history-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeaveRequest {
  id: string;
  staffId: string;
  staffFirstName: string | null;
  staffLastName: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "denied";
  notes: string | null;
  reason: string | null;
  submittedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  denialReason: string | null;
  createdAt: string;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
}

const leaveTypeLabels: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick Leave",
  maternity: "Maternity/Paternity",
  medical: "Medical Leave",
  personal: "Personal",
  bereavement: "Bereavement",
  other: "Other",
};

const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  denied: "destructive",
};

function calcDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

export default function LeavePage() {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "denied">("all");

  // Detail dialog
  const [detailRequest, setDetailRequest] = useState<LeaveRequest | null>(null);

  // Denial dialog
  const [denyTarget, setDenyTarget] = useState<LeaveRequest | null>(null);
  const [denialReason, setDenialReason] = useState("");
  const [denyError, setDenyError] = useState("");

  const [form, setForm] = useState({
    staffId: "",
    leaveType: "vacation",
    startDate: "",
    endDate: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    const [leaveRes, staffRes] = await Promise.all([
      fetch("/api/staff-leave"),
      fetch("/api/staff"),
    ]);
    const leaveData = await leaveRes.json();
    const staffData = await staffRes.json();
    setLeaveRequests(leaveData);
    setStaff(staffData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/staff-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setDialogOpen(false);
    setForm({ staffId: "", leaveType: "vacation", startDate: "", endDate: "", notes: "" });
    fetchData();
  }

  async function handleApprove(id: string) {
    await fetch(`/api/staff-leave/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    fetchData();
  }

  async function handleDenySubmit() {
    if (!denyTarget) return;
    if (!denialReason.trim()) {
      setDenyError("A denial reason is required.");
      return;
    }
    const res = await fetch(`/api/staff-leave/${denyTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "denied", denialReason: denialReason.trim() }),
    });
    if (!res.ok) {
      const data = await res.json();
      setDenyError(data.error ?? "Failed to deny request.");
      return;
    }
    setDenyTarget(null);
    setDenialReason("");
    setDenyError("");
    fetchData();
  }

  const filteredRequests = filter === "all"
    ? leaveRequests
    : leaveRequests.filter(r => r.status === filter);

  const pendingCount = leaveRequests.filter(r => r.status === "pending").length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="mt-1 text-muted-foreground">
            {leaveRequests.length} total requests ({pendingCount} pending)
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>New Leave Request</Button>
      </div>

      <div className="mb-4 flex gap-2">
        {(["all", "pending", "approved", "denied"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && pendingCount > 0 && (
              <Badge variant="secondary" className="ml-2">{pendingCount}</Badge>
            )}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leave Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {req.staffFirstName} {req.staffLastName}
                    </TableCell>
                    <TableCell>{leaveTypeLabels[req.leaveType] || req.leaveType}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {req.startDate} — {req.endDate}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {calcDays(req.startDate, req.endDate)}d
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[req.status]}>{req.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(req.submittedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {req.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleApprove(req.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => { setDenyTarget(req); setDenialReason(""); setDenyError(""); }}
                            >
                              Deny
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailRequest(req)}
                        >
                          View
                        </Button>
                        <EntityHistoryDialog
                          entityId={req.id}
                          entityType="leave"
                          title="Leave Request History"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => { if (!open) setDetailRequest(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Request Detail</DialogTitle>
          </DialogHeader>
          {detailRequest && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span className="font-medium text-muted-foreground">Staff</span>
                <span>{detailRequest.staffFirstName} {detailRequest.staffLastName}</span>

                <span className="font-medium text-muted-foreground">Type</span>
                <span>{leaveTypeLabels[detailRequest.leaveType] || detailRequest.leaveType}</span>

                <span className="font-medium text-muted-foreground">Dates</span>
                <span>
                  {detailRequest.startDate} — {detailRequest.endDate}
                  <span className="ml-2 text-muted-foreground">
                    ({calcDays(detailRequest.startDate, detailRequest.endDate)} days)
                  </span>
                </span>

                <span className="font-medium text-muted-foreground">Status</span>
                <Badge variant={statusColors[detailRequest.status]} className="w-fit">
                  {detailRequest.status}
                </Badge>

                <span className="font-medium text-muted-foreground">Submitted</span>
                <span>{new Date(detailRequest.submittedAt).toLocaleString()}</span>

                {detailRequest.status === "approved" && detailRequest.approvedAt && (
                  <>
                    <span className="font-medium text-muted-foreground">Approved</span>
                    <span>{new Date(detailRequest.approvedAt).toLocaleString()}</span>
                    {detailRequest.approvedBy && (
                      <>
                        <span className="font-medium text-muted-foreground">Approved By</span>
                        <span>{detailRequest.approvedBy}</span>
                      </>
                    )}
                  </>
                )}

                {detailRequest.status === "denied" && detailRequest.denialReason && (
                  <>
                    <span className="font-medium text-muted-foreground">Denial Reason</span>
                    <span className="text-destructive">{detailRequest.denialReason}</span>
                  </>
                )}
              </div>

              {(detailRequest.notes || detailRequest.reason) && (
                <div className="rounded-md border p-3">
                  <p className="mb-1 font-medium text-muted-foreground">Notes</p>
                  <p className="text-sm">{detailRequest.notes || detailRequest.reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deny Dialog */}
      <Dialog
        open={!!denyTarget}
        onOpenChange={(open) => {
          if (!open) { setDenyTarget(null); setDenialReason(""); setDenyError(""); }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deny Leave Request</DialogTitle>
          </DialogHeader>
          {denyTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Denying{" "}
                <span className="font-medium text-foreground">
                  {denyTarget.staffFirstName} {denyTarget.staffLastName}
                </span>
                {" "}— {leaveTypeLabels[denyTarget.leaveType] || denyTarget.leaveType},{" "}
                {denyTarget.startDate} to {denyTarget.endDate} ({calcDays(denyTarget.startDate, denyTarget.endDate)} days).
              </p>
              <div>
                <Label>
                  Denial Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={denialReason}
                  onChange={(e) => { setDenialReason(e.target.value); setDenyError(""); }}
                  placeholder="Explain why this request is being denied (required for the audit trail)..."
                  rows={3}
                  className="mt-1"
                />
                {denyError && (
                  <p className="mt-1 text-xs text-destructive">{denyError}</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setDenyTarget(null); setDenialReason(""); setDenyError(""); }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDenySubmit}>
                  Confirm Denial
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Leave Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Staff Member</Label>
              <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leaveType} onValueChange={(v) => setForm({ ...form, leaveType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(leaveTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Reason for leave..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Submit Request</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
