# PROJECT OPTIMUS — CP-SAT Scheduling Engine (+ MOSAIC role-aware scheduling)

**Status:** PARKED — execute when a trigger below fires. Say "start Project Optimus" to begin.
**Created:** 2026-06-13 · Updated 2026-06-13 to fold in MOSAIC (LPN/CNA role-aware scheduling).
**Decision context:** variant-quality probe showed FAIR/COST variants invert or converge in 6 of 8 runs (`scripts/variant-sanity-probe.ts`).

## What

Replace the greedy + local-search + sweeps generation core with Google OR-Tools **CP-SAT**
(via the `or-tools-wasm` npm package, Apache 2.0), so each schedule variant is *solved
independently against its own objective* instead of derived from BALANCED via swap sweeps.

**Bundled scope — MOSAIC (role-aware scheduling):** while rebuilding the engine, also make
slots role-typed (X RNs + Y LPNs + Z CNAs per shift) instead of N undifferentiated bodies.
Folded in here deliberately: role requirements are just more CP-SAT constraints — trivial to
add to a constraint model, painful to retrofit onto the greedy engine. Doing both at once
means one engine rewrite, not two. See the MOSAIC section below.

## Why

- True variants: COST genuinely cheapest, FAIR genuinely fairest — provable, no inversions.
- Better schedules in tightly-constrained weeks (exactly when a CAH is hurting).
- Generation time becomes a configurable budget (anytime solver), not an emergent property.
- Strengthens the "AI engine" marketing claim with optimization guarantees.

## Reinforcing evidence (2026-06-23 investigation)

A read-only investigation into longer-schedule behaviour (full data in
`docs/scheduler-longer-horizon-findings.md`) produced new evidence that the greedy +
local-search + sweeps core is structurally shaky — precisely what CP-SAT removes:

- **More optimization makes schedules WORSE.** On a 28-day schedule, soft violations rose
  with local-search effort: 500→43, 1500→105, 6000→171, 20000→176. The search objective
  (`softPenalty`) is misaligned with the reported soft-rule metric (`evaluateSchedule`).
- **Non-reproducible quality.** Same 28-day schedule, 5 seeds → [73, 84, 97, 103, 105]
  violations (~40% spread). A CP-SAT solve is deterministic for a fixed seed + budget.
- **Generation time is pathological (reinforces Trigger 3):** `weekendRedistributionSweep`
  takes 17–115 s per 28-day generation (hits its 500-iteration cap). CP-SAT makes time a
  configurable budget instead of an emergent property.
- **Cross-schedule equity is weekends-only** (6-week rolling lookback); hours/preferences are
  not balanced across schedules, and `flexHoursYearToDate` is read but never written.

These join the existing variant-inversion probe (`scripts/variant-sanity-probe.ts`) as
decision context.

### Secondary work tracked separately (fold into OPTIMUS, or do standalone)

- **Cross-schedule equity beyond weekends** + `flexHoursYearToDate` ownership (task_167618ab).
  A CP-SAT model can carry cumulative equity as objective terms — natural to fold in.
- **`weekendRedistributionSweep` performance** (task_bb78d1f4). Largely mooted if the sweeps
  are replaced by a solver.
- **Local `getDay()` weekend-detection UTC audit** across scoring/rules (task_d5fd0d9a).
  Independent of the engine choice — still needed either way.

### Near-term alternative to a full rewrite

The "more effort → more violations" misalignment is independently fixable in the heuristic
engine: it is contained to `softPenalty()` in `src/lib/engine/scheduler/scoring.ts`
(consecutive-weekend + weekend-equity terms penalize per-assignment where the rules penalize
per-staff / per-excess-shift; a per-nurse load term has no rule equivalent). Estimated
**MEDIUM** (~1 file, 40–60 LOC, ~10–20 scoring-test updates). It does NOT fix the seed
variance and may be throwaway if OPTIMUS lands — decide before investing.

## Triggers (any one)

1. Pitching the scheduler/service where the three-variant story must be defensible.
2. A pilot hospital notices the variants look identical / mislabeled.
3. Generation time complaints from the ops team on 6-week schedules.
4. Roster sizes grow past ~40 nurses or multi-unit schedules arrive.

## Plan

**Phase 0 — Benchmark prototype (1 session, go/no-go gate)**
- `npm i or-tools-wasm`, encode HARD rules only for one real 6-week context.
- Measure: feasible-solution time, 10s/30s-budget quality, WASM memory. Abort if ugly.

**Phase 1 — Model builder (1–2 sessions)**
- `src/lib/engine/cpsat/model-builder.ts`: SchedulerContext → CP-SAT model.
- Hard rules as constraints (incl. priorAssignments boundary seeding — same semantics as
  v1.7.24). Soft rules as weighted objective terms reusing WeightProfile weights.
- Determinism: fixed seed, `num_workers: 1`, time budget param (default 30s/variant).

**Phase 2 — Shadow variant (1 session)**
- Add 4th variant "Optimal" to runner; scored by the SAME `scoreFromDrafts`; validated by
  the SAME `evaluateSchedule` + `validate-output.ts` (defense in depth — solver output never
  trusted blind). Understaffed explanations: reuse existing `getRejectionReasons` machinery.
- Extend `scripts/verify-schedule-periods.ts` to run the Optimal variant through all 79 checks.

**Phase 3 — Promotion (after several real cycles)**
- Compare Optimal vs Balanced on real data (ops team eyeball + score deltas).
- If consistently better: FAIR/COST become independent CP-SAT solves with their own
  objectives; greedy engine stays as fallback + explanation generator.

## Interim mitigation (do regardless, ~1 hour)

Scenarios page honesty fix: when variant scores converge or invert, label it
("variants converged — schedule is fully constrained") instead of presenting fake choice.

## Risks / mitigations

- or-tools-wasm maturity (v0.9, single maintainer) → pin version; evaluator verifies all output.
- Rejection-reason quality → keep greedy path for explanations.
- Bundle/memory (~4MB WASM, server-side only) → acceptable; runner is a Node process.

---

# MOSAIC — LPN/CNA role-aware scheduling (bundled into OPTIMUS)

**Why bundled:** the engine today fills N undifferentiated bodies per shift; mixed-team
units (med-surg, swing-bed) need X RNs + Y LPNs + Z CNAs. In CP-SAT this is just per-role
count constraints — cheap to add during the rewrite, expensive to retrofit onto greedy.

**Additional trigger (beyond OPTIMUS's own):** the first pilot hospital that staffs a unit
we schedule (med-surg, swing-bed) with mixed RN/LPN/CNA teams. ICU/ER are RN-heavy, so
RN-only pilots may not need this for months — but when triggered, build it inside OPTIMUS.

**Already half-built:** `census_band` already carries `requiredRNs` / `requiredLPNs` /
`requiredCNAs` / `requiredChargeNurses`; `staff.role` exists; the charge-nurse slot already
proves the "role-typed slot filled first with eligibility constraints" pattern.

**The core design decision — substitution model (real nursing scope):**
- Role hierarchy with downward substitution: `RN(3) > LPN(2) > CNA(1)`.
- Higher license CAN fill a lower slot — allowed but **soft-penalized** (paying RN wages for
  LPN work is wasteful, not unsafe). Same shape as the existing "cap competency at the
  called-out nurse's level" logic in `find-candidates.ts`.
- Lower license filling a higher slot (LPN→RN, CNA→licensed) = **hard violation** (scope of
  practice / legal).

**Build (inside the OPTIMUS phases):**
- Phase 0/1 (model): per-shift role requirements derived from the census band; role-rank
  constraints in the CP-SAT model (each slot requires `roleRank ≥ slot rank`); over-qualified
  substitution as a weighted objective term.
- Phase 1 also covers the greedy fallback if kept: generalize charge-first fill →
  charge-RN → RN slots → LPN slots → CNA slots (most-constrained-first).
- Rules: `min-staff` role-aware (per-role floors, not one number); `patient-ratio` keys off
  RN count specifically (legal ratio is patient-to-licensed/RN); new `role-coverage` hard rule
  for the evaluator. Files: `min-staff.ts`, `patient-ratio.ts`, new rule + registry.
- Callout/coverage: replacement must match or down-substitute into the vacated role
  (`find-candidates.ts`).
- Analytics + verify: fix the LPN-drop in analytics (`effective-required.ts` omits
  `requiredLPNs`); add a mixed-team scenario to `scripts/verify-schedule-periods.ts`.

**If MOSAIC is needed BEFORE OPTIMUS** (a mixed-team pilot lands but the variant story isn't
urgent yet): it can be done as a standalone greedy-engine pass (~4–6 sessions) using the same
substitution model and the Phase-2/3 rule changes above — but prefer bundling into OPTIMUS if
the timing allows, to avoid two engine rewrites.
