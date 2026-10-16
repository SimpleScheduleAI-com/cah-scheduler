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
import { getStandardHolidays } from "@/lib/holidays/standard-holidays";

interface Holiday {
  id: string;
  name: string;
  date: string;
  year: number;
  isActive: boolean;
  createdAt: string;
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ name: "", date: "" });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/holidays");
    const data = await res.json();
    setHolidays(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openNewDialog() {
    setEditingHoliday(null);
    setForm({ name: "", date: "" });
    setDialogOpen(true);
  }

  function openEditDialog(holiday: Holiday) {
    setEditingHoliday(holiday);
    setForm({ name: holiday.name, date: holiday.date });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingHoliday) {
      await fetch(`/api/holidays/${editingHoliday.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setDialogOpen(false);
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this holiday?")) return;
    await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function addStandardHolidays(year: number) {
    // Date-only strings computed per year by rule (see standard-holidays.ts);
    // never via new Date(y, m, d).toISOString(), which is a day early east of UTC.
    for (const h of getStandardHolidays(year)) {
      await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: h.name, date: h.date, year }),
      });
    }
    fetchData();
  }

  const years = [...new Set(holidays.map((h) => h.year))].sort((a, b) => b - a);
  if (!years.includes(selectedYear)) {
    years.push(selectedYear);
    years.sort((a, b) => b - a);
  }

  const filteredHolidays = holidays
    .filter((h) => h.year === selectedYear)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Public Holidays</h1>
          <p className="mt-1 text-muted-foreground">
            Manage holidays that affect scheduling and fairness calculations
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => addStandardHolidays(selectedYear)}
          >
            Add Standard Holidays ({selectedYear})
          </Button>
          <Button onClick={openNewDialog}>Add Holiday</Button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {years.map((year) => (
          <Button
            key={year}
            variant={selectedYear === year ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedYear(year)}
          >
            {year}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedYear(selectedYear + 1)}
        >
          + {selectedYear + 1}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holidays for {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : filteredHolidays.length === 0 ? (
            <p className="text-muted-foreground">
              No holidays configured for {selectedYear}. Click &quot;Add
              Standard Holidays&quot; to add common US holidays.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Holiday</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Day of Week</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHolidays.map((holiday) => {
                  const date = new Date(holiday.date + "T00:00:00");
                  const dayOfWeek = date.toLocaleDateString("en-US", {
                    weekday: "long",
                  });
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-medium">
                        {holiday.name}
                      </TableCell>
                      <TableCell>
                        {date.toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isWeekend ? "secondary" : "outline"}>
                          {dayOfWeek}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(holiday)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(holiday.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingHoliday ? "Edit Holiday" : "Add Holiday"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Holiday Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Christmas Day"
                required
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingHoliday ? "Save Changes" : "Add Holiday"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
