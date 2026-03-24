"use client"

import { useState } from "react"
import { History, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"

interface AuditEntry {
  id: string
  action: string
  description: string
  justification: string | null
  performedBy: string
  createdAt: string
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  override_hard_rule: "Hard Rule Override",
  override_soft_rule: "Soft Rule Override",
  callout_logged: "Callout Logged",
  callout_filled: "Callout Filled",
  swap_requested: "Swap Requested",
  swap_approved: "Swap Approved",
  open_swap_approved: "Open Swap Approved",
  swap_denied: "Swap Denied",
  manual_assignment: "Manual Assignment",
  leave_requested: "Leave Requested",
  leave_approved: "Leave Approved",
  leave_denied: "Leave Denied",
  open_shift_created: "Coverage Created",
  open_shift_filled: "Coverage Filled",
  open_shift_cancelled: "Coverage Cancelled",
  assignment_cancelled_for_leave: "Assignment Cancelled",
  callout_created_for_leave: "Callout (Leave)",
  schedule_auto_generated: "Schedule Generated",
  acuity_changed: "Census Tier Changed",
  census_changed: "Census Count Changed",
}

const ACTION_COLORS: Record<string, BadgeVariant> = {
  created: "default",
  updated: "secondary",
  deleted: "destructive",
  override_hard_rule: "destructive",
  callout_logged: "destructive",
  callout_filled: "default",
  swap_requested: "outline",
  swap_approved: "default",
  open_swap_approved: "default",
  swap_denied: "destructive",
  manual_assignment: "secondary",
  leave_requested: "outline",
  leave_approved: "default",
  leave_denied: "destructive",
  open_shift_created: "outline",
  open_shift_filled: "default",
  open_shift_cancelled: "destructive",
  assignment_cancelled_for_leave: "destructive",
  callout_created_for_leave: "destructive",
  schedule_auto_generated: "secondary",
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

interface EntityHistoryDialogProps {
  entityId: string
  entityType: string
  title: string
}

export function EntityHistoryDialog({ entityId, entityType, title }: EntityHistoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadHistory() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/audit?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=50`
      )
      if (!res.ok) throw new Error("Failed to load history")
      const data: AuditEntry[] = await res.json()
      setEntries(data)
    } catch {
      setError("Could not load history. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(value: boolean) {
    setOpen(value)
    if (value) loadHistory()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="View history"
        >
          <History size={14} />
          <span className="sr-only">View history</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 size={18} className="animate-spin mr-2" />
              Loading history…
            </div>
          )}

          {error && !loading && (
            <div className="text-sm text-destructive text-center py-6">{error}</div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">
              No history recorded yet.
            </div>
          )}

          {!loading && !error && entries.length > 0 && (
            <ol className="relative border-l border-border ml-3 space-y-4">
              {entries.map((entry) => (
                <li key={entry.id} className="ml-4">
                  <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-muted-foreground/40" />
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <Badge variant={ACTION_COLORS[entry.action] ?? "secondary"} className="text-[10px] px-1.5 py-0">
                      {ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {formatTimestamp(entry.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-snug">{entry.description}</p>
                  {entry.justification && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">
                      Reason: {entry.justification}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">by {entry.performedBy}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
