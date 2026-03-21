"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

interface UnitConfig {
  id: string;
  name: string;
  description: string | null;
  weekendRuleType: "count_per_period" | "alternate_weekends";
  weekendShiftsRequired: number;
  schedulePeriodWeeks: number;
  holidayShiftsRequired: number;
  escalationSequence: string[];
  lowCensusOrder: string[];
  otApprovalThreshold: number;
  maxOnCallPerWeek: number;
  maxOnCallWeekendsPerMonth: number;
  maxConsecutiveWeekends: number;
  minStaffDay: number;
  minStaffNight: number;
  isActive: boolean;
}

interface FormState {
  name: string;
  description: string;
  weekendRuleType: "count_per_period" | "alternate_weekends";
  weekendShiftsRequired: number;
  schedulePeriodWeeks: number;
  holidayShiftsRequired: number;
  escalationSequence: string[];
  lowCensusOrder: string[];
  otApprovalThreshold: number;
  maxOnCallPerWeek: number;
  maxOnCallWeekendsPerMonth: number;
  maxConsecutiveWeekends: number;
  minStaffDay: number;
  minStaffNight: number;
}

const defaultForm: FormState = {
  name: "",
  description: "",
  weekendRuleType: "count_per_period",
  weekendShiftsRequired: 3,
  schedulePeriodWeeks: 6,
  holidayShiftsRequired: 1,
  escalationSequence: ["float", "per_diem", "overtime", "agency"],
  lowCensusOrder: ["voluntary", "overtime", "per_diem", "full_time"],
  otApprovalThreshold: 4,
  maxOnCallPerWeek: 1,
  maxOnCallWeekendsPerMonth: 1,
  maxConsecutiveWeekends: 2,
  minStaffDay: 3,
  minStaffNight: 2,
};

export default function UnitsPage() {
  const [units, setUnits] = useState<UnitConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitConfig | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/units");
    const data = await res.json();
    setUnits(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openNewDialog() {
    setEditingUnit(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEditDialog(unit: UnitConfig) {
    setEditingUnit(unit);
    setForm({
      name: unit.name,
      description: unit.description || "",
      weekendRuleType: unit.weekendRuleType,
      weekendShiftsRequired: unit.weekendShiftsRequired,
      schedulePeriodWeeks: unit.schedulePeriodWeeks,
      holidayShiftsRequired: unit.holidayShiftsRequired,
      escalationSequence: unit.escalationSequence,
      lowCensusOrder: unit.lowCensusOrder,
      otApprovalThreshold: unit.otApprovalThreshold,
      maxOnCallPerWeek: unit.maxOnCallPerWeek,
      maxOnCallWeekendsPerMonth: unit.maxOnCallWeekendsPerMonth,
      maxConsecutiveWeekends: unit.maxConsecutiveWeekends,
      minStaffDay: unit.minStaffDay,
      minStaffNight: unit.minStaffNight,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingUnit) {
      await fetch(`/api/units/${editingUnit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setDialogOpen(false);
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this unit?")) return;
    await fetch(`/api/units/${id}`, { method: "DELETE" });
    fetchData();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Unit Configuration</h1>
          <p className="mt-1 text-muted-foreground">
            Configure scheduling rules and policies for each unit
          </p>
        </div>
        <Button onClick={openNewDialog}>Add Unit</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : units.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No units configured. Add a unit to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {units.map((unit) => (
            <Card key={unit.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle>{unit.name}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(unit)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(unit.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {unit.description && (
                  <CardDescription>{unit.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Weekend Rule</p>
                    <p className="font-medium">
                      {unit.weekendRuleType === "count_per_period"
                        ? `${unit.weekendShiftsRequired} shifts / ${unit.schedulePeriodWeeks} weeks`
                        : "Alternate weekends"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Holiday Shifts</p>
                    <p className="font-medium">{unit.holidayShiftsRequired} per period</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">OT Approval Threshold</p>
                    <p className="font-medium">{unit.otApprovalThreshold} hours</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Max Consecutive Weekends</p>
                    <p className="font-medium">{unit.maxConsecutiveWeekends}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Callout Escalation Order</p>
                    <p className="font-medium">{unit.escalationSequence.join(" → ")}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Low Census Order</p>
                    <p className="font-medium">{unit.lowCensusOrder.join(" → ")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Min Staff (Day)</p>
                    <p className="font-medium">{unit.minStaffDay}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Min Staff (Night)</p>
                    <p className="font-medium">{unit.minStaffNight}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Edit Unit" : "Add Unit"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unit Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., ICU"
                  required
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g., Intensive Care Unit"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Weekend Fairness</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Weekend Rule Type</Label>
                  <Select
                    value={form.weekendRuleType}
                    onValueChange={(v) =>
                      setForm({ ...form, weekendRuleType: v as "count_per_period" | "alternate_weekends" })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count_per_period">Count Per Period</SelectItem>
                      <SelectItem value="alternate_weekends">Alternate Weekends</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Weekend Shifts Required</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.weekendShiftsRequired}
                    onChange={(e) => setForm({ ...form, weekendShiftsRequired: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Schedule Period (weeks)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.schedulePeriodWeeks}
                    onChange={(e) => setForm({ ...form, schedulePeriodWeeks: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Holiday & On-Call</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Holiday Shifts Required</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.holidayShiftsRequired}
                    onChange={(e) => setForm({ ...form, holidayShiftsRequired: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Max On-Call/Week</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.maxOnCallPerWeek}
                    onChange={(e) => setForm({ ...form, maxOnCallPerWeek: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Max On-Call Weekends/Month</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.maxOnCallWeekendsPerMonth}
                    onChange={(e) => setForm({ ...form, maxOnCallWeekendsPerMonth: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Limits & Thresholds</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max Consecutive Weekends</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.maxConsecutiveWeekends}
                    onChange={(e) => setForm({ ...form, maxConsecutiveWeekends: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>OT Approval Threshold (hours)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.otApprovalThreshold}
                    onChange={(e) => setForm({ ...form, otApprovalThreshold: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Minimum Staffing Floor</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Absolute minimum staff per shift regardless of census level. The effective
                requirement will be <strong>max(census-based, this floor)</strong>. Applies
                as a hard rule — shifts cannot be saved below this count.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Staff — Day Shift</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.minStaffDay}
                    onChange={(e) => setForm({ ...form, minStaffDay: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Min Staff — Night / Evening Shift</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.minStaffNight}
                    onChange={(e) => setForm({ ...form, minStaffNight: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingUnit ? "Save Changes" : "Create Unit"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
