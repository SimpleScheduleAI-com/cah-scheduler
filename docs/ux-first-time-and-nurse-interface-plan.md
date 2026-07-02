# First-Time UX + Nurse Interface Plan

**Date:** 2026-07-02
**Status:** Approved direction (founder-reviewed); not yet executed
**Scope:** (A) Make the manager scheduler self-serve friendly for a first-time nurse manager. (B) Add a nurse-facing, mobile-first interface sharing the same backend. Hosted on Railway.

---

## Decisions locked (founder)

| Decision | Choice |
|---|---|
| First-time persona | Nurse manager doing **self-serve setup** (full zero-to-first-schedule path) |
| Import philosophy | Excel import happens **once**; ongoing staff changes via the Staff page. Incremental import = nice-to-have, not blocker |
| Publish gate | Already exists — publish is disabled while hard violations > 0 (verified in code). Keep; add success feedback |
| Terminology | Rename for ICP: hard violations → **Compliance rules**; soft violations → **Fairness rules** (see glossary) |
| Nurse interface | Mobile-first; view schedule (calendar), request leave, call out, shift swaps. **No self-scheduling** |
| Manager interface | Desktop-first (current app) |
| Nurse login | **Email + password.** For now: one seeded demo nurse, credentials pre-filled on the login screen |
| Hosting | **Railway** (already deployed) |

---

## Part A — Manager scheduler: first-time UX

### What's already good (verified by walkthrough)
- Schedule detail header has Generate / Re-evaluate / Export / Publish + fill-rate & violation cards
- Publish is correctly blocked on hard violations (`schedule/[id]/page.tsx:305-332`)
- Setup page has a clear Step 1 (template download) / Step 2 (upload) flow with per-row validation errors
- Rules page has plain-English rule descriptions with Edit/Disable
- Dashboard has a 3-step Getting Started card
- Command palette (⌘K) and shortcut panel (?) exist and are wired

### Friction inventory (verified)

| # | Friction | Where |
|---|---|---|
| 1 | Setup/Import buried under "System" at the bottom of the sidebar; nav order is reverse of setup order | `sidebar.tsx` |
| 2 | Getting Started card covers only 3 steps (import, units, schedule) — never mentions Generate → Review → Publish; dismissal is permanent (localStorage) | `dashboard/page.tsx:83-174` |
| 3 | No success feedback after publish / import / apply-variant (silent success) | schedule detail, setup, scenarios |
| 4 | Generation with no staff/shifts "succeeds" at 0% fill with no warning | scenarios/generate flow |
| 5 | Vocabulary drift: nav "Schedule" → page "Schedule Builder"; nav "Schedule Variants" → page "Scenario Comparison" | sidebar vs page titles |
| 6 | Jargon unexplained: hard/soft violations, PRN, FTE, L1–L5 competency, census band colors | rules, census, staff, scenarios |
| 7 | Bare empty states on Callouts, Open Shifts, Leave, Swaps (empty tables, no guidance) | daily-ops pages |
| 8 | Demo/seed data (33 staff, 3 units) only loadable via CLI | `src/db/seed.ts` |
| 9 | Unit config fields have no guidance (why weekendShiftsRequired = 3?) | `settings/units` |
| 10 | Schedule list cards show name/dates/status only — no fill %, violations, or "needs attention" | `/schedule` |
| 11 | ⌘K palette + ? shortcuts have zero discoverability (founder didn't know they existed) | `providers.tsx` |
| 12 | Import is full-replace (deletes everything). Acceptable per import-once philosophy, but the red warning is the only guard | `setup`, `api/import` |

### Tier 1 — quick wins (each ≤ ~1 day)

1. **Sidebar reorder**: setup-critical items surfaced (a "Get Set Up" group on top until setup complete, or move Import/Export out of "System").
2. **Getting Started v2**: 5 steps (Import → Units review → Create schedule → Generate → Publish), progress persisted server-side, re-openable from a persistent "?" Help button (which also advertises ⌘K and shortcuts).
3. **ICP language pass** (see glossary below): Compliance rules / Fairness rules everywhere; L1–L5 legend; PRN/FTE tooltips; one vocabulary per concept ("Schedule Variants" everywhere; "Schedule" everywhere).
4. **Success feedback**: toasts/confirmation after publish, import, variant apply. Publish button keeps its violation gate; add a "published ✓ — nurses can now see this" confirmation.
5. **Generation preflight**: block generate with a plain-language message when the unit has no staff or no shifts.
6. **"Load sample data" button** (empty-state dashboards + setup page) wiring the existing seed — safe exploration + demo mode.
7. **Empty-state copy** on the 4 daily-ops pages (e.g., "No callouts yet. When a nurse calls out, log it here — we'll rank replacement candidates for you.").
8. **InfoTip component** reused across census band colors, competency levels, FTE, PRN.

### Tier 2 — medium (≈1–2 weeks)

9. **Setup wizard**: guided Unit → Staff import → Rules review → First schedule → Generate, driven by a small `/api/onboarding-status` endpoint (entity counts already exist).
10. **Staff-page maintenance polish** (the blessed post-import path): make add/edit/deactivate flows complete and obvious, so nobody ever needs to re-import.
11. **Schedule list cards with status chips**: fill %, compliance-rule status, "action needed".
12. **Review-before-publish summary**: coverage, violations, per-nurse hours — replaces bare button click.
13. **Incremental import (per-entity upsert)** — deprioritized per import-once philosophy; revisit if pilot hospitals ask.

### Glossary / ICP language (Tier-1 item 3)

| Current term | ICP-facing term | Notes |
|---|---|---|
| Hard violations | **Compliance rules** ("2 compliance rules broken") | Safety/legal/policy — must fix before publishing |
| Soft violations | **Fairness rules** ("49 fairness flags") | Founder's pick. Bucket also contains preference/cost items; if that ever confuses, fallback: "Fairness & preference flags" |
| L1–L5 competency | Keep levels, add legend | L1 new grad (needs preceptor on shift) · L2 needs ICU/ER supervision · L3 independent · L4 can supervise · L5 preceptor/charge-capable |
| PRN | "PRN (as-needed staff)" on first use + tooltip | Also unify PRN vs per_diem wording |
| FTE | Tooltip: "1.0 FTE = 40 h/week; 0.5 = 20 h/week" | Shown on dashboard + staff |
| Census bands Blue/Green/Yellow/Red | Add one-line legend: patient-count tiers that set required staffing | census + rules pages |
| "Scenario Comparison" page title | **Schedule Variants** (match the nav) | one vocabulary |
| "Schedule Builder" page title | **Schedule** (match the nav) | one vocabulary |

---

## Part B — Nurse interface (mobile-first, same backend)

### Architecture: one app, one deploy

New route group in the existing Next.js app (e.g. `/(nurse)` → `/my/...`), mobile-first layout (bottom tab bar, no sidebar), served as an installable **PWA** (manifest + icons; no app store needed). The manager UI and nurse UI hit the same API routes and the same SQLite DB — "the two backends talk to each other" is automatic because it is one backend. A swap requested on a phone is instantly a row in the manager's approval queue.

Nurse screens (scope-locked, no self-scheduling):
1. **My Schedule** — month/week calendar of *published* assignments (adapt the existing `staff-calendar` component: day = green, night = navy chips)
2. **Leave** — request + status ("pending / approved / denied")
3. **Call Out** — one-tap against my upcoming shift
4. **Swaps** — request a swap; respond to swaps targeting me

Backend reality: ~80% exists. `staff-leave`, `callouts`, `swap-requests`, `prn-availability`, `staff/[id]/schedule` APIs all present with status flows, and v1.8 added cross-workflow integrity (leave voids swaps, optimistic locking, stale guards) — exactly what two concurrent interfaces need.

### Railway: what actually has to happen

Because nurse UI = same app, **there is no new Railway integration**. Same service, same deploy, one URL (`/…` manager, `/my/…` nurses). What Railway *does* require:

| # | Item | Action | Effort |
|---|---|---|---|
| 0a | **DB persistence (CRITICAL — check first)** | `src/db/index.ts:6` hardcodes the DB to `process.cwd()/cah-scheduler.db` — the container filesystem, which Railway wipes on every redeploy. Attach a **Railway Volume**, add a 1-line change (`process.env.DATABASE_PATH ?? path.join(process.cwd(), "cah-scheduler.db")`), set `DATABASE_PATH` to the volume mount (e.g. `/data/cah-scheduler.db`). Quick test: redeploy and confirm data survives | 1 line + volume config |
| 0b | Build script | `npm run build` runs tests + `db:push` — fine on Railway; confirm build command in service settings | check only |
| 1 | Auth secrets | `AUTH_SECRET` (and later email-provider creds) as Railway env vars | minutes |
| 2 | WAL mode | Already enabled; single persistent Node process on Railway is the ideal SQLite setup. No Postgres migration needed at CAH scale | none |
| 3 | Custom domain / HTTPS | Railway provides HTTPS by default; PWA install requires HTTPS ✓ | optional |

### Build phases

| Phase | What | Effort |
|---|---|---|
| **0. Railway hardening** | Volume + `DATABASE_PATH` (above) | ~half day |
| **1. Auth + roles** | `user` table linked to `staff.id`; roles `manager` / `nurse`; **email + password** (credentials provider, e.g. Auth.js); seed one demo nurse account with credentials **pre-filled on the login form**; seed one manager account | ~1 wk |
| **2. Authorization pass** | Route-by-route guards on existing APIs: nurse reads/creates only own data; approvals, publish, generate, config = manager-only; nurse endpoints filter `status = "published"` schedules only | ~1 wk |
| **3. Nurse PWA screens** | The 4 screens above + bottom-tab layout + manifest | 1–2 wks |
| **4. Notifications** | Notification table + triggers (schedule published, swap targeted/approved, leave decided). In-app first; email next (matches email login); SMS (Twilio) later if pilot nurses want it | ~1 wk |

**Total: ~4–6 weeks to pilot-ready.** Phases 1–2 are the real new work; 3 reuses existing components/APIs; 0 is a half-day but must come first.

### Explicitly out of scope (for now)
Separate repo/app, native app stores, self-scheduling, Postgres migration (sync better-sqlite3 calls everywhere make it a large refactor; unnecessary at 33-staff scale), SMS (revisit after pilot feedback).

---

## Suggested sequencing

1. **Phase 0 Railway volume check** (protects existing data — do immediately)
2. Tier-1 quick wins (1–8) — can ship independently, high visible payoff
3. Nurse app Phases 1–3 (auth → guards → screens)
4. Tier-2 manager items (wizard, review-before-publish) in parallel with Phase 3
5. Notifications (Phase 4) once nurses are logging in

## Open items
- Confirm whether the Railway service already has a Volume attached (if data has survived past redeploys, it may; verify before relying on it)
- Email provider choice for password reset / notifications later (Resend/Postmark are simplest)
- Which seeded nurse becomes the demo login (suggest an ICU RN with day+night mix, e.g. James Wilson)
