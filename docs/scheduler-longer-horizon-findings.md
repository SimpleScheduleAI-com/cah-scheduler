# Longer-schedule equity & optimizer findings (2026-06-23)

Investigation into two reported symptoms on longer schedules:

1. Soft violations grow much faster than schedule length.
2. Doubt about whether new schedules actually reference prior-schedule history for equity.

All findings are read-only observations against the live local DB (3 schedules: one
14-day, two 28-day) plus the engine code. No app behaviour was changed.

---

## TL;DR

- The violation growth is **not** mainly "more shifts → more violations." Per-shift
  violation rate is **1.5×–2.8× worse** on the 28-day schedules.
- Root cause is **not** "the optimizer needs more iterations." A controlled probe shows
  **more local-search iterations produce MORE soft violations**, not fewer — the
  local-search objective is **misaligned** with the soft-rule metric the UI reports.
- The optimizer is also **unstable**: the same 28-day schedule regenerated with different
  seeds swings from 73 to 105 violations.
- Cross-schedule equity is **real but narrow**: only **weekend rotations** are carried
  across schedules (6-week rolling lookback). Hours, preferences, holiday fairness and
  `flexHoursYearToDate` are **not** maintained across schedules.

---

## Q1 — Why soft violations balloon on 4-week schedules

### Live data (`POST /api/evaluate`)

| Schedule           | Shifts | Soft violations | Per shift | Penalty/shift |
| ------------------ | ------ | --------------- | --------- | ------------- |
| 14-day (published) | 28     | 15              | 0.54      | 1.0           |
| 28-day #1 (Jul)    | 56     | 85              | 1.52      | 4.1           |
| 28-day #2 (Aug)    | 56     | 46              | 0.82      | 2.2           |

Purely proportional growth would keep per-shift rate flat (~0.54). Instead it is 1.5×–2.8×
higher on the 28-day schedules → **real degradation**, not just scale.

By rule, the growth concentrates in **Staff Preference Match** and rules that can only fire
on longer horizons (Consecutive Weekends needs ≥3 weekends; Weekend-Shifts-Required scales
up; more weeks → more overtime windows).

### Controlled probe (in-memory, no DB writes)

Called `generateSchedule()` directly across seeds/iterations and counted soft violations
via the engine's own rule loop.

**Variance at fixed settings (28d#1, 1500 iters, 5 seeds):** `[73, 84, 97, 103, 105]`
— spread 32 (~40%). The optimizer is unstable / under-converged.

**Iteration sweep (28d#1, seed 1):**

| local-search iters | soft violations | Staff Preference Match |
| ------------------ | --------------- | ---------------------- |
| 500                | 43              | 18                     |
| 1,500              | 105             | 59                     |
| 6,000              | 171             | 123                    |
| 20,000             | 176             | 128                    |

Violations **rise monotonically** with optimization effort. The local search optimizes an
internal composite score (the weight profile in `scoreFromDrafts`) that diverges from the
rule-engine soft-violation count (`evaluateSchedule`). Given more iterations it trades away
preference satisfaction (and adds OT / consecutive-weekend hits) to improve its own score.

> Confidence: variance is 5 samples; the iteration trend is one seed across 4 levels
> (monotonic, large effect). Worth a multi-seed confirmation before any rewrite, but the
> direction is clear.

### Hardcoded budget (context, not the root cause)

`runner.ts:252` builds the displayed "Balanced" schedule with a fixed `1500` local-search
iterations regardless of schedule length (`index.ts:104` default 500). This does not scale
with problem size — but per the probe, _increasing_ it would make violations worse, so the
fix is objective alignment + stability, not a bigger budget.

### Performance note

`weekendRedistributionSweep` takes **17–115 s** per 28-day generation (hits its 500-iter
cap); total generation ran 10–117 s and was highly variable.

---

## Q2 — Is prior-schedule history referenced for equity?

Partially, and narrower than assumed.

| Equity dimension                   | Cross-schedule?     | Evidence                                                                                                                          |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Weekend rotations                  | YES                 | 6-week rolling lookback feeds scoring — `rule-engine.ts:267-310`. Verified the 28-day windows include earlier schedules.          |
| Weekly hours / overtime            | NO                  | Current schedule only (+7-day boundary for hard rules).                                                                           |
| Staff preferences                  | NO                  | Per-schedule.                                                                                                                     |
| Holiday fairness, consecutive days | NO                  | Per-schedule / 7-day boundary.                                                                                                    |
| `flexHoursYearToDate`              | Read, never written | `find-candidates.ts:411` reads it for ranking; the engine never updates it (only seed + manual API). Not a maintained YTD signal. |

The lookback is a **rolling 6-week window**, not cumulative/year-to-date, and covers
**weekends only**. Each scenario also stores `soft_violations` as `"[]"` — violations are
recomputed live, never persisted, so there is no historical equity/violation record.

---

## Why the two symptoms are mostly separate

- The violation **blow-up** is a within-schedule **optimizer** problem (instability +
  objective misalignment). Perfect history tracking would not fix it.
- The equity **gap** is real but narrow (weekends-only) and mainly affects fairness
  _across_ schedules, not the per-schedule violation count.

---

## Recommended directions (not yet actioned)

1. **Align the local-search objective with the soft-rule penalties** (or make the local
   search penalty-aware of the actual rules), so more optimization cannot increase reported
   violations. This is the single highest-value fix.
2. **Stabilise the optimizer** — record/seed deterministically and reduce run-to-run
   variance; surface the seed so a result is reproducible.
3. **`weekendRedistributionSweep` performance** — 17–115 s with a 500-iter cap on 28-day
   schedules; profile and bound.
4. **Broaden cross-schedule equity** beyond weekends (hours/preferences) and decide whether
   `flexHoursYearToDate` should be engine-maintained post-publish or removed as a signal.

These findings strongly reinforce the case for **PROJECT OPTIMUS** (the parked CP-SAT engine
plan): a proper solver optimizing the true objective would not exhibit "more effort → more
violations" or large seed variance.

## Engine upgrades from senior-industry review (added 2026-09-20)

Source: written feedback from a senior nursing-operations reviewer, September
2026, plus the 2026-09-13 multi-unit assessment. Ordered by priority. Items 1-4
are schema fields plus one route each; the rules engine can already consume
them. None changes the engine's core. Not yet actioned.

### 1. On-call activation (safety rules are wrong without it)

**How a CAH actually uses on-call.** Night shift runs with 2 nurses on the
floor and 1 at home on standby at a small hourly rate. A highway pile-up sends
four patients to the ED at 02:00; the house supervisor calls the on-call nurse
in. She works 02:30-07:00 at full rate (usually with a 2-4 h minimum call-in
guarantee) and is also rostered for Thursday day shift at 07:00.

**What we do today.** `on_call` is a shift type with a cap (max 1/week, max 1
weekend/month) and nothing else. The engine sees "on call Wed night" and "day
shift Thu" and evaluates them as if nothing happened. The 4.5 worked hours are
invisible to rest hours (>=10 h), the 60-hour rolling cap, consecutive days,
and overtime. If the manager lets her work Thursday, the software calls the
schedule compliant when it is not; if the manager sends her home, that is a
callout the software never predicted. Payroll reconstructs standby vs worked
hours from paper.

**Build.** An "Activate on-call" action (supervisor, at call-in time or next
morning):

1. Pick the on-call assignment; enter actual start and end times.
2. System creates a worked assignment for those hours, `assignmentSource =
"call_in"`, minimum-hours guarantee applied for pay; standby hours stay on
   the on-call row.
3. Worked hours flow into rest, 60 h, consecutive-day and overtime rules
   immediately (engine already reads assignments; the row just has to exist).
4. The nurse's next scheduled shift is re-evaluated; a new hard violation
   (rest hours) is flagged and opens the existing callout / find-replacement
   flow for that shift.
5. Audit: who activated, when, hours, which downstream shift was affected.

Interacts with `rest-hours.ts`, `max-consecutive.ts`, `overtime-v2.ts`, the
60 h window, and `on-call-limits.ts` (an activated on-call must still count as
the one on-call for the week). Write the design before code.

### 2. Budgeted FTE per unit with variance readout (talks to finance)

Reviewer: "Is staffing determined on position control or budget? Who really
decides — nursing or finance?" We never ask. Demand comes only from census
bands and acuity; the cost-optimized variant minimizes OT and agency hours but
has no ceiling to compare against. Add `budgetedFte` (and optionally
`approvedPositions`) on `unit`; show scheduled FTE vs budget on the dashboard
and on each variant's score card ("7.4 FTE scheduled against 6.0 budgeted").
Cheap, and it is the number the person signing the check looks at.

### 3. Generic accommodations (replaces the weekend-exempt special case)

**What an accommodation is.** A formal HR arrangement (ADA, FMLA, pregnancy,
religious observance, return-to-work) limiting what one nurse may be asked to
do. The hospital is legally exposed if the schedule ignores it. Real examples:
no ICU/ER for 8 weeks after back surgery (lifting/transfers); no nights and no
shifts over 8 h in the third trimester; days only, indefinitely, for a sleep
disorder; no Friday sundown-Saturday sundown; max 3 shifts/week on light duty
until a stated date.

**What we do today.** One hard-coded flag, `weekendExempt`, with its own rule.
Everything else lives in the manager's head; the generator will put the
post-surgery nurse in ICU and the audit trail will show the software
recommended it.

**Build.** A `staff_restriction` table, one row per restriction:

| Field              | Example                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| staffId            | Maria Garcia                                                                                |
| type               | `no_shift_type` / `no_unit` / `max_shift_hours` / `max_shifts_per_week` / `blocked_weekday` |
| value              | `night` / `ICU` / `8` / `3` / `Saturday`                                                    |
| startDate, endDate | 2026-09-01 to 2026-11-01, or open-ended                                                     |
| reasonCategory     | medical / pregnancy / religious / other                                                     |
| note               | free text for the file                                                                      |

Every active row is a HARD eligibility rule, handled exactly like approved
leave and PRN availability: the nurse is not a candidate for a violating
shift, and the assignment dialog lists the reason under "Unavailable".
Date-ranged rows expire on their own. `weekendExempt` migrates to one
`blocked_weekday` row pair. Also tag each `rule` row with a `source`
(law / contract / policy / preference) so the audit trail can say why a rule
exists when a nurse disputes a schedule (first live case: union seniority at
the OMH prospect).

### 4. Seasonal census bands

Census bands are static. Snowbird counties and tourist towns have a different
normal in January than July. Cheapest fix: date-ranged band sets per unit, or
two band tables with an effective date.

### 5. Multi-unit correctness (prerequisite for "twinned" units)

From the 2026-09-13 assessment; both are required before a 3-5 unit hospital:

- Home-unit-or-cross-trained becomes a HARD eligibility rule; the float
  penalty stays for the cross-trained case. Today the generator draws from the
  whole hospital and only a soft penalty discourages an untrained float.
- Concurrent schedules for other units must be loaded into the rule context so
  rest hours, overlap, 60 h and consecutive-day rules span units. Today only
  the current schedule plus the prior 7 days are seen.

Reviewer's "if it comes in the door, it is yours" is twinning plus on-call
(item 1); nothing more is needed once these two land.

### 6. Self-scheduling under professional governance (only when a prospect asks)

Reviewer: where nursing self-governs, nurses control their own schedules
within the rules. We are manager-generates, nurse-reacts. The building blocks
exist (open-shift "raise a hand", the evaluator that scores any proposed
assignment); missing are a claim window on a draft schedule and a fairness
pass over claims. Do not build yet, but stop pitching "the manager generates
the schedule" — pitch "rules plus whoever fills the grid".

## Gaps register — everything we do not handle yet (consolidated 2026-09-20)

One line each. Sources: senior-industry review (Sep 2026), Dr. Tara / OMH
meeting (2026-09-11), multi-unit assessment (2026-09-13), code inspection.
Items already expanded above are cross-referenced, not repeated.

### A. Context the engine cannot express

- **Rule provenance.** No way to say a rule exists because of state law, a
  labor contract, an HR policy, or a manager preference. Add `source` on
  `rule` (see item 3 above). Matters the moment a schedule is disputed.
- **State-specific limits.** Thresholds are configurable, but there is no
  per-state preset (Texas Safe Harbor is the only state-specific concept).
  A New York deployment starts from Texas defaults.
- **Labor contracts.** Seniority, bidding order, mandatory-overtime rules,
  guaranteed hours for agency contracts — none modelled. `hireDate` exists
  but nothing reads it as seniority.
- **HR accommodations.** Only `weekendExempt`. See item 3.
- **Culture / governance model.** Self-scheduling vs manager-scheduled is not a
  setting; the product silently assumes manager-scheduled. See item 6.

### B. Staffing model assumptions baked in

- **Position control vs budget.** No budgeted FTE or approved-position count
  anywhere. See item 2.
- **Centralized vs decentralized staffing.** One manager per unit is assumed.
  No house-supervisor role that staffs across units, and no house-wide view of
  who is where today.
- **ED treated like a ward.** "ED busy enough to be viewed separately" has no
  expression: same census-band model, same rules, no arrival-driven demand.
- **Hybrid / gig workforce.** Employment types exist (float, per diem, agency)
  but there is no agency contract object: guaranteed hours, contract dates,
  cost per hour, "cannot be sole coverage" flag. Agency is a placeholder row.
- **Regular-staff floor.** No hard rule that at least one regular (non-agency)
  RN is on every shift. Dr. Tara asked for it explicitly; reviewer implies it.
- **Seasonality.** Static census bands. See item 4.
- **Twinned units / "it comes in the door, it is yours".** Needs item 5 plus
  on-call activation (item 1).
- **On-call as standby that converts to worked hours.** See item 1.
- **1:1 observation demand.** `shift.sitterCount` exists but is not driven by
  a patient-level input and does not feed the staffing requirement in the
  generator. Dr. Tara had 22 concurrent 1:1s.

### C. Schedule shapes we cannot generate

- **Fixed recurring patterns.** No "this nurse works Mon/Tue/Wed/Fri every
  week" template that repeats to a date. The generator is the only way to fill
  a grid; copy-forward does not exist.
- **Biweekly pay-period targets.** Hours are checked weekly (40 h OT, 60 h
  rolling). An 80 h / 2-week target with 6x12 h + 1x8 h is not expressible;
  the 8 h make-up shift has no concept.
- **Mixed shift lengths per nurse.** Preferred shift is a type (day/night),
  not a length; grandfathered 8 h nurses cannot be pinned to 8 h.
- **Weekend rules by role or seniority.** Weekend fairness is one rule for
  everyone; "junior techs every weekend, nurses alternate" would be reported
  as violations.
- **Mandated overtime override.** No emergency mode that turns hard rules into
  flagged warnings so a manager can hold the whole incoming shift.
- **Per-unit competency.** `icuCompetencyLevel` is one number per nurse used
  for every unit; a Level 5 ICU nurse is Level 5 in OB too.
- **Charge-nurse pre-seeding is ICU/ER-only** (`greedy.ts` filters
  `isICUUnit`); Med-Surg charge coverage depends on the general pass.
- **"ICU" hardcoded fallbacks** in schedule creation, rule engine, staff form,
  and importer; census bands loaded without a unit filter in the rule engine.

### D. Workflow and roles

- **Role hierarchy.** Only manager and nurse. No clerk/staffer who enters
  requests on behalf of staff, no supervisor over 2-3 units who approves, no
  assistant director / CNO tier. Every approval is "the manager".
- **Seniority-aware leave approval.** When several nurses request the same
  day, no ranking by seniority and no coverage preview of "approve this one
  and only one nurse is left".
- **Rejection reasons.** Leave and swap denials have `denialReason` fields but
  the manager UI does not require or prompt for one.
- **Sick-call cutoff.** Callouts record no "called at" time; a 1-hour cutoff
  policy (OMH) or a 2-hour one (typical) cannot be enforced or reported.
- **Notification channels.** In-app only. Email is the channel Dr. Tara will
  accept; SMS is refused by staff who will not use work phones.
- **Paper trail linkage.** No way to attach or reference the paper "pink slip"
  a clerk keyed in, so the audit trail cannot point at its supporting document.

### E. Reporting

- **Daily staffing sheet.** No per-shift printable of who is on (RN/tech/LPN
  breakdown, 1:1s, on-call). Night supervisors hand-write it today.
- **Monthly schedule in the hospital's own layout.** Export is our format
  only; each customer has a wall-poster format they will not give up.
- **Per-nurse absence report.** No "all sick calls and leave for Nurse X in a
  date range" view or download; the data is in `staff_leave` and `callout`.
- **Budget variance.** See item 2.
- **Cross-unit daily view.** See B, centralized staffing.

### F. Engine internals still open (from the July findings above)

- Local-search objective misaligned with soft-rule penalties (item 1 of the
  original list).
- Non-deterministic optimizer, no surfaced seed.
- `weekendRedistributionSweep` 17-115 s on 28-day schedules.
- Cross-schedule equity limited to weekends; `flexHoursYearToDate` unmaintained.
- All of which still argue for PROJECT OPTIMUS
  (`docs/superpowers/plans/2026-06-13-PROJECT-OPTIMUS-cpsat-engine.md`).
