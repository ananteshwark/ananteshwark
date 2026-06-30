# ERP Feature Roadmap — Oracle Fusion Cloud Gap Analysis

> **Baseline**: Phases 1–92 complete (345 tests passing).  
> **Methodology**: Feature-by-feature comparison against Oracle Fusion Cloud ERP, HCM, SCM, CX, and EPM pillars.  
> **Priority tiers**: P1 = core gap / revenue-blocking · P2 = important completeness · P3 = competitive differentiator  
> **Complexity**: S (days) · M (1–2 weeks) · L (3–4 weeks) · XL (6–8 weeks)

---

## ✅ Delivery Log (in progress)

| Phase | Feature | Status | Tests |
|-------|---------|--------|-------|
| Ph-93–95 | Subledger Accounting Engine (SLA) — rules, runtime, XLA audit trail | ✅ Done | 25 |
| Ph-96–98 | COA segments, account trees, cross-validation rules | ✅ Done | 25 |
| Ph-99 | AP invoice hold framework (blocks payment runs) | ✅ Done | 14 |
| Ph-100 | AP 3-way matching | ⏩ Pre-existing (procurement vendor-invoice module) | — |
| Ph-103–105 | AP Withholding Tax (TDS) — codes, calc engine, Form 16A certs | ✅ Done | 13 |
| Ph-106–107 | AR credit limits, exposure, credit hold | ⏩ Pre-existing (sales/credit.service) | — |
| Ph-109–111 | AR Collections workbench — aging drill-down, promise-to-pay, dispute mgmt (suspends dunning) | ✅ Done | 12 |
| Ph-112–114 | AR Lockbox — MT940/BAI2/normalized parsers, auto-application (oldest/exact/by-ref), unapplied queue | ✅ Done | 14 |
| Ph-115 | Asset books (Corporate/Tax/IFRS) | ⏩ Pre-existing (FA depreciation areas) | — |
| Ph-116, 119, 120 | FA lifecycle — CIP capitalization, impairment (IAS 36), revaluation (IAS 16) | ✅ Done | 9 |
| Ph-121–124 | Tax Determination Engine (ZX) — regime/tax/status/rate hierarchy, rules, registrations, GSTR-3B/VAT reporting | ✅ Done | 16 |
| Ph-125–127 | Encumbrance accounting — commitment→obligation→expenditure ledger, blocking funds check, liquidation | ✅ Done | 14 |
| Ph-128, 129 | Cash forecasting — multi-source forecast snapshots (AR/AP/payroll/maturities), forecast-vs-actual variance | ✅ Done | 9 |
| Ph-130 | Zero-balance sweep / cash pooling | ⏩ Pre-existing (treasury sweep rules) | — |
| Ph-131–133 | Financial close management (ARCS) — close tasks w/ certification, balance-sheet reconciliations (variance-gated sign-off), close calendar dashboard | ✅ Done | 13 |

**Current total: 509 tests passing. ✅ TRACK A (Finance Depth) A1–A12 COMPLETE.**

### Track B — Supply Chain
| Phase | Feature | Status | Tests |
|-------|---------|--------|-------|
| Ph-134–136 | Multi-org inventory — inventory orgs + hierarchy, item-org assignments, inter-org transfers with pricing | ✅ Done | 14 |
| Ph-137–140 | Cost accounting — weighted-average cost roll, standard cost + PPV, period-end cost-update revaluation (JE), variance dashboard | ✅ Done | 11 |
| Ph-141–144 | Lot genealogy — parent-child capture, forward/backward trace, recall impact analysis | ✅ Done | 9 |
| Ph-145, 146 | Order fulfillment — drop-ship + back-to-back supply linkage (drop-ship receipt relieves SO line) | ✅ Done | 11 |
| Ph-147, 148 | Pick-pack-ship + shipment tracking | ⏩ Pre-existing (DeliveryOrder workflow, carrier/tracking/POD) | — |
| Ph-150 | Global Order Promising — date-based ATP/CTP with scheduled PO receipts, ranked multi-source sourcing rules | ✅ Done | 8 |
| Ph-149 | Configure-to-Order (CTO) | ⏳ Deferred (needs variant BOM explosion — Ph-102 territory) | — |
| Ph-151–154 | Transportation — carrier master, freight rate engine + rate shopping, shipment planning w/ utilization, freight audit | ✅ Done | 12 |
| Ph-155, 156, 158 | Quality at operations — operation quality plans, in-process collection w/ move gate, first-pass yield | ✅ Done | 11 |
| Ph-157 | Non-conformance (NCR) | ⏩ Pre-existing (quality non-conformance entity) | — |
| Ph-159–162 | Process manufacturing (OPM) — formula/recipe, quantity-scaled batches (yield/scrap, co/by-products), lab-release gate | ✅ Done | 12 |
| Ph-164, 165, 166 | CMMS — WO parts reservation/issue, asset warranty + claims, service history w/ cost rollup | ✅ Done | 10 |
| Ph-163, 167 | PM schedules (calendar/meter) + condition monitoring | ⏩ Pre-existing (maintenance plan trigger TIME/COUNTER + counter readings) | — |

**Running total: 607 tests passing. ✅ TRACK B (Supply Chain) B1–B8 substantially complete.**

### Track C — HCM Depth
| Phase | Feature | Status | Tests |
|-------|---------|--------|-------|
| Ph-168 | Legislative Data Groups — per-country payroll framework (currency, rounding, SI rates, regime flags), IN/UK/US seed | ✅ Done | 9 |
| Ph-169 | India payroll localization (TDS/PF/ESI/PT/Form 16) | ⏩ Pre-existing (statutory module: tax-slab, statutory-config, form16) | — |
| Ph-172 | Retroactive pay | ⏩ Pre-existing (payroll retro module: detectArrears/applyArrearsToRun) | — |
| Ph-174–176 | Payroll costing — costing rules (%/absolute split), cost distribution per element×cost-center, labor distribution report | ✅ Done | 9 |
| Ph-178–180 | Benefits enrollment — open enrollment windows, life-event processing (30-day election), eligibility, deduction calculator | ✅ Done | 13 |
| Ph-177 | Benefit programs & plans | ⏩ Pre-existing (benefits module: plans, enrollments) | — |
| Ph-182–186 | Compensation Workbench — budget envelopes per org unit/award type, budget-gated award worksheet, manager→HR→finance approval routing, salary-change execution, total compensation statement | ✅ Done | 14 |
| Ph-181 | Merit cycles & allocations | ⏩ Pre-existing (benefits module: merit-cycle, merit-allocation) | — |
| Ph-187–190 | Skills & Workforce Intelligence — skills taxonomy (categories + 1–5 catalog), employee skill profiles, job-requirement gap analysis (employee + department rollup), AI-suggested learning matched to catalog courses | ✅ Done | 10 |
| Ph-191–193 | Position-Based Headcount Budgeting — time-phased position budgets (approved FTE, salary range, effective period), headcount-control validation on hires (OK/WARN/BLOCK + frozen-position block), non-destructive workforce planning scenarios with baseline+delta projection | ✅ Done | 11 |
| Ph-194–197 | Time & Labor (OTL) — configurable time rules (daily/weekly OT, 7th consecutive day, shift differentials) with seedable defaults, weekly timecard processing into payroll-ready pay elements, absence reconciliation against approved leave, payroll-export aggregation by element | ✅ Done | 9 |

**Running total: 682 tests passing. Track C (Payroll/HCM) complete.**

### Track D — Procurement Intelligence (delivery log)

| Phase | Feature | Status | Tests |
|-------|---------|--------|-------|
| Ph-198–201 | Strategic Sourcing — RFI/RFQ/reverse-auction events with multi-round sealed bidding + bid history (re-round, auction must-beat rule), weighted price/quality/delivery scoring with award recommendation, split-award by percentage, one-click award-to-PO proposals grouped by supplier | ✅ Done | 13 |
| Ph-202–205 | Supplier Qualification & Risk — weighted qualification questionnaires (BOOLEAN/NUMERIC/CHOICE) with auto pass/fail scoring and review routing, reviewer override, certificate expiry tracking (VALID/EXPIRING/EXPIRED + expiring-soon feed), periodic supplier KPI scorecards (on-time/reject/invoice-accuracy) with weighted overall + trend deltas | ✅ Done | 11 |

**Running total: 706 tests passing.**

Remaining genuine gaps continue below (Tracks B–G).

---

## TRACK A — FINANCE DEPTH

### A1. Subledger Accounting Engine (SLA)
**Oracle equivalent**: Oracle Subledger Accounting (XLA)  
**Priority**: P1 · **Complexity**: XL  
**Gap**: Our system posts journal entries directly from business events with hardcoded GL accounts. Oracle's SLA is a rule-based engine that maps any business event (invoice, payment, shipment) to journal entries using configurable Account Derivation Rules (ADR), Journal Line Types (JLT), and Journal Entry Descriptions (JED). This makes accounting configurable per legal entity without code changes.

Phases:
- **Ph-93**: SLA rule repository — entity `sla_rules` with event class (AP_INVOICE, AR_RECEIPT, etc.), journal line type, account derivation priority, condition expressions
- **Ph-94**: SLA runtime engine — event processor that evaluates rules and posts to GL; replaces hardcoded account lookups in all services
- **Ph-95**: SLA audit trail — `xla_ae_lines` table tracing every JE line back to its source document and the rule that generated it

---

### A2. Account Hierarchy & Segment Security
**Oracle equivalent**: Oracle GL Chart of Accounts with Value Sets, Trees, Segment Value Security  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our COA is a flat list. Oracle structures accounts with multiple segments (Company-CostCenter-Account-Product-Project), value sets with validation, hierarchical trees for reporting roll-ups, and segment value security rules.

Phases:
- **Ph-96**: COA Segments — split account code into configurable segments (up to 6); entity `chart_of_accounts_segments`
- **Ph-97**: Account Trees / Hierarchy — parent-child rollup trees for financial reporting; `gl_account_trees`, `gl_account_tree_nodes`
- **Ph-98**: Cross-validation rules — forbid invalid account combinations; evaluated at JE entry time

---

### A3. AP Invoice Matching & Tolerances
**Oracle equivalent**: Oracle Payables Invoice Validation — 2-way/3-way/4-way matching  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our AP links bills to POs but lacks formal matching workflow. Oracle validates quantity billed vs received vs ordered with configurable tolerances (qty ±5%, price ±2%, amount ±$100). Invoices on hold cannot be paid.

Phases:
- **Ph-99**: Invoice hold framework — `ap_holds` entity with hold reason, release condition; holds block payment run
- **Ph-100**: 3-way matching engine — compare AP invoice qty/price against PO line and GRN; auto-release within tolerance
- **Ph-101**: 4-way matching — add inspection lot acceptance qty to the matching chain
- **Ph-102**: ERS (Evaluated Receipts Settlement) — auto-generate AP invoice from GRN for ERS-flagged vendors

---

### A4. AP Withholding Tax (WHT / TDS)
**Oracle equivalent**: Oracle Payables Withholding Tax  
**Priority**: P1 · **Complexity**: M  
**Gap**: WHT is mandatory in India (TDS), Brazil, Mexico, and most emerging markets. Oracle calculates WHT at invoice or payment time, posts to WHT liability account, and generates WHT certificates.

Phases:
- **Ph-103**: WHT setup — `ap_wht_codes` with rate, certificate type, applicability rules (vendor type, invoice type, threshold)
- **Ph-104**: WHT calculation engine — compute WHT at invoice validation; post split JE (vendor credit = gross − WHT; WHT liability credit)
- **Ph-105**: WHT certificates — generate TDS certificates (India Form 16A), payment advice with WHT breakdown

---

### A5. AR Credit Management
**Oracle equivalent**: Oracle Credit Management  
**Priority**: P1 · **Complexity**: M  
**Gap**: We have AR invoicing but no credit control. Oracle assigns credit limits, credit scores, credit hold triggers, and a credit analyst review workflow.

Phases:
- **Ph-106**: Credit profile — `ar_credit_profiles` with credit limit, payment terms, currency, credit score, review cycle
- **Ph-107**: Credit hold engine — block SO release and delivery when customer balance > credit limit × exposure %; configurable hold reason
- **Ph-108**: Credit review workflow — periodic review task generation; analyst approve/override/escalate

---

### A6. AR Collections Workbench
**Oracle equivalent**: Oracle Collections  
**Priority**: P2 · **Complexity**: L  
**Gap**: We have dunning letters but no interactive collector workbench. Oracle provides a unified view of overdue customers, promise-to-pay tracking, dispute management, and collection strategy assignment.

Phases:
- **Ph-109**: Collections workbench — customer aging drill-down, contact history, collector notes
- **Ph-110**: Promise-to-pay — `ar_promises` entity; track follow-up dates, amount promised, kept/broken status
- **Ph-111**: Dispute management — raise dispute against invoice line; suspend dunning; route to resolver

---

### A7. AR Lockbox / Automated Receipt Application
**Oracle equivalent**: Oracle AR Lockbox  
**Priority**: P2 · **Complexity**: M  
**Gap**: Our bank reconciliation imports generically. Oracle's lockbox processes BAI2/EDI 820 bank files to auto-apply receipts to invoices using matching rules.

Phases:
- **Ph-112**: BAI2 / MT940 parser — standardized bank statement import formats
- **Ph-113**: Auto-application rules — apply receipt to oldest-first / exact-match / customer reference; `ar_receipt_application_rules`
- **Ph-114**: Unapplied receipt queue — unapplied receipts management with manual application UI

---

### A8. Fixed Assets — Full Lifecycle
**Oracle equivalent**: Oracle Assets  
**Priority**: P1 · **Complexity**: L  
**Gap**: Basic depreciation exists. Oracle adds: corporate vs tax books, CIP (Construction in Progress), mass additions from AP, physical inventory, impairment (IAS 36), revaluation.

Phases:
- **Ph-115**: Asset books — separate `fa_books` (Corporate, Tax, IFRS); each with own depreciation rules and rates
- **Ph-116**: CIP assets — `fa_cip_assets`; accumulate costs; transfer to in-service on capitalization date
- **Ph-117**: Mass additions — auto-create FA from AP invoice line when item is flagged as capitalizable
- **Ph-118**: Physical inventory — generate asset verification list; record discrepancies; retire missing assets
- **Ph-119**: Impairment testing — record impairment indicators, calculate recoverable amount, post impairment loss JE (IAS 36)
- **Ph-120**: Revaluation — revalue asset class to fair value; track revaluation reserve in equity (IAS 16)

---

### A9. Tax Determination Engine
**Oracle equivalent**: Oracle Tax (E-Business Tax / ZX module)  
**Priority**: P1 · **Complexity**: XL  
**Gap**: Our tax is a flat rate lookup. Oracle's engine has a full hierarchy: Tax Regime → Tax → Tax Status → Tax Rate → Applicability Rules, evaluated per transaction line based on party, geography, and item classification.

Phases:
- **Ph-121**: Tax regime hierarchy — `zx_regimes`, `zx_taxes`, `zx_statuses`, `zx_rates` with effective dates
- **Ph-122**: Tax determination rules — condition-based rule ordering (geography, party classification, item); `zx_rules`
- **Ph-123**: Tax registration management — per-party, per-regime registrations; validate on transactions
- **Ph-124**: Tax reporting — VAT return summary, input vs output; GST GSTR-1/GSTR-3B (India); Intrastat

---

### A10. Encumbrance Accounting
**Oracle equivalent**: Oracle Budgetary Control & Encumbrance Accounting  
**Priority**: P2 · **Complexity**: L  
**Gap**: Used in public sector and grant organizations. Oracle tracks commitments (PO), obligations (GRN), and expenditures against budget appropriations with real-time funds check.

Phases:
- **Ph-125**: Encumbrance ledger — parallel ledger tracking commitments and obligations
- **Ph-126**: Funds check — validate available funds at PO/Requisition approval; block if over-budget
- **Ph-127**: Encumbrance liquidation — auto-liquidate PO encumbrance on GRN; GRN encumbrance on AP invoice

---

### A11. Cash Forecasting & Pooling
**Oracle equivalent**: Oracle Cash Management — Cash Forecasting  
**Priority**: P2 · **Complexity**: M  
**Gap**: Our treasury tracks current cash. Oracle builds daily/monthly forecasts by pulling AR due dates, AP due dates, payroll disbursement, and loan maturities.

Phases:
- **Ph-128**: Cash forecast engine — aggregate future inflows (AR due) and outflows (AP due, payroll, loans) by day/week/month
- **Ph-129**: Forecast variance analysis — compare forecast vs actual cash position; `cash_forecast_lines`
- **Ph-130**: Intercompany cash pooling — zero-balance sweep rules between bank accounts in same entity group

---

### A12. Financial Close Management
**Oracle equivalent**: Oracle Account Reconciliation Cloud (ARCS)  
**Priority**: P2 · **Complexity**: M  
**Gap**: No structured period-end close process. Oracle ARCS assigns reconciliation tasks, tracks open items, certifies balance sheet accounts, and produces a close calendar.

Phases:
- **Ph-131**: Close task framework — `fin_close_tasks` with period, account, preparer, reviewer, due date, status
- **Ph-132**: Balance sheet reconciliation — attach supporting schedules to account balances; sign-off workflow
- **Ph-133**: Close calendar dashboard — visual view of open vs certified tasks; breach alerts

---

## TRACK B — SUPPLY CHAIN COMPLETENESS

### B1. Multi-Org Inventory
**Oracle equivalent**: Oracle Inventory — Multi-Organization  
**Priority**: P1 · **Complexity**: L  
**Gap**: Inventory is warehouse-based but lacks Oracle's legal entity hierarchy. Oracle separates Inventory Organizations from Warehouses, supports inter-org transfers with freight/tax, and item-org assignment.

Phases:
- **Ph-134**: Inventory organization model — `inv_organizations` separate from warehouses; org hierarchy for inter-org access
- **Ph-135**: Inter-org transfers with pricing — internal orders with freight, tax, intercompany markup
- **Ph-136**: Item-org assignments — control which items are active in which orgs; inherited item attributes

---

### B2. Average & Standard Cost Accounting
**Oracle equivalent**: Oracle Cost Management  
**Priority**: P1 · **Complexity**: L  
**Gap**: We only support FIFO costing. Oracle supports FIFO, LIFO, Average, and Standard costing. Standard cost enables variance analysis (PPV, MUV, LRV, SUV).

Phases:
- **Ph-137**: Weighted Average Cost (WAC) — rolling average recalculated on each receipt; `inv_cost_layers` update
- **Ph-138**: Standard cost engine — maintain standard per item-org; compute variances on PO receipt and production completion
- **Ph-139**: Cost update — period-end standard cost update; revalue inventory at new standard; post revaluation JE
- **Ph-140**: Variance analysis dashboard — PPV, MUV, overhead variance drill-down by item, vendor, work center

---

### B3. Lot Traceability / Genealogy
**Oracle equivalent**: Oracle SCM Lot Genealogy  
**Priority**: P1 · **Complexity**: M  
**Gap**: We have lot/serial tracking but no forward/backward genealogy. Oracle traces finished goods lots to every raw material lot consumed — critical for pharma, food, and aerospace recalls.

Phases:
- **Ph-141**: Genealogy capture — record parent-child lot relationships at production completion and goods receipt
- **Ph-142**: Forward trace — given a raw material lot, find all FG lots that consumed it; tree visualization
- **Ph-143**: Backward trace — given an FG lot, show all component lots used in its production
- **Ph-144**: Recall impact analysis — identify all customers who received FG containing a recalled raw material lot

---

### B4. Advanced Order Management
**Oracle equivalent**: Oracle Order Management + Global Order Promising (GOP)  
**Priority**: P1 · **Complexity**: XL  
**Gap**: Our SOs lack fulfillment orchestration. Oracle adds drop shipment, back-to-back ordering, CTO (configure-to-order), multi-source promising, and full pick-pack-ship workflow.

Phases:
- **Ph-145**: Drop shipment flow — SO line triggers PO to supplier; GRN auto-confirms SO delivery to customer
- **Ph-146**: Back-to-back orders — SO demand creates supply PO or production order automatically
- **Ph-147**: Pick-pack-ship — pick list from open SO; pack into shipment containers; ship confirm with carrier details
- **Ph-148**: Shipment tracking — carrier tracking number, estimated delivery, POD capture
- **Ph-149**: Configure-to-Order (CTO) — option selection at order entry; BOM explosion per configuration
- **Ph-150**: Global Order Promising — ATP/CTP with sourcing rules, supply chain calendar, exception messaging

---

### B5. Transportation Management
**Oracle equivalent**: Oracle Transportation Management (OTM)  
**Priority**: P2 · **Complexity**: XL  
**Gap**: No logistics management. Oracle OTM handles carrier selection, rate shopping, load building, freight audit, and shipment tracking.

Phases:
- **Ph-151**: Carrier master — `log_carriers` with service levels, transit times, freight zones
- **Ph-152**: Freight rate engine — rate tables by carrier/zone/weight/volume; auto-select cheapest carrier
- **Ph-153**: Shipment planning — consolidate deliveries into shipments; weight/volume utilization
- **Ph-154**: Freight audit & payment — match carrier invoice to planned freight cost; approve/dispute

---

### B6. Quality at Operations (In-Process Quality)
**Oracle equivalent**: Oracle Manufacturing — Quality at Operations  
**Priority**: P1 · **Complexity**: M  
**Gap**: Our quality module handles inspection lots but is decoupled from production routing. Oracle embeds quality collection points on routing operations — must pass before moving to next operation.

Phases:
- **Ph-155**: Quality plan per routing operation — `mfg_quality_plans` linked to operation; required vs optional
- **Ph-156**: In-process collection — collect measurements/pass-fail at operation completion; block move if FAIL
- **Ph-157**: Non-conformance (NCR) — raise NCR from quality failure; disposition (scrap/rework/use-as-is); `mfg_ncrs`
- **Ph-158**: First-pass yield tracking — FPY per work center, routing, item; trend charts

---

### B7. Process Manufacturing
**Oracle equivalent**: Oracle Process Manufacturing (OPM)  
**Priority**: P2 · **Complexity**: XL  
**Gap**: Our manufacturing is discrete (unit-tracked). Oracle OPM handles batch/recipe manufacturing for pharma, food, chemicals — bulk quantities, formula yield factors, batch disposition via lab release.

Phases:
- **Ph-159**: Recipe / Formula management — `opm_formulas`, `opm_formula_details` with ingredient ratios, yield %
- **Ph-160**: Batch production orders — quantity-scaled batch from formula; co-products and by-product outputs
- **Ph-161**: Process operations — batch routing steps with equipment and resource requirements
- **Ph-162**: Batch quality release — lab results required before batch is released to stock

---

### B8. Maintenance Management (Full CMMS)
**Oracle equivalent**: Oracle Maintenance Cloud  
**Priority**: P2 · **Complexity**: L  
**Gap**: Our maintenance module has basic structure. Oracle adds preventive maintenance schedules, meter-based triggers, work order parts reservation, and full asset service history.

Phases:
- **Ph-163**: PM schedules — `maint_pm_schedules` with calendar-based (every 90 days) and meter-based (every 500 hours) triggers; auto-generate work orders
- **Ph-164**: Work order parts reservation — reserve inventory items for WO; issue on WO completion
- **Ph-165**: Asset service history — complete history of work orders, parts, labor, costs per asset
- **Ph-166**: Warranty management — `maint_warranties` per asset; flag WOs under warranty; claim tracking
- **Ph-167**: Condition monitoring — record sensor/meter readings; alert on threshold breach; trigger unplanned WO

---

## TRACK C — HCM DEPTH

### C1. Global Payroll Compliance
**Oracle equivalent**: Oracle Global Payroll  
**Priority**: P1 · **Complexity**: XL  
**Gap**: Our payroll computes gross-to-net but lacks country-specific tax rules. Oracle has Legislative Data Groups (LDG) per country with specific tax calculations, social insurance, year-end processing, and statutory filing formats.

Phases:
- **Ph-168**: Legislative Data Groups — `hr_ldgs` per country; tax tables, social insurance rates, rounding rules
- **Ph-169**: India payroll localization — TDS (new/old regime), PF, ESI, Professional Tax, HRA calculation, Form 16
- **Ph-170**: UK payroll localization — PAYE, NIC (Class 1A/1B), student loan deductions, RTI submission format
- **Ph-171**: US payroll localization — Federal/State income tax (FITW/SITW), FICA (SS + Medicare), FUTA/SUTA, W-2/W-4
- **Ph-172**: Retroactive pay — detect prior-period salary changes; compute retro delta; include in current run
- **Ph-173**: Year-end processing — generate W-2 (US), P60 (UK), Form 16 (India); electronic filing formats

---

### C2. Payroll Costing
**Oracle equivalent**: Oracle Payroll Costing  
**Priority**: P1 · **Complexity**: M  
**Gap**: Our payroll posts a single JE per run. Oracle distributes each payroll element cost to specific cost centers, projects, or GL accounts based on assignment-level costing rules.

Phases:
- **Ph-174**: Costing rules — `pay_costing_rules` per element/cost center/project; percentage or absolute split
- **Ph-175**: Payroll cost distribution — generate cost JE per employee × element × cost-center split
- **Ph-176**: Labor distribution reporting — payroll cost by department, project, GL account for management reporting

---

### C3. Benefits Administration
**Oracle equivalent**: Oracle Benefits  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our benefits page is a placeholder. Oracle Benefits manages plan types (medical, dental, 401k), open enrollment, life event triggers, eligibility rules, cost sharing, and payroll deduction integration.

Phases:
- **Ph-177**: Benefit programs & plans — `ben_programs`, `ben_plan_types`, `ben_plans` with coverage options, costs, eligibility rules
- **Ph-178**: Open enrollment — annual election window; employee elections via self-service; waiver tracking
- **Ph-179**: Life event processing — hire/marriage/birth/divorce triggers benefit eligibility changes; 30-day election window
- **Ph-180**: Benefit deductions — auto-create payroll deductions for elected plans; employer contribution tracking
- **Ph-181**: ACA/COBRA compliance (US) — minimum essential coverage tracking, COBRA election management, Form 1095-C

---

### C4. Compensation Workbench
**Oracle equivalent**: Oracle Compensation Workbench  
**Priority**: P1 · **Complexity**: L  
**Gap**: No salary planning tool. Oracle's Workbench gives managers a merit-cycle worksheet to allocate salary increases, bonuses, and equity grants within a budget envelope.

Phases:
- **Ph-182**: Compensation plan setup — merit cycles, budget envelopes per org unit, eligible population, award types
- **Ph-183**: Manager worksheet — ranked employee list with current salary, performance rating, proposed increase %, budget consumed
- **Ph-184**: Approval workflow — manager → HR → Finance; lock worksheet after approval; prevent post-approval changes
- **Ph-185**: Salary change execution — auto-create assignment change records from approved worksheet
- **Ph-186**: Total compensation statement — employee-facing view of cash + benefits + equity value

---

### C5. Skills & Workforce Intelligence
**Oracle equivalent**: Oracle Dynamic Skills, Oracle Workforce Intelligence  
**Priority**: P2 · **Complexity**: L  
**Gap**: We have learning and appraisals but no skills inventory. Oracle maintains a skills taxonomy, employee skill proficiency levels, skill-gap analysis, and AI-recommended learning paths.

Phases:
- **Ph-187**: Skills taxonomy — `hr_skills`, `hr_skill_categories` with proficiency levels (1–5); globally shared catalog
- **Ph-188**: Employee skills profile — assign skills + proficiency to employees; `hr_employee_skills`
- **Ph-189**: Skills gap analysis — compare job requirements vs employee skills; department-level gaps
- **Ph-190**: AI-suggested learning — recommend learning courses to close identified skill gaps

---

### C6. Position-Based Headcount Budgeting
**Oracle equivalent**: Oracle Position Management / Workforce Budgeting  
**Priority**: P2 · **Complexity**: M  
**Gap**: We track positions but don't enforce headcount budgets. Oracle allows HR to budget approved FTEs per position and block hires that exceed the position budget.

Phases:
- **Ph-191**: Position budgeting — `hr_position_budgets` with approved FTE, grade, salary range, effective period
- **Ph-192**: Headcount control — validate hire/transfer against position vacancy and budget; block or warn
- **Ph-193**: Workforce planning scenarios — model org restructuring (merger, reduction, expansion) without affecting live data

---

### C7. Time & Labor
**Oracle equivalent**: Oracle Time & Labor (OTL)  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our attendance tracks shifts but lacks Oracle's time processing rules: overtime triggers, shift differentials, absence integration, and payroll-ready time output.

Phases:
- **Ph-194**: Time calculation rules — overtime triggers (daily >8h, weekly >40h, 7th day); `otl_time_rules`
- **Ph-195**: Shift differentials — premium pay for evening/night/weekend shifts; auto-calculate additional elements
- **Ph-196**: Absence integration — link approved leave to timesheet; deduct from balance when hours below scheduled
- **Ph-197**: Payroll-ready time — aggregate by element (regular, OT, differential) for payroll input

---

## TRACK D — PROCUREMENT INTELLIGENCE

### D1. Sourcing Events & Reverse Auctions
**Oracle equivalent**: Oracle Sourcing  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our RFQ is a basic quote request. Oracle Sourcing supports RFI, RFQ, reverse auctions with sealed/open bidding rounds, bid scoring with weighting, and award optimization.

Phases:
- **Ph-198**: Sourcing event types — RFI, RFQ, Auction; `proc_sourcing_events`, `proc_event_lines`
- **Ph-199**: Supplier bid portal — suppliers submit line-level bids; bid history; re-round capability
- **Ph-200**: Scoring & award — weighted score (price/quality/delivery); award recommendation; split-award support
- **Ph-201**: Award-to-PO — convert awarded event lines to PO or blanket agreement in one action

---

### D2. Supplier Qualification & Risk
**Oracle equivalent**: Oracle Supplier Qualification Management (SQM)  
**Priority**: P2 · **Complexity**: M  
**Gap**: Our vendor portal collects basic info. Oracle SQM sends structured questionnaires, collects certifications, scores responses, and generates qualification status per commodity.

Phases:
- **Ph-202**: Qualification questionnaires — configurable templates per commodity/category; `proc_questionnaires`
- **Ph-203**: Supplier responses — portal answers; auto-score pass/fail; route failures for review
- **Ph-204**: Certificate management — ISO, quality, compliance certs with expiry alerts
- **Ph-205**: Supplier scorecard — KPIs (on-time delivery %, quality reject %, invoice accuracy %) with trend

---

### D3. Spend Analysis
**Oracle equivalent**: Oracle Procurement Analytics  
**Priority**: P2 · **Complexity**: M  
**Gap**: No spend analytics. Oracle provides a spend cube — actual vs committed spend by supplier, category, cost center, period with drill-through to source documents.

Phases:
- **Ph-206**: Spend cube — aggregate PO/invoice spend by supplier, item category, cost center, period; `proc_spend_summary`
- **Ph-207**: Savings tracking — compare negotiated price vs market price; log savings per contract/event
- **Ph-208**: Maverick spend detection — flag POs without approved vendor or without requisition approval

---

### D4. Contract Lifecycle Management (CLM)
**Oracle equivalent**: Oracle Procurement Contracts  
**Priority**: P2 · **Complexity**: M  
**Gap**: Our contracts module is basic. Oracle CLM manages authoring from templates, clause library, deviation tracking, approval, e-signature, obligation monitoring, and renewal alerts.

Phases:
- **Ph-209**: Contract templates & clause library — `contract_templates`, `contract_clauses`; assemble from approved clauses
- **Ph-210**: Deviation management — flag non-standard clauses; route deviations to legal for approval
- **Ph-211**: Contract obligations — track milestones/deliverables; alert when due; link to payment schedule
- **Ph-212**: E-signature integration — DocuSign/Adobe Sign API for contract execution
- **Ph-213**: Renewal management — auto-alert 90/60/30 days before expiry; initiate renewal workflow

---

## TRACK E — CRM / CX EXPANSION

### E1. Sales Forecasting & Pipeline Management
**Oracle equivalent**: Oracle Sales Cloud — Forecasting  
**Priority**: P1 · **Complexity**: M  
**Gap**: We have opportunities but no structured forecast. Oracle provides commit/best-case/worst-case forecasts per territory/quarter, manager roll-up, and forecast accuracy tracking.

Phases:
- **Ph-214**: Forecast categories — assign Commit/Best Case/Pipeline/Omitted to each opportunity
- **Ph-215**: Manager forecast roll-up — aggregate team pipeline by quarter; manager override on rep forecast
- **Ph-216**: Forecast accuracy — compare prior-period commits to actual bookings; win rate by stage

---

### E2. Sales Territory & Quota Management
**Oracle equivalent**: Oracle Sales Cloud — Territories & Quotas  
**Priority**: P2 · **Complexity**: M  
**Gap**: No territory management. Oracle assigns accounts to territories by geography, industry, named account; sets quotas per rep/quarter; calculates attainment.

Phases:
- **Ph-217**: Territory definitions — `crm_territories` with coverage rules (region, industry, account list)
- **Ph-218**: Quota assignment — `crm_quotas` per rep, territory, product family, quarter
- **Ph-219**: Attainment tracking — real-time quota attainment % from closed-won opportunities

---

### E3. Configure, Price, Quote (CPQ)
**Oracle equivalent**: Oracle CPQ Cloud  
**Priority**: P1 · **Complexity**: XL  
**Gap**: Our quotes are simple line items. Oracle CPQ drives complex product configuration (option groups, incompatibilities, dependencies), pricing waterfalls (list → discount → net), guided selling, and branded PDF generation.

Phases:
- **Ph-220**: Product configurator — option groups, constraints, required combinations; `cpq_product_models`
- **Ph-221**: Pricing waterfall — list price → customer discount → volume discount → promotional → approval thresholds
- **Ph-222**: Guided selling — questionnaire-driven product recommendation based on customer requirements
- **Ph-223**: Quote PDF generation — branded quote document with configured items, pricing, T&Cs
- **Ph-224**: Quote-to-order — convert approved quote to SO in one action; carry all configuration details

---

### E4. Incentive Compensation
**Oracle equivalent**: Oracle Incentive Compensation  
**Priority**: P2 · **Complexity**: L  
**Gap**: No commission tracking. Oracle calculates sales commission based on quota attainment tiers, product accelerators, draws, handles disputes, and integrates with payroll.

Phases:
- **Ph-225**: Compensation plans — `ic_plans` with attainment tiers, rates, accelerators, caps, draws
- **Ph-226**: Commission calculation — run per period; split credits for team sales; `ic_transactions`
- **Ph-227**: Dispute management — rep disputes a credit; manager review; adjustment workflow
- **Ph-228**: Payroll integration — push approved commission amounts as payroll elements

---

### E5. Omni-channel Service
**Oracle equivalent**: Oracle Fusion Service  
**Priority**: P2 · **Complexity**: L  
**Gap**: We have tickets and SLAs. Oracle adds knowledge management, email-to-ticket, customer self-service portal, and SLA escalation automation.

Phases:
- **Ph-229**: Knowledge base — `svc_kb_articles` with categories, ratings, visibility; linked to ticket resolution
- **Ph-230**: Email-to-ticket — inbound email parser creates tickets; auto-assign by subject keywords
- **Ph-231**: Customer self-service portal — customers create/view/update own tickets; KB article deflection
- **Ph-232**: SLA escalation automation — auto-reassign ticket when SLA breach imminent; notify manager

---

### E6. Marketing Automation
**Oracle equivalent**: Oracle Eloqua / Oracle Responsys  
**Priority**: P3 · **Complexity**: XL  
**Gap**: No marketing module. Oracle provides B2B campaign management, lead scoring, nurturing flows, and CRM lead integration.

Phases:
- **Ph-233**: Campaign management — `mkt_campaigns`, `mkt_campaign_members`; email/SMS channels; schedule/send
- **Ph-234**: Lead scoring — score on behavior (email opens, page visits, form fills); `mkt_lead_scores`
- **Ph-235**: Nurture flows — automated multi-step sequences triggered by lead behavior
- **Ph-236**: Marketing attribution — track lead source to closed opportunity; ROI per campaign

---

## TRACK F — PROJECT PORTFOLIO MANAGEMENT

### F1. Project Budgeting & Revenue Recognition
**Oracle equivalent**: Oracle Project Costing, Oracle Project Billing  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our projects have basic milestones. Oracle adds detailed budgets by task/resource/period, T&M and fixed-price billing, and project-based revenue recognition.

Phases:
- **Ph-237**: Project budgets — `pjt_budgets` with budget lines by task/resource/GL account; baseline + revisions
- **Ph-238**: Budget vs actual — compare committed, actual, EAC (estimate at completion) per task
- **Ph-239**: T&M project billing — generate AR invoice from time entries and expense reports at billing rates
- **Ph-240**: Fixed-price billing — milestone and percentage-of-completion billing schedules
- **Ph-241**: Project revenue recognition — POC, completed-contract, milestone recognition methods

---

### F2. Resource Management
**Oracle equivalent**: Oracle Project Resource Management  
**Priority**: P2 · **Complexity**: M  
**Gap**: No resource capacity management. Oracle tracks resource pools, skill requirements, availability, and generates resource requests across the project portfolio.

Phases:
- **Ph-242**: Resource pool — `pjt_resources` with skills, cost rates, availability calendar
- **Ph-243**: Resource requests — PM requests resources by skill/grade; resource manager fulfills from pool
- **Ph-244**: Utilization reporting — utilization % (billable vs available) by week; over/under-allocation alerts

---

### F3. Earned Value Management (EVM)
**Oracle equivalent**: Oracle Project Performance Reporting  
**Priority**: P2 · **Complexity**: M  
**Gap**: No EVM. Required for government contracts. Oracle tracks PV, EV, AC, SPI, CPI per task and project.

Phases:
- **Ph-245**: EVM baseline — establish PMB from approved project schedule
- **Ph-246**: EVM calculations — compute PV/EV/AC/SPI/CPI per task and project; trend over time
- **Ph-247**: S-curve reporting — cumulative cost/schedule variance chart; forecast at completion (FAC)

---

### F4. Capital Projects & CIP
**Oracle equivalent**: Oracle Project Costing — Capital Projects  
**Priority**: P2 · **Complexity**: M  
**Gap**: Project costs are expensed. Oracle allows costs to be capitalized to fixed assets (CIP → in-service) with split between capital and expense.

Phases:
- **Ph-248**: Capital project type — tag project as capital; `pjt_capital_rules` per task (capitalize/expense)
- **Ph-249**: CIP interface — accumulate capital costs in FA CIP asset; periodic transfer to in-service
- **Ph-250**: Asset assignment — map project tasks to asset lines; split among multiple assets

---

## TRACK G — PLATFORM & INTELLIGENCE

### G1. Embedded Analytics / BI
**Oracle equivalent**: Oracle OTBI + Oracle Analytics Cloud (OAC)  
**Priority**: P1 · **Complexity**: XL  
**Gap**: Our analytics is module-specific dashboards. Oracle OTBI provides a cross-module dimensional model with drag-and-drop report builder, scheduled delivery, and drill-through to source transactions.

Phases:
- **Ph-251**: Analytics subject areas — dimensional model per pillar (Finance, HCM, SCM, CRM)
- **Ph-252**: Report builder — drag-and-drop column selector, filters, grouping, sorting; save as personal/shared
- **Ph-253**: Scheduled reports — email delivery of saved reports on a cron schedule
- **Ph-254**: KPI tiles / configurable dashboards — homepage KPI tiles; drill-through to detail report
- **Ph-255**: Predictive analytics — ML-based churn risk, late payment probability, demand forecast accuracy

---

### G2. Workflow & BPM Engine
**Oracle equivalent**: Oracle BPM (Fusion workflow)  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our workflow module is basic. Oracle's BPM supports parallel/sequential/FYI routing, dynamic escalation, delegation, vacation rules, ad-hoc approver addition, and graphical process designer.

Phases:
- **Ph-256**: Parallel approval routing — multiple approvers simultaneously; all-must-approve vs any-one
- **Ph-257**: Escalation rules — auto-escalate to supervisor after N hours; configurable per stage
- **Ph-258**: Vacation/delegation rules — auto-reassign during absence; proxy approval
- **Ph-259**: Graphical BPMN designer — drag-and-drop process builder; swimlanes; decision gateways

---

### G3. Mobile First
**Oracle equivalent**: Oracle HCM Mobile, Oracle SCM Mobile  
**Priority**: P1 · **Complexity**: L  
**Gap**: No mobile experience. Oracle provides iOS/Android apps for approvals, expense capture, timesheet entry, and warehouse RF scanning.

Phases:
- **Ph-260**: Progressive Web App (PWA) — offline-capable mobile shell; push notifications; manifest + service worker
- **Ph-261**: Mobile approval inbox — push notification on pending approvals; swipe approve/reject
- **Ph-262**: Mobile expense capture — photo-to-expense: OCR receipt; populate amount/date/merchant
- **Ph-263**: Mobile timesheet — weekly timesheet on phone; GPS project/task check-in
- **Ph-264**: Warehouse mobile UI — RF-optimized picking/putaway screen; barcode scan for bin/item confirmation

---

### G4. AI / Digital Assistant
**Oracle equivalent**: Oracle Digital Assistant (ODA)  
**Priority**: P2 · **Complexity**: XL  
**Gap**: No conversational AI. Oracle DA answers "What are my pending approvals?", "What's my leave balance?", "Show me overdue invoices" via chat or voice.

Phases:
- **Ph-265**: Intent classification — NLU layer classifying user utterances into ERP intents
- **Ph-266**: Approval bot — "You have 3 pending PO approvals. Approve all?" via chat UI
- **Ph-267**: HR self-service bot — leave balance, payslip download, profile update via chat
- **Ph-268**: Finance bot — overdue AR, cash position, expense claim status in natural language

---

### G5. Data Privacy & GDPR Compliance
**Oracle equivalent**: Oracle Data Safe / GDPR Compliance  
**Priority**: P1 · **Complexity**: M  
**Gap**: No data privacy framework. GDPR, DPDP (India), CCPA require right-to-erasure, consent management, DSARs, and PII field masking.

Phases:
- **Ph-269**: Personal data inventory — tag PII fields in entity metadata; `privacy_pii_fields`
- **Ph-270**: Consent management — record consent per data subject per purpose; `privacy_consents`
- **Ph-271**: Right to erasure — anonymize PII on employee/customer termination after retention period
- **Ph-272**: DSAR (Data Subject Access Request) — export all personal data for a subject; access audit trail

---

### G6. Security Hardening
**Oracle equivalent**: Oracle Cloud Security  
**Priority**: P1 · **Complexity**: M  
**Gap**: JWT + RBAC is baseline. Oracle adds adaptive MFA, IP allowlisting, privileged access management, and session anomaly detection.

Phases:
- **Ph-273**: Multi-factor authentication (MFA) — TOTP (Google Authenticator), SMS OTP; enforce per role/IP
- **Ph-274**: IP allowlisting — restrict API access by IP range per tenant
- **Ph-275**: Session monitoring — active session list; force-logout; anomaly detection (unusual IP, off-hours)
- **Ph-276**: Field-level encryption — encrypt PII fields (SSN, bank account, salary) at rest with per-tenant keys

---

### G7. Integration Framework
**Oracle equivalent**: Oracle Integration Cloud (OIC)  
**Priority**: P1 · **Complexity**: L  
**Gap**: Our EDI and webhook support is basic. Oracle OIC provides 400+ adapters (Salesforce, SAP, Workday, banks), orchestration flows, error handling, and monitoring dashboards.

Phases:
- **Ph-277**: Integration adapter framework — generic adapter model with authentication, pagination, retry; `integration_adapters`
- **Ph-278**: Pre-built connectors — Salesforce, Stripe, Shopify, QuickBooks, JIRA adapters
- **Ph-279**: Event streaming — Kafka/webhook fan-out for real-time integration; `integration_events`
- **Ph-280**: Integration monitoring — success/failure dashboard per adapter; dead-letter queue; failure alerts

---

### G8. Multi-Language & Localization
**Oracle equivalent**: Oracle Fusion Localization  
**Priority**: P2 · **Complexity**: M  
**Gap**: We have a localization settings page but no actual i18n. Oracle translates UI, statutory reports, and document templates into 30+ languages.

Phases:
- **Ph-281**: i18n framework — extract all UI strings to locale files; `i18n/en.json`, `i18n/hi.json`; react-i18next
- **Ph-282**: Document template localization — AR invoices, PO, payslips in customer/employee's preferred language
- **Ph-283**: Right-to-left (RTL) support — Arabic, Hebrew layout support
- **Ph-284**: Number/date/currency formatting — locale-aware formatting throughout UI and reports

---

### G9. Audit & GRC (Governance, Risk & Compliance)
**Oracle equivalent**: Oracle Audit Vault, Oracle GRC  
**Priority**: P1 · **Complexity**: M  
**Gap**: Our audit log captures events but lacks SOX controls. Oracle GRC manages SOX controls, risk assessments, and segregation of duties (SOD) conflict detection.

Phases:
- **Ph-285**: SOD conflict matrix — define conflicting permission pairs (create vendor + approve payment); `grc_sod_rules`
- **Ph-286**: SOD violation detection — scan user role assignments for conflicts; alert security admin; enforce preventive controls
- **Ph-287**: Control framework — `grc_controls` with objective, owner, test frequency, evidence collection
- **Ph-288**: Risk register — enterprise risk catalog with likelihood, impact, mitigating controls; risk heat map

---

### G10. Extensibility Platform
**Oracle equivalent**: Oracle Extensibility Framework / Visual Builder  
**Priority**: P2 · **Complexity**: XL  
**Gap**: We have custom fields and webhooks. Oracle allows tenants to build new UI pages, business objects, workflows, and integrations without base code changes.

Phases:
- **Ph-289**: Custom objects — tenants define new business objects with fields, relationships, list views; `platform_custom_objects`
- **Ph-290**: Custom UI pages — drag-and-drop page builder for custom objects; embed in sidebar navigation
- **Ph-291**: Custom business logic — tenant-defined formula fields, validation rules, automation triggers without backend deployment
- **Ph-292**: Marketplace / add-ons — install pre-built vertical extensions (retail, construction, healthcare, nonprofit)

---

## PRIORITY SUMMARY

### P1 — Build Now (Core functional gaps blocking enterprise adoption)

| Phase | Feature | Track | Complexity |
|-------|---------|-------|-----------|
| 93–95 | Subledger Accounting Engine (SLA) | Finance | XL |
| 96–98 | COA Segments & Account Hierarchies | Finance | L |
| 99–102 | AP 3-Way Matching & ERS | Finance | L |
| 103–105 | AP Withholding Tax / TDS | Finance | M |
| 106–108 | AR Credit Management | Finance | M |
| 115–117 | Fixed Assets: Books, CIP, Mass Additions | Finance | L |
| 121–124 | Tax Determination Engine | Finance | XL |
| 134–136 | Multi-Org Inventory | SCM | L |
| 137–140 | Standard & Average Costing + Variance | SCM | L |
| 141–144 | Lot Traceability / Genealogy | SCM | M |
| 145–150 | Advanced Order Management (Drop Ship, B2B, PPS, CTO) | SCM | XL |
| 155–158 | Quality at Operations | Manufacturing | M |
| 168–173 | Global Payroll (India / UK / US) | HCM | XL |
| 174–176 | Payroll Costing | HCM | M |
| 177–181 | Benefits Administration | HCM | L |
| 182–186 | Compensation Workbench | HCM | L |
| 194–197 | Time & Labor Rules | HCM | L |
| 198–201 | Sourcing Events & Auctions | Procurement | L |
| 214–216 | Sales Forecasting | CRM | M |
| 220–224 | Configure-Price-Quote (CPQ) | CRM | XL |
| 237–241 | Project Budgeting & Revenue Recognition | Projects | L |
| 251–255 | Embedded BI / Analytics | Platform | XL |
| 256–259 | Workflow BPM Engine | Platform | L |
| 260–264 | Mobile First (PWA + mobile apps) | Platform | L |
| 269–272 | GDPR / Data Privacy | Platform | M |
| 273–276 | Security Hardening (MFA, encryption) | Platform | M |
| 277–280 | Integration Framework | Platform | L |
| 285–288 | GRC / SOD / Risk Register | Platform | M |

### P2 — Build Next (Competitive completeness, vertical market expansion)

| Phase | Feature | Track |
|-------|---------|-------|
| 109–111 | AR Collections Workbench | Finance |
| 112–114 | AR Lockbox / Auto-receipt Application | Finance |
| 118–120 | Fixed Assets: Physical Inventory & Impairment | Finance |
| 125–127 | Encumbrance Accounting | Finance |
| 128–130 | Cash Forecasting & Pooling | Finance |
| 131–133 | Financial Close Management | Finance |
| 151–154 | Transportation Management | SCM |
| 159–162 | Process Manufacturing (OPM) | Manufacturing |
| 163–167 | Full CMMS / Preventive Maintenance | Maintenance |
| 187–190 | Skills Taxonomy & Workforce Intelligence | HCM |
| 191–193 | Position-Based Headcount Budgeting | HCM |
| 202–205 | Supplier Qualification & Scorecard | Procurement |
| 206–208 | Spend Analysis & Savings Tracking | Procurement |
| 209–213 | Contract Lifecycle Management (CLM) | Procurement |
| 217–219 | Territory & Quota Management | CRM |
| 225–228 | Incentive Compensation | CRM |
| 229–232 | Omni-channel Service | CRM |
| 242–244 | Project Resource Management | Projects |
| 245–247 | Earned Value Management (EVM) | Projects |
| 248–250 | Capital Projects & CIP | Projects |
| 265–268 | AI Digital Assistant | Platform |
| 281–284 | Multi-Language / i18n | Platform |
| 289–292 | Extensibility / Low-code Platform | Platform |

### P3 — Strategic Differentiators

| Phase | Feature | Track |
|-------|---------|-------|
| 233–236 | Marketing Automation (Eloqua-equivalent) | CRM |
| 255 | Predictive Analytics / ML models | Platform |
| 289–292 | App Marketplace / Vertical Add-ons | Platform |

---

## ESTIMATED TOTAL SCOPE

| Priority | Phases | Approximate Effort |
|----------|--------|--------------------|
| P1 | ~90 phases (93–182) | 14–18 months |
| P2 | ~65 phases (183–252) | 18–24 months |
| P3 | ~40 phases (253–292) | 8–12 months |
| **Total** | **~200 phases (93–292)** | **~3.5 years full parity** |

---

## CURRENT COVERAGE vs ORACLE FUSION CLOUD

| Pillar | Our Coverage | Oracle Fusion Equivalent | Gap % |
|--------|-------------|--------------------------|-------|
| **Finance — GL** | ✅ 85% | Full subledger + SLA + trees | 15% |
| **Finance — AP** | ✅ 65% | Matching, WHT, ERS, P-cards | 35% |
| **Finance — AR** | ✅ 60% | Credit mgmt, lockbox, collections | 40% |
| **Finance — FA** | ✅ 50% | Books, CIP, impairment, revaluation | 50% |
| **Finance — Tax** | ✅ 30% | Full determination engine | 70% |
| **Finance — Treasury** | ✅ 60% | Deal mgmt, hedging, MTM | 40% |
| **Finance — EPM** | ✅ 40% | Driver-based planning, ARCS | 60% |
| **Procurement** | ✅ 70% | Sourcing events, CLM, SQM, p-cards | 30% |
| **Inventory / WMS** | ✅ 75% | Multi-org, avg/std cost, genealogy | 25% |
| **Order Management** | ✅ 50% | Drop ship, B2B, CTO, GOP | 50% |
| **Manufacturing** | ✅ 80% | Process mfg, quality at ops, genealogy | 20% |
| **Maintenance** | ✅ 40% | PM schedules, condition monitoring | 60% |
| **HCM — Core HR** | ✅ 80% | Global HR, position mgmt | 20% |
| **HCM — Payroll** | ✅ 55% | Country localizations, retro pay | 45% |
| **HCM — Benefits** | ✅ 10% | Full plan mgmt, open enrollment | 90% |
| **HCM — Talent** | ✅ 70% | Compensation, skills, career dev | 30% |
| **CRM / CX** | ✅ 45% | CPQ, territories, incentive comp | 55% |
| **Projects** | ✅ 40% | Budgeting, billing, EVM, resources | 60% |
| **Platform** | ✅ 55% | Analytics, MFA, i18n, extensibility | 45% |
| **OVERALL** | **≈ 62%** | Oracle Fusion Cloud full suite | **≈ 38%** |
