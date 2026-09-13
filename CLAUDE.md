# CLAUDE.md — CAH Scheduler

This file provides context and conventions for Claude Code when working in this repository.

---

## Project Overview

**CAH Scheduler** is a nurse scheduling application for Critical Access Hospitals (small rural hospitals, ≤25 beds). It automates complex staff scheduling while enforcing hard rules (safety/legal) and soft rules (fairness/preferences).

- **Current version:** 1.11.0
- **GitHub:** https://github.com/SimpleScheduleAI-com/cah-scheduler
- **Local path:** D:\Pradeep\Personal\Projects\Nurse-scheduling new

---

## Tech Stack

| Layer          | Technology                                |
| -------------- | ----------------------------------------- |
| Framework      | Next.js 16.1.6 (App Router)               |
| Language       | TypeScript 5.x (strict mode)              |
| UI             | React 19, Radix UI, Tailwind CSS 4        |
| Icons          | Lucide React                              |
| Database       | SQLite via `better-sqlite3` (synchronous) |
| ORM            | Drizzle ORM 0.45.1                        |
| Validation     | Zod 4                                     |
| Date utilities | date-fns 4, react-day-picker 9            |
| Excel          | xlsx 0.18.5                               |
| Linting        | ESLint 9 (flat config)                    |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (route.ts files)
│   ├── dashboard/          # Dashboard page
│   ├── staff/              # Staff management
│   ├── schedule/           # Schedule grid + [id] detail
│   ├── scenarios/          # Scenario comparison
│   ├── callouts/           # Callout logging
│   ├── open-shifts/        # Coverage requests
│   ├── leave/              # Leave approval workflow
│   ├── swaps/              # Shift swap management
│   ├── availability/       # PRN availability
│   ├── rules/              # Rule configuration
│   ├── settings/           # Unit + holiday config
│   ├── audit/              # Audit trail
│   ├── setup/              # Excel import/export
│   ├── my/                 # Nurse-facing portal (leave, swaps, availability, notifications)
│   └── login/              # Login page (active only when AUTH_ENABLED === "true")
├── components/
│   ├── layout/sidebar.tsx  # Main navigation (update when adding pages)
│   ├── schedule/           # Schedule grid, assignment dialog, violations modal
│   ├── staff/              # Staff table, form, detail dialog, calendar
│   └── ui/                 # Radix UI wrappers (button, card, dialog, etc.)
├── db/
│   ├── schema.ts           # Drizzle ORM schema (single source of truth)
│   ├── index.ts            # DB initialization + export
│   └── seed.ts             # Test data seeder
├── middleware.ts           # Route guard — enforces auth/role checks when AUTH_ENABLED === "true"
└── lib/
    ├── engine/
    │   ├── rule-engine.ts  # Main rule evaluation orchestrator
    │   ├── rule-calculator.ts
    │   ├── census-calculator.ts
    │   ├── rules/          # 22 individual rule evaluators (13 hard + 9 soft)
    │   └── scheduler/      # Auto-generation engine
    │       ├── types.ts         # WeightProfile, AssignmentDraft, SchedulerContext
    │       ├── state.ts         # SchedulerState (O(1) mutable tracking)
    │       ├── eligibility.ts   # passesHardRules + getRejectionReasons
    │       ├── scoring.ts       # softPenalty (7-component)
    │       ├── weight-profiles.ts # BALANCED, FAIR, COST_OPTIMIZED
    │       ├── greedy.ts        # greedyConstruct (phase 1)
    │       ├── local-search.ts  # localSearch (phase 2, swap improvement)
    │       ├── index.ts         # buildSchedulerContext + generateSchedule
    │       └── runner.ts        # runGenerationJob (3 variants, writes DB)
    ├── auth/                # Session, password hashing, roles, user provisioning (flag-gated)
    ├── onboarding/          # First-run product tour + practice-marker state
    ├── date/week.ts         # Shared UTC-safe week/weekend date helpers
    ├── callout/escalation.ts
    ├── coverage/find-candidates.ts
    ├── import/parse-excel.ts
    ├── audit/logger.ts
    └── utils.ts

docs/                       # End-user documentation (01- through 10-)
RULES_SPECIFICATION.md      # Full business rules reference
CHANGELOG.md                # Version history
```

---

## Development Commands

```bash
npm run dev          # Start dev server on port 3000
npm run build        # pure next build (schema push happens at prestart)
npm start            # Production server
npm run lint         # ESLint

# Database
npm run db:generate  # Generate migrations after schema changes
npm run db:push      # Apply schema to database
npm run db:migrate   # Run pending migrations
npm run db:studio    # Drizzle Studio (visual DB browser)
npm run db:seed      # Seed test data (src/db/seed.ts)
```

### Database Workflow (after schema changes)

1. Edit `src/db/schema.ts`
2. `npm run db:generate`
3. `npm run db:push`
4. Update `src/db/seed.ts` if needed

---

## Naming Conventions

| Thing            | Convention                        |
| ---------------- | --------------------------------- |
| Pages            | `src/app/[name]/page.tsx`         |
| API routes       | `src/app/api/[resource]/route.ts` |
| React components | PascalCase (`StaffForm.tsx`)      |
| Utilities        | camelCase (`findCandidates.ts`)   |
| DB columns       | snake_case                        |
| TS variables     | camelCase                         |
| Path alias       | `@/*` → `./src/*`                 |

---

## Key Patterns

### Adding a New Page

1. Create `src/app/[pagename]/page.tsx`
2. Add route to `src/components/layout/sidebar.tsx`

### Adding a New API Endpoint

1. Create `src/app/api/[resource]/route.ts`
2. Export named functions: `GET`, `POST`, `PUT`, `DELETE`
3. Use Drizzle ORM for all DB access
4. Log changes to `exceptionLog` via `src/lib/audit/logger.ts`

### Adding a New Rule

1. Create `src/lib/engine/rules/[rule-name].ts`
2. Export a `RuleEvaluator` object with `id`, `type`, `category`, `evaluate(context)`
3. Register it in `src/lib/engine/rules/index.ts`
4. Return an array of `RuleViolation` objects

### UI Components

- Use Radix UI wrappers from `src/components/ui/`
- Style with Tailwind CSS utility classes
- Accept `className` prop for flexibility
- No Redux/Zustand — use React `useState` + URL params for client state

---

## Business Rules Summary

### Hard Rules (13 — cannot be violated)

- Minimum staff per shift (census-band-based)
- Charge nurse requirement (**Level 4+ only**; Level 5 preferred, Level 4 stand-in)
- Patient-to-nurse ratio
- ≥10 hours rest between shifts
- ≤5 consecutive working days
- ICU competency Level 2+
- Level 1 orientee must have Level 5 preceptor
- Level 2 in ICU/ER needs Level 4+ supervisor
- No overlapping shifts for same staff
- PRN staff can only work dates they submitted availability
- Approved leave blocks scheduling
- On-call limits (max 1/week, max 1 weekend/month)
- Max 60 hours in any rolling 7-day period (all 7 windows checked, not just backward)

### Soft Rules (9 — scored with penalties)

- Overtime (>40 h/week = HIGH penalty; extra ≤40 = LOW)
- Preference matching (shift type + days off)
- Weekend count (min 3 per 6-week period)
- Consecutive weekends (max 2)
- Holiday fairness (annual tracking)
- Skill mix (diverse experience per shift)
- Float penalty (minimize cross-unit assignments)
- Charge clustering (distribute charge nurses)
- Weekend-exempt staff protection (deterrent penalty; last-resort weekend assignment for exempt staff)

Full specification: `RULES_SPECIFICATION.md`

---

## Database Key Tables

| Table                      | Purpose                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| `unit`                     | Healthcare unit config (ICU, ER, etc.)                                |
| `staff`                    | Nurse/staff members                                                   |
| `staff_preferences`        | Shift/day-off preferences                                             |
| `shift_definition`         | Shift templates                                                       |
| `schedule`                 | Scheduling periods (6-week blocks)                                    |
| `shift`                    | Shift instances within a schedule                                     |
| `assignment`               | Staff-to-shift assignments                                            |
| `rule`                     | 22 configurable rules (13 hard + 9 soft)                              |
| `census_band`              | Patient count → staffing requirements                                 |
| `staff_leave`              | Leave requests + approval workflow                                    |
| `prn_availability`         | PRN date availability submissions                                     |
| `shift_swap_request`       | Staff swap requests                                                   |
| `callout`                  | Absence + escalation tracking                                         |
| `open_shift`               | Coverage requests (auto-recommended)                                  |
| `scenario`                 | Schedule scenarios for comparison (Balanced/Fair/Cost variants)       |
| `generation_job`           | Background generation job tracking (pending/running/completed/failed) |
| `staff_holiday_assignment` | Annual holiday fairness tracking                                      |
| `exception_log`            | Full audit trail of all changes                                       |

---

## Important Notes

- **Auth is flag-gated** — `AUTH_ENABLED !== "true"` disables it entirely; demo accounts in `DEMO-LOGINS.md`; nurse portal at `/my`
- **Single SQLite file** — sufficient for CAH scale, not for multi-facility
- **Synchronous DB** — `better-sqlite3` is sync; no `async/await` needed for DB calls
- **No caching** — direct DB queries on every request
- **Excel is the import/export mechanism** — no external system integrations
- **Audit everything** — all state changes must be logged to `exception_log`
- **Safe Harbor** — `safeHarborInvoked` flag exists on assignments (Texas law)

---

## Reference Documents

- `RULES_SPECIFICATION.md` — Complete rule definitions
- `CHANGELOG.md` — Feature history and migration notes
- `docs/01-introduction.md` through `docs/11-generating-schedules.md` — User-facing guides
- `docs/ARCHITECTURE.md` — System map (read at session start)
- `docs/KNOWN-TRAPS.md` — Known gotchas and footguns (read at session start)
- `docs/DECISIONS.md` — Architectural decision log
- `DEMO-LOGINS.md` — Demo account credentials for the flag-gated auth system
- `src/db/seed.ts` — Canonical example of test data structure

---

## Context Compaction

When context is compacted, always preserve:

- Current file paths being edited
- Test failure messages
- Architecture decisions made this session

---

## Working Style Preferences

- **Ground all suggestions in real-world nursing and hospital operations.** Before proposing any algorithm change, penalty weight, rule threshold, or workflow adjustment, reason through how it would play out in an actual hospital — consider payroll costs, staff fatigue, charge nurse responsibilities, and what a scheduling manager would naturally do. If a suggestion does not hold up to that test, revise it or flag the concern before implementing.
- When multiple approaches are possible, discuss the practical trade-offs first and ask for direction before writing code.

---

## Operating Model (permanent, model-agnostic)

The main session orchestrates: plan, decompose, review, synthesize. Mechanical
work goes to named subagents. This holds for any main-session model.

### Session boot ritual (before the first edit)

1. Read `docs/ARCHITECTURE.md` (system map) and `docs/KNOWN-TRAPS.md`.
2. `git log --oneline -10` for recent movement.
3. Check `scripts/tsc-baseline.json` for the current type-error baseline.
4. Note your own model tier and route work per the tier ladder below.

### Model tier ladder (resolve at session start, never hard-code)

Roles are defined by capability NEED; fill each role with the best model the
harness offers THAT DAY. When tiers appear or disappear (e.g. Fable), only
the top of the ladder changes — nothing else in this system moves.

| Role                                                    | Fill with (best available, top first)                                                                                                              | Effort                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Judgment: architecture, hardest debugging, final review | `judgment-child` (Fable) → `deep-reasoner` (Opus) → main session                                                                                   | high/xhigh, sparingly |
| Orchestration (main session, day-to-day)                | Opus — or higher when the session runs one                                                                                                         | default               |
| Mechanical execution                                    | `fast-worker` (Sonnet — the FLOOR; never Haiku: on this repo cheaper models take more turns, break worker contracts, and cost more than they save) | default               |
| Verification                                            | `verifier` (Sonnet) + the mechanical scripts — tier-INDEPENDENT by design                                                                          | default               |

- **Escalate up, don't grind.** The main session does not have to be the top
  model. For a decision above your tier (architecture trade-off, gnarly root
  cause, high-stakes review): spawn the highest judgment agent available —
  one question in, concise conclusion out — instead of burning your own turns
  on it. Try `judgment-child` first; if the spawn fails, that tier doesn't
  exist today — fall back to `deep-reasoner`, then to reasoning in-session
  with extra verification.
- **The gates are tier-insurance.** The weaker the available models, the MORE
  the mechanical layer matters (verify gate, ground-truth, verifier). Never
  weaken a gate because the models got better; never skip one because they
  got worse.

### Spawn matrix

| Work                                                   | Who                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Architecture, root-cause debugging, high-stakes review | Main session if at/above Opus; otherwise escalate up (see ladder)                    |
| Second opinion / the hardest single calls              | `judgment-child` if available, else `deep-reasoner`; synthesize with your own answer |
| Boilerplate, tests, formatting, well-specified edits   | `fast-worker` agent (precise spec, no judgment calls)                                |
| Checking any subagent's claim                          | `verifier` agent, or `npm run ground-truth` + read the diff                          |

### Iron rules

- **A subagent self-report is a hypothesis.** Accept only after
  `npm run ground-truth` (compare its output to the claim) or a `verifier`
  pass. A clean tree plus a claim of edits is an automatic reject.
- **The verify gate is blocking.** `npm run verify` runs on every commit via
  the pre-commit hook: tests must pass, tsc errors ≤ ratcheted baseline,
  staged files prettier-clean. `VERIFY_SKIP_TESTS=1` exists for docs-only
  commits and nothing else.
- **Debugging protocol:** reproduce on a scratch COPY of the DB (never the
  live `cah-scheduler.db`) → write the failing regression test → fix the root
  cause, not the symptom → gate.
- **Doc maintenance:** a new trap → `docs/KNOWN-TRAPS.md`; a new architectural
  decision → `docs/DECISIONS.md`; same session, no exceptions — same tier as
  the RULES_SPECIFICATION.md rule above.

---

## Documentation Maintenance Rules

These are non-negotiable requirements for every change made to this codebase.

### RULES_SPECIFICATION.md

- Must always reflect the **exact, current logic** the application is running on
- Update this file whenever any change affects: rule behavior, thresholds, penalty weights, unit configuration, escalation logic, or any scheduling constraint
- Update the document version number and the inline changelog table at the bottom of the file
- Even bug fixes that correct rule behavior must be documented here — if the fix changes what the rule actually does in practice, it belongs in this document

### Beginner Documentation (docs/)

- The `docs/` folder contains user-facing guides written for non-technical staff
- Keep these aligned with the current state of the application
- `docs/05-scheduling-rules.md` is the most rule-sensitive — update it when rules change
- Language should remain simple and jargon-free; do not introduce technical implementation details

### CHANGELOG.md

- Add a new versioned entry for every commit that changes application behavior
- Review previous entries before writing a new one — match the established style, structure, and level of detail exactly
- Patch version (1.x.Y) for bug fixes; minor version (1.Y.0) for new features
- Each entry should explain: what changed, why it changed, and what files were modified
