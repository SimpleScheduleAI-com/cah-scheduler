# PROJECT OPTIMUS — CP-SAT Scheduling Engine

**Status:** PARKED — execute when a trigger below fires. Say "start Project Optimus" to begin.
**Created:** 2026-06-13 · Decision context: variant-quality probe showed FAIR/COST variants invert or converge in 6 of 8 runs (`scripts/variant-sanity-probe.ts`).

## What

Replace the greedy + local-search + sweeps generation core with Google OR-Tools **CP-SAT**
(via the `or-tools-wasm` npm package, Apache 2.0), so each schedule variant is *solved
independently against its own objective* instead of derived from BALANCED via swap sweeps.

## Why

- True variants: COST genuinely cheapest, FAIR genuinely fairest — provable, no inversions.
- Better schedules in tightly-constrained weeks (exactly when a CAH is hurting).
- Generation time becomes a configurable budget (anytime solver), not an emergent property.
- Strengthens the "AI engine" marketing claim with optimization guarantees.

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
