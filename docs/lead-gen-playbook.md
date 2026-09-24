# Lead-Gen Playbook — Ranked CAH Lead List at Near-Zero Cost

Planning doc (2026-07-12). Method adapted from "How to Build a Lead List
with Claude Code" (X/@itsalexvacca, 2026-07): agent + ICP context file →
scored 0-10 list with a WHY per row → verified contacts → outreach ordered
by fit. Our adaptation is CHEAPER than the original: his ICP requires a
paid search API (Exa) to discover companies; ours is a finite, public,
government-published universe — every CAH is in the CMS / Flex Monitoring
Program registry. We skip discovery entirely and spend everything on
scoring and contacts.

Budget target: ~$0 tooling. Optional spend: postage (~$60 for 85 letters),
an email-verifier free tier. No list brokers, no Apollo/ZoomInfo, no ads.

## Phase 1 — Build the universe (free, one afternoon)

- Source: Flex Monitoring Program CAH list (public download, all ~1,380
  CAHs) and/or CMS Provider of Services file. Cross-check with Texas DSHS
  hospital directory.
- Scope pass 1: Texas only (~85 CAHs). Columns to keep/derive: hospital
  name, city, county, certified beds, system affiliation (independent vs
  owned — from POS ownership fields / AHA-style directories), website.
- **Update 2026-09-24:** a merged national universe with financials,
  fiscal-year end and agency-spend signals now exists at
  `leads/public-records/cah_master_prospects.csv` (1,377 CAHs; built from
  Medicare cost reports, IRS 990 XML, CMS ownership and California HCAI).
  Methodology and caveats: `docs/cah-public-financial-data.md`. Use its
  agency signal and budget window as scoring inputs in Phase 2.
- Deliverable: `leads/universe-tx.csv` (a repo `leads/` folder mirrors the
  post's project-folder pattern: `ICP.md`, scoring rubric, outputs —
  context files make every rerun consistent).

## Phase 2 — Score 0-10 for fit, with a WHY (Claude labor, ~$0)

Write `leads/ICP.md` once (the post's highest-leverage artifact): 25-bed
Texas CAH; buyer = Administrator/CEO; user = DON; pain = hand-built Excel
schedules, callout scramble, OT/agency creep; our offer = flat $1,000-1,500
per month service, first schedule fast, no IT project.

Scoring signals, all from public sources (agent checks per hospital):

| Signal                                                              | Why it moves the score                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Independent (not system-owned)                                      | One decision-maker; systems buy at corporate (M7's lane, not ours) |
| Nursing job postings open now (careers page / Indeed)               | Active staffing strain = scheduling pain TODAY                     |
| Postings mention night/weekend/rotating shifts or "self-scheduling" | Direct scheduling-pain language                                    |
| No enterprise WFM in postings (no UKG/Kronos mentions)              | Greenfield, no rip-out fight                                       |
| Deeper rural / farther from a metro                                 | Fewer PRN options, worse callout pain                              |
| Recent news: new Administrator/DON, expansion, staffing coverage    | Fresh leadership buys change; news = conversation opener           |
| Swing-bed / ER-heavy service mix                                    | Census volatility = our exact strength                             |

Output: `leads/leads-scored.csv` — score, hospital, county, WHY (one
sentence citing the actual signal). Per the post: read the top WHYs before
trusting the scores; a bad 9 means ICP.md needs one more line — fix and
rerun.

## Phase 3 — Find the named contact (the CAH advantage)

Small rural hospitals PUBLISH their leadership — Administrator/CEO and DON
names sit on About/Leadership pages, board minutes, TORCH member news, and
local newspapers. Agent instruction copied from the post verbatim in
spirit: "Only real people you can verify. Leave a field blank if unsure" —
a guessed name at a 200-person organization is instantly detected and
burns the account.

Per hospital: Administrator/CEO name + DON/CNO name, source URL for each,
LinkedIn if it exists (many won't — that's normal here).

## Phase 4 — Contact channels (rural reality beats email tooling)

- Email: pattern-derive from the hospital domain (first.last@, finitial
  last@), verify on a free-tier verifier. Accept that many CAHs run
  generic info@ inboxes — fine at this volume.
- THE PHONE IS THE CHANNEL. CAH main lines are public and staffed by
  humans who know everyone. "May I speak with [DON name]?" outperforms any
  cold-email stack at this org size — and it's free.
- Physical letters: 85 stamps ≈ $60 for the top tier. Nobody cold-mails
  rural hospital administrators anymore; a one-page letter with the demo
  URL and flat pricing is a pattern interrupt.
- Watering holes (free, compounding): TORCH (Texas Organization of Rural &
  Community Hospitals) events/newsletter, NRHA, state DSHS communications.
  One TORCH relationship is worth 20 cold emails.

## Phase 5 — Outreach, ordered by score (the whole point)

- 9-10 (likely ~8-12 hospitals): founder personal touch — phone call or
  letter, referencing the WHY signal ("saw you're hiring three night-shift
  RNs..."). Discovery question from the service playbook: "what's the task
  you dread every Monday?" Never lead with AI.
- 7-8: personalized email — one signal, one sentence of offer, demo link
  - pricing page (published pricing is a trust asset here; use it).
- ≤6: no outreach; they receive the content/AEO flywheel (blog, ChatGPT
  citations) until a signal changes. Rescore quarterly.
- Every payload includes: demo URL, flat price, "first schedule in under
  two weeks" (service mode — canonical claims per facts-dossier only).
- **Hook freshness rule (learned 2026-08-28).** Personalization hooks are
  DURABLE (identity/state: career history, an award as standing, an ongoing
  turnaround or expansion) or PERISHABLE (events: congratulations, "new
  role"/"first 100 days", news pieces, open postings). Perishable hooks
  expire ~8 weeks after the event; messages are drafted at research time
  but sent later, so every send gets a 2-minute freshness check: person
  still in seat, posting still live, event still recent, tense still true
  (a building "going up" may have opened). Stale perishable hook → reframe
  as durable identity or cut. Quoting someone's own public words back to
  them is durable — congratulating them on old news is not.

## Outreach message standard (founder-set, 2026-09-12)

Every first-touch message has three beats, in this order, and nothing else:

1. **Their situation, verified and specific.** One sentence about the
   hospital's own scheduling pain, built from the row's brief (never the
   `why` column), and ideally carrying a date or duration: how long a nursing
   posting has been open, how many months the person has been in the seat, a
   service they still run at their size. Re-check the source at send time
   (careers page, job board, leadership page); a posting hook older than ~8
   weeks is stale until re-checked.
2. **One plain line on who we are.** "I run SimpleScheduleAI, a nurse
   scheduling solution for small Texas hospitals." No fee, no service-model
   framing, no install or compliance claims, no "AI" as the lead.
3. **A value-first ask in their currency, naming their hospital.** Never
   "could I get 20 minutes for your read" (a favor request), never "send me
   your roster" (nobody hands over data before they know us). The close
   promises something they can watch, at no cost to them:
   - CNO / DON: "Would it be worth 20 minutes to see how <Hospital>'s next
     month could be built in under 30 minutes, with rest and weekend rules
     checked before it reaches your nurses? Nothing needed from your side,
     I'll show it on a sample unit. - Pradeep"
   - CEO / Administrator: "...built in under 30 minutes, with overtime and
     agency shifts visible before they're worked instead of after? Nothing
     needed from your side, I'll show it on a sample unit. - Pradeep"
     "Under 30 minutes" must stay demonstrable live (three drafts in about two
     minutes on the sample unit; the rest is review). No savings numbers: we
     have no customer data, and a rural CFO will ask "how much" first.

Rules that ride along: connection notes cap at 300 characters, so the note is
beats 1-2 plus a short ask and the value close goes in the DM on acceptance
("Thanks for connecting, <First>." opener). "Dr." only for an earned
doctorate. Flattery only when earned and specific. A death or crisis at the
hospital means hold the row and never reference it. The person must be
verified in seat on the day of sending.

**Revision procedure** (when asked to improve a message): reopen the row's
brief and its `VERIFIED` line; re-check the hook's source live for currency;
confirm the person is still in seat; rewrite to the three beats; record in
`new_message_reason` what changed and why; write the row back to the sheet.
The real worked example (before/after with the source that sharpened the
hook) lives in the gitignored `leads/message-standard.md`.

## Cadence + hygiene

- Volume stays tiny and personal (5-10 first-touches/week). This is 85
  accounts, not 8,500 — the asset is the founder's credibility in a small
  community where administrators all know each other. One referral loop
  beats any sequence tool.
- Track in the same CSV (touched, channel, response, next step). No CRM
  until it hurts.
- Rescore signals monthly (postings churn); expand to neighboring states
  (OK/NM/AR/LA, ~150 more CAHs) only after Texas outreach is running.
- Compliance: individual, personal B2B outreach; no bulk blasts; honor any
  opt-out immediately.

## What we deliberately skip (cost discipline)

Search APIs (universe is known), list brokers, Apollo/ZoomInfo seats,
sequence tools, paid ads, conference sponsorships (attend cheap TORCH
events; don't sponsor yet). Revisit paid anything only when the free
pipeline is saturated — at 85 accounts, it won't be soon.

## Founder sales note — rehearse before the first real call (2026-08-16)

Adopted from Blomfield's "simulating investor calls" (YC Startup School
Paris): before dialing the first administrator from the ranked list, run
2-3 practice calls against an AI playing a skeptical 25-bed-CAH DON — 20
years of paper schedules, burned once by an enterprise WFM rollout,
allergic to the word "AI", protective of her nurses. Build the opponent
from leads/ICP.md + the objection notes in ops/conversations/. Practice
the discovery question ("what's the task you dread every Monday?"), the
price answer, and the "what if it makes a bad schedule" answer. The first
real call should be rep #4, not rep #1.
