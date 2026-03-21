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
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SwapRequest {
  id: string;
  requestingStaffId: string;
  targetStaffId: string | null;
  requestingAssignmentId: string;
  targetAssignmentId: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  notes: string | null;
  requestor: { firstName: string; lastName: string } | null;
  target: { firstName: string; lastName: string } | null;
  requestorShiftDate: string | null;
  targetShiftDate: string | null;
  createdAt: string;
}

interface SwapViolation {
  staffId: string;
  staffName: string;
  ruleId: string;
  severity: "hard";
  description: string;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AssignmentOption {
  id: string;
  shiftId: string;
  scheduleId: string;
  isChargeNurse: boolean;
  status: string;
  date: string;
  shiftName: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  scheduleName: string;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  denied: "destructive",
  cancelled: "outline",
};

function formatAssignmentLabel(a: AssignmentOption): string {
  return `${format(parseISO(a.date), "EEE, MMM d")} — ${a.shiftName} (${a.startTime}–${a.endTime})`;
}

export default function SwapsPage() {
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "denied">("all");

  // Two-step approve: pre-validation confirmation dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmSwapId, setConfirmSwapId] = useState<string | null>(null);
  const [confirmValidating, setConfirmValidating] = useState(false);
  const [confirmViolations, setConfirmViolations] = useState<SwapViolation[]>([]);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmValid, setConfirmValid] = useState(false);
  const [confirmOpenRequest, setConfirmOpenRequest] = useState(false);
  const [confirmApproving, setConfirmApproving] = useState(false);

  // Log swap dialog state
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [requestingStaffId, setRequestingStaffId] = useState("");
  const [requestingAssignments, setRequestingAssignments] = useState<AssignmentOption[]>([]);
  const [requestingAssignmentId, setRequestingAssignmentId] = useState("");
  const [targetStaffId, setTargetStaffId] = useState("");
  const [targetAssignments, setTargetAssignments] = useState<AssignmentOption[]>([]);
  const [targetAssignmentId, setTargetAssignmentId] = useState("");
  const [swapNotes, setSwapNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/swap-requests");
    const data = await res.json();
    setSwapRequests(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Step 1: Approve clicked — run pre-validation and open confirmation dialog
  async function handleApproveClick(id: string) {
    setConfirmSwapId(id);
    setConfirmViolations([]);
    setConfirmError(null);
    setConfirmValid(false);
    setConfirmOpenRequest(false);
    setConfirmValidating(true);
    setConfirmDialogOpen(true);

    const res = await fetch(`/api/swap-requests/${id}/validate`);
    const data = await res.json();
    setConfirmValidating(false);

    if (!res.ok) {
      setConfirmError(data.error ?? "An unexpected error occurred during validation.");
      return;
    }

    setConfirmValid(data.valid);
    setConfirmViolations(data.violations ?? []);
    setConfirmOpenRequest(data.openRequest ?? false);
    if (!data.valid && data.error) {
      setConfirmError(data.error);
    }
  }

  // Step 2: Manager confirmed — execute the actual approval
  async function handleConfirmApprove() {
    if (!confirmSwapId) return;
    setConfirmApproving(true);
    const res = await fetch(`/api/swap-requests/${confirmSwapId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    setConfirmApproving(false);
    setConfirmDialogOpen(false);
    // Safety net: if the PUT still returns violations (edge case), surface them
    if (!res.ok) {
      const data = await res.json();
      if (res.status === 422 && data.violations) {
        setConfirmViolations(data.violations);
        setConfirmValid(false);
        setConfirmDialogOpen(true);
      }
      return;
    }
    fetchData();
  }

  async function handleDeny(id: string) {
    let validationNotes: string | undefined;
    try {
      const vRes = await fetch(`/api/swap-requests/${id}/validate`);
      const vData = await vRes.json();
      if (Array.isArray(vData.violations) && vData.violations.length > 0) {
        validationNotes = vData.violations
          .map((v: { description: string }) => v.description)
          .join("; ");
      }
    } catch {
      // validation failure does not block the denial
    }
    await fetch(`/api/swap-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "denied", validationNotes }),
    });
    fetchData();
  }

  async function openLogDialog() {
    if (allStaff.length === 0) {
      const res = await fetch("/api/staff");
      const data = await res.json();
      setAllStaff(data);
    }
    setRequestingStaffId("");
    setRequestingAssignments([]);
    setRequestingAssignmentId("");
    setTargetStaffId("");
    setTargetAssignments([]);
    setTargetAssignmentId("");
    setSwapNotes("");
    setLogDialogOpen(true);
  }

  async function onRequestingStaffChange(staffId: string) {
    setRequestingStaffId(staffId);
    setRequestingAssignmentId("");
    if (!staffId) {
      setRequestingAssignments([]);
      return;
    }
    const res = await fetch(`/api/assignments?staffId=${staffId}`);
    const data = await res.json();
    setRequestingAssignments(data);
  }

  async function onTargetStaffChange(staffId: string) {
    setTargetStaffId(staffId);
    setTargetAssignmentId("");
    if (!staffId || staffId === "none") {
      setTargetAssignments([]);
      return;
    }
    const res = await fetch(`/api/assignments?staffId=${staffId}`);
    const data = await res.json();
    setTargetAssignments(data);
  }

  async function handleSubmitSwap() {
    if (!requestingStaffId || !requestingAssignmentId) return;
    setSubmitting(true);
    await fetch("/api/swap-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestingStaffId,
        requestingAssignmentId,
        targetStaffId: targetStaffId && targetStaffId !== "none" ? targetStaffId : null,
        targetAssignmentId: targetAssignmentId || null,
        notes: swapNotes || null,
      }),
    });
    setSubmitting(false);
    setLogDialogOpen(false);
    fetchData();
  }

  const filteredRequests = filter === "all"
    ? swapRequests
    : swapRequests.filter(r => r.status === filter);

  const pendingCount = swapRequests.filter(r => r.status === "pending").length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shift Swap Requests</h1>
          <p className="mt-1 text-muted-foreground">
            {swapRequests.length} total requests ({pendingCount} pending review)
          </p>
        </div>
        <Button onClick={openLogDialog}>Log Swap Request</Button>
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
          <CardTitle>Swap Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filteredRequests.length === 0 ? (
            <p className="text-muted-foreground">No swap requests found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requesting Staff</TableHead>
                  <TableHead>Their Shift</TableHead>
                  <TableHead>Target Staff</TableHead>
                  <TableHead>Target Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {req.requestor?.firstName} {req.requestor?.lastName}
                    </TableCell>
                    <TableCell>{req.requestorShiftDate || "—"}</TableCell>
                    <TableCell>
                      {req.target ? (
                        `${req.target.firstName} ${req.target.lastName}`
                      ) : (
                        <span className="text-muted-foreground italic">Open request</span>
                      )}
                    </TableCell>
                    <TableCell>{req.targetShiftDate || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[req.status]}>{req.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-50 truncate">{req.notes}</TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApproveClick(req.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeny(req.id)}
                          >
                            Deny
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Log Swap Request Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Swap Request</DialogTitle>
            <DialogDescription>
              Record a shift swap request between two staff members. Target staff and assignment
              are optional for open swap requests.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Requesting staff */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Requesting Staff</h4>
              <div className="space-y-1.5">
                <Label>Staff member</Label>
                <Select value={requestingStaffId} onValueChange={onRequestingStaffChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff…" />
                  </SelectTrigger>
                  <SelectContent>
                    {allStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {requestingStaffId && (
                <div className="space-y-1.5">
                  <Label>Shift to swap away</Label>
                  {requestingAssignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No upcoming assignments found.
                    </p>
                  ) : (
                    <Select value={requestingAssignmentId} onValueChange={setRequestingAssignmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assignment…" />
                      </SelectTrigger>
                      <SelectContent>
                        {requestingAssignments.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {formatAssignmentLabel(a)}
                            {a.isChargeNurse ? " ★ Charge" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {/* Target staff (optional) */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-semibold">
                Target Staff{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </h4>
              <div className="space-y-1.5">
                <Label>Staff member</Label>
                <Select
                  value={targetStaffId}
                  onValueChange={onTargetStaffChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Leave blank for open request…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Open request (no specific target) —</SelectItem>
                    {allStaff
                      .filter((s) => s.id !== requestingStaffId)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} ({s.role})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {targetStaffId && targetStaffId !== "none" && (
                <div className="space-y-1.5">
                  <Label>Shift to swap into</Label>
                  {targetAssignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No upcoming assignments found.
                    </p>
                  ) : (
                    <Select value={targetAssignmentId} onValueChange={setTargetAssignmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assignment…" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetAssignments.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {formatAssignmentLabel(a)}
                            {a.isChargeNurse ? " ★ Charge" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Reason for swap request…"
                value={swapNotes}
                onChange={(e) => setSwapNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setLogDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitSwap}
                disabled={!requestingStaffId || !requestingAssignmentId || submitting}
              >
                {submitting ? "Submitting…" : "Submit Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pre-validation Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirmValidating
                ? "Checking Rules…"
                : confirmError
                  ? "Cannot Approve Swap"
                  : confirmViolations.length > 0
                    ? "Swap Cannot Be Approved"
                    : "Confirm Approval"}
            </DialogTitle>
            <DialogDescription>
              {confirmValidating
                ? "Validating shift compatibility…"
                : confirmError
                  ? confirmError
                  : confirmViolations.length > 0
                    ? "This swap would violate one or more hard scheduling rules. Resolve the issues below before approving."
                    : confirmOpenRequest
                      ? "This is an open swap request with no target staff selected. Approving will mark the assignment as swapped and create a coverage request."
                      : "All scheduling rules pass. Confirm to complete the swap."}
            </DialogDescription>
          </DialogHeader>

          {confirmValidating && (
            <p className="text-sm text-muted-foreground">Validating…</p>
          )}

          {!confirmValidating && confirmViolations.length > 0 && (
            <div className="space-y-3">
              {confirmViolations.map((v, i) => (
                <Alert key={i} variant="destructive">
                  <AlertTitle className="capitalize">{v.ruleId.replace(/-/g, " ")}</AlertTitle>
                  <AlertDescription>{v.description}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {!confirmValidating && confirmValid && !confirmError && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <AlertTitle className="text-green-700 dark:text-green-300">No violations found</AlertTitle>
              <AlertDescription className="text-green-600 dark:text-green-400">
                This swap is compatible with all scheduling rules.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              {confirmViolations.length > 0 || confirmError ? "Close" : "Cancel"}
            </Button>
            {!confirmValidating && confirmValid && !confirmError && (
              <Button onClick={handleConfirmApprove} disabled={confirmApproving}>
                {confirmApproving ? "Approving…" : "Confirm Approval"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
