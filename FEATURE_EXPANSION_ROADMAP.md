# Feature Expansion Roadmap
### Build plan for the full HCM/HRMS feature list (source: `Feature_List.docx`)

**Date:** 2026-07-09 · **Branch:** `claude/app-build-setup-ntay5k`
**Companion docs:** `PRODUCTION_READINESS_ROADMAP.md` (platform-grade items — all ✅), `ROADMAP.md`, `ORACLE_FUSION_GAP_ANALYSIS.md`, `SAP-GAP-ANALYSIS.md`.

This roadmap maps every feature in the supplied feature list against the current
codebase and sequences the gaps into four build phases. Status legend:

- ✅ **Built** — exists today (module + tests)
- 🔶 **Partial** — a working foundation exists; the listed feature extends it
- ⬜ **New** — no meaningful foundation; net-new build

Existing foundations referenced throughout: 54 API modules including
`hr/*` (employees, leave, attendance + time evaluation, OTL, roster, skills,
exits, headcount), `talent/*` (ATS, hiring, onboarding, learning, goals,
performance, appraisal, succession), `engagement` (surveys/eNPS, recognition,
feed), `helpdesk`, `travel`, `expenses`, `letters`, `bgv`, `benefits`
(incl. comp workbench), `payroll`, `analytics` (semantic layer, dashboards,
predictive attrition, ONA), `ai` (statistical anomaly engine), `assistant`
(copilot + Claude-backed LLM planner), `workflow` (engine + BPM + approval
matrix), `automation` (rule engine, 40+ events), `platform` (webhooks, custom
fields, SSO), `extensibility` (custom objects/records/rules), `marketplace`,
`sync` (offline mobile protocol), `dms`, `localization`, `notifications`,
`rbac`, `security` (TOTP/MFA), `integration`, `contracts`, `grc`, `audit`.

---

## 1. Domain-by-domain gap map

### 1.1 Talent Management

| # | Feature | Status | Plan |
|---|---|---|---|
| 1 | Individual Development Plans (IDP) | ⬜ | **Phase 1** — `talent/idp`: plan → development items (courses, mentoring, stretch goals) → progress check-ins; link items to `talent/learning` courses and `hr/skills` |
| 2 | Career Plan + Career Architecture setup | ⬜ | **Phase 2** — career-track/role-family model over the existing position/job data; employee aspirations + interests capture; role-path graph |
| 3 | Talent Profile (single snapshot) | 🔶 | **Phase 1** — aggregate view over employee + skills + goals + reviews + succession + learning (all exist); one `GET /talent/profile/:employeeId` + page |
| 4 | Succession planning for critical positions | ✅/🔶 | `talent/succession` exists — extend with criticality flags + readiness ratings (Phase 1) |
| 5 | Role-based succession pools + pool development plans | ⬜ | **Phase 2** — pools as first-class objects over mass roles; pool-level development plans reuse IDP items |
| 6 | Talent Reviews (multi-parameter calibration + next steps) | 🔶 | **Phase 2** — extend `performance/calibration` with configurable parameters + outcome actions |
| 7 | Talent Pools (segments + development plans) | ⬜ | **Phase 2** — shared infrastructure with #5 |
| 8 | Succession Dashboard | 🔶 | **Phase 2** — bench strength, readiness, coverage-of-critical-roles KPIs in analytics |
| 9 | AI-enabled Career Reflection | ⬜ | **Phase 3** — Claude-backed (reuses `LlmPlannerService` client pattern) over talent profile data |
| 10 | AI-powered Career Exploration & Planning | ⬜ | **Phase 3** — role-fit narratives from skills gap + career architecture |
| 11 | AI-powered Career Architecture (bulk role clustering, job evaluation) | ⬜ | **Phase 3** — clustering over role/skill vectors; LLM-assisted job evaluation |
| 12 | IJP recommendations | 🔶 | **Phase 3** — internal job posting matching (ATS jobs × employee skills) |

### 1.2 Core (platform & HR core)

| # | Feature | Status | Plan |
|---|---|---|---|
| 1 | Org structure, employee data, ESS | ✅ | — |
| 2 | Staffing models: Job / Position / Hybrid / Project | 🔶 | **Phase 2** — positions exist; add project-based staffing assignments |
| 3 | Report Builder (per subscribed module) | 🔶 | **Phase 1** — semantic layer + saved queries exist; add more datasets + module gating by license |
| 4 | HR Policies management | 🔶 | **Phase 1** — policy repository with versioning + acknowledgement (DMS foundation) |
| 5 | Employee lifecycle management | ✅ | Transfers, probation, confirmation, exits, F&F all exist |
| 6 | Notifications: Email / Push / Bell / MS Teams | 🔶 | **Phase 4** — email + in-app exist; add web-push and a Teams connector (webhook-based) |
| 7 | Multi-country: currencies, time zones, locale data | ✅ | Currency, localization packs, i18n exist |
| 8 | Compensation mgmt (structures, packages, positioning) | ✅/🔶 | Salary structures + comp workbench exist; positioning vs pay ranges → Phase 2 (with Merit Planning) |
| 9 | Lifecycle workflows + flow builder | ✅ | Workflow engine + BPM + approval matrix |
| 10 | RBAC standard + custom roles | ✅ | Catalog-enforced RBAC |
| 11 | Talent search (query-based, universal search) | 🔶 | **Phase 1** — search module exists; add talent-attribute filters (skills, role, location) |
| 12 | Mobile application support | 🔶 | API-side complete incl. offline sync protocol; native shell is out of API scope (Phase 4 note) |
| 13 | Form Builder (standard, field-update, PDF forms) | 🔶 | **Phase 2** — custom objects/fields exist; add form definitions + PDF render + field-update flows |
| 14 | 2FA + concurrent access management | ✅ | MFA at login + session registry |
| 15 | DMS: view, generation workflows, bulk ops, digital signature | 🔶 | **Phase 2** — DMS + letter generation exist; add bulk generate/download/upload + signature hook |
| 16 | Language packs | ✅ | i18n module |
| 17 | Effective-dated reports | 🔶 | **Phase 2** — as-of-date parameter in semantic layer queries |
| 18 | Pulse | 🔶 | **Phase 1** — recurring micro-survey schedule over `engagement` surveys |
| 19 | Journeys (templates, event-triggered) | ⬜ | **Phase 2** — journey = ordered step template instantiated per employee on lifecycle events (automation engine triggers) |
| 20 | Contract management | ✅ | `contracts` + CLM |
| 21 | Disciplinary process management | ⬜ | **Phase 2** — case type on helpdesk foundation: incident → inquiry → action → appeal, confidential by default |
| 22 | Visitor management | ⬜ | **Phase 4** — low HCM coupling; gate pass + host notification + check-in log |

### 1.3 Expense Management

| # | Feature | Status | Plan |
|---|---|---|---|
| 1–2 | Multiple expense types/policies, per-type currencies | 🔶 | **Phase 1** — policy engine per type: limits by band/grade/dept, eligible currencies |
| 3 | Per-diem policies | ⬜ | **Phase 1** — city-class × band day rates, partial-day proration |
| 4 | Per-mileage policies | ⬜ | **Phase 1** — rate × distance with vehicle classes |
| 5 | Advance types/policies (band/grade/dept restricted) | 🔶 | **Phase 1** — advances exist in finance; add policy restrictions + link to expense claims |
| 6 | Persona dashboards (employee/manager/HOD/admin) | 🔶 | **Phase 2** — extend existing analytics |
| 7 | Split expenses with colleagues | ⬜ | **Phase 1** — split lines across claimants with per-person approval |
| 8 | Tax groups per geography | 🔶 | **Phase 1** — reuse finance tax engine on expense lines |
| 9 | Deduct advances from submitted expenses | 🔶 | **Phase 1** — settlement step: advance offset at approval |
| 10–12 | Internal + real-time currency conversion | ✅/🔶 | Currency module exists; add per-type internal rate tables (Phase 1) |
| 11 | Budgeting + threshold alerts | 🔶 | **Phase 1** — budget module exists; wire expense category budgets + automation alerts |
| 13 | Corporate card sync | ⬜ | **Phase 4** — card-feed import (CSV/OFX first, API adapters later) |
| 14–15 | GPS mileage + location-search mileage | ⬜ | **Phase 3** — mobile checkin GPS exists; add trip capture + distance calc |
| 16 | Risk score per expense line | 🔶 | **Phase 3** — productize the AI anomaly expense detectors into a per-line score at submission |
| 17 | GPT-based OCR of bills | 🔶 | **Phase 3** — heuristic receipt parser exists; add Claude vision extraction behind the same seam (5,000-scan metering via licensing) |

### 1.4 Merit Planning & Compensation Modelling

| # | Feature | Status | Plan |
|---|---|---|---|
| 1 | Comp plan config across geographies/currencies | 🔶 | **Phase 2** — comp workbench exists; add plan object (cycle, population, currency sets) |
| 2 | Questionnaire-based modelling → increment grids, budget distribution | ⬜ | **Phase 2** — model inputs → grid generator (perf rating × compa-ratio) |
| 3 | Increment ranges + system budgets at manager/function/BU levels | ⬜ | **Phase 2** — hierarchical budget tree |
| 4 | Budget redistribution + delegation | ⬜ | **Phase 2** — uses budget tree + delegation module |
| 5 | HRBP review/validation before launch | ⬜ | **Phase 2** — plan states DRAFT → HRBP_REVIEW → LAUNCHED |
| 6 | Manager/approver worksheet views + insights | ⬜ | **Phase 2** — worksheet API + page |
| 7 | Up to 4 approver levels + BU/BUHR/CHRO | ✅ | Approval matrix supports chains — configuration only |
| 8 | Alerts: bias, discretion breach, budget overrun, pay-range breach | 🔶 | **Phase 3** — rule checks + AI anomaly pass over proposed increments |
| 9 | Post-approval: salary structure update + letters | ✅/🔶 | Payroll structures + letters exist — wire plan outputs (Phase 2) |
| 10 | Merit / adhoc / interim / promotion / bonus / LTI cycles | ⬜→🔶 | **Phase 2** — cycle types on the same plan engine |
| 11 | Inbound/outbound integration (API/SFTP) | 🔶 | Phase 4 Studio track |

### 1.5 Absence

Leave module exists with policies + accruals. All items below extend it in **Phase 1** unless noted:

| # | Feature | Status |
|---|---|---|
| 1 | Paid/unpaid policies, multiple accrual + pro-rata | ✅/🔶 |
| 2 | Tenure, carry-forward, clubbing, encashment | 🔶 (carry-forward exists; add clubbing rules + encashment flow) |
| 3 | Hourly / half-day / full-day | 🔶 (half/full exist; add hourly) |
| 4 | Past/future date restrictions | 🔶 |
| 5 | Usage/application limits + lifecycle validations | 🔶 |
| 6 | Sandwich leave | ⬜ |
| 7 | Interdependent leave usage | ⬜ |
| 8 | Eligibility by gender/religion/nationality/dependents/custom | 🔶 (family module supplies dependents) |
| 9 | Birthday/anniversary leave | ⬜ (auto-grant via automation engine) |
| 10 | Auto approval / revoke / replacement workflows | 🔶 |
| 11 | Compressed work week | ⬜ (with Time Tracking phase) |
| 12 | Blackout policy | ⬜ |
| 13 | Holiday pay policy | ⬜ (Phase 2, with payroll) |
| 14 | Pay rate at leave-policy level | ⬜ (Phase 2, with payroll) |
| 15 | Concurrent leave handling | 🔶 |

### 1.6 Performance Management

| # | Feature | Status | Plan |
|---|---|---|---|
| 1–3 | MBO + OKR, goal plans, cascading, check-ins, multi-stage reviews | ✅ | Goals/OKR + performance + appraisal exist |
| 4 | Calibration (lobbies + hierarchy) | ✅/🔶 | Calibration exists; add lobby grouping (Phase 1) |
| 5 | Persona dashboards | 🔶 | Phase 2 analytics pass |
| 6 | Notes & journal on objectives | ⬜ | **Phase 1** — journal entries per goal |
| 7 | 3-year performance history | ✅ | Data model already retains cycles |
| 8 | Promotion framework | ⬜ | **Phase 2** — eligibility rules + promotion cycle (ties into Merit Planning) |
| 9 | Check-ins | ✅ | — |
| 10 | Custom achievement matrix | ⬜ | **Phase 2** — configurable rating matrix |
| 11 | Goal explorer (view/copy peers' goals) | ⬜ | **Phase 1** — visibility rules + copy endpoint |
| 12 | Competency mapping | 🔶 | Skills module foundation; map competencies to roles (Phase 2 with Skills) |
| 13 | Talent review (restricted parameters) | 🔶 | Phase 2 (shared with Talent Mgmt #6) |
| 14 | Custom formula configuration | ⬜ | **Phase 2** — expression evaluator for final scores |
| 15–16 | Team goals + bulk goals | 🔶 | **Phase 1** — team-level goal owner + bulk assign |
| 17 | Talent profile & N-grid | 🔶 | 9-box exists in succession; generalize N×N (Phase 2) |
| 18 | IDP | ⬜ | Phase 1 (Talent #1) |
| 19 | Continuous feedback | 🔶 | Recognition + feed exist; add structured feedback requests (Phase 1) |
| 20 | Multistakeholder feedback (360/MSF) | ⬜ | **Phase 2** — nomination → collection → report, anonymity rules |

### 1.7 Recruitment

| # | Feature | Status | Plan |
|---|---|---|---|
| 1–2 | Requisitions + approvals, jobs mgmt, applications, posting | ✅ | ATS exists |
| 3–4 | Sourcing; feedback/evaluation/interview/assessment | ✅/🔶 | Interviews exist; add structured evaluation forms (Phase 1) |
| 5 | Offer mgmt with salary structures + templates + approvals | ✅ | Offers exist |
| 6–7 | External recruiter logins (30) + BGV vendor logins (5) | ⬜ | **Phase 2** — scoped external-user portal (vendor portal pattern exists in procurement) |
| 8 | CV parsing (10,000 CVs) | ⬜ | **Phase 3** — Claude-based parse → candidate fields, metered |
| 9, 17 | LinkedIn + job-board integrations | ⬜ | **Phase 4** — integration adapters |
| 10 | Bulk offer generation | 🔶 | **Phase 1** — batch over existing offer engine |
| 11 | Refer + IJP | 🔶 | **Phase 1** — referral portal + internal-only postings |
| 12 | Career page management | ⬜ | **Phase 2** — public postings endpoint + configurable page |
| 13 | Core reports & analytics | ✅ | Recruitment dashboards exist |
| 14 | Integration ecosystem | 🔶 | Phase 4 Studio track |
| 15 | Diversity & inclusion features | ⬜ | **Phase 2** — anonymized screening + DEI funnel metrics |
| 16 | Project support | ⬜ | Phase 2 (with Core staffing models) |
| 18 | Auto interview scheduling (live calendar) | ⬜ | **Phase 3/4** — slot engine; calendar-provider adapters |
| 19 | Recruiter overview dashboard | 🔶 | Phase 2 analytics pass |
| 20 | Candidate portal action centre | 🔶 | **Phase 2** — candidate tasks/requests (onboarding portal foundation) |

### 1.8 Social Network (Vibe + RnR)

| # | Feature | Status | Plan |
|---|---|---|---|
| V1 | Posting (polls, events) + activity feed | ✅/🔶 | Feed + announcements exist; add polls + events (**Phase 1**) |
| V2 | Noticeboard | 🔶 | Pinned announcements (**Phase 1**) |
| V3 | Groups | ⬜ | **Phase 1** — group spaces with membership + group feeds |
| V4, V7 | Post approval + reporting/moderation | ⬜ | **Phase 1** — pre-moderation queue + report flow |
| V5 | Automated notifications | ✅ | Automation engine |
| V6 | Knowledge base | ⬜ | **Phase 2** — articles + categories (shared with Helpdesk FAQs) |
| V8 | Content creation templates | ⬜ | Phase 2 |
| V9 | RnR + Vibe unification | 🔶 | Recognition already posts to wall; unify feed (**Phase 1**) |
| V10 | Teams integration | ⬜ | Phase 4 |
| V11–13 | Announcements, social profile, automated milestone posts | ✅/🔶 | Milestone posts via automation events (**Phase 1**) |
| R1–2 | Peer + nomination-based recognition | ✅/🔶 | Peer exists; nominations + panels (**Phase 1**) |
| R3 | Approval + panel voting | ⬜ | **Phase 1** |
| R4 | Project-based nominations | ⬜ | Phase 2 |
| R5–6 | Program configuration + administration | 🔶 | **Phase 1** — program objects (period, eligibility, budget) |
| R7 | Gamification: points, badges, leaderboards | 🔶 | Points + badges exist; leaderboards (**Phase 1**) |
| R8 | Custom email templates | 🔶 | Email module exists |
| A1–9 | Adoption theme: nudges, budgeting rules, program templates, translate, reward-store integration, cross-module promotion | ⬜/🔶 | **Phase 2** (budget rules, templates); reward store → Phase 4 integration |

### 1.9 Travel Management

Travel module exists (requests, policies, approvals, travel→expense handoff). Gaps:

| # | Feature | Status | Plan |
|---|---|---|---|
| 1–4, 6 | Indents/accommodation/advances, multi-level policies, modification/cancellation flows, on-behalf requests, travel types | ✅/🔶 | Add accommodation legs + on-behalf + cancellation workflow (**Phase 1**) |
| 5 | Exceptional flows on budget breach | 🔶 | Budget + approval matrix exist (**Phase 1**) |
| 7 | External travel-agent logins (3) + itinerary updates | ⬜ | **Phase 2** — external portal pattern |
| 8 | Admin/agent ↔ employee chat | ⬜ | **Phase 2** — threaded comments on the request |
| 9–10 | Dashboards; unlimited internal admins | 🔶 | Phase 2 analytics pass |
| 11–12, 14 | Multi-currency, tax groups, real-time conversion | 🔶 | Reuse finance currency/tax (**Phase 1**) |
| 13 | Budgeting | 🔶 | **Phase 1** |
| 15 | GST reporting (India) | 🔶 | Compliance GST exists — add travel transaction feed (**Phase 2**) |
| 16 | TMS/cab integrations | ⬜ | Phase 4 |

### 1.10 Voice of Employee

| # | Feature | Status | Plan |
|---|---|---|---|
| 1 | Engagement framework (themes/sub-themes) | ⬜ | **Phase 1** — theme taxonomy on survey questions |
| 2–3 | Survey creation/deployment, classic + chat admin, analyzer + realtime dashboards | ✅/🔶 | Surveys + eNPS exist; chat-style runner + analyzer (**Phase 2**) |
| 4–5 | Realtime engagement dashboard; impact analysis, text analytics, heatmap | 🔶 | **Phase 3** — heatmaps by org unit; Claude-based theme/sentiment extraction |
| 6 | Action planning + follow-ups | ⬜ | **Phase 2** — action items on survey results with owners/status |
| 7–8 | Anonymous surveys; text/sentiment analysis | 🔶/⬜ | Anonymity exists; sentiment → Phase 3 |
| 9, 16 | Attrition analysis + employee watchlist; dashboards | ✅/🔶 | Predictive attrition exists; watchlist + dashboards (**Phase 2**) |
| 10–11 | HR-event-triggered surveys; journey integration | 🔶 | Automation events → survey launch (**Phase 1**); journeys dependency (Phase 2) |
| 12–13 | OOB templates + question bank with mapped themes | ⬜ | **Phase 1** — seed data |
| 14 | Anonymous post from external site | ⬜ | Phase 4 (public endpoint hardening) |

### 1.11 Time Tracking

Attendance + time evaluation + shifts + rosters + OTL exist. Extensions:

| # | Feature | Status | Plan |
|---|---|---|---|
| 1–5 | Night/WFH shifts, patterns, attendance policies + rule-based leave deduction, rosters + auto-assignment, buffers, weekly offs | ✅/🔶 | Rosters/auto-assign built (P1.6); add shift patterns + buffers (**Phase 1**) |
| 6–7, 12–13, 20 | Rule-based OT, thresholds, payment/comp-off, planned OT, multipliers, multi-frequency prioritization | 🔶 | OTL exists — extend rule engine (**Phase 1–2**) |
| 8 | Absconding flow | ⬜ | **Phase 1** — no-show detection (automation sweep) → case |
| 9 | Manager One View | 🔶 | **Phase 2** — team attendance cockpit |
| 10–11 | Rest/off day config; night shift differential | 🔶 | **Phase 1** |
| 14 | Geofencing / geotagging / IP restriction | 🔶 | GPS check-ins + IP allowlisting exist; geofence radius validation (**Phase 1**) |
| 15 | Hours/days-based leave policies | 🔶 | With Absence phase |
| 16 | Facial recognition check-in | ⬜ | Phase 4 (device/vendor integration) |
| 17 | Fair Workweek + predictability pay | ⬜ | **Phase 2** — schedule-change premiums on roster changes |
| 18 | Infraction rules | ⬜ | **Phase 2** — attendance point system + escalation |
| 19 | Break rules (standard + injection) | ⬜ | **Phase 2** |
| 21 | Work transfer | ⬜ | Phase 2 (cost-center reallocation of hours) |
| 22 | Intelligent recommendations framework | ⬜ | Phase 3 (AI layer over rostering/OT) |
| 23 | Complex punch processing at scale | 🔶 | Phase 2 (durable jobs queue for punch batch processing) |
| 24 | Virtual ID card + attendance admin app | ⬜ | Phase 3 (mobile) |

### 1.12 People Analytics

| # | Feature | Status | Plan |
|---|---|---|---|
| 1–18 | Standard dashboards (headcount, attrition, recruitment, onboarding, performance, leave, time, OT, cost, T&E, DEI, helpdesk, vibe, recognition, skills, org, functional, I-9) | 🔶 | ~10 exist via cross-analytics/BI; build the rest as semantic-layer saved queries + pages (**Phase 2**) |
| 19–22 | Storyboards (narrative multi-page dashboards) | ⬜ | **Phase 2** — ordered dashboard compositions with commentary blocks |
| 23 | Analytics designer (5 custom dashboards/storyboards) | 🔶 | Semantic layer + saved queries are the engine; add dashboard composer UI + license limit (**Phase 2**) |
| 24 | Module-gated + persona-gated access | 🔶 | Licensing + RBAC exist — enforcement pass (**Phase 2**) |

### 1.13 Employee Onboarding

| # | Feature | Status | Plan |
|---|---|---|---|
| 1 | Admin: workflows, forms, PDF forms, doc generation, policy sign-off | ✅/🔶 | Onboarding + letters exist; policy sign-off + PDF forms (**Phase 2**, Form Builder dependency) |
| 2 | Candidate experience (welcome page, tasks) | 🔶 | **Phase 2** — pre-join portal |
| 3 | BGV framework + vendor integrations | ✅ | BGV module |
| 4 | I-9 verification + E-Verify | ⬜ | **Phase 2** — I-9 Section 1/2/3 flow with document capture; E-Verify adapter stub (Phase 4 live integration) |

### 1.14 Skills Management

| # | Feature | Status | Plan |
|---|---|---|---|
| 1 | Skill ontology (40k+ skills) + admin dashboard | 🔶 | Skills module exists; import an open ontology (ESCO/O*NET-style seed) (**Phase 2**) |
| 2 | Role-to-skill mapping + proficiency levels | 🔶 | **Phase 2** |
| 3 | Categorization + framework management | 🔶 | **Phase 2** |
| 4 | Skill ingestion from connected platforms | ⬜ | Phase 4 (Studio) |
| 5 | Self-declared skills + skills of interest | 🔶 | **Phase 1** |
| 6 | AI skill recommendations | ⬜ | **Phase 3** — inference from role, goals, learning history |
| 7 | Proficiency capture + attestation | 🔶 | **Phase 2** |
| 8 | Peer endorsements | ⬜ | **Phase 1** — endorsement edges (also feeds ONA) |
| 9 | Validation via approval flows + talent reviews | 🔶 | **Phase 2** |
| 10 | Integration-based assessments | ⬜ | Phase 4 |
| 11–13 | Skills across search/performance/succession/career; skill-based discovery + mobility; gap visibility | 🔶 | **Phase 2/3** — gap engine exists in rudimentary form; wire into IJP + succession |

### 1.15 Helpdesk

| # | Feature | Status | Plan |
|---|---|---|---|
| 1–2 | Ticket management + SLA by category/subcategory | ✅ | HR helpdesk with SLA exists |
| 3 | Rule-based auto-assignment engine | ⬜ | **Phase 1** — routing rules (category × org unit → agent pool, round-robin/load-based) |
| 4 | Extensibility: forms, custom fields, permission roles | 🔶 | Custom fields exist — wire to cases (**Phase 1**) |
| 5 | Hold / reassign / reopen | 🔶 | **Phase 1** |
| 6 | SLA-based escalations | 🔶 | SLA sweep exists; add escalation chains (**Phase 1**) |
| 7 | Private agent↔admin messages | ⬜ | **Phase 1** — internal notes |
| 8 | Closure feedback (CSAT) | ⬜ | **Phase 1** |
| 9 | FAQs | ⬜ | **Phase 2** — knowledge base (shared with Vibe #V6) |
| 10 | Email parser → tickets | ⬜ | **Phase 2** — inbound email webhook → case |

### 1.16 LXP / Learning

| # | Feature | Status | Plan |
|---|---|---|---|
| L1 | Employee learning centre | 🔶 | Learning module exists; learner home (**Phase 2**) |
| L2 | Personalized recommendations (IDP/succession/career touchpoints) | ⬜ | **Phase 3** — AI layer |
| L3 | AI learning search & discovery | ⬜ | **Phase 3** |
| L4 | Add courses to development plans from any touchpoint | 🔶 | With IDP (**Phase 1–2**) |
| I1–2 | Two-way LMS/content-provider integrations; xAPI listeners | ⬜ | **Phase 4** — xAPI statement endpoint + SCORM/provider adapters |
| A1–4 | Course/path setup, assignment & tracking, reports, AI skill-to-course mapping | ✅/🔶/⬜ | Setup + assignment exist; dashboards Phase 2; AI mapping Phase 3 |
| **Disprz-LMS depth** (micro-learning, ILT/VILT, drip journeys, gamified learning, contests, MOOC integrations, assessments incl. graded subjective, OJT, journey scorecards, multi-level approvals, workflow automation) | ⬜/🔶 | **Phase 4 track** — ILT sessions + assessments (quiz exists via surveys foundation) first; content ecosystem integrations later |

### 1.17 Studio (integration platform — premium tier)

| # | Feature | Status | Plan |
|---|---|---|---|
| 1 | API management (published API list) | 🔶 | Swagger-documented APIs exist; API-key management per consumer (**Phase 2**) |
| 2 | Reports API | 🔶 | Semantic layer run-by-id is the engine (**Phase 2**) |
| 3–4 | API-level IP/user restrictions; self-service config | 🔶 | IP allowlisting exists; per-key scoping (**Phase 2**) |
| 5–6 | Backend throttling; consumption alerts | 🔶 | Throttler + metrics exist; per-key quotas + alerts (**Phase 2**) |
| 7–8 | Central monitoring, audit, error debugging | 🔶 | Request tracing + audit exist; per-integration run logs (**Phase 2**) |
| 9 | Event framework: webhooks + event push | ✅ | Webhooks + automation events |
| 10–11 | Integrations designer middleware (Python) + scheduling | ⬜ | **Phase 4** — sandboxed script runner is a major infra bet; start with declarative mappings on the durable jobs queue |
| 12 | Connector library | 🔶 | Marketplace manifests are the distribution vehicle (**Phase 2**) |
| 13 | Lookup tables + master files | ⬜ | **Phase 2** — tenant lookup tables (custom objects foundation) |
| 14 | API builder (custom API packages) | ⬜ | Phase 4 |
| 15 | SFTP for reports/outbound | ⬜ | **Phase 4** — scheduled report delivery |
| 16 | Extensibility layer | ✅/🔶 | Custom objects/records/rules + marketplace |
| 17 | Automation hub | ✅ | Automation rule engine |

### 1.18 Sandbox / Pre-Prod, Academy, Alumni

| Area | Status | Plan |
|---|---|---|
| Sandbox instance (2nd tenant, settings sync, data sync on request, 1000-user cap) | 🔶 | **Phase 4** — tenant-export exists as the seed; add settings-only export/import (bidirectional config sync) + user cap via licensing |
| Academy (certification portal, 1-year licenses) | ⬜ | **Phase 4** — thin build on learning + licensing: certification courses, expiry, renewal |
| **Alumni Management** (add/remove alumni, registration, directory, separation visibility incl. leave balance at LWD, support tickets, profile updates, document/payslip access, Android/iOS, policy docs) | ⬜ | **Phase 2** — high-value, well-scoped: post-exit persona over existing exits + helpdesk + DMS + payslips; separate `alumni` role with narrow RBAC; mobile via existing API + sync |

---

## 2. Phased build plan

### Phase 1 — Extend what exists (highest leverage, lowest risk) — ✅ COMPLETE
*All nine workstreams shipped (commits on `claude/app-build-setup-ntay5k`): absence
depth, expense depth, helpdesk depth, performance depth, social/RnR depth, time-tracking
depth, travel depth, recruitment quick wins, and core quick wins (HR policies +
acknowledgement, talent profile aggregate). API suite: 185 suites / 1,709 tests green.*

*Everything here lands inside a module that already has entities, services, tests, and UI.*

1. **Absence depth**: hourly leave, sandwich/blackout/interdependent rules, encashment, birthday/anniversary auto-grants, date restrictions, concurrent handling
2. **Expense depth**: per-diem + mileage policies, expense splitting, advance offset at settlement, policy restrictions by band/grade, category budgets + alerts, tax groups on lines
3. **Helpdesk depth**: auto-assignment engine, escalation chains, internal notes, hold/reassign/reopen, CSAT on closure
4. **Performance depth**: IDP module, goal journal, goal explorer, team/bulk goals, structured continuous feedback, calibration lobbies
5. **Social/RnR depth**: polls + events, groups, moderation queue, nomination programs + panel voting, leaderboards, milestone auto-posts, noticeboard
6. **Time tracking depth**: shift patterns + buffers, absconding sweep, geofenced check-ins, night-shift differential, OT rule extensions
7. **Travel depth**: accommodation legs, on-behalf + guest travel, cancellation workflows, budget-breach exception flows
8. **Recruitment quick wins**: referral portal + IJP postings, bulk offers, evaluation forms
9. **Core quick wins**: talent profile aggregate, talent search filters, HR policy repository + acknowledgement, Pulse schedules, VoE theme taxonomy + question bank + event-triggered surveys

### Phase 2 — New sub-modules on existing foundations — ✅ COMPLETE
*All twelve workstreams shipped (commits on `claude/app-build-setup-ntay5k`,
`e1fd964`→`7cc9b6a`): merit planning, career architecture/pools/9-box, skills
ontology + attestation, 360/promotion/achievement-matrix, journeys + disciplinary,
alumni network, form builder + I-9/E-Verify, external-collaborator portals, people
analytics (storyboards/composer/licence tiers), knowledge base + email-to-ticket +
action planning + attrition watchlist, Studio tier 1 (API keys/quota gateway/lookup
tables), and time-tracking tier 2 (break rules/infractions/fair workweek/One View).
API suite: 200 suites / 1,873 tests green.*

1. **Merit Planning & Compensation Modelling** (plan engine, budget tree, worksheets, HRBP gate, cycle types, letter/structure outputs)
2. **Career Architecture + Talent Pools + Talent Reviews + Succession pools/dashboard**
3. **Skills platform**: ontology import, role-skill maps, proficiency + attestation, validation flows, gap visibility into IJP/succession
4. **MSF/360 feedback + promotion framework + custom formulas/achievement matrix + N-grid**
5. **Journeys** (event-triggered step templates) + **Disciplinary case management**
6. **Alumni portal** (post-exit persona: directory, documents/payslips, tickets, profile)
7. **Form Builder + DMS bulk ops + effective-dated reporting + I-9/E-Verify flow + candidate/onboarding portals**
8. **External-collaborator portals**: recruiter/BGV-vendor/travel-agent logins (scoped external users)
9. **People Analytics buildout**: remaining standard dashboards, storyboards, dashboard composer with license limits
10. **Knowledge base** (helpdesk FAQs + Vibe articles) + email-to-ticket parser + survey action planning + attrition watchlist
11. **Studio tier 1**: API keys with scopes/quotas/alerts, reports API, lookup tables, connector distribution via marketplace
12. **Time tracking tier 2**: break rules, infractions, fair workweek, One View cockpit, punch batch processing on the jobs queue

### Phase 3 — AI-powered layer — ✅ COMPLETE
*All seven workstreams shipped (commits on `claude/app-build-setup-ntay5k`,
`bc4a9bc`→`07ae85f`): AI career (IJP matching/role clustering/role-fit/reflection),
metered receipt OCR + expense line risk, metered CV parsing + interview
scheduling, survey text analytics (sentiment/themes/heatmap/impact), skill
inference + learning recommendations + course mapping, merit bias/outlier alerts
+ WFM recommendations, and copilot expansion (knowledge-search + sentiment
actions). Every feature is built behind the LLM seam — deterministic/statistical
core that works without `ANTHROPIC_API_KEY`, with optional Claude enrichment when
a key is present. Metered features (OCR, CV) count usage against a monthly quota.
API suite: 206 suites / 1,924 tests green.*

*All built behind the established seams: `modules/ai` (statistical engine) + `LlmPlannerService` pattern (Claude tool-use, disabled without `ANTHROPIC_API_KEY`).*

1. Career reflection, exploration & planning; AI career architecture (role clustering, job evaluation); IJP matching
2. GPT/Claude OCR for receipts (metered) + expense line risk scores (productized anomaly detectors)
3. CV parsing (metered) + auto interview scheduling engine
4. Survey text analytics: themes, sentiment, heatmaps, impact analysis
5. Skill inference + learning recommendations + AI skill-to-course mapping + AI learning search
6. Merit-cycle bias/outlier alerts; WFM intelligent recommendations
7. Copilot expansion: every new module gets copilot actions through the existing planner

### Phase 4 — Integrations & infrastructure bets

1. **Studio tier 2**: integrations-designer script runtime (sandboxed), scheduling, API builder, SFTP delivery
2. **Notification channels**: MS Teams, web push; reward-store integration
3. **Recruiting ecosystem**: LinkedIn/job boards, calendar providers, assessment vendors
4. **Learning ecosystem**: xAPI listeners, LMS/MOOC/content-provider integrations, ILT/VILT with Zoom/Teams
5. **Expense/travel ecosystem**: corporate card feeds, TMS/cab integrations
6. **Sandbox instance tooling** (settings sync on tenant-export foundation), **Academy** certification portal
7. **Device-dependent**: facial recognition check-in, native mobile shells, visitor management kiosk
8. **E-Verify live integration**

---

## 3. Sequencing rationale

1. **Phase 1 first** — every item strengthens a module that customers already
   touch daily (leave, expenses, helpdesk, performance, feed); zero new
   infrastructure, immediate demo value.
2. **Phase 2 is the differentiating middle** — merit planning, career/skills
   architecture, and the alumni/external portals are the features that
   decide enterprise HCM deals. Each has a named foundation to build on.
3. **Phase 3 stays behind seams** — AI features degrade gracefully when no
   API key is configured, so they ship without deployment risk and reuse one
   pattern (strict tool-use planner) everywhere.
4. **Phase 4 last** — external integrations depend on partner accounts and
   credentials that don't block the product core; the script-runtime and
   sandbox-instance items are genuine infrastructure projects deserving
   their own design pass.

**Suggested cadence:** Phase 1 ≈ 4–6 sprints across 9 workstreams · Phase 2 ≈
8–10 sprints · Phase 3 ≈ 4 sprints (parallel to late Phase 2) · Phase 4 ≈
scheduled by partner/integration availability.

---

*Statuses verified against the codebase on the date above (module inventory
under `apps/api/src/modules/`, 176 test suites / 1,616 tests green). Source
feature list: `Feature_List.docx` (uploaded 2026-07-09).*
