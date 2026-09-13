# Decision Log

Dated, append-only. One entry per decision: what + why. New architectural
decisions get appended in the same session they are made (CLAUDE.md rule).

- **2026-02 — Heuristic engine over CP-SAT.** Greedy construction + local
  search with 3 weight profiles (Balanced/Fair/Cost). Good-enough schedules in
  seconds on a $5 container; CP-SAT (OPTIMUS) parked as a spike until quality
  demands it.
- **2026-06 — Phase-selection optimizer guard REVERTED.** It fixed violation
  counts but tanked variant fairness (Balanced 69%→31%) because FAIR/COST
  derive from the Balanced base. Do not reintroduce without re-measuring all
  three variants.
- **2026-06 — Agency ranked last, always.** Candidate cost order is
  straight-time → overtime → agency; agency premium exceeds OT premium in
  practice, and CAH managers expect it.
- **2026-06 — Stateless HMAC session cookie over DB sessions.** Edge
  middleware can verify with Web Crypto only (no node:crypto/Buffer/DB in
  middleware); 30-day rolling `ssai_session`; revocation-by-rotation is
  acceptable at demo scale.
- **2026-06 — Auth is additive and flag-gated** (`AUTH_ENABLED`), so the
  no-auth local workflow and hosted demo coexist; nurse portal lives at `/my`,
  mobile-first, published-schedules-only.
- **2026-06 — Callout vs open shift split by leave length.** Leave ≤7 days →
  callout flow; >7 days → open shift (per-unit `calloutThresholdDays`,
  default 7).
- **2026-07 — Pre-commit verify gate + ratcheted tsc baseline.** Tests must
  pass and the type-error count may never rise; baseline auto-ratchets down.
  Chosen over CI because Railway build is the de-facto CI and the founder
  works solo-local.
- **2026-07 — Post-Fable operating model.** Opus orchestrates, Sonnet workers
  (`fast-worker`/`verifier`), Opus `deep-reasoner` for second opinions. Spec:
  docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md.
- **2026-07 — AUTH_SCOPE=nurse_only demo mode.** Manager surfaces open, nurse
  portal enforced; chosen so the founder can demo the manager app without
  login while nurse logins stay real. Anonymous pass-through strips identity
  headers to prevent spoofing. Local/demo only.
- **2026-07 — Demo showroom as separate service.** Second Railway service +
  `DEMO_MODE` flag + guarded reset endpoint (bearer secret or same-origin;
  60s limit; `resetDemoData()` throws outside demo mode); becomes a `demo`
  tenant after the P2 tenancy work and the service is retired (spec §4/§7).
  Same-origin resets are allowed because demo data is disposable by
  definition. Runbook: `docs/DEMO-SETUP.md`.
- **2026-07 — Demo resets to EMPTY, not furnished.** Founder pivot: the demo's
  purpose is usability testing of the from-scratch journey, not a showroom.
  Reset wipes to blank; the bundled sample workbook
  (public/sample-hospital-data.xlsx, served by GET /api/import when the DB is
  empty) is the tester's starting file. Supersedes the furnished-showroom
  reset.
- **2026-07-06 — Model tier ladder replaces fixed model roles.** Roles are
  defined by capability need and resolved against whatever tiers the harness
  offers that day: judgment = judgment-child (Fable) -> deep-reasoner (Opus)
  -> main session; workers = Sonnet floor (never Haiku — more turns, broken
  contracts, net costlier here); verification = tier-independent scripts.
  Spawn-attempt-as-detection: if judgment-child fails to spawn, that tier is
  absent — fall down the ladder. Chosen the day before Fable access ends so
  Fable's return (or any new top tier) requires zero system changes. Also
  adopted from the community "routing block" pattern: escalate-up rule (a
  lower-tier main session hands calls above its tier to the highest judgment
  agent instead of grinding) and effort pinning (judgment high/xhigh
  sparingly). Gates never scale down with model quality — they are
  tier-insurance.

## 2026-08-15 — Reliability rating stays static; feature itself under question

The per-nurse reliability rating (imported from the roster Excel, weighted
×3 in both candidate rankers) is NOT to be wired to real callout history for
now. Founder: "leave it for now — we are not sure if we will keep this
feature." Do not build earned-reliability, and do not re-flag the staleness;
the open decision is whether the field survives at all. If it is removed,
strip it from both rankers' base scores at the same time.

## 2026-09-13 — Published schedules are amended, not unpublished

A published schedule is the version of record nurses have seen. Once seen,
"unpublishing" has no real-world meaning — a charge nurse does not take the
schedule off the wall to move one name. So a hand change to a published
schedule is an **amendment**: allowed, reason mandatory, logged against the
schedule (`post_publish_amendment`, reason as justification), and only the
affected nurse is notified. The old 409 "unpublish first" guard (v1.6.13) is
gone from the assignments route. Unpublish survives for wholesale rework
(regeneration still requires it), now with a mandatory reason and its own
`unpublished` audit action. Rejected alternative: keep the 409 and make
unpublish → re-publish cheaper — re-publish must keep alerting everyone
(that is its job), so it can never be the right tool for a one-person change.
Founder direction after the 2026-09-11 Dr. Tara demo; she also asked that
every change be tracked and that nurses see only that their own shift moved.

## 2026-09-13 — Urgent callouts notify eligible nurses when ≥ 1 day out

Leave approval has two coverage paths split by the unit's callout threshold
(default 7 days): open shift (beyond) and callout (within). Only the open
shift path told nurses anything, so a night charge nurse's leave 6 days out
silently became a manager-only callout — the demo gap. Now the callout path
also posts `callout_posted` to every rule-eligible nurse when the shift is at
least one full day away. Cutoff at 1 day, not 0: with hours to go the manager
is already on the phone and a board notice is noise. The two paths remain
distinct on purpose — a callout has no open-shift row, so the nurse is told
to contact the manager rather than "raise a hand". Founder: "4-5 days before,
it makes sense; less than a day away it does not."
