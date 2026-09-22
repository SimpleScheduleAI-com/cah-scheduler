# PROJECT OPTIMUS — CP-SAT Scheduling Engine (+ MOSAIC role-aware scheduling)

**Status:** PARKED — execute when a trigger below fires. Say "start Project Optimus" to begin.
**Created:** 2026-06-13 · Updated 2026-06-13 to fold in MOSAIC (LPN/CNA role-aware scheduling).
**Decision context:** variant-quality probe showed FAIR/COST variants invert or converge in 6 of 8 runs (`scripts/variant-sanity-probe.ts`).

## What

Replace the greedy + local-search + sweeps generation core with Google OR-Tools **CP-SAT**
(via the `or-tools-wasm` npm package, Apache 2.0), so each schedule variant is _solved
independently against its own objective_ instead of derived from BALANCED via swap sweeps.

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

## Competitor details (added 2026-09-22, from `docs/competitor-pricing-tiers.md`)

What the eight closest vendors actually ship, and what it means for the
engine we build. Full tier-by-tier detail and sources in
`docs/competitor-pricing-tiers.md`; positioning in `docs/competitor-lessons.md`.

### The bar OPTIMUS has to clear is low on rules, high on forecasting

- **Nobody publishes how their scheduler decides.** Deputy's auto-fill has
  three weights (cost, equal hours, learn-from-me) and JSON "recipes";
  M7's "Auto-Balance" names no method; QGenda's "intelligent automation"
  is rules that reviewers say break on complex rule sets; ShiftWizard is
  "rules-based shift building", not a solver; ScheduleAnywhere, SmartLinx
  and OnShift have no generator at all. A CP-SAT engine that optimises 22
  NAMED rules with a printable objective is unique in the set, and "here is
  exactly why nurse X got shift Y" stays our cheapest durable
  differentiator. Keep the explanation output a first-class deliverable of
  OPTIMUS, not a nice-to-have.
- **Hard rules are soft everywhere else.** Deputy: only shift overlap is a
  hard block; training, leave, fatigue and availability are warnings with a
  "Schedule anyway" button; its rest rule fires only when shift one ends
  after 7 pm and shift two starts before 9 am; no consecutive-night limit,
  no rolling 7-day cap, no on-call or weekend limits. ScheduleAnywhere has
  coverage counters, not constraints. No competitor evidences ratio, rest,
  preceptor or charge-nurse enforcement inside the generator. Our 13 hard
  rules as true constraints is a real gap in the market; do not weaken any
  of them to make the solver's job easier.
- **Real "AI" in this market is census forecasting, not scheduling.**
  In-House Health (length-of-stay model, department matcher, hourly census
  per department) and ShiftWizard (Predictive Census, 7-120 days, claimed
  87-90%) are the only genuine models. Both need admission volumes a 25-bed
  hospital does not produce. Do NOT scope forecasting into OPTIMUS; census
  bands plus seasonal band sets (gaps register item 4) are the right-sized
  demand input for a CAH, and the solver should consume required-staff per
  shift as given.
- **Fairness is claimed, never defined.** M7 markets "staff fairness scores
  over 94%" with no methodology; QGenda has "equity tracking"; Deputy has an
  "equal hours" toggle. OPTIMUS should publish its fairness terms (weekend
  count, holiday, preference hit rate, OT distribution) as named objective
  components with weights the DON can see. That is the FAIR variant made
  auditable.
- **Chat agents exist but cannot solve.** Deputy AI (beta, "introductory
  free") executes existing workflows after confirm and, per Deputy's own
  docs, cannot handle "four staff, 24-hour coverage"; QGenda's chat
  assistant has no customer evidence. If we ever add a conversational layer
  it sits ON TOP of the solver (explain, what-if, apply), never replaces it.
  Not part of OPTIMUS.

### Engine features competitors have that we should match or beat

| Feature                                          | Who has it                                                                           | Our status                                  | OPTIMUS relevance                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Deterministic, reproducible runs                 | Nobody advertises it                                                                 | Non-deterministic today (findings Q1)       | CP-SAT with a surfaced seed makes us the only one who can reproduce a schedule for an auditor |
| Explain why a nurse was or was not picked        | M7 ("see why preferences were or weren't honored")                                   | Assignment dialog shows rejection reasons   | Keep; extend to "why this variant"                                                            |
| Open shifts routed only to eligible staff        | M7, QGenda, ShiftWizard                                                              | Have (open-shift board, eligibility filter) | No change                                                                                     |
| Float pool / central staffing across units       | M7 (strength), In-House "Command Center", QGenda, ShiftWizard                        | Missing; single-unit engine                 | Multi-unit correctness (gaps register item 5) must land before or with OPTIMUS                |
| Self-scheduling windows with rules               | ShiftWizard (most praised feature), QGenda, ScheduleAnywhere (dates only)            | Missing                                     | Solver can score claimed shifts and fill holes: a natural OPTIMUS phase 2                     |
| Rotation / fixed pattern templates               | ScheduleAnywhere copy-forward, OnShift 4/2 rotations, Deputy 1/2/4-week agreed hours | Missing (Dr. Tara ask)                      | Model as per-nurse pattern constraints; solver fills around them                              |
| Credential expiry blocks assignment              | SmartLinx (blocks), Deputy (warns), ScheduleAnywhere (warns)                         | Competency levels, no expiry dates          | Cheap schema add; a hard constraint for the solver                                            |
| Census/acuity to required staff                  | OnShift Staff Exact, SmartLinx HPPD, ShiftWizard, QGenda EHR feed                    | Census bands + acuity extras                | Adequate; keep as input, not objective                                                        |
| Overtime projected while building                | SmartLinx, Deputy (beta), ShiftWizard                                                | Have (isOvertime, 60 h rule)                | No change                                                                                     |
| On-call as standby that converts to worked hours | Nobody documents it                                                                  | Missing (gaps register item 1)              | Only we would model it; do it                                                                 |

### Pricing and packaging facts that constrain the engine

- **Per-user billing punishes PRN pools.** Deputy bills every non-archived
  person; ScheduleAnywhere bills every employee on the grid. Our roster-size
  retainer avoids this; keep OPTIMUS compute cost independent of headcount
  so we never need per-seat metering.
- **Quote-only is the norm.** Six of eight publish no price; QGenda has 5%/yr
  escalators, auto-renew and a 5% card surcharge; ShiftWizard escalators are
  now "standard". Published flat pricing is a stated differentiator; nothing
  in OPTIMUS may require a services engagement to configure (Deputy sells
  "AI Labor Optimization" as a paid CSM service; that is the anti-pattern).
- **Price floor for context:** Humanity $2.75-3.75, NurseGrid Manager $5,
  ScheduleAnywhere $4.80-6, Deputy $5-9 per user/month. Our $10 tier sits
  above every generic tool and below every quote-only vendor. That holds
  only while the rules engine is visibly the reason.
- **Solver run-time budget.** Deputy exposes "a minute or less / a few
  minutes / as long as it takes"; M7 claims a first pass "in seconds".
  Target for OPTIMUS: first feasible solution under 10 s, three variants
  under 2 min on a 6-week single-unit schedule, with a visible progress bar.
  Current local search takes 17-115 s on 28-day schedules, already slower
  than the competition's claims.

### Market movement to watch

- **M7 Health acquired by Ascend Learning (2026-09-21).** Will be bundled
  with ATI, NHA credentialing and StaffGarden into systems Ascend already
  sells to. Enterprise-first roadmap likely; careers page empty. Their CAH
  push (blog 2026-09-09, "onboarding in UT/MS/AL", no named CAH) may stall.
  Re-check quarterly.
- **ScheduleAnywhere is being folded into TCP Humanity.** Its base includes
  the only named CAH reference in the set (Culbertson Memorial, 22 beds). A
  grid-export importer is a concrete migration play once OPTIMUS makes the
  generated schedule clearly better than their copy-forward.
- **HealthStream launched CAH "market bundles" (Q2 2026)** at "a better
  per-unit price"; unknown whether ShiftWizard is inside. First sign of an
  incumbent pricing for our segment.
- **Corrections to our own claims:** a competitor DOES have a CAH reference
  (ScheduleAnywhere); M7 is not YC-backed; OnShift belongs to ShiftKey, not
  ShiftMed. Fix the CAH buyer's-guide post and `competitor-lessons.md`.
