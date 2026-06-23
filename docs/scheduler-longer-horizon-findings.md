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

| Schedule | Shifts | Soft violations | Per shift | Penalty/shift |
|---|---|---|---|---|
| 14-day (published) | 28 | 15 | 0.54 | 1.0 |
| 28-day #1 (Jul) | 56 | 85 | 1.52 | 4.1 |
| 28-day #2 (Aug) | 56 | 46 | 0.82 | 2.2 |

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
|---|---|---|
| 500 | 43 | 18 |
| 1,500 | 105 | 59 |
| 6,000 | 171 | 123 |
| 20,000 | 176 | 128 |

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
with problem size — but per the probe, *increasing* it would make violations worse, so the
fix is objective alignment + stability, not a bigger budget.

### Performance note

`weekendRedistributionSweep` takes **17–115 s** per 28-day generation (hits its 500-iter
cap); total generation ran 10–117 s and was highly variable.

---

## Q2 — Is prior-schedule history referenced for equity?

Partially, and narrower than assumed.

| Equity dimension | Cross-schedule? | Evidence |
|---|---|---|
| Weekend rotations | YES | 6-week rolling lookback feeds scoring — `rule-engine.ts:267-310`. Verified the 28-day windows include earlier schedules. |
| Weekly hours / overtime | NO | Current schedule only (+7-day boundary for hard rules). |
| Staff preferences | NO | Per-schedule. |
| Holiday fairness, consecutive days | NO | Per-schedule / 7-day boundary. |
| `flexHoursYearToDate` | Read, never written | `find-candidates.ts:411` reads it for ranking; the engine never updates it (only seed + manual API). Not a maintained YTD signal. |

The lookback is a **rolling 6-week window**, not cumulative/year-to-date, and covers
**weekends only**. Each scenario also stores `soft_violations` as `"[]"` — violations are
recomputed live, never persisted, so there is no historical equity/violation record.

---

## Why the two symptoms are mostly separate

- The violation **blow-up** is a within-schedule **optimizer** problem (instability +
  objective misalignment). Perfect history tracking would not fix it.
- The equity **gap** is real but narrow (weekends-only) and mainly affects fairness
  *across* schedules, not the per-schedule violation count.

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
