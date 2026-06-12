import type { ShiftInfo, StaffInfo } from "@/lib/engine/rules/types";
import type { AssignmentDraft, GenerationResult, SchedulerContext } from "./types";
import { SchedulerState, shiftEndDateTime } from "./state";
import { passesHardRules, isICUUnit } from "./eligibility";

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildStateFrom(
  assignments: AssignmentDraft[],
  priorAssignments?: AssignmentDraft[]
): SchedulerState {
  const s = new SchedulerState();
  for (const a of assignments) s.addAssignment(a);
  // Prior-period seed: keeps boundary rest/consecutive/60h checks valid
  for (const p of priorAssignments ?? []) s.addAssignment(p);
  return s;
}

function makeDraft(
  staffId: string,
  shift: ShiftInfo,
  isChargeNurse: boolean,
  state: SchedulerState,
  context: SchedulerContext
): AssignmentDraft {
  const staff = context.staffMap.get(staffId)!;
  const weekHours = state.getWeeklyHours(staffId, shift.date);
  const isFloat = !!(staff.homeUnit && staff.homeUnit !== shift.unit);
  return {
    shiftId: shift.id,
    staffId,
    date: shift.date,
    shiftType: shift.shiftType,
    startTime: shift.startTime,
    endTime: shiftEndDateTime(shift.date, shift.startTime, shift.durationHours)
      .toTimeString()
      .slice(0, 5),
    durationHours: shift.durationHours,
    unit: shift.unit,
    isChargeNurse,
    isOvertime: weekHours + shift.durationHours > 40,
    isFloat,
    floatFromUnit: isFloat ? (staff.homeUnit ?? null) : null,
  };
}

/**
 * Criticality score — lower means more critical.
 * Used to prioritise repair order and determine which shifts can be raided
 * for staff (only raid from less critical = higher number).
 */
function shiftCriticality(shift: ShiftInfo): number {
  const icu = isICUUnit(shift.unit);
  if (icu && shift.requiresChargeNurse) return 1;
  if (shift.requiresChargeNurse) return 2;
  if (icu) return 3;
  if (shift.shiftType === "night") return 4;
  if (shift.shiftType === "day" || shift.shiftType === "evening") return 5;
  return 6; // on_call
}

/** Pick the candidate with the fewest rolling 7-day hours (most capacity remaining). */
function pickLeastLoaded(
  candidates: StaffInfo[],
  date: string,
  state: SchedulerState
): StaffInfo {
  return candidates.reduce((best, c) =>
    state.getRolling7DayHours(c.id, date) < state.getRolling7DayHours(best.id, date) ? c : best
  );
}

interface ViolatedShift {
  shift: ShiftInfo;
  needsCharge: boolean;   // requiresChargeNurse but no isChargeNurse assignment present
  needsLevel4: boolean;   // ICU/ER with staff present but no Level 4+ supervisor
  shortfall: number;      // assigned < required
}

function findViolations(
  assignments: AssignmentDraft[],
  context: SchedulerContext
): ViolatedShift[] {
  const state = buildStateFrom(assignments, context.priorAssignments);
  const result: ViolatedShift[] = [];

  for (const shift of context.shifts) {
    const sa = state.getShiftAssignments(shift.id);
    const required = shift.requiredStaffCount + shift.acuityExtraStaff;

    const hasCharge = sa.some((a) => a.isChargeNurse);
    const needsCharge = shift.requiresChargeNurse && !hasCharge;

    const hasLevel4 = sa.some(
      (a) => (context.staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0) >= 4
    );
    // ICU shift that has some staff but is missing Level 4+ supervision.
    // (Empty ICU shifts are covered by shortfall — once Level 4+ is added,
    // Level 2 nurses become newly eligible and the shortfall shrinks.)
    const needsLevel4 = isICUUnit(shift.unit) && sa.length > 0 && !hasLevel4;

    const shortfall = Math.max(0, required - sa.length);

    if (needsCharge || needsLevel4 || shortfall > 0) {
      result.push({ shift, needsCharge, needsLevel4, shortfall });
    }
  }

  // Repair most critical shifts first
  return result.sort((a, b) => shiftCriticality(a.shift) - shiftCriticality(b.shift));
}

// ── Assignment attempt helpers ────────────────────────────────────────────────

/**
 * Try to directly assign a currently-unassigned eligible staff member to `shift`.
 * Returns the updated assignments array on success, null on failure.
 *
 * @param asCharge    - must be charge-qualified Level 4+
 * @param asLevel4    - must be Level 4+ (but not necessarily charge-qualified)
 */
function tryDirect(
  shift: ShiftInfo,
  asCharge: boolean,
  asLevel4: boolean,
  assignments: AssignmentDraft[],
  context: SchedulerContext
): AssignmentDraft[] | null {
  const state = buildStateFrom(assignments, context.priorAssignments);
  const onShift = new Set(state.getShiftAssignments(shift.id).map((a) => a.staffId));

  const candidates = context.staffList.filter((s) => {
    if (!s.isActive || onShift.has(s.id)) return false;
    if (asCharge && (!s.isChargeNurseQualified || s.icuCompetencyLevel < 4)) return false;
    if (asLevel4 && s.icuCompetencyLevel < 4) return false;
    return passesHardRules(s, shift, state, context);
  });

  if (candidates.length === 0) return null;

  const best = pickLeastLoaded(candidates, shift.date, state);
  return [...assignments, makeDraft(best.id, shift, asCharge, state, context)];
}

/**
 * Try to fix a Level 4+ requirement (charge or supervisor) by moving a Level 4+
 * nurse from a lower-criticality shift to `shift`.
 *
 * The key insight: moving a nurse changes which rolling 7-day windows contain
 * their hours. A nurse who is ineligible for Sunday charge (too many Mon–Fri
 * hours) may become eligible once their Friday regular shift is removed — the
 * Mon–Sun window drops from 72h to 60h.
 *
 * Safety conditions before raiding a donor shift:
 *   1. Donor shift must be LESS critical (higher criticality number) than `shift`
 *   2. Donor shift must retain at least 1 staff member
 *   3. Donor shift must not lose its own charge nurse (if it requires one)
 *   4. Donor ICU shift must not be left with a Level 2 nurse and no Level 4+
 *
 * After a successful swap, attempts to back-fill the vacated donor slot with
 * any eligible staff so the donor shift does not stay short-staffed.
 *
 * @param asCharge       - assign as charge nurse on `shift`
 * @param requireCharge  - require donor to be charge-qualified
 */
function trySwap(
  shift: ShiftInfo,
  asCharge: boolean,
  requireCharge: boolean,
  assignments: AssignmentDraft[],
  context: SchedulerContext
): AssignmentDraft[] | null {
  const shiftCrit = shiftCriticality(shift);
  const shiftLookup = new Map(context.shifts.map((s) => [s.id, s]));

  // Collect Level 4+ nurses assigned to other shifts, sorted least-critical-donor first
  const donorCandidates = assignments
    .filter((a) => {
      if (a.shiftId === shift.id) return false;
      const staff = context.staffMap.get(a.staffId);
      if (!staff || staff.icuCompetencyLevel < 4) return false;
      if (requireCharge && !staff.isChargeNurseQualified) return false;
      return true;
    })
    .sort((a, b) => {
      const sa = shiftLookup.get(a.shiftId);
      const sb = shiftLookup.get(b.shiftId);
      if (!sa || !sb) return 0;
      // Steal from LEAST critical shift first (highest criticality number)
      return shiftCriticality(sb) - shiftCriticality(sa);
    });

  for (const donor of donorCandidates) {
    const donorShift = shiftLookup.get(donor.shiftId);
    if (!donorShift) continue;

    // Only raid from less critical shifts
    if (shiftCriticality(donorShift) <= shiftCrit) continue;

    // Build temporary state without the donor assignment
    const tempAssignments = assignments.filter((a) => a !== donor);
    const tempState = buildStateFrom(tempAssignments, context.priorAssignments);

    // Can this nurse fill the violated shift in this new state?
    const staff = context.staffMap.get(donor.staffId)!;
    if (!passesHardRules(staff, shift, tempState, context)) continue;

    // ── Safety checks on the donor shift ───────────────────────────────────

    const donorRemaining = tempAssignments.filter((a) => a.shiftId === donorShift.id);

    // Never empty a shift completely
    if (donorRemaining.length === 0) continue;

    // Don't orphan the donor shift's own charge requirement
    if (donorShift.requiresChargeNurse && donor.isChargeNurse) {
      if (!donorRemaining.some((a) => a.isChargeNurse)) continue;
    }

    // Don't leave an ICU donor shift without Level 4+ if it has Level 2 staff
    // (Level 2 nurses require Level 4+ supervision — removing the only Level 4+
    // creates a new hard violation)
    if (isICUUnit(donorShift.unit)) {
      const donorHasLevel2 = donorRemaining.some(
        (a) => (context.staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0) === 2
      );
      const donorHasOtherLevel4 = donorRemaining.some(
        (a) => (context.staffMap.get(a.staffId)?.icuCompetencyLevel ?? 0) >= 4
      );
      if (donorHasLevel2 && !donorHasOtherLevel4) continue;
    }

    // ── Commit the swap ─────────────────────────────────────────────────────

    const newDraft = makeDraft(staff.id, shift, asCharge, tempState, context);
    let result = [...tempAssignments, newDraft];

    // Back-fill the vacated donor slot (best-effort)
    // This restores the donor shift's staffing so it doesn't stay understaffed.
    const backfillState = buildStateFrom(result, context.priorAssignments);
    const donorOnShift = new Set(
      backfillState.getShiftAssignments(donorShift.id).map((a) => a.staffId)
    );
    const backfillCandidates = context.staffList.filter((s) => {
      if (!s.isActive || donorOnShift.has(s.id)) return false;
      return passesHardRules(s, donorShift, backfillState, context);
    });
    if (backfillCandidates.length > 0) {
      const bf = pickLeastLoaded(backfillCandidates, donorShift.date, backfillState);
      result = [...result, makeDraft(bf.id, donorShift, false, backfillState, context)];
    }

    return result;
  }

  return null;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Post-construction repair phase.
 *
 * Runs after `greedyConstruct` and before `localSearch`. Scans for remaining
 * hard violations and attempts systematic repair in criticality order:
 *
 *  1. Missing charge nurse on charge-required shifts
 *  2. Missing Level 4+ ICU/ER supervisor
 *  3. Understaffed slots
 *
 * For each violation two strategies are tried in order:
 *
 *  Strategy A — Direct assignment: find an eligible staff member not yet on
 *    the violated shift and assign them. This succeeds when the greedy pass
 *    over-constrained a slot (e.g., charge-protection look-ahead was too
 *    aggressive) but a nurse is still available.
 *
 *  Strategy B — Swap repair: move a Level 4+ nurse FROM a lower-criticality
 *    shift TO the violated slot. The key mechanism: by removing the nurse from
 *    their current assignment, the rolling 7-day hours in the windows containing
 *    the violated shift drop, potentially bringing them under the 60h cap. The
 *    vacated donor slot is then back-filled with any eligible (typically less
 *    specialised) nurse.
 *
 * Runs up to MAX_PASSES so cascading fixes take effect — for example, adding a
 * Level 4+ to an ICU shift makes Level 2 nurses newly eligible, reducing the
 * remaining shortfall in the next pass.
 *
 * Violations that cannot be resolved after all passes represent genuine staffing
 * shortages (not enough eligible staff exist) and are preserved in `understaffed`.
 */
export function repairHardViolations(
  result: GenerationResult,
  context: SchedulerContext
): GenerationResult {
  const MAX_PASSES = 3;
  let assignments = [...result.assignments];

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const violations = findViolations(assignments, context);
    if (violations.length === 0) break;

    let madeProgress = false;

    for (const { shift, needsCharge, needsLevel4, shortfall } of violations) {
      // ── 1. Repair missing charge nurse ─────────────────────────────────
      if (needsCharge) {
        const direct = tryDirect(shift, true, false, assignments, context);
        if (direct) { assignments = direct; madeProgress = true; continue; }

        const swapped = trySwap(shift, true, true, assignments, context);
        if (swapped) { assignments = swapped; madeProgress = true; continue; }
      }

      // ── 2. Repair missing Level 4+ ICU supervisor (shift has staff but ──
      //       no Level 4+; not the same as a missing charge nurse)
      if (needsLevel4 && !needsCharge) {
        const direct = tryDirect(shift, false, true, assignments, context);
        if (direct) { assignments = direct; madeProgress = true; continue; }

        // requireCharge=false: any Level 4+ suffices for supervision
        const swapped = trySwap(shift, false, false, assignments, context);
        if (swapped) { assignments = swapped; madeProgress = true; continue; }
      }

      // ── 3. Fill understaffed slots ──────────────────────────────────────
      // Direct only: swapping for general staffing moves the shortage without
      // gaining anything. Multi-slot shortfalls are resolved across passes
      // (each pass fills one slot; next pass re-scans and fills the next).
      if (shortfall > 0) {
        const direct = tryDirect(shift, false, false, assignments, context);
        if (direct) { assignments = direct; madeProgress = true; }
      }
    }

    if (!madeProgress) break;
  }

  // Rebuild the final understaffed list from the actual post-repair state
  const finalState = buildStateFrom(assignments, context.priorAssignments);
  const finalUnderstaffed = context.shifts.flatMap((shift) => {
    const sa = finalState.getShiftAssignments(shift.id);
    const required = shift.requiredStaffCount + shift.acuityExtraStaff;
    const chargeMet = !shift.requiresChargeNurse || sa.some((a) => a.isChargeNurse);
    if (sa.length >= required && chargeMet) return [];
    return [
      {
        shiftId: shift.id,
        date: shift.date,
        shiftType: shift.shiftType,
        unit: shift.unit,
        required,
        assigned: sa.length,
        reasons: ["genuine shortage — no eligible staff available after repair"],
      },
    ];
  });

  return { assignments, understaffed: finalUnderstaffed };
}
