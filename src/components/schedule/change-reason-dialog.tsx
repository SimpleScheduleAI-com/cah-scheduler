"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Reason prompt for changes to a PUBLISHED schedule.
 *
 * A published schedule is the version of record nurses have seen. Hand changes
 * after that are amendments — allowed, but each one must be explained. The
 * reason goes into the audit trail and, for assign/remove, is shown to the
 * affected nurse in their notification. Unpublish is the wholesale-rework path
 * and withdraws the schedule from everyone, so it needs a reason too.
 */
export type ChangeReasonMode = "assign" | "remove" | "unpublish";

const COPY: Record<
  ChangeReasonMode,
  { title: string; description: string; confirm: string; placeholder: string }
> = {
  assign: {
    title: "Add to a published schedule",
    description:
      "Nurses have already seen this schedule. The reason is recorded in the audit trail and shown to the nurse being added.",
    confirm: "Add and notify",
    placeholder: "e.g. Covering for approved leave; census up on the 17th",
  },
  remove: {
    title: "Remove from a published schedule",
    description:
      "Nurses have already seen this schedule. The reason is recorded in the audit trail and shown to the nurse being removed.",
    confirm: "Remove and notify",
    placeholder:
      "e.g. Low census release; moved to night shift at nurse's request",
  },
  unpublish: {
    title: "Unpublish this schedule?",
    description:
      "This withdraws the schedule from every nurse until it is published again, and re-publishing alerts all of them. For a one-person change, close this and edit the shift instead — that is recorded as an amendment. Unpublish only for wholesale rework.",
    confirm: "Unpublish",
    placeholder: "e.g. Regenerating after three new hires start on the 21st",
  },
};

interface ChangeReasonDialogProps {
  open: boolean;
  mode: ChangeReasonMode;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function ChangeReasonDialog({
  open,
  mode,
  onCancel,
  onConfirm,
}: ChangeReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[mode];

  // Fresh textarea each time the dialog opens.
  useEffect(() => {
    if (open) {
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  const trimmed = reason.trim();

  async function confirm() {
    if (trimmed.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="change-reason">Reason</Label>
          <Textarea
            id="change-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={copy.placeholder}
            rows={3}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={trimmed.length === 0 || submitting}
            variant={mode === "unpublish" ? "destructive" : "default"}
          >
            {submitting ? "Saving…" : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
