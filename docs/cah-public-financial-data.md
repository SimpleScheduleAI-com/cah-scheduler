# CAH budgets from public records (researched 2026-09-24)

Suggestion under test: "earnings in public records — to get budget info on
CAHs." Verdict: it works, and it works best for the thing we care most about
(agency nurse spend) only in specific sources. Five parallel research passes
plus real data pulls: Medicare cost reports (HCRIS), IRS Form 990 e-file XML,
government-owned hospital documents, state and aggregated datasets, and the
public money CAHs can spend on software.

**Hospital-level output lives in the git-ignored `leads/public-records/`
folder** (this repo is public): a merged 1,377-row prospect list keyed on
Medicare provider number (CCN), the 990 census, cost-report extracts, the
government-CAH document notes, and rerun scripts. This doc holds methodology
and national figures only. See also `lead-gen-playbook.md`.

---

## 1. Bottom line

1. **Size, margin, cash and fiscal year are free for all ~1,377 CAHs** from
   Medicare cost reports, 6-9 months after year-end.
2. **Agency nurse spend is NOT in the cost report for CAHs.** The contract
   labor worksheet (S-3 Part II) is only required of IPPS hospitals; 7 of
   1,377 CAHs filled it in for FY2024. Any vendor or dataset built on cost
   reports (Definitive, RAND, NASHP) has the same blind spot.
3. **The agency signal comes from three other places:**
   - **Form 990, Part VII Section B** (top 5 contractors over $100k):
     176 of the 472 standalone nonprofit CAHs we matched list a nurse agency
     or contract-labor platform there. Schedule O sometimes itemizes the
     contract labor total.
   - **Government-owned CAH board packets** (about 37% of CAHs): monthly
     financials show "agency/contract labor" as its own line, budget vs
     actual, and board votes name software vendors and prices.
   - **California HCAI and Washington DOH** publish registry/contract nurse
     data per hospital. California CAHs: median 10.7% of RN hours from
     registry nurses, 18 of 34 above 10%.
4. **Budget season is knowable per hospital** from the fiscal-year end.
   503 CAHs close their year in December, so their FY2027 budgets are being
   built right now (Sep-Nov 2026).
5. **Public money partly pays for us.** Cost-based Medicare reimbursement
   returns roughly the hospital's Medicare share of an allowable software
   cost at settlement; the FY2026 SHIP menu explicitly lists "software
   subscription services"; RHTP state rounds are live.

---

## 2. Source ranking

| Source                                                    | CAHs covered                                            | What it gives us                                                                                                             | Agency-spend signal                 | Lag                  | Cost                                              |
| --------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------- | ------------------------------------------------- |
| Medicare cost report (HCRIS)                              | All ~1,377                                              | Beds, FTEs, salaries, nursing cost-center salaries, revenue, operating expense, margin, cash, fiscal year, system membership | None (S-3 II blank)                 | 6-9 months after FYE | Free                                              |
| IRS Form 990 e-file XML                                   | ~575 standalone nonprofits (+130 inside system returns) | Revenue, margin, IT expense (line 14), top-5 contractors, leaders' names and titles, Schedule O notes                        | **Strong** where present            | 12-24 months         | Free                                              |
| Government CAH documents (board packets, audits, budgets) | ~514 public owners                                      | Adopted budget, monthly contract labor, software contracts and renewal dates, approval thresholds, board calendar            | **Strongest**, hospital by hospital | Monthly              | Free, labour-intensive                            |
| California HCAI annual disclosure                         | 34-38 CA CAHs                                           | Registry nurse hours vs employed RN hours                                                                                    | **Strong**                          | ~1 year              | Free                                              |
| Washington DOH cost-center data                           | ~33 WA CAHs                                             | "Contract Staffing" dollars by hospital (from FY2023)                                                                        | **Strong** (14 of 33 report)        | ~1 year              | Free                                              |
| CMS Hospital General Information                          | All                                                     | Ownership type, phone, address, star rating                                                                                  | —                                   | Quarterly            | Free                                              |
| Flex Monitoring CAHFIR / CAHMPAS                          | State medians public; hospital level CEO/CFO-only       | 29 financial indicators                                                                                                      | —                                   | ~1-2 years           | Free, gated                                       |
| Chartis State of the State                                | Rural hospitals, state level                            | Share negative margin, vulnerable-to-closure counts                                                                          | —                                   | Annual               | Free                                              |
| Definitive / AHA survey / RAND                            | All                                                     | Contacts and installed software (Definitive); cleaned cost reports                                                           | Same cost-report gap                | —                    | ~$50k/yr (Definitive, Vendr median); RAND $499/yr |
| MSRB EMMA bond disclosures                                | Few CAHs                                                | Audited statements                                                                                                           | —                                   | Annual               | Free, low yield                                   |

---

## 3. National figures from our pulls

From the FY2024 cost-report extract (1,377 CAHs) merged with CMS ownership:

| Measure                                                 | Value                 |
| ------------------------------------------------------- | --------------------- |
| Government-owned (county, city, district, state)        | 514 (37%)             |
| Part of a system (home office on cost report)           | 619                   |
| Median net patient revenue                              | $30.2M                |
| Median total salaries                                   | $12.7M                |
| Median hospital FTEs (employees only)                   | 136                   |
| Median operating margin on patient services             | -5.2% (65% negative)  |
| Median days cash (cash line only, excludes investments) | 37                    |
| Fiscal-year end: December / June / September / other    | 503 / 496 / 262 / 116 |
| Report contract labor on S-3 Part II                    | 7                     |

Operating margin here is G-3 line 5 over line 3, i.e. before tax levies,
grants and other income; only about 30% have negative _net_ income.

From the IRS 990 census (all 2025 e-filed hospital returns):

- 654 filers checked the Schedule H "critical access hospital" box, covering
  705 CAH facilities (about 51% of CAHs); 575 file standalone returns.
- Matched to cost-report CCNs: 472 standalone CAHs.
- Nurse agency or contract-labor platform in the top 5 contractors: 176.
  Most frequent names: Medical Solutions, Qualivis, Medefis, FocusOne, Aya,
  Health Carousel, Fusion, Total MSP, Fastaff, Cross Country.
- Where Schedule O itemizes contract labor (17% of standalone filers),
  median $1.34M, about 5% of total expenses.
- Median lag from year-end to e-filing: 10.4 months (nearly all extend).

State programs:

- **California (2024 HCAI):** 34 CAHs matched; median 10.7% of RN hours from
  registry nurses vs 6.8% for all California general hospitals; 20 of 34
  CAHs had a negative operating margin.
- **Washington (2024 DOH):** CAH contract staffing $26.2M, 3.1% of contract
  plus salary spend vs 5.1% for all hospitals; only 14 of 33 CAHs report it.
- **Colorado (HCPF 2026 report):** statewide contracted labor rose from
  $43.4M (2014) to $934.6M (2022), fell 24.9% in 2024; hospitals with 25 or
  fewer beds cut it by $4.4M. No hospital-level contract labor.

Labour-market context (BLS OEWS May 2025): national RN mean $101,420;
lowest states AL $77,020, SD $77,140, MS $78,950, IA $80,540, KS $82,360;
nonmetro Kansas $77,640. Travel pay national average about $2,198/week
(Vivian, Sep 2026, via search snippet).

---

## 4. How to read each source

### Medicare cost report (CMS-2552-10)

- Files: `https://downloads.cms.gov/FILES/HCRIS/HOSP10FY{YYYY}.ZIP` (three
  headerless CSVs: `_rpt`, `_nmrc`, `_alpha`, joined on `RPT_REC_NUM`;
  worksheet code 7 chars, line and column 5 digits). A report lands in the
  file for the federal fiscal year its period _begins_ in. FY2024 is
  complete; FY2025 is partial (749 CAHs). Pre-flattened alternative:
  data.cms.gov "Hospital Provider Cost Report" (117 columns, through 2023;
  blocks scripted access, use a browser).
- CAH flag: CCN positions 3-4 = `13`, or Worksheet S-2 Part I line 105 = Y.
- Beds S-3 I line 14 col 2; hospital FTEs line 14 col 10; total salaries
  A line 200 col 1; nursing cost centers A lines 13, 30-35, 91-92; net
  patient revenue G-3 line 3; operating expense G-3 line 4; net income
  G-3 line 29; cash G line 1; fiscal year S-2 line 20.
- Contract labor S-3 II line 11 col 2 (dollars) and col 5 (hours): blank
  for CAHs. Overtime is not on the form.
- 78% of FY2024 CAH reports are "as submitted" (unaudited). Staff leased
  from a parent system show as purchased services, not salaries.

### IRS Form 990

- ProPublica's API is summary-only and about two years behind. Use the IRS
  e-file XML: `https://apps.irs.gov/pub/epostcard/990/xml/{YEAR}/index_{YEAR}.csv`
  gives the batch zip; the server supports range requests, so one filing
  (~100 KB) can be pulled without the whole zip (`fetch_xml.py`).
- Useful fields: Part I lines 12/18/19; Part VII Section A (officers and key
  employees, names and titles); **Part VII Section B** (top 5 contractors
  over $100k with service description); Part IX lines 5-7 pay, 11g other
  fees, **14 IT**; Schedule O (itemizes 11g when it exceeds 10% of
  expenses); Schedule H Part V (per-facility CAH checkbox).
- Limits: government CAHs mostly absent; 130 CAHs blended into system
  returns; physician/CRNA groups often crowd nurse agencies out of the top
  5; only 24% name a CNO; line 19 includes non-operating income.

### Government-owned CAHs

- About 37% of CAHs; roughly half county-owned, half hospital districts.
  Largest counts: KS, TX, IA, NE, WA (about 80% of its CAHs), CO, OK, CA.
- Board packets are the richest single document: monthly income statement
  with agency/contract labor budget vs actual, days cash, travel-nurse
  counts, and contract approvals with vendor and price. Audits bury agency
  spend in "purchased services" but, since GASB 96 (2023), must disclose
  multi-year software subscriptions and their end dates, which reveals the
  incumbent and the renewal window.
- Many county CAHs in KS and NE are managed by Great Plains Health Alliance
  (about 30); the buyer may be the manager, not the hospital.
- Best yield per hour: California district packets; Washington packets plus
  the State Auditor portal; Kansas and Iowa audit repositories (software
  subscription note); Texas district sites (tax and budget notices).

### Procurement thresholds for public CAHs (SaaS)

| State  | Rule relevant to a $10-60k/yr subscription                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| WA     | Formal bidding over $75k applies to materials and work; services and software generally exempt, but the State Auditor expects documented quotes |
| CA     | Software exempt from formal bid; above $25k the board approves a "competitive means" (HSC 32138)                                                |
| TX     | County bid threshold $100k since 9/1/2025; co-ops (TIPS, BuyBoard, DIR) satisfy the bid requirement                                             |
| KS, NE | No bid statute for county hospitals; board policy governs                                                                                       |
| ID     | Nothing required under $75k; co-op purchases deemed compliant                                                                                   |

In practice the gate is the CEO's budgeted signing authority, so the move is
to get our line into the draft budget. Ship every proposal with a
procurement kit: pricing sheet, sole-source rationale, security documents,
draft board memo. Signed public contracts are themselves public (Texas by
statute), which argues for published, formula-based pricing.

### Public records requests

Response deadlines: WA 5 business days, TX 10, CA 10 (+14), KS 3, NE 4,
ID 3-10. Read published packets first; request only real gaps, narrowly:
(1) the vendor payment register for one to three named months, (2) the
current scheduling-software contract with pricing and renewal terms,
(3) the contract-labor account by vendor for one year. Never during an open
RFP, never the same week as a cold email, never nurse-level data.

---

## 5. Budget calendar

Fiscal-year end is on the cost report and the 990. Rule of thumb: budgets
are built 2-5 months before year-end.

| FYE       | CAHs | Budget prep | Sell in                 |
| --------- | ---- | ----------- | ----------------------- |
| December  | 503  | Jul-Oct     | **Now** through October |
| June      | 496  | Jan-Apr     | Nov-Mar                 |
| September | 262  | Apr-Jul     | Feb-Jun                 |

Government CAHs follow statutory adoption dates: WA Nov 15, CO Dec 15,
CA June, KS Sep 20/Oct 1, TX Aug-Sep, ID August, IA March, NE Sep 20
(unverified; possibly Sep 30).

---

## 6. Public money a CAH can put toward us

| Program                                          | Per hospital                                         | Software allowed?                                                                                                        | Timing                                                       |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Medicare cost-based reimbursement                | Every CAH                                            | Allowable A&G cost; Medicare pays back ~its share at settlement                                                          | Annual cost report                                           |
| SHIP (HRSA)                                      | Up to $13,528 (FY2026)                               | FY2026 menu lists "software subscription services"; efficiency software under the ACO/shared-savings item; SORH approval | Budget period Jun 1-May 31; apply ~January, so pitch Oct-Jan |
| Rural Health Transformation Program (CMS)        | Via state rounds only; FY26 state awards $147M-$281M | Use F: "software and hardware for significant IT advances designed to improve efficiency"; scheduling not named          | States awarding now; FY27 amounts by Oct 31, 2026            |
| Rural Hospital Provider Assistance (HRSA-26-105) | 132 hospitals awarded 9/10/2026 (list public)        | Unverified                                                                                                               | Just paid                                                    |
| Flex (HRSA to states)                            | No direct CAH purchase                               | Partner with state Flex financial/operational projects                                                                   | FY2024-2028 cycle                                            |
| USDA Community Facilities                        | —                                                    | No: recurring costs barred (7 CFR 3570.63)                                                                               | —                                                            |

**Cost-based reimbursement, worked example** (80 users x $10 x 12 +
$1,500 setup = $11,100 in year 1): at 30% / 40% / 50% Medicare share the
hospital nets about $7,800 / $6,700 / $5,600. Caveats: traditional Medicare
only (not Medicare Advantage); cost allocated to distinct-part SNF, psych or
rehab units and capped RHCs is not reimbursed on cost; money arrives at
settlement; grant-funded costs may need offsetting. Pitch line: "Because
you're cost-based, Medicare will likely cover roughly your Medicare share of
this subscription at settlement; your CFO can check it against your last
cost report." Never say "free" or "grant-funded".

Where award data lives: USAspending.gov (ALN 93.798 RHTP, 93.301 SHIP,
93.241 Flex), TAGGS, state SORH and RHTP pages. SHIP subawards fall below
the $30k federal reporting threshold, so they appear only on state sites.

---

## 7. How to use it (playbook)

1. **Filter** the merged list to independent CAHs (no system home office, 758) or publicly owned ones, then by state focus.
2. **Rank by agency signal:** nurse agency in 990 top 5, Schedule O contract
   labor, California registry share over 10%, Washington contract staffing,
   or agency lines in board packets.
3. **Time it:** December-FYE hospitals now; June-FYE in November-March.
   Pair with SHIP (Oct-Jan) and the state's RHTP round.
4. **Open with their own numbers, labelled with the source:** "Per your
   FY2024 Form 990, contract labor was about X% of expenses." Never quote an
   executive's compensation back to them; verify names on the hospital site
   before outreach (990s are 1-2 years old).
5. **For public CAHs, read the last three board packets** before the first
   call: agency line vs budget, incumbent scheduling or timekeeping vendor,
   upcoming contract renewals, who presents finance.

## 8. What does not work

- Cost-report contract labor for CAHs (blank); overtime (not on any form).
- A "non-salary share of nursing cost" proxy tested against 390 small rural
  IPPS hospitals that do report contract labor: rank correlation 0.21. Use
  only as a tie-breaker.
- ProPublica API for anything beyond totals.
- EMMA for CAHs (almost no bond filers); Nebraska and Oregon state sites
  were unreliable during research.
- Paid aggregators for agency spend: they inherit the cost-report gap.

## 9. Refresh

Scripts in `leads/public-records/scripts/` (paths point at the research
scratchpad; adjust before rerunning): `filter.py`/`build.py` (HCRIS),
`census.py`/`parse990.py`/`fetch_xml.py` (990), `build_master.py` (merge).
Refresh after each CMS HCRIS release (last: 2026-07-14) and each IRS
e-file year. Re-verify leadership names before any outreach.
