"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { SkeletonCard } from "@/components/ui/skeleton";

interface Schedule {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  unit: string;
  status: string;
  createdAt: string;
}

interface Unit {
  id: string;
  name: string;
  staffCount: number;
}

export default function SchedulePage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");

  const fetchSchedules = useCallback(async () => {
    const res = await fetch("/api/schedules");
    setSchedules(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedules();
    fetch("/api/units")
      .then((r) => r.json())
      .then(setUnits);
  }, [fetchSchedules]);

  function openDialog() {
    setName("");
    setStartDate("");
    setEndDate("");
    // Default to unit from most recent non-archived schedule; fall back to first unit
    const lastUnit = schedules
      .filter((s) => s.status !== "archived")
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.unit;
    setSelectedUnit(lastUnit ?? units[0]?.name ?? "");
    setError(null);
    setDialogOpen(true);
  }

  async function handleCreate() {
    if (!name.trim() || !startDate || !endDate || !selectedUnit) {
      setError("All fields are required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after start date.");
      return;
    }

    setCreating(true);
    setError(null);

    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), startDate, endDate, unit: selectedUnit }),
    });

    if (!res.ok) {
      setError("Failed to create schedule. Please try again.");
      setCreating(false);
      return;
    }

    const created = await res.json();
    setDialogOpen(false);
    setCreating(false);
    router.push(`/schedule/${created.id}`);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SkeletonCard />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule Builder</h1>
          <p className="mt-1 text-muted-foreground">
            {schedules.length} schedule period{schedules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openDialog}>New Schedule</Button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-muted p-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
            </svg>
          </div>
          <p className="text-lg font-medium">No schedule periods yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Get started by creating your first schedule period
          </p>
          <Button onClick={openDialog} className="mt-4">
            New Schedule
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((s, index) => (
            <Link key={s.id} href={`/schedule/${s.id}`}>
              <Card
                className="cursor-pointer transition-all hover:bg-accent hover:shadow-lg hover:-translate-y-0.5 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <Badge
                      variant={
                        s.status === "published"
                          ? "default"
                          : s.status === "draft"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(s.startDate), "MMM d")} -{" "}
                    {format(parseISO(s.endDate), "MMM d, yyyy")}
                  </p>
                  <p className="text-sm text-muted-foreground">{s.unit}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Schedule Period</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="sched-name">Schedule Name</Label>
              <Input
                id="sched-name"
                placeholder="e.g. ICU — Feb/Mar 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sched-start">Start Date</Label>
                <Input
                  id="sched-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-end">End Date</Label>
                <Input
                  id="sched-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.name}>
                      <span className="flex items-center justify-between gap-4 w-full">
                        <span>{u.name}</span>
                        <span className={`text-xs ${u.staffCount === 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {u.staffCount} staff
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {units.length === 0 && (
                <p className="text-xs text-destructive">
                  No units found. Import your data first via the Setup page.
                </p>
              )}
              {(() => {
                const selected = units.find((u) => u.name === selectedUnit);
                if (!selected) return null;
                if (selected.staffCount === 0) {
                  return (
                    <p className="text-xs text-destructive">
                      No active staff are assigned to {selected.name}. A schedule cannot be generated without staff. Go to{" "}
                      <a href="/setup" className="underline">Import / Export</a> to load your roster first.
                    </p>
                  );
                }
                if (selected.staffCount < 5) {
                  return (
                    <p className="text-xs text-yellow-600">
                      Only {selected.staffCount} staff assigned to {selected.name}. The generated schedule may be significantly understaffed.
                    </p>
                  );
                }
                return null;
              })()}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || units.length === 0 || (units.find((u) => u.name === selectedUnit)?.staffCount ?? 1) === 0}
            >
              {creating ? "Creating…" : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
