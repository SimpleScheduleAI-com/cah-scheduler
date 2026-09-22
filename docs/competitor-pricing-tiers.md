# Competitor pricing tiers and feature depth (researched 2026-09-22)

Eight vendors, one question each: what does a buyer actually get per tier,
and what would a 25-bed Critical Access Hospital pay. Eight parallel research
passes over official pricing pages, help centers, KLAS, Capterra/G2/Software
Advice, SEC filings, earnings calls, press, and app stores. Every number below
is dated and sourced in the per-vendor sections; anything marked _estimate_
comes from an aggregator and could not be verified against a primary source.

Companion to `competitor-lessons.md` (positioning) and the gaps register in
`scheduler-longer-horizon-findings.md` (what we still lack).

---

## 1. Cross-vendor summary

| Vendor               | Owner (2026)                                    | Published price?        | Real price signal                                                                                                                                                                       | Tiers                | AI that actually ships                                                                                   | Hospital / CAH fit                                                                                                      |
| -------------------- | ----------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Deputy**           | Independent (AU)                                | Yes                     | Lite $5 / Core $6.50 / Pro $9 per user/mo, 10% off annual, $30/mo minimum                                                                                                               | 3 + add-ons          | Chat agent (beta) that runs existing workflows with confirm; **cannot optimise or handle 24-h coverage** | Clinics, home care, senior living. No inpatient hospital case study. No acuity, ratios, charge rules, rolling 7-day cap |
| **ScheduleAnywhere** | TCP Software (brand being folded into Humanity) | Was; page now redirects | Historic: $25/mo flat to 10 staff, $50/mo to 25, $2/employee above. 2025 quote: $150/mo flat under 26, $6/user above ($4.80 annual). **Capterra's "$25/user" is a data-entry artifact** | 1 (+ paid add-ons)   | None                                                                                                     | **Has a 22-bed CAH reference** (Culbertson Memorial, IL). No rules engine, no auto-schedule, dated UI, app 2.2 stars    |
| **M7 Health**        | **Ascend Learning (acquired 2026-09-21)**       | No                      | "Priced for smaller facilities" claim, no number; enterprise land-and-expand via pilots                                                                                                 | None public          | Constraint-based "Auto-Balance", census forecast, preference learning; method undisclosed                | Ochsner 47 hospitals down to CAHs "onboarding in UT/MS/AL"; no named CAH; 0 third-party reviews                         |
| **In-House Health**  | Independent, seed ($5.4M)                       | No                      | ROI-priced per unit ($270K/unit savings claim); assessment-first enterprise motion                                                                                                      | None public          | Real census/LOS forecasting models; scheduler is a copilot                                               | Only named customer is Assuta (Israel); no US hospital named; forecasting needs volume a CAH lacks                      |
| **OnShift**          | ShiftKey (not ShiftMed)                         | No                      | Quote-only; aggregator estimate $8-17 PEPM                                                                                                                                              | None official        | "Predictive" best-fit ranking; no generative AI                                                          | Senior living/SNF only; KLAS "Long-Term Care Only"; no acute deployments found                                          |
| **QGenda**           | Hearst Health                                   | No                      | Aggregator "$500-1,000/provider/mo" is unreliable; anecdotes imply $20-125/provider/mo; gov contracts $66K-257K; 5%/yr escalator, auto-renew                                            | Modules, no tiers    | Chat assistant + NL reporting marketed; reviewers find only rules automation                             | Physician-first; nurse product KLAS "limited share, not primary"; reviewers: **poor fit under 25 beds**                 |
| **SmartLinx**        | Lone View Capital (PE)                          | No                      | Aggregator "$3/user/mo" floor + $2-5 per add-on module; $1-5K implementation _estimate_                                                                                                 | Modules              | Rules and alerts; AI is roadmap (blog 2026-04)                                                           | Long-term care only; PBJ/Five-Star are dead weight for a hospital; 150-employee floor                                   |
| **ShiftWizard**      | HealthStream                                    | No                      | Quote-only; 1-5 yr terms, annual escalators standard; $1.7M for two large go-lives; **NurseGrid Manager at $5/user/mo is HealthStream's own small-team floor**                          | 1 + add-ons (Acuity) | Predictive Census ML (7-120 days, ~87-90% claimed)                                                       | Mid-to-large systems; no <=25-bed reference; HealthStream sells a CAH "market bundle" (2026-Q2) that may include it     |

**Our position for reference:** flat published pricing, $10/user tier, service
retainer $1,000-1,500 by roster size (see `competitor-lessons.md`).

### What the table says

1. **Only Deputy and (historically) ScheduleAnywhere publish a price.** Every
   healthcare-native vendor is quote-only with escalators and auto-renew.
   Published flat pricing remains a real differentiator, not a nicety.
2. **The two cheap generic tools have no rules engine.** Deputy's fatigue rule
   only fires for shifts ending after 7 pm and starting before 9 am; every
   warning is one click to override. ScheduleAnywhere has counters, not
   constraints. Neither can express a charge-nurse requirement.
3. **The healthcare-native vendors do not sell to 25-bed hospitals.** QGenda,
   ShiftWizard, OnShift and SmartLinx have no CAH reference. M7 says it is
   "onboarding" CAHs and names none. The one named CAH in the whole set runs
   ScheduleAnywhere.
4. **"AI" is mostly forecasting or a chat wrapper.** In-House Health and
   ShiftWizard have real census models. M7's optimiser is undisclosed.
   Deputy's agent cannot solve coverage. Nobody publishes how their scheduler
   decides, which is the transparency lane we already chose.
5. **M7's acquisition changes the map.** Ascend Learning (ATI, NHA, StaffGarden,
   Laudio) will sell M7 as part of an education-to-scheduling bundle to
   systems it already serves. Expect enterprise-first roadmap and less
   attention below 25 beds. Their hiring page shows zero open roles.

### Corrections to our own material

- Our CAH buyer's guide blog says no competitor has a CAH reference. False:
  ScheduleAnywhere's 2019 AONL case study is a 22-bed CAH (Sarah D. Culbertson
  Memorial Hospital, Rushville IL, 200+ staff, self-scheduling unit). Fix the
  post.
- `competitor-lessons.md` calls M7 "YC-backed" in the research brief; it is
  not (First Round, Threshold, 25madison). Update on next touch.
- OnShift belongs to ShiftKey, not ShiftMed.

---

## 2. Deputy (deputy.com)

### Pricing (captured 2026-09-22)

| Plan                | USD per user/mo | Notes                                                                                               |
| ------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| Lite                | $5              | "Everything you need to get started with scheduling and time tracking"                              |
| Core (most popular) | $6.50           | Default trial plan                                                                                  |
| Pro                 | $9              | Includes Analytics+ and Messaging+                                                                  |
| Enterprise          | Not listed      | "Contact us"; legacy article: 250+ users, mandatory professional services, 8-14 week implementation |

- 10% off annual, billed upfront. **Minimum $30/mo and 4 users on annual**
  (since 2025-09-01). Restructured 2025-10-01 from Scheduling $4.50 / Time &
  Attendance $4.50 / Premium $6 / free Starter (all discontinued).
- **Every non-archived person is billed**, invited or not, including admins and
  test users. Only archived users and "Advisor" access are free. A PRN pool
  that works two shifts a month costs the same as full-timers.
- Annual: cannot reduce seats or downgrade mid-term, no refunds.
- Add-ons (monthly, 10% off annual): Payroll by Paycor $8/user + $49 base
  (annual Core/Pro, US only); HR $2/user; Messaging+ $1.95/user; Analytics+
  $1.50/user. Service add-ons via CSM only: priority support, "AI Labor
  Optimization" (a services engagement, unpriced), technical account manager,
  extra sandbox at 10% of ARR, custom SOW with minimum spend.
- SMS 1 cent per 160 characters (US). Free trial about 31 days on Core, no card.
- Worked example, 60 users: Core $390/mo ($4,212/yr annual). Pro $540/mo.
  Adding HR + Payroll roughly triples Core.

### Basic vs Advanced Scheduling

**Basic (Lite):** day/week/month and person/area views; multi-location view;
drag-and-drop by Location > Area; weekly templates; bulk copy/move/delete/
publish; scheduled breaks; five shift types (Open first-claim, Open with
approval, Swap, Offer to chosen people, Find Replacement); shift
confirmations; tasks; agreed hours on 1/2/4-week patterns; custom stress
profiles (fatigue); training-based scheduling; preferred staff;
availability; leave blocking; Fair Workweek predictability pay.

**Advanced (Core adds):** Auto-fill empty shifts (weights: cost / equal hours /
learn-from-me, plus JSON "recipes"); auto-fill from agreed regular hours;
auto-build empty shift structure from required headcount, minimum coverage,
or previous schedules; custom shift fields; Fair Workweek consent; Business
Insights (auto-forecast required staff, budgets and targets, custom demand
metrics, labor modelling with fixed work, model automation); micro-scheduling
(one shift split across areas, one clock-in, **irreversible switch**);
timesheet auto-approval; biometric kiosk; Pay Rate Builder.

**Pro adds nothing scheduling-specific**: custom roles, location hierarchy,
audit logs, SSO, sandbox, 24/7 chat, premium reports.

### How the engine actually decides

- Seven "recommended" checks per assignment: overlap (the only hard block),
  training modules valid, unavailability, approved leave, stress profile, HR
  onboarding complete, preferred staff. Everything but overlap is a warning
  with a "Schedule anyway" button.
- Stress profile parameters: max hours per shift / day (rolling 24 h) / week
  (calendar week), max days per calendar week, **minimum rest between shifts
  only if shift one ends after 7 pm and shift two starts before 9 am**, plus a
  generic JSON gap rule. No consecutive-night limit, no rolling 7-day hour
  window, no weekend or on-call limits.
- Auto-scheduling pipeline is retail-shaped: demand metric (default "Sales")
  from POS, spreadsheet or manual entry; labor model converts it to headcount
  per area; auto-build empty shifts; auto-fill. No census, acuity, admissions
  driver ships. Auto-fill will not fill Open shifts, only Empty ones. Overtime
  warnings on the schedule are a Feb-2026 beta requiring Pay Rate Builder.
- "On call" exists only as a non-worked pay category. No on-call limits, no
  activation.

### Deputy AI

- Announced 2025-11-05 and 2025-11-28 (built on AWS). In beta. **Badge on
  every plan: "INTRODUCTORY FREE. Price and availability may change."** No
  future price, date or meter announced anywhere.
- What ships: a chat/voice agent (web, mobile, WhatsApp) for admins, location
  managers, supervisors. Creates one-off/recurring/open/rotating shifts,
  copies weeks, bulk edits, fills empty shifts, finds replacements, swaps,
  publishes, loads templates, edits and approves timesheets, adds leave and
  training records, answers help questions. Shows a plan and does nothing
  until you confirm. Honours availability, leave, training, stress profiles.
  Best under about 150 shifts per request.
- Deputy's own stated limits: cannot do predictive staffing, cannot optimise
  on cost or forecast, no analytics, struggles with "I have four staff and
  need 24-hour coverage Monday to Sunday." A six-week three-shift unit
  schedule is far larger than its request cap.
- "AI Labour Optimisation," "AI Insights," "AI Timesheet Approval," "AI
  Payroll Anomaly Detection" were announced as in development for 2026. Only
  the rules-based timesheet auto-approval (Core+) and a services-sold "AI
  Labor Optimization" engagement exist today.

### Healthcare specifics

- Training modules with expiry dates and file upload; areas can require
  modules; expiry notifications at 7/14/30/60/90 days via an extension.
  Expired credentials drop the nurse from "recommended" but are overridable.
- Logos: Kaiser Permanente, DaVita, Brookdale Senior Living, VCA Animal
  Hospital; case studies are home nursing (AU) and a UK care home. **No
  inpatient or CAH case study.** Third-party guides steer hospitals elsewhere.
- Reviews (Capterra 4.6, 773): app lag, support "disgraceful" (2025-26),
  "automations don't work with complex scheduling requirements," per-user
  billing painful for large low-hours pools, reporting paywalled behind Pro.

---

## 3. ScheduleAnywhere (TCP Software, ex Atlas Business Solutions)

### State of the product

- scheduleanywhere.com now redirects twice and lands on a page that renders
  **TCP Humanity** content. Every former pricing, FAQ and feature URL does the
  same. Old API host no longer resolves. Product is still operational (TCP
  status page, SOC 3 for calendar 2025, iOS app v5.5 updated this month) but
  new-logo marketing has been redirected to Humanity. No sunset notice found.
- TCP now quotes healthcare prospects Humanity: Essentials $2.75 / Professional
  $3.75 per employee/mo annual, Enterprise custom.

### Pricing, reconciled

| Source                              | Figure                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Old official tiers (pre-TCP)        | 1-10 employees $25/mo flat; 11-25 $50/mo flat; 26-50 $2/employee/mo; 50+ quote                                                   |
| Connecteam quote, 2025-03           | Under 26 employees $150/mo flat ($120 annual); 26+ $6/user/mo ($4.80 annual); API +$0.50/user; implementation $295/hour optional |
| Capterra / GetApp / Software Advice | "$25 per user per month"                                                                                                         |

**Capterra's $25/user is the old $25/month flat account fee forced into a
per-user field.** Real cost is $2-6 per scheduled employee, or a small flat
fee for tiny teams. Priced per employee on the schedule, not per login, so
every nurse counts. Contracts one year, auto-renew, data deleted 30 days after
expiry. 30-day trial. Manager Dashboard and Self-Scheduling are paid add-ons
with unpublished prices.

### What you get (single feature set across tiers)

- Spreadsheet grid, click-to-assign (no drag-and-drop), unlimited schedules
  and shifts, shift tags, explanations (Call Off, On Call, PTO, Training).
- Copy Schedule = the rotation mechanism: enter a pattern once, copy forward.
  Schedule Multiple = bulk assign.
- Requirement rows (staff, hours, census, patients per day) and Coverage
  Watches that count scheduled staff by shift/position/skill against them.
  **Display counters, not constraints.**
- Time-off, swap (both days must have shifts), and cover requests with
  manager approval. No open-shift board; managers message unscheduled staff.
- Self-Scheduling add-on: timed windows controlling when and which dates a
  nurse may edit. No rule enforcement inside the window beyond dates.
- Email and SMS (via carrier gateway), one-way messaging, about 19 canned
  reports, no custom report builder.
- Skills with expiry and 90-day notices; Manager Dashboard add-on warns on
  expired skills and hours exceeded. Does not block assignment.
- Three access levels. SAML SSO. Paid REST API. Excel import. **No payroll or
  timekeeping connectors, not HIPAA-compliant, no MFA** (per Connecteam).
- Native iOS/Android apps: 2.2 stars (49) and about 2.8 (290).

### Healthcare evidence

- "Created by an RN." AONL 2019 case study: **Sarah D. Culbertson Memorial
  Hospital, 22-bed CAH**, 200+ staff, 50+ nurses on self-scheduling; and
  Firelands Regional (424 beds, "7-10 hours/week to under 20 minutes/day").
- Absent: charge-nurse rule, rest rule, consecutive-day limit, ratio
  enforcement, rotation engine, holiday fairness, any hard stop.
- Reviews (Capterra 4.6, 61, mostly 2015-2021): "looks like Windows 98,"
  "there is no auto-schedule function," app "basically useless," no undo.
  Connecteam dropped it from its healthcare roundup in 2026.

---

## 4. M7 Health

- **Acquired by Ascend Learning 2026-09-21**, price undisclosed. Not YC.
  Investors were First Round, Threshold, 25madison, Lakehouse, Banter,
  January. Total raised $17M (pre-seed $1.75M, seed $4M 2024-09, Series A
  $10M 2025-07). 59-62 staff, NYC, about 25% nurses. Careers page empty.
- **Pricing:** none public. Pricing page 404s, Capterra "contact vendor," no
  trial. Blog 2026-09-09: "priced specifically for smaller facilities without
  requiring dedicated IT resources," no figure. ROI calculator inputs are beds,
  nurses, turnover, OT hours, contract nurses; sample output $57K savings.
  Buyer's guide lists subscription, configuration, integration, data prep,
  training, expansion and exit terms as separate cost lines. Land-and-expand
  via 2-3 hospital pilots (Ochsner, ScionHealth).
- **Features:** self-scheduling with preferences; "Auto-Balance" first-pass
  generator over preferences, compliance, skill and tenure mix, fairness;
  fairness score ("over 94%," undefined); open shifts routed only to eligible
  staff by credential and unit; float and central staffing office interface;
  callouts and guardrailed swaps; on-call tracking; Workday certified
  (2026-08), UKG/Kronos, ADP, Epic per press; SOC 2 Type II; web app, no
  app-store presence confirmed. Stack: React/NestJS/Postgres on AWS.
- **AI:** Auto-Balance method never described (no solver, MIP or ML named);
  census forecasting "from historical patterns"; preference learning;
  turnover-risk signals. No LLM feature. Series A said AI capabilities were
  still to be built.
- **Customers:** Ochsner 47 hospitals system-wide (2026-02, 2,000+ auto-filled
  shifts/week), ScionHealth (agency 31% to 12% at Denver), Lifepoint, Mohawk
  Valley, several community hospitals. "100+ net new hospitals in 29 states"
  in the past year. CAHs "onboarding in Utah, Mississippi, Alabama," none
  named. Zero third-party reviews anywhere.
- **Openings for us:** transparent CAH pricing; visible hard-rule logic (their
  ratio/rest/preceptor enforcement is not evidenced); named CAH references;
  independence from an ed-tech conglomerate; MEDITECH/CPSI integrations they
  never mention.

---

## 5. In-House Health (inhouse.health)

- Founded 2023, Denver/NYC/Tel Aviv, about 46 staff. Pre-seed $1.4M, seed
  $4M (NEA, TMV, 2024-05). Total $5.4M, no Series A as of 2026-09.
- **Pricing:** none public. Sales starts with a "free opportunity assessment"
  then scoping, integration, on-site launch, steering-committee reporting.
  ROI claims: $270K savings per unit, 31% more shifts at budget, 5.5 hours
  saved per user per week (site, 2026); ">10% labor cost, about $800K per
  facility" (press, 2024). Two modes: automation layer on an existing
  scheduler, or full replacement. Implementation "as short as 2 weeks."
- **Features:** AI copilot that flags unbalanced shifts 3-21 days out and
  proposes redesigns; hourly census and workload forecasting per department
  1-3 weeks ahead from ADT, perioperative and demographic feeds; proprietary
  Workload Score; HPPD suite; preference-based self-scheduling; browse-and-
  claim open shifts; per-nurse Reliability Score (call-in likelihood);
  "Nursing Command Center" float and agency management; perioperative start/
  end prediction; executive dashboards; native iOS/Android app (4.4 stars,
  weekly releases). **No documented swap workflow, callout escalation,
  incentive engine, credential expiry, on-call, or named Epic/UKG/API
  integration.**
- **AI, for real:** length-of-stay distribution model, department-matcher
  classifier, intraday corrective algorithm. The scheduling optimiser is
  undisclosed; their own post surveys genetic algorithms, MIP and Nash welfare
  without saying which they use. Agent and LLM posts are aspirational. Metrics
  contradict themselves (optimal shifts 57 to 70% in one post, 57 to 87% in
  another).
- **Customers:** Assuta Medical Centers (Israel, design partner since 2023,
  four units). "Live in several hospitals, 800+ nurses" (2024). Recent posts
  target SNFs. **No US hospital named. No CAH.** No G2, Capterra or KLAS entry.
- **Fit:** the forecasting wedge needs high-throughput units; a single
  med-surg/swing unit gives it nothing to model. Enterprise sales motion.

---

## 6. OnShift (a ShiftKey company)

- Ownership: ShiftKey invested June 2022, fully integrated July 2023. Flagship
  is OnShift Schedule X (2023-09) with the OnShift X app (2025-07). The
  ShiftMed confusion comes from ShiftMed buying CareerStaff in 2024.
- **Pricing:** quote-only everywhere. Capterra "contact vendor," no trial. One
  aggregator estimates $30-60K three-year TCO for 100 employees (roughly
  $8-17 per employee/mo) with implementation, migration and training fees;
  unsourced. OnShift Wallet earned-wage access is free to employers.
- **Modules:** Schedule X (templates with weekly/bi-weekly/4-2 rotations as of
  2025; best-fit replacement ranking by cost, availability, history and
  "likelihood to accept"; open-shift claiming; overtime alerts; CMS PBJ
  export; SAMI marketplace plugging ShiftKey 1099 contractors into the
  schedule; CPR/first-aid expiry tracking added 2025; HPPD against budget;
  Staff Exact census/acuity staffing since 2012); Time (facial-recognition
  punch); Employ (ATS); Engage (surveys, points); Wallet; 60+ reports.
- **AI:** "predictive analytics" and best-fit matching (2025 release). No
  generative or autonomous scheduling claim. No 2026 AI announcement.
- **Market:** "built exclusively for senior care." KLAS lists it as "OnShift
  (Long-Term Care Only)," limited market share. ShiftKey's marketplace serves
  acute care in some states; **no evidence of Schedule X in any acute or CAH
  setting.**
- **Reviews:** Capterra 3.9 (14); OnShift X on Google Play about 2.7; support
  hard to reach; managers cannot see the actual schedule in the app.

---

## 7. QGenda (Hearst Health)

- Founded 2006 as a physician/anesthesia scheduler; 650K+ providers; Hearst
  acquired 2024-08; bought New Innovations (GME) 2025-07.
- **Pricing:** no rate card, pricing page 404. Model is per-provider-per-month
  with modules sold separately and a separate implementation fee. The
  "$500-1,000 per provider/mo" repeated by aggregators could not be verified
  and may be per-organisation; anecdotes ($1,500/mo for 60+ physicians;
  ~$15K/yr for 10 EM providers) imply $20-125/provider/mo. **No nurse
  per-seat price found.** Government contracts $66K-257K (scope unknown); GSA
  GS-35F-0858N; VA runs it at 80 sites for 18K users. Standard agreement per
  a third-party summary: up to 5%/yr escalator, auto-renew with 30-day notice,
  5% card surcharge, SMS passed through. Implementation quoted as 12 weeks,
  reported 3-9 months. Reviewers say poor fit under about 20 providers.
- **Nurse & Staff Scheduling (launched 2022-12):** mobile-first self-
  scheduling with PTO balances; configurable rules; "intelligent automation"
  that reviewers say struggles with complex rule sets; open shifts with
  ShiftMed marketplace sync (2026-07); rules-based swaps and splits; float
  deployment with skills and hours visible system-wide; overtime alerts; EHR
  census/acuity feed to flag over/understaffing; Epic, Cerner, Meditech,
  Workday certified (2026-05), UKG, ADP and others; 85+ integrations; REST
  API. Credentialing, time and attendance, on-call are separate paid modules.
- **AI:** "QGenda Intelligence": natural-language chat to change schedules,
  NL reporting, "intelligent optimisation that learns from patterns." No
  launch dates, no customer evidence, independent reviewers find only rules
  automation. Forrester TEI (2026-01) claims 430% ROI for a composite large
  system.
- **Market:** 4,500+ organisations, "86% of US health systems." Nurse product
  KLAS: 10 evaluating organisations, "limited market share, not primary,
  component," score 80.1. **No CAH customer or rural offering found.** The
  likely route into a 25-bed hospital is a parent system that already runs
  QGenda for physicians.
- **Reviews:** Capterra 4.2 (68). Complaints: hidden costs, per-head pricing
  regardless of use, dedicated reps removed in 2025-26, admin complexity,
  mobile app crashes and forced re-authentication, no visibility of who
  changed a schedule.

---

## 8. SmartLinx (Lone View Capital)

- Founded 2000, Hackensack NJ; PE majority 2023-07; acquired Bektek (2025-03)
  and StafferLink VMS (2025-04). Claims 5,000+ facilities, 500K caregivers.
- **Pricing:** quote-only. Aggregators: "$3 per user/mo" floor (Capterra,
  unsourced), $10-100/user (SelectHub estimate), implementation $1-5K per
  facility, biometric clocks $300-900, add-on modules $2-5 per employee
  (SoftwareFinder, provenance unknown). Target size 150-5,000+ employees.
  Rough all-in estimate for 150 staff: $10-20 per employee/mo, $18-36K/yr.
- **Modules:** Scheduling (HPPD/PPD census-driven, templates and rotations,
  text-blast open shifts, OT projection while building, license expiry check
  before assignment, "predictive" coverage-gap alerts); Time & Attendance
  (iris biometrics, contactless clock, geofenced mobile); Smartlinx Go app
  (2.8 stars from 555 ratings); Workforce Analytics; HR, Payroll, ATS,
  Benefits, Earned Wage Access; PBJ reporting and CMS Five-Star predictor
  (SNF-only); Staffing Marketplace and StafferLink VMS for agency spend.
- **AI:** none shipped. Blog 2026-04-01 says they are "getting ready to
  launch" role-based AI assistants and census-trend prediction.
- **Market:** "purpose-built for long-term care, post-acute, senior living,
  behavioural health." A hospitals page exists with no hospital customers.
  **No CAH, no acute-care constructs** (charge nurse, competency, ratios by
  unit, on-call, preceptor).
- **Reviews:** thin (6-11 per site); reporting weak, implementation harder
  than expected, cannot fix data errors without vendor, mobile crashes.

---

## 9. ShiftWizard (HealthStream)

- Acquired 2020-10 for about $32M. HealthStream also owns ANSOS (migrating to
  ShiftWizard) and NurseGrid. 172K+ monthly active users, 16M+ shifts built;
  revenue growing about 30% year over year through Q2 2026; KLAS 84.5
  (22 organisations, "limited market share").
- **Pricing:** quote-only. Capterra/Software Advice/GetApp "contact vendor,"
  free trial listed. Per-user/month model implied. SEC filings: 1-5 year
  subscription terms; Q4 2025 call: annual price escalators now standard on
  new and renewed contracts. Q2 2026 call: two large go-lives worth $1.7M
  combined; **new "market bundles" for critical access hospitals** combining
  software and content "at a better per-unit price," early CAH uptake, no
  price disclosed, not stated whether ShiftWizard is in the bundle. The CAH
  page lists "flexible staff scheduling tools" and SHIP grant eligibility.
  Implementation "60-90 days." KLAS users cite "high costs relative to
  previous solutions." **HealthStream's own small-team product, NurseGrid
  Manager, is $5 per team member/mo (teams of 2-250) with a free Starter
  tier**, which is the floor they set below ShiftWizard.
- **Features:** self-scheduling within manager windows (most praised);
  templates up to a year ahead; rules-based shift building ("50-75% less
  build time"), not a one-click solver; compliance matching (licensure,
  certifications, ANA fatigue guidance, experience mix) from HR feed; open
  shifts with bidding; float pool management; productivity to census (HPPD,
  HPPV) from EMR and timekeeping; Acuity & Assignment Manager add-on; no
  native time clock, bidirectional sync with Workday (certified), UKG/Kronos,
  ADP, Paycom, Paylocity, PeopleSoft; Epic, MEDITECH, McKesson census feeds;
  CredentialStream tie-in; call-off handling with open-shift push; swaps;
  relaunched mobile app (4.7 stars, 3.4K); built-in messaging; 780+ developers
  on the API portal.
- **AI:** Predictive Census, ML on the facility's own history, 7-120 days out,
  claimed 90% at 7 days and 87% at 120. "hStream AI" is platform branding;
  agentic work in development, no ShiftWizard-specific launch.
- **Market:** WakeMed, UF Health, Deaconess, 10,000-employee takeouts from
  horizontal WFM vendors. **No public reference at or below 25 beds.**
- **Reviews:** Capterra 4.4 (723). Complaints: slow and freezing at
  self-scheduling windows (81% of negative reviews), login friction, reporting
  inaccurate (dominant manager complaint on KLAS), inflexible for complex
  patterns, tedious template setup, cost.

---

## 10. Implications for us

- **Publish the price, keep publishing it.** Six of eight hide it; the two
  that show it are generic tools with no rules engine. Nobody in the
  healthcare-native set will match a flat number on a web page.
- **Sell the rules, not "AI."** The only vendors with real models forecast
  census; none exposes how the scheduler chooses. Our 22 named rules and
  three visible variants remain unique. Add "every warning is one click to
  override in Deputy" and "ScheduleAnywhere counts, it does not constrain" to
  the comparison page.
- **Go after the ScheduleAnywhere base.** It has the only CAH reference in
  the set, its brand is being folded into Humanity, its app is at 2.2 stars,
  and it costs $4.80-6 per user. Those customers already pay per employee and
  already use self-scheduling windows. A migration path (Excel export of
  their grid into our importer) is a concrete play.
- **Watch M7 under Ascend.** Bundle pricing with ATI and credentialing could
  land in systems that own CAHs. Our counter is the independence and the
  sub-25-bed focus they will now struggle to keep.
- **Do not chase forecasting.** In-House Health and ShiftWizard own that lane
  and it does not work at CAH volumes. Census bands plus seasonal bands (gaps
  register item 4) are the right-sized answer.
- **Pricing floor to be aware of:** HealthStream NurseGrid Manager $5, Humanity
  $2.75-3.75, Deputy $5-9, ScheduleAnywhere $4.80-6. Our $10/user sits above
  every generic tool and below every quote-only vendor, which is the correct
  place as long as the rules engine is the reason.

---

## 11. Source index

Per-vendor source lists (official pages, help centers, KLAS, review sites,
SEC filings, earnings transcripts, app stores) are preserved in the research
transcripts from 2026-09-22. Key primary URLs:

- Deputy: deputy.com/pricing, help.deputy.com "Pricing plans" and "Pricing
  FAQs" (updated 2026-09), "Introduction to Deputy AI (BETA)", "Set up stress
  profiles", "Using Auto-scheduling"; news.deputy.com 2025-11-05 and
  2025-11-28.
- ScheduleAnywhere: Quick Start Guide for Managers PDF (scheduleanywhere.com),
  AONL 2019 case study PDF, TCP SOC 3 2025, tcpsoftware.com/pricing,
  connecteam.com/reviews/scheduleanywhere (2025-03-20), Capterra p/134921.
- M7 Health: m7health.com (platform, implementation, CAH blog 2026-09-09,
  Auto-Balance whitepaper 2026-03-19), GlobeNewswire 2026-09-21 (Ascend
  acquisition), Ochsner release 2026-02-23, Capterra p/10037829.
- In-House Health: inhouse.health (product, technical blog), BusinessWire
  2024-05-08, Becker's 2024-12-18, Tracxn, App Store id6748960919.
- OnShift: onshift.com products and newsroom, GlobeNewswire 2025-07-23,
  shiftkey.com 2023-07-12, KLAS "OnShift (Long-Term Care Only)", Capterra
  p/122212.
- QGenda: qgenda.com product pages and blog "Getting the most bang for your
  buck", KLAS nurse and staff scheduling 188902, checkthat.ai pricing
  (2026-04-20), VA PIA FY23, BusinessWire 2026-01-13 (Forrester TEI).
- SmartLinx: smartlinx.com solutions pages and blog 2026-04-01, Capterra
  p/154002, SelectHub, SoftwareFinder, App Store id1446077536.
- ShiftWizard: healthstream.com ShiftWizard and Predictive Census pages,
  HealthStream 10-K FY2024, Q4 2025 and Q2 2026 earnings transcripts
  (fool.com), KLAS 66144, Capterra p/178376 and p/254829 (NurseGrid).
