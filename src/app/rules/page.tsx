"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Rule {
  id: string;
  name: string;
  ruleType: string;
  category: string;
  description: string | null;
  parameters: Record<string, unknown>;
  weight: number;
  isActive: boolean;
}

// ── Parameter configuration for hard rules ─────────────────────────────────
type NumberParam = {
  key: string;
  label: string;
  type: "number";
  default: number;
  unit: string;
  warnIf?: (v: number) => string | null;
};
type SelectParam = {
  key: string;
  label: string;
  type: "select";
  options: number[];
  default: number;
};
type ParamField = NumberParam | SelectParam;

const RULE_PARAMS: Record<string, ParamField[]> = {
  "rest-hours": [
    {
      key: "minRestHours",
      label: "Min rest between shifts",
      type: "number",
      default: 10,
      unit: "h",
      warnIf: (v) => (v < 8 ? "Below recommended 8h minimum" : null),
    },
  ],
  "max-consecutive": [
    {
      key: "maxConsecutiveDays",
      label: "Max consecutive days",
      type: "number",
      default: 5,
      unit: "days",
      warnIf: (v) => (v > 5 ? "Exceeds recommended 5-day maximum" : null),
    },
  ],
  "max-hours-60": [
    {
      key: "maxHours",
      label: "Max hours per 7-day window",
      type: "number",
      default: 60,
      unit: "h",
      warnIf: (v) =>
        v < 40
          ? "Below standard 40h/week — may cause gaps"
          : v > 72
          ? "Very high — verify state regulations"
          : null,
    },
  ],
  "icu-competency": [
    {
      key: "minLevel",
      label: "Min competency level",
      type: "select",
      options: [1, 2, 3, 4, 5],
      default: 2,
    },
  ],
  "level1-preceptor": [
    {
      key: "minPreceptorLevel",
      label: "Min preceptor level",
      type: "select",
      options: [3, 4, 5],
      default: 5,
    },
  ],
  "level2-supervision": [
    {
      key: "minSupervisorLevel",
      label: "Min supervisor level",
      type: "select",
      options: [3, 4, 5],
      default: 4,
    },
  ],
  "on-call-limits": [
    {
      key: "maxOnCallPerWeek",
      label: "Max on-call shifts per week",
      type: "number",
      default: 1,
      unit: "",
    },
    {
      key: "maxOnCallWeekendsPerMonth",
      label: "Max on-call weekends per month",
      type: "number",
      default: 1,
      unit: "",
    },
  ],
};

// No-overlapping-shifts is always active; hide the toggle
const LOCKED_RULES = new Set(["no-overlapping-shifts"]);

function paramSummary(evaluatorId: string, parameters: Record<string, unknown>): string {
  const fields = RULE_PARAMS[evaluatorId];
  if (!fields) return "";
  return fields
    .map((f) => {
      const value = (parameters[f.key] as number) ?? f.default;
      if (f.type === "select") return `Level ${value}+`;
      return `${value}${(f as NumberParam).unit}`;
    })
    .join(" · ");
}

interface CensusBand {
  id: string;
  name: string;
  unit: string;
  color: "blue" | "green" | "yellow" | "red";
  minPatients: number;
  maxPatients: number;
  requiredRNs: number;
  requiredLPNs: number;
  requiredCNAs: number;
  requiredChargeNurses: number;
  patientToNurseRatio: string;
  isActive: boolean;
}

const CENSUS_TIER_DOT: Record<string, string> = {
  blue:   "bg-blue-500",
  green:  "bg-green-500",
  yellow: "bg-yellow-500",
  red:    "bg-red-500",
};

const CENSUS_TIER_LABEL: Record<string, string> = {
  blue:   "Blue — Low Census",
  green:  "Green — Normal",
  yellow: "Yellow — Elevated",
  red:    "Red — Critical",
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [bands, setBands] = useState<CensusBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBandId, setEditingBandId] = useState<string | null>(null);
  const [bandDraft, setBandDraft] = useState<Partial<CensusBand> | null>(null);
  const [bandSaving, setBandSaving] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<Record<string, unknown> | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [rulesRes, bandsRes] = await Promise.all([
      fetch("/api/rules"),
      fetch("/api/census-bands"),
    ]);
    setRules(await rulesRes.json());
    setBands(await bandsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function toggleRule(id: string, isActive: boolean) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;

    await fetch(`/api/rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, isActive }),
    });
    fetchData();
  }

  async function updateWeight(id: string, weight: number) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;

    await fetch(`/api/rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, weight }),
    });
    fetchData();
  }

  function startEditBand(band: CensusBand) {
    setEditingBandId(band.id);
    setBandDraft({ ...band });
  }

  function cancelEditBand() {
    setEditingBandId(null);
    setBandDraft(null);
  }

  async function saveBand() {
    if (!bandDraft || !editingBandId) return;
    setBandSaving(true);
    await fetch("/api/census-bands", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingBandId, ...bandDraft }),
    });
    setBandSaving(false);
    setEditingBandId(null);
    setBandDraft(null);
    fetchData();
  }

  function startEditRule(rule: Rule) {
    setEditingRuleId(rule.id);
    setRuleDraft({ ...rule.parameters });
  }

  function cancelEditRule() {
    setEditingRuleId(null);
    setRuleDraft(null);
  }

  async function saveRule() {
    if (!ruleDraft || !editingRuleId) return;
    const rule = rules.find((r) => r.id === editingRuleId);
    if (!rule) return;
    setRuleSaving(true);
    await fetch(`/api/rules/${editingRuleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, parameters: ruleDraft }),
    });
    setRuleSaving(false);
    setEditingRuleId(null);
    setRuleDraft(null);
    fetchData();
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const hardRules = rules.filter((r) => r.ruleType === "hard");
  const softRules = rules.filter((r) => r.ruleType === "soft");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Rules Configuration</h1>
        <p className="mt-1 text-muted-foreground">
          {rules.filter((r) => r.isActive).length} of {rules.length} rules active
        </p>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Scheduling Rules</TabsTrigger>
          <TabsTrigger value="census">Census Bands</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Rules (must always be satisfied)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-52">Rule</TableHead>
                    <TableHead className="w-24">Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-40">Parameters</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-36"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hardRules.map((r) => {
                    const evaluatorId = r.parameters.evaluator as string;
                    const paramFields = RULE_PARAMS[evaluatorId];
                    const isLocked = LOCKED_RULES.has(evaluatorId);
                    const isEditing = editingRuleId === r.id;
                    const summary = paramSummary(evaluatorId, r.parameters);

                    return (
                      <React.Fragment key={r.id}>
                        <TableRow>
                          <TableCell className="font-medium align-top pt-3">{r.name}</TableCell>
                          <TableCell className="align-top pt-3">
                            <Badge variant="secondary">{r.category}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground align-top pt-3">
                            {r.description}
                          </TableCell>
                          <TableCell className="align-top pt-3">
                            {summary ? (
                              <span className="text-sm font-mono text-primary">{summary}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top pt-3">
                            {isLocked ? (
                              <Badge variant="default">Always active</Badge>
                            ) : (
                              <Badge variant={r.isActive ? "default" : "secondary"}>
                                {r.isActive ? "Active" : "Disabled"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="align-top pt-2">
                            <div className="flex items-center gap-1">
                              {paramFields && !isEditing && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEditRule(r)}
                                  disabled={editingRuleId !== null}
                                >
                                  Edit
                                </Button>
                              )}
                              {!isLocked && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleRule(r.id, !r.isActive)}
                                  disabled={isEditing}
                                >
                                  {r.isActive ? "Disable" : "Enable"}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {isEditing && ruleDraft && paramFields && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={6} className="py-3 px-4">
                              <div className="flex flex-wrap items-end gap-6">
                                {paramFields.map((field) => {
                                  const currentVal =
                                    (ruleDraft[field.key] as number) ?? field.default;
                                  const warning =
                                    field.type === "number" && field.warnIf
                                      ? field.warnIf(currentVal)
                                      : null;
                                  return (
                                    <div key={field.key} className="flex flex-col gap-1">
                                      <label className="text-xs font-medium text-muted-foreground">
                                        {field.label}
                                      </label>
                                      {field.type === "select" ? (
                                        <select
                                          value={currentVal}
                                          onChange={(e) =>
                                            setRuleDraft((d) => ({
                                              ...d,
                                              [field.key]: Number(e.target.value),
                                            }))
                                          }
                                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                        >
                                          {field.options.map((opt) => (
                                            <option key={opt} value={opt}>
                                              Level {opt}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            min={0}
                                            value={currentVal}
                                            onChange={(e) =>
                                              setRuleDraft((d) => ({
                                                ...d,
                                                [field.key]: Number(e.target.value),
                                              }))
                                            }
                                            className="h-8 w-20 text-sm"
                                          />
                                          {field.unit && (
                                            <span className="text-xs text-muted-foreground">
                                              {field.unit}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {warning && (
                                        <p className="text-xs text-amber-600">{warning}</p>
                                      )}
                                    </div>
                                  );
                                })}
                                <div className="flex items-center gap-2 pb-0.5">
                                  <Button size="sm" onClick={saveRule} disabled={ruleSaving}>
                                    {ruleSaving ? "Saving…" : "Save"}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={cancelEditRule}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fairness Rules (balanced with weights)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {softRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.category}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">
                        {r.description}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.5"
                            value={r.weight}
                            onChange={(e) =>
                              updateWeight(r.id, parseFloat(e.target.value))
                            }
                            className="w-20"
                          />
                          <span className="w-8 text-sm">{r.weight}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.isActive ? "default" : "secondary"}>
                          {r.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRule(r.id, !r.isActive)}
                        >
                          {r.isActive ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="census">
          <Card>
            <CardHeader>
              <CardTitle>Census Bands</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Band</TableHead>
                    <TableHead>Patient Range</TableHead>
                    <TableHead>Required RNs</TableHead>
                    <TableHead>Required LPNs</TableHead>
                    <TableHead>Required CNAs</TableHead>
                    <TableHead>
                      Charge Nurses
                      <span className="block text-xs font-normal text-muted-foreground">(in RN count)</span>
                    </TableHead>
                    <TableHead>Ratio</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bands.map((b) => {
                    const isEditing = editingBandId === b.id;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${
                                CENSUS_TIER_DOT[b.color] ?? "bg-gray-400"
                              }`}
                            />
                            {CENSUS_TIER_LABEL[b.color] ?? b.name}
                          </span>
                        </TableCell>

                        {isEditing ? (
                          <>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  className="w-16 h-7 text-sm"
                                  value={bandDraft?.minPatients ?? b.minPatients}
                                  onChange={(e) => setBandDraft((d) => ({ ...d, minPatients: Number(e.target.value) }))}
                                />
                                <span className="text-muted-foreground">–</span>
                                <Input
                                  type="number"
                                  min={0}
                                  className="w-16 h-7 text-sm"
                                  value={bandDraft?.maxPatients ?? b.maxPatients}
                                  onChange={(e) => setBandDraft((d) => ({ ...d, maxPatients: Number(e.target.value) }))}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                className="w-16 h-7 text-sm"
                                value={bandDraft?.requiredRNs ?? b.requiredRNs}
                                onChange={(e) => setBandDraft((d) => ({ ...d, requiredRNs: Number(e.target.value) }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                className="w-16 h-7 text-sm"
                                value={bandDraft?.requiredLPNs ?? b.requiredLPNs}
                                onChange={(e) => setBandDraft((d) => ({ ...d, requiredLPNs: Number(e.target.value) }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                className="w-16 h-7 text-sm"
                                value={bandDraft?.requiredCNAs ?? b.requiredCNAs}
                                onChange={(e) => setBandDraft((d) => ({ ...d, requiredCNAs: Number(e.target.value) }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                className="w-16 h-7 text-sm"
                                value={bandDraft?.requiredChargeNurses ?? b.requiredChargeNurses}
                                onChange={(e) => setBandDraft((d) => ({ ...d, requiredChargeNurses: Number(e.target.value) }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="text"
                                className="w-16 h-7 text-sm"
                                value={bandDraft?.patientToNurseRatio ?? b.patientToNurseRatio}
                                onChange={(e) => setBandDraft((d) => ({ ...d, patientToNurseRatio: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge variant={b.isActive ? "default" : "secondary"}>
                                {b.isActive ? "Active" : "Disabled"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button size="sm" onClick={saveBand} disabled={bandSaving}>
                                  {bandSaving ? "Saving…" : "Save"}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={cancelEditBand}>
                                  Cancel
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              {b.minPatients} – {b.maxPatients} patients
                            </TableCell>
                            <TableCell>{b.requiredRNs}</TableCell>
                            <TableCell>{b.requiredLPNs}</TableCell>
                            <TableCell>{b.requiredCNAs}</TableCell>
                            <TableCell>{b.requiredChargeNurses}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{b.patientToNurseRatio}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={b.isActive ? "default" : "secondary"}>
                                {b.isActive ? "Active" : "Disabled"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditBand(b)}
                                disabled={editingBandId !== null}
                              >
                                Edit
                              </Button>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
