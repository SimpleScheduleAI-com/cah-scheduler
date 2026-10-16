# Competitor Lessons — Product Ideas Worth Stealing (and Not)

Working notes from deep competitor research. Each entry: what they do, whether
we adopt it, and when. Facts and citations live in the website repo's
`docs/seo/competitor-dossier.md`; this file is the product-decision side.

## From YouShift (researched 2026-07-06 — YC W25, physician-group scheduler)

1. **Points-based preference budget — ADOPT LATER (post-first-pilot).**
   Their staff spend a limited points budget to weight shift preferences, so
   fairness is explainable ("you spent your points on Christmas off, she spent
   hers on weekends"). Map to us as a preference-weighting INPUT to the soft
   rules — nurses rank what matters most each 6-week period, the engine's
   preference-match penalty uses the weights. Explicitly NOT self-scheduling:
   the DON still owns the schedule (founder decision; CAH accountability
   culture). Backlog card, revisit after pilot #1 feedback.

2. **"Every change is compliance-checked in real time" — SAY IT NOW.**
   We already do this (violations modal, swap validation, callout
   escalation). Their copy claims it loudly; ours doesn't. Website copy task,
   zero engineering.

3. **Positioning ammunition — USE IN SALES MATERIALS.**
   As of 2026-07-06 YouShift has: no G2/Capterra/Trustpilot listings, no
   published pricing, no named customers, no nurse/CAH language, "agentic AI"
   marketing with zero technical disclosure. Our contrast: published flat
   pricing, a self-serve demo link, 22 readable rules, CAH-specific
   everything. Against AI buzzwords, "click the demo and read the rules" is
   the stronger pitch to a rural administrator. (Neutral framing rule
   applies in public content — see dossier.)

4. **Swap compatibility indicator — SMALL POLISH, SOMEDAY.**
   Their mobile swap flow shows a "compatibility indicator" before a nurse
   proposes a swap. Our /my swap dialog already filters to eligible partners
   via /api/my/swap-options; surfacing a visible "compatible / creates
   overtime" badge per candidate is a small UX win when we next touch the
   nurse portal.

5. **Wedge-to-OS pattern — AWARENESS ONLY.**
   They ship time clock + labor-cost analytics and openly aim to be "Rippling
   for healthcare." That's the standard post-trust expansion path (scheduling
   → time & attendance → payroll/credentialing). Not our fight pre-revenue;
   remember it when pilots ask "can it also do timekeeping?" — the answer is
   "on the roadmap after scheduling is solid," not "no."

6. **Threat level: LOW-WATCH.** Bottom-up doctor adoption (app-store,
   1000+ individual physicians) doesn't reach CAH DONs. M7 Health remains the
   head-to-head AEO/product competitor. Re-check YouShift ~quarterly for a
   nursing pivot.

## From M7 Health (researched 2026-07-06 — the head-to-head competitor)

1. **The CAH authority lane is claimed but undefended — CONTEST NOW.**
   ChatGPT cites M7's 2026-04-01 CAH post as the answer for "best nurse
   scheduling software for critical access hospitals," yet that post names
   zero CAH customers and contains zero proof — and M7's entire named
   customer list (Ochsner 47 hospitals, ScionHealth, Lifepoint...) is
   multi-hospital systems. Our counter is NOT a fake case study (hard rule:
   we have no pilot customers and never invent results) — it's out-evidencing
   with what's true today: the live demo link, published flat pricing, the
   readable 22-rule list, worked-math posts. Speed matters: their content
   arc is accelerating post-Series-A.

2. **Mechanism specificity beats "AI balances" — DOUBLE DOWN.**
   M7 never says how anything works ("AI forecasts," "AI balances"); their
   own job ad frames AI/ML as something to build; their turnover feature is
   baseline-deviation rules in AI wrapping. We can honestly publish exactly
   how our engine works (greedy + local-search over 22 named rules, three
   variants the DON chooses). Transparency is our cheapest durable
   differentiator against both M7 and YouShift.

3. **They have no native nurse app either (mobile web) — PARITY, note it.**
   No app-store presence found for M7. Our /my portal is the same
   architecture choice; nobody has an app-store advantage in this matchup.

4. **Their turnover-risk feature is a REAL product idea — ADOPT LATER.**
   Flagging "this nurse's callout rate is climbing vs her own baseline /
   she stopped submitting preferences" is rule-based, cheap, and fits our
   data model (callouts, preferences, OT already tracked). Honest framing:
   deviation signals, not "AI prediction." Post-pilot backlog card — a DON
   retention conversation starter.

5. **Their 4-week onboarding claim matches our promise — PROVE OURS.**
   "Most CAHs live within a few weeks, no IT burden" is exactly our one-month
   setup pitch. Ours is backed by a written runbook (spec §6); when pilot #1
   completes onboarding, document the actual timeline — first real proof in
   the category wins the claim.

6. **Threat level: HIGH-ACTIVE.** $10M Series A (2025-07), Ochsner
   system-wide, monthly content, hiring sales/CS. They are moving downmarket
   via content into OUR lane while their product proof stays enterprise.
   Re-check monthly (weekly citation check already covers the AEO side).
   **Update 2026-09-21: acquired by Ascend Learning** (owner of ATI, NHA,
   StaffGarden, Laudio). Expect M7 to be bundled with education and
   credentialing into health systems Ascend already sells to; their careers
   page went to zero openings. The sub-25-bed push may stall — our
   independence and CAH focus become sharper contrasts. Details:
   `competitor-pricing-tiers.md` §4.

## AI landscape — how we use AI vs how they (probably) do

Recorded 2026-07-06 so the reasoning survives the session. Mechanisms below
for competitors are informed inference — neither company discloses its stack.

**Us (fact, not inference):** the scheduling engine is classical algorithmic
optimization — greedy construction + local-search improvement over 22
explicit rules, three weighted variants (Balanced/Fair/Cost) the DON chooses
from. Deterministic, auditable, seconds-fast, zero LLM in the product
runtime. No ML trained on data, no demand forecasting from history (never
claim these). The LLM kind of AI lives in the SERVICE layer: AI agents build
and operate the product, and the managed-service delivery (imports, rule
tuning, support) is founder+AI labor. That is the honest content of
"AI-native service."

**YouShift ("optimization algorithms + agentic AI"):** solver undisclosed;
founders describe the problem correctly as constrained multi-objective
allocation, so a conventional optimizer almost certainly does the math. The
"agentic AI" layer (their job ad: "AI agent layer... turning real-world
operational workflows into agentic, automated systems") is best read as LLM
agents wrapped AROUND the solver — the LLM mediates, never decides:

- natural-language rule setup (admin types a rule, agent translates it into
  solver constraints)
- exception handling (callout arrives, agent evaluates candidates, drafts
  and chases messages, proposes swap chains)
- conversational schedule edits ("move X off Thursday, keep coverage" →
  agent computes minimal repair and proposes it)
- plain-language explanations of constraint decisions

Risk profile of that pattern in a compliance domain: an LLM mis-translating
a rest rule is a patient-safety-adjacent bug — which is exactly why the
agent layer stays an interface, not an authority.

**M7 ("AI forecasts / AI balances"):** outcome-framed language only, never
mechanism; own job ad frames AI/ML as capabilities TO BUILD; flagship
"AI-powered" turnover feature self-describes as baseline-deviation rules.
Assessment: rule-driven heart, AI costume.

**Our roadmap equivalents (post-revenue, DON stays in command):** the two
agentic features that fit CAH life are natural-language rule configuration
and callout-communication drafting; "explain this schedule" narration is a
close third. Solver upgrades (OPTIMUS / CP-SAT spike) are a separate axis
from the agentic layer — do not conflate them. Core thesis: agentic AI is
not a moat; it is LLM glue around the same math all three products run.
Workflow fit for a 25-bed hospital is the moat.

## Service-model lessons (from "The Claude Agent Playbook", X/@yurshevv, 2026-07-02)

Generic agent-business playbook; most of it validates choices we already
made (narrow niche, outcome-not-AI pitch, retainer pricing, demo-not-deck,
running our own ops with agents). Four ideas worth adopting for SERVICE mode:

1. **Make the retainer legible — ADOPT AT NEXT PRICING-PAGE TOUCH.**
   Their sharpest line: a retainer should visibly bundle three things —
   (a) the system running, (b) monitoring + failure response with someone
   accountable, (c) a monthly allotment of changes/tweaks. Our flat monthly
   fee ($1,000/$1,500 by roster size) currently names a price, not what the
   month BUYS. Itemizing it ("your schedules generated and maintained +
   monitored + rule changes included") converts "why do we still pay?" into
   a checklist the administrator can defend at renewal.

2. **Proof-of-work reporting — FOLD INTO STICKINESS PHASE A.**
   "An agent nobody's watching is a liability... even a simple daily-log
   email." For service mode this means a periodic "what we did for you"
   summary (schedules updated, callouts resolved, rules tuned). Invisible
   service labor is unrenewable service labor. Merges with the DON weekly
   digest / admin monthly report already specced (production spec §7.1 P6)
   — add the service-labor line-items to those same surfaces, not a new one.

3. **Explicit escalation protocol — ADD TO TRUST PACK / SERVICE PAGES.**
   "Clients forgive edge cases; they don't forgive silent failures." State
   plainly: what happens when something breaks — who is contacted, through
   what channel, how fast. CAH DONs live in escalation culture (callout
   chains ARE escalation protocols); they will recognize and trust the
   shape. Cheap credibility no competitor states either.

4. **Discovery-call language — FOUNDER SALES NOTE.**
   Never ask "do you want AI"; ask "what's the task you dread every
   Monday." Also: product-mode buyers who struggle with configuration are
   the warmest service-mode upgrade leads — treat the $10/user tier as a
   funnel, not just a SKU.

Ignored deliberately: template marketplace (Method 2), charm pricing
($27-style — wrong register for hospital B2B), 30-day-hustle framing.

### YouShift update (Playwright-rendered site, 2026-07-12)

The previously-unfetchable SPA finally read. Three strategic updates:

1. **They now offer a managed-service mode** — site verbatim: "if needed,
   our team manages your scheduling end-to-end, removing the administrative
   burden." Convergence on our service angle from the software side. Their
   version is an enterprise add-on ("hundreds to thousands of clinicians");
   ours is the product FOR a 20-60-nurse CAH. Lane still ours, but the
   "someone runs it for you" pitch is no longer unique — sharpen our version
   with retainer legibility + proof-of-work reporting (see service-model
   lessons above) before it matters.
2. **Their agentic layer is early-access, not shipped** — FAQ verbatim:
   "currently in early access... rolling out broadly in upcoming releases."
   Confirms the earlier assessment: the agentic AI is being built now.
3. **The points system is gone from their current site** — was the one
   concrete fairness mechanism in 2024 press; treat as legacy. Their current
   fairness language is generic ("workload equity... fairness across every
   scheduling cycle").

Threat level stays LOW-WATCH (enterprise physician lane), but the
managed-service convergence is the specific thing to re-check quarterly.

## Product backlog — flex-home / low-census workflow (raised 2026-08-11)

The gap the capability inventory flags: the software detects overstaffing and
SUGGESTS who to flex, but nothing executes a send-home. In service mode our
team does it manually (a valid service capability); in product mode it is not
claimable until this ships.

**It is ~80% built already.** Existing scaffolding — do NOT rebuild:

- `unit.lowCensusOrder` — per-unit send-home order (stored, displayed on the
  unit card, no form control to edit it)
- `staff.voluntaryFlexAvailable` — per-nurse VTO flag (stored, editable)
- `staff.flexHoursYearToDate` — counter (stored, never incremented)
- `flex_home` — already a valid `exception_log` action enum value
- `src/components/schedule/assignment-dialog.tsx` — already suggests who to flex
- dashboard `overstaffedShifts` + advisory copy ("consider flex-home or VTO")
- `src/lib/audit/staffing-context.ts` — `describeStaffing()` already produces the
  "N over requirement — excess staff" line used by census + removal audit entries

**What is missing (~1 day):** one action that (a) marks the assignment flexed,
(b) increments `flexHoursYearToDate`, (c) emits the `flex_home` audit action
with the staffing note, (d) notifies the nurse. Definition of done MUST include
the audit line — founder requirement 2026-08-11: a send-home has to be visible
and useful to whoever reads the trail later.

Fairness angle worth building in at the same time: flex-home is a cost lever
nurses feel personally, so rotate it — surface who was flexed last and how many
flex hours each nurse has YTD (the counter already exists for exactly this).
