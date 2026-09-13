# Known Traps

Landmines this repo has already stepped on. Read before your first edit of a
session. When you discover a new one, add it HERE in the same session — that
rule is in CLAUDE.md and is not optional.

## Windows / tooling

- **`prn` is a reserved DOS device name.** Git cannot open files or dirs named
  exactly `prn` ("No such file or directory" while the file visibly exists).
  Use `prn-availability` style names. Same family: `con`, `aux`, `nul`.
- **PowerShell file writes add BOM / cause mojibake.** `WriteAllText` and
  `Out-File` default to BOM'd encodings that break tooling. Prefer the Edit
  tool; if scripting, use `New-Object System.Text.UTF8Encoding($false)` and
  verify the bytes afterward.
- **Turbopack serves stale CSS across restarts.** If a style edit refuses to
  appear: kill the dev server AND `rm -rf .next`, then restart.
- **Prettier repo-wide is forbidden.** It churns unrelated files and the
  founder reverts it. Only ever format the files you changed.

## Build / deploy (Railway)

- **Volumes mount at RUNTIME only.** During `next build` the volume dir does
  not exist; `src/db/index.ts` mkdirs the DB dir so build-time module eval
  survives. Never assume `/data` exists at build.
- **`next build` page-data collection uses multiple workers**, each opening
  its own SQLite connection to a fresh throwaway DB → they race on the
  DELETE→WAL conversion → `SQLITE_BUSY`. Defenses live in `src/db/index.ts`
  (busy timeout, open retry, tolerated WAL race). Never fires locally because
  the local DB is already WAL — do not "simplify" this away.
- **`typescript.ignoreBuildErrors: true` is set** (next.config). The build
  passing says nothing about types. The verify gate's ratcheted baseline
  (currently 22 pre-existing errors, all in tests/scripts) is the only type
  watchdog. Check the count, not the build.
- **Build script must stay pure `next build`.** Schema push happens at
  `prestart` (drizzle-kit push against the mounted volume), not at build.
- **Railway's `npm ci` runs the `prepare` lifecycle script with NO `.git`
  directory** (the build container gets an exported tree, not a checkout), so
  a bare `git config` in `prepare` fails with exit 128 and kills the image
  build. `scripts/setup-hooks.mjs` guards this — keep the `existsSync(".git")`
  check if you touch it.

## Data / domain

- **Never mutate the founder's live dev DB** (`cah-scheduler.db`) during agent
  work — he tests against it between sessions. Debug on a scratch copy
  (`cp cah-scheduler.db <scratchpad>/…`) first.
- **All week math goes through `src/lib/date/week.ts`** (UTC-safe Mon–Sun).
  Hand-rolled `getDay()` arithmetic has already caused a 24h-vs-36h weekly
  hours bug. If you need week bounds, import them.
- **Agency staff must ALWAYS rank last** in candidate suggestions regardless
  of overtime status — cost order is straight-time → OT → agency. A past sort
  change silently ranked agency #1; the regression test in
  `src/lib/coverage/` guards it.
- **Leave approval has TWO coverage paths** (`src/app/api/staff-leave/[id]/route.ts`),
  split by the unit's `calloutThresholdDays` (default 7): open shift beyond,
  callout within. Anything nurse-facing (notifications, board rows, tests)
  must be reasoned through for BOTH — the callout path had no notification at
  all until v1.11.0, and a demo with a schedule starting in 3 days exercises
  only the callout path. The demo unit's threshold is 7, so "post leave for
  next week" is always a callout.
- **Route date tests: build "today + n" from LOCAL fields, not `toISOString()`.**
  Routes parse `YYYY-MM-DD` as local midnight; a UTC slice is a day behind on
  any machine east of Greenwich (the founder's is UTC+5:30), so "+4 days"
  silently becomes "+3" and the assertion text drifts.
- **Auth is flag-gated.** `AUTH_ENABLED !== "true"` = total no-op (no login,
  no middleware). Demo accounts + local run command: `DEMO-LOGINS.md`.
  Excel import cascade-deletes nurse logins; `provisionAuthUsers()` re-creates
  them post-import — keep that call if you touch the import route.

## Process

- **A subagent's self-report is a hypothesis.** One under-reported its edits
  by ~7x. `npm run ground-truth` prints the facts; the verifier agent
  adversarially checks claims. Accept nothing without the diff.

## Maintenance log

- 2026-07-04 — file created as part of the post-Fable operating system (spec: docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md).
- 2026-07-04 — two new traps from the demo-showroom rehearsal:
  - **Only one `next dev` per checkout.** Turbopack holds a lock at
    `.next/dev/lock`; a second dev server (any port) fails with "Unable to
    acquire lock", and there is no CLI/env override for the dist dir. Kill
    the running server first (stale locks after force-kills: delete
    `.next/dev/lock`). Force-killed servers can also be auto-respawned by
    lingering child processes — verify the port with netstat after killing.
  - **Module-scope state is unreliable under `next dev`.** The demo reset's
    60s rate limit (module-level timestamp) does not trigger across requests
    in dev — Turbopack workers don't share module instances. It works under
    `next start` (single process). Don't "fix" dev behavior by moving such
    state to the DB unless production actually needs it.
- 2026-07-06 — two traps from the empty-demo rework:
  - **Client-side onboarding flags survive server resets.** The `fcg:*`
    localStorage keys live in each visitor's browser; wiping the demo DB
    leaves returning browsers showing a half-struck Getting Started list on
    an empty hospital. Fixed via a reset epoch (`demo-reset-epoch.txt` next
    to the DB, surfaced in GET /api/demo/status; DemoBanner fires
    `onboarding-reset` when it changes). Any future "wipe the server" feature
    must ask: what client-side state believes the old world still exists?
  - **Never run two agent sessions with git write access on one checkout.**
    A sibling session mistook a teammate's landed commits for a glitch and
    `git reset --soft`'d them away (twice). Agent contracts now ban history
    rewrites and subagent delegation; the orchestrator serializes all git
    operations.

## Sibling agent stashes the orchestrator's uncommitted work (2026-08-15)

**Symptom:** mid-session, marker greps show your uncommitted edits vanished
from tracked files; untracked new files survive; `git status` shows only the
subagent's files modified.

**Cause:** a fast-worker ran `git stash` (named `sibling-wip-isolate`) to get
a clean diff of its own edits — shelving the orchestrator's in-flight work.
Variant of the 2026-07 soft-reset collision; the no-history-rewrite rule did
not cover stash/restore of the working tree.

**Recovery:** `git stash list` FIRST — if the work was stashed (not
checkout'd), `git stash pop` restores it; file sets usually don't overlap so
the pop is clean. Verify with marker greps, never by assumption.

**Prevention:** fast-worker contracts (project + global) now have an explicit
rule: never stash/checkout/restore changes you did not author; report foreign
dirt, don't clean it. Orchestrator side: marker-grep your own edits after any
subagent completes work in the same tree, before building on top of them.
