/**
 * One-shot script: update rule names and descriptions in an existing database
 * to match the improved language introduced in v1.7.0.
 *
 * Run with:  npx tsx scripts/update-rule-descriptions.ts
 *
 * Safe to run multiple times (idempotent — updates by evaluator id).
 */

import { db } from "../src/db";
import { rule } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

const updates: { evaluator: string; name: string; description: string }[] = [
  {
    evaluator: "patient-ratio",
    name: "Patient-to-RN Ratio",
    description:
      "RN-to-patient ratio must not exceed the census band maximum (default 2:1). " +
      "Only RNs count — LPNs and CNAs are support staff, not substitutes. " +
      "Only enforced for shifts using a numeric census value; census-band shifts satisfy the ratio by construction.",
  },
  {
    evaluator: "icu-competency",
    name: "ICU/ER Competency Requirement (Level 2+)",
    description:
      "Staff assigned to ICU or ER shifts must hold ICU Competency Level 2 or above. " +
      "Level 1 orientees are blocked from ICU/ER shifts regardless of preceptor availability.",
  },
  {
    evaluator: "level1-preceptor",
    name: "Level 1 Orientee: Level 5 Preceptor Required",
    description:
      "A Level 1 orientee on any non-ICU/ER shift requires a Level 5 RN on the same shift as preceptor. " +
      "Level 1 orientees cannot be placed on ICU or ER shifts under any circumstances " +
      "(enforced by the ICU/ER Competency rule).",
  },
  {
    evaluator: "level2-supervision",
    name: "Level 2 Staff in ICU/ER: Level 4+ Supervisor Required",
    description:
      "Level 2 staff working in ICU or ER must have at least one Level 4 or above nurse " +
      "on the same shift for direct supervision.",
  },
  {
    evaluator: "on-call-limits",
    name: "On-Call Limits (Max 1/Week, 1 Weekend/Month)",
    description:
      "A staff member may hold at most 1 on-call shift per week and 1 on-call weekend per month. " +
      "Enforced during auto-generation, swap approval, and open-shift candidate ranking.",
  },
  {
    evaluator: "staff-on-leave",
    name: "Staff On Approved Leave",
    description:
      "Staff with manager-approved leave cannot be scheduled for any shift during the leave period.",
  },
  {
    evaluator: "rest-hours",
    name: "Minimum Rest Between Shifts",
    description: "Staff must have at least 10 hours of rest between consecutive shifts.",
  },
  {
    evaluator: "max-consecutive",
    name: "Maximum Consecutive Days",
    description: "Staff cannot work more than 5 consecutive days without a day off.",
  },
  {
    evaluator: "no-overlapping-shifts",
    name: "No Overlapping Shifts",
    description:
      "Staff cannot be assigned to two shifts whose hours overlap on the same calendar day.",
  },
  {
    evaluator: "prn-availability",
    name: "PRN Availability",
    description:
      "Per-diem (PRN) staff can only be scheduled on dates they have submitted availability for.",
  },
];

let updated = 0;
for (const u of updates) {
  const rows = db
    .update(rule)
    .set({ name: u.name, description: u.description })
    .where(sql`json_extract(${rule.parameters}, '$.evaluator') = ${u.evaluator}`)
    .run();
  if (rows.changes > 0) {
    console.log(`✓ Updated: ${u.evaluator} → "${u.name}"`);
    updated += rows.changes;
  } else {
    console.log(`  skipped: ${u.evaluator} (no matching rule found)`);
  }
}

console.log(`\nDone. ${updated} rule(s) updated.`);
