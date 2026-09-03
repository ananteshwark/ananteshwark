# SAP S/4HANA — Low-Level Feature Gap Analysis (v2)

_Evidence-based comparison of this ERP against SAP S/4HANA, based on source inspection of entities + service logic across all modules. Updated after Phases 69–78._

Legend: ✅ Implemented · 🟡 Present but shallow · ❌ Missing

---

## FI — Financial Accounting

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| GL / journal posting, chart of accounts | ✅ | `gl/gl.service.ts` — full DRAFT/POST/REVERSE lifecycle, balance validation, sequential numbering, period enforcement |
| AP / AR sub-ledgers | ✅ | `ap/ap.service.ts`, `ar/ar.service.ts` — vendor/customer bills & invoices, payment allocation, multi-currency |
| Bank reconciliation + statement import | ✅ | `bank/bank.service.ts` — statement balance vs book balance, transaction matching; import via `bank-import.service.ts` |
| Multi-currency + FX revaluation | ✅ | `currency/currency.service.ts` — mark-to-market open items, FX gain/loss JE posting |
| Fixed assets + depreciation (SLM/WDV/DB) | ✅ | `fixed-assets/fixed-assets.service.ts` — monthly computation, run+post lifecycle, disposal |
| Asset parallel depreciation areas | ✅ | Phase 71 — multiple areas per asset with independent method/life/GL accounts per ledger |
| Tax incl. withholding components | 🟡 | `tax/tax.service.ts` — multi-component tax codes exist; **no separate WHT ledger posting, no WHT crediting rules** |
| Fiscal periods + financial reports (TB/P&L/BS) | ✅ | `gl/gl.service.ts` — period open/close/lock enforcement; trial balance, P&L, BS, cash flow, GL detail, ageing |
| Document splitting (segment/profit-center balancing) | ✅ | Phase 72 — `DocumentSplittingRule`, `applySplitting()` in `gl.service.ts`; segment trial balance |
| Parallel ledgers / ledger groups | 🟡 | `ledgerCode` field on `JournalEntry` (Phase 71); **no ledger group hierarchy, no group-level reconciliation matrix, no ledger-filtered report set** |
| Special purpose ledger (SPL) | ❌ | No SPL entity or posting logic |
| Recurring journals | ✅ | Phase 76 — `RecurringJournal` entity, frequency-based templates, auto-advance `nextRunDate` |
| Accrual engine + auto-reversal | ✅ | Phase 76 — `AccrualConfig`, monthly posting, auto-reversal to next period |
| Period-close cockpit | ✅ | Phase 76 — orchestrated checklist (draft entries / recurring / accruals / period status / canClose flag) |
| Cash discount / tiered payment terms (2/10-net-30) | 🟡 | `paymentTerms` is a flat net-days integer; **no tiered discount (2/10 net 30), no early-payment discount GL posting** |
| Dunning | ✅ | `dunning/dunning.service.ts` — levels by overdue days, letter generation, customer grouping |
| Consolidation (intercompany elimination) | 🟡 | `consolidation/consolidation.service.ts` — member consolidation, IC reconciliation summary; **no current-rate vs temporal translation, no minority interest, no equity method, no elimination matrix** |
| Validation / substitution rules | ❌ | No rules engine for account combination validation or automatic account substitution |

## CO — Controlling

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Cost centers + profit centers | ✅ | `gl/gl.service.ts` (cost centers), `controlling/controlling.service.ts` (profit centers with hierarchy) |
| Assessment / distribution cycles | ✅ | `controlling/controlling.service.ts` — ASSESSMENT/DISTRIBUTION by PERCENTAGE/FIXED/SKF, GL posting of allocations |
| Budget vs actual + commitment accounting | ✅ | `budget/budget.service.ts` — open-PO commitments, posted GL actuals, available/utilization/variance |
| Internal orders | ✅ | Phase 74 — `InternalOrder` entity (OVERHEAD/INVESTMENT/ACCRUAL class), status lifecycle, settlement via GL |
| Activity types + activity-based costing | ❌ | No activity type master, activity rates, or ABC allocation; cost allocation uses cost-center totals only |
| BOM standard-cost roll-up (product costing) | ✅ | Phase 70 — `rollupBomMaterialCost()` recursive (depth-10), routing labor, `CostingRun` entity, updates `item.standardCost` |
| CO-PA profitability analysis | ✅ | Phase 74 — `controlling/controlling.service.ts` groups by profit center; revenue/expenses/gross-profit P&L by segment |
| Overhead costing sheet | ❌ | No overhead master record, cost pool hierarchy, or overhead surcharge calculation |

## MM — Materials Management

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Vendor master + purchasing info records | ✅ | `procurement/info-record/` — price, lead time, min-order qty, validity dates |
| PR → RFQ → PO → GRN → 3-way match → invoice | ✅ | Full S2P including tolerance policy (Phase 34), blocked invoice status |
| Outline agreements | ✅ | `procurement/outline-agreement/` — VALUE_CONTRACT/QUANTITY_CONTRACT, releasedValue/releasedQuantity |
| Service entry sheets | ✅ | `procurement/service-entry/` — draft/submit/approve workflow, GR/IR on approval |
| Returns to vendor / debit note | ✅ | `procurement/returns/` — stock reversal, debit note amount, inventory integration |
| Approval matrix + delegation | ✅ | `doa/doa.service.ts` — DOA rules by document type and amount tier |
| Inventory valuation: FIFO | ✅ | Phase 69 — `fifo-layer.entity`, `consumeFifoLayers()` dequeues oldest-first |
| Inventory valuation: moving average | ✅ | `inventoryService.receiveStock()` — WAC formula on each receipt |
| Inventory valuation: standard cost | ✅ | Phase 69 — PPV = (actual − standard) × qty posted on receipt |
| Subcontracting | ✅ | Phase 73 — `subcontract-order.entity`, component issue + finished goods receipt with cost rollup |
| Consignment stock (vendor-owned) | ✅ | Phase 73 — `consignment-stock.entity`, consume/return, FULLY_CONSUMED status |
| Stock transport orders (STO) | ✅ | Phase 73 — `stock-transfer-order.entity`, FIFO layer migration on transfer |
| GR/IR clearing account | 🟡 | `grir/grir.service.ts` referenced; GL posting in GRN and service-entry approval is **best-effort (try-catch, non-blocking)** — not transactional |
| Source list / quota arrangement / auto source determination | ❌ | No source list, vendor ranking, or quota percentage entity |
| Batch management + FEFO determination | 🟡 | `batch-characteristic.entity` + `wms.service.fefoPickSuggestion()` returns ordered lots; **no automatic batch determination or FEFO-driven picking task generation** |
| Split valuation | ❌ | No valuation pool concept (e.g., split by plant or procurement type) |

## SD — Sales & Distribution

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Quote → order → delivery → invoice | ✅ | `sales.service.ts`, `delivery.service.ts` — full flow; goods issue calls `inventoryService.issueStock()` |
| Pricing conditions engine | ✅ | `pricing.service.ts` — BASE_PRICE/DISCOUNT_%/SURCHARGE; specificity rank; date ranges; min/max qty |
| Credit management | ✅ | `credit.service.ts` — NONE/WARNING/BLOCKED; open AR + confirmed SOs as exposure |
| ATP (available-to-promise) | ✅ | `atp.service.ts` — on-hand minus committed; commitForItem/releaseForItem |
| Returns + credit memos | ✅ | `returns-credit.service.ts` — return receipt restocks inventory; credit note applies to AR |
| Billing plans (milestone) | ✅ | Phase 75 — `billing-plans.service.ts` — milestones with %, status PENDING/BILLED/PAID |
| Billing plans (periodic / auto-schedule) | 🟡 | `planType=PERIODIC` enum exists; **no interval scheduler or auto-invoice generation** |
| Rebate agreements + accrual + settlement | ✅ | Phase 75 — `rebate.service.ts` — tiered rates, per-order accrual, simulate, settle |
| Rebate GL posting on settlement | 🟡 | `creditNoteAccountId` field present; **no GL journal entry created on settlement** |
| Output / message determination | ❌ | No condition-based document output framework (print forms, delivery note templates, EDI mapping per document type) |
| Variant configuration (configurable products) | ❌ | No BOM-to-order variant selection or configurable item logic |
| Consignment sales | ❌ | Consignment stock exists in inventory; **not integrated into sales order workflow** |
| Backorder rescheduling | ❌ | No backorder split or automatic date-rescheduling on partial availability |
| Intercompany sales (IC markup, transfer pricing) | ❌ | `ic-transaction.entity` exists; **not wired into sales order flow; no IC pricing or contra-account posting** |
| Service tickets + SLA | ✅ | `crm/service-ticket.service.ts` — SLA response/resolution from policy, breach tracking, dashboard |

## PP — Production Planning

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| BOM (incl. phantom BOMs) | ✅ | `manufacturing/entities/bom.entity` — BomLine with scrapPct, isPhantom, subBomId |
| Work centers | ✅ | `work-center.entity` — capacityPerHour, costPerHour, capacityMinutesPerDay, efficiencyPercent |
| Routings + operations | ✅ | `routing.entity` + `routing-operation.entity` — sequence, setupMinutes, runMinutesPerUnit, yieldPercent |
| Production orders + confirmation | ✅ | `production-order.entity` — full lifecycle; `confirmOperation()` accumulates labor cost |
| MRP | ✅ | `mrp.service.ts` — net requirements from open SOs + reorder points; planned orders; `convertPlannedOrder()` |
| Order costing: WIP, variance, settlement | ✅ | Phase 48 — `wipBalance`, material/labor variance; `settleOrder()` nulls WIP |
| Settlement GL posting (transactional) | 🟡 | `completeOrder()` has **best-effort (try-catch) GL call** — not transactional; settlement can silently lose GL entry |
| Finite capacity scheduling | ✅ | Phase 78 — `fcs.service.ts` — day-based scheduling with capacity leveling, multi-WC routing |
| Capacity load reporting + overload detection | ✅ | `fcs.getCapacityLoad()` — utilizationPct, overloaded flag per day |
| Repetitive manufacturing / KANBAN | ❌ | Discrete orders only |
| Co-products / by-products | ❌ | Single finished item per production order |
| Engineering change management (ECN/ECO) | ❌ | No ECN/ECO entity, no BOM effective-date versioning workflow |

## QM — Quality Management

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Inspection plans + lots + results + characteristics | ✅ | `quality/` — InspectionPlan, InspectionLot, characteristics with limits, PASS/FAIL verdict |
| Usage decision (Accept/Reject/Conditional) | ✅ | `qm-results.service.ts:setUsageDecision()` — auto-creates NCR on REJECT |
| Non-conformance (NCR) | ✅ | `quality.service.ts:createNcr()` — severity, root cause, corrective/preventive actions |
| Incoming (GRN-tied) + in-process inspection | ✅ | `LotReferenceType.GRN` / `PRODUCTION`; plan drives type |
| Periodic inspection scheduling | 🟡 | `InspectionType.PERIODIC` defined; **no recurrence interval or auto-lot generation** |
| Vendor quality scoring / quality notifications | ❌ | No supplier performance dashboard, AQL-based decisions, or quality notification entity |
| Quality certificates (COC, incoming/outgoing) | ❌ | No certificate entity or generation logic |
| SPC / control charts / sampling procedures | ❌ | No UCL/LCL, no AQL/LTPD sampling plans, no trend analysis |
| Stability studies | ❌ | No shelf-life or temperature-dependent pass/fail tracking |
| Calibration management | ❌ | No instrument master, calibration schedule, due-date tracking, or cert linking |

## PM — Plant Maintenance

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Equipment master | ✅ | `equipment.entity` — manufacturer, model, serial, status lifecycle |
| Functional locations (hierarchical) | ✅ | `functional-location.entity` — parent_id tree, structure indicator |
| Maintenance plans (time-based + counter-based) | ✅ | Phase 22/57 — `maintenance-plan.entity` COUNTER_BASED / TIME_BASED; getDuePlans() query |
| Counter readings / odometer | ✅ | `counter-reading.entity` — reading by counterType and date |
| Maintenance orders (PREV/BREAKDOWN/CORRECTIVE) | ✅ | Full lifecycle; breakdown notification → auto MO creation |
| Preventive MO auto-generation from plans | 🟡 | `getDuePlans()` is query-only; **no scheduler or job that actually creates orders on due date** |
| Maintenance task lists (reusable templates) | 🟡 | `MaintenancePlan.tasks` is JSONB blob; **no reusable task template entity or multi-counter strategy** |
| Maintenance strategy plans | ❌ | No multi-counter strategy, no RCM (Reliability-Centered Maintenance) framework |
| Refurbishment / rebuild orders | ❌ | No refurbishment workflow or rebuild part tracking |
| Warranty management | ❌ | No warranty period, expiration alerts, or claim-to-MO linking |
| Serial / equipment history (MTBF/MTTR) | 🟡 | Serial stored in Equipment; **no movement log, no failure history rollup, no MTBF/MTTR analytics** |

## HCM — Human Capital Management

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Employee master | ✅ | `hr/employees/entities/employee.entity` — full identity, addresses, banking, employment details |
| Org structure (admin-configurable levels) | ✅ | `org-level-config.entity` — 7 configurable levels with mandatory/optional flags |
| Position management + headcount | ✅ | `position.entity` — code, status, headcount tracking, hierarchy |
| Attendance / absence | ✅ | `attendance-record.entity` + shift assignments |
| Leave management (accrual + balances) | ✅ | `hr/leave/` — accrual methods, leave types, balance tracking, application workflow |
| Timesheets | ✅ | `timesheet.entity` — weekly basis, status workflow |
| Time evaluation engine | ✅ | `time-evaluation-rule.entity` — late arrival, overtime, absence, comp-off rules with thresholds |
| Shift planning / scheduling | ✅ | `shift.entity` + shift-assignment — night shift, grace minutes, working time calc |
| Dependents / nominees | ✅ | `dependent.entity` + `nominee.entity` — gratuity/PF allocation % |
| Exit management | ✅ | `hr/exits/` — exit checklist (IT/Finance/HR/Manager NOC), FnF settlement |
| Garnishments / court-order deductions | ❌ | No garnishment entity or court-order workflow |
| Off-cycle / mid-period payroll actions | 🟡 | `payroll-run.entity` supports OFF_CYCLE/BONUS/ARREARS run types; **workflow incomplete** |
| ESS / MSS portal (self-service) | 🟡 | Backend APIs present; **no dedicated self-service leave/payslip/manager-approval portal UI** |

## Payroll

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Pay components (earnings/deductions/reimbursements) | ✅ | `pay-component.entity` — 4 types, calc methods (fixed/% /formula/slab) |
| Payroll runs + payslips | ✅ | Full run lifecycle; `payslip.entity` with line items, gross/net |
| Retroactive payroll | ✅ | `arrears-record.entity` — period ranges, pending/applied/cancelled |
| Gratuity | ✅ | `gratuity-settlement.entity` — years-of-service calc, approval workflow |
| India statutory (PF/ESI/PT/TDS/Form 16) | ✅ | `payroll/statutory/` — full India pack, Form 16 generation |
| US payroll (federal/state tax brackets, FICA) | 🟡 | `localization/us/us-statutory.service.ts` — 2024 federal brackets, CA state, FICA/Medicare/FUTA; **no W-2 / 1099 form generation** |
| UAE statutory (WPS / EOSB) | 🟡 | `localization/ae/ae-statutory.service.ts` exists; **WPS file export and EOSB settlement workflow not confirmed complete** |
| Bank file export (NEFT/RTGS/ACH/EFT) | 🟡 | Finance payment-run module handles vendor payments; **no payroll-specific bank file format export** |
| Employee loans / salary advances | ❌ | No dedicated employee loan or advance-deduction entity in payroll |
| Off-cycle runs (end-to-end) | 🟡 | Run type enum present; workflow for approvals + GL posting gaps remain |
| Global statutory packs (UK/EU/SG/AU) | ❌ | Only India, US, UAE localized |

## Talent Management

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| ATS (applicant tracking system) | ✅ | `talent/ats/` — job postings, applicants, interviews, offers, hire workflow |
| Onboarding workflows | ✅ | `talent/onboarding/` — templates, task checklists, completion % |
| L&D (courses, enrollments, skill matrix) | ✅ | `learning/entities/course.entity` — internal/external/online courses, enrollments |
| OKRs | ✅ | `goals/entities/okr-cycle.entity` — cycles, objectives, key results |
| Performance reviews + appraisals + calibration | ✅ | `talent/performance/` — cycles, self/manager forms, calibration sessions |
| Succession planning | ✅ | `talent/succession/` — criticality, successor candidates |
| LMS depth (SCORM / certifications / learning paths) | 🟡 | Course + enrollment only; **no SCORM compliance, no certification tracking, no learning paths, no content delivery** |

## Benefits

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Plan enrollment | ✅ | `benefit-enrollment.entity` — active/terminated, enrollment dates |
| Benefit types (health/dental/vision/life/retirement) | ✅ | `benefit-plan.entity` — full type enum |
| Merit cycles + merit allocation | ✅ | `merit-cycle.entity` + merit-allocation with approval workflow |
| Salary bands | ✅ | `salary-band.entity` — grade/level/job family, min/mid/max, effective dates |
| What-if comp planning / total rewards statement | ❌ | No scenario modeling or annual compensation statement generation |

## Platform / Cross-cutting

| SAP capability | Status | Evidence / Gap |
|---|---|---|
| Multi-tenant (RLS on all entities) | ✅ | `tenants/` + `tenant_id` on all entities |
| RBAC / permission matrix | ✅ | `rbac/` — system + custom roles, permission matrix |
| Workflow engine | ✅ | `workflow/` — multi-step definitions, instance state, approval routing |
| Audit trail | ✅ | `audit/entities/audit-log.entity` — immutable diffs |
| SSO (SAML/OIDC/OAuth2) | ✅ | `platform/sso/sso.service.ts` — provider entity, attribute mapping |
| GRC / SOD rules | ✅ | `platform/entities/sod-rule.entity` — automated SoD check on role assignment |
| Data retention / archiving | ✅ | `platform/entities/data-retention-policy.entity` — per-entity-type policy |
| Public API + webhooks | ✅ | `platform/webhooks/` — 16 event types, HMAC signing, retry, delivery tracking |
| EDI integration (X12 850/855/856/810) | ✅ | `platform/edi/` — X12 parser, trading partner config, transaction log |
| Custom fields | ✅ | `platform/custom-fields/` — TEXT/NUMBER/DATE/DROPDOWN/CHECKBOX/MULTI_SELECT |
| i18n / multi-language | ✅ | `localization/` + i18next on frontend |
| PWA / mobile | ✅ | Vite PWA plugin, offline support, install prompt |
| DMS / document attachments | ✅ | `dms/entities/attachment.entity` |
| Global cross-entity search | ✅ | `search/search.service.ts` — employees, vendors, invoices, etc. |
| Analytics / report builder / KPIs | ✅ | `analytics/` — SQL-based report definitions, KPI definitions, scheduled reports |
| Approval delegation | ✅ | `delegation/` — date-range delegation, active/revoked |
| Barcode / QR scanning | ✅ | `platform/qr/qr.service.ts` — entity-type/ID QR generation |
| Notifications (email + in-app) | ✅ | `notifications/` + email template service |
| Rate limiting | 🟡 | `@nestjs/throttler` installed; **no per-tenant or per-endpoint rate limiting configured** |
| Driver-based planning / what-if scenarios | ❌ | No scenario modeling, sensitivity analysis, or driver-based budget projection |
| Consolidation: currency translation methods | ❌ | No current-rate vs temporal-rate selection; single reporting currency only |
| Consolidation: minority interest / equity method | ❌ | No ownership % or minority interest entity |

---

## Priority recommendations — highest ERP-correctness impact first

| # | Gap | Priority |
|---|---|---|
| 1 | **Activity types + overhead costing sheet** — no activity rates means PP labor costing is estimation-only | P1 |
| 2 | **GR/IR + production order settlement as transactional (blocking) GL calls** — silent failures corrupt stock valuation and COGS | P1 |
| 3 | **Payroll bank file export** (NEFT/RTGS/ACH/EFT) — payroll runs can't disburse without bank file | P1 |
| 4 | **Parallel ledgers — ledger group hierarchy + group reconciliation** — required for IFRS + local GAAP dual reporting | P1 |
| 5 | **Source list + quota arrangement + auto source determination** — missing automates procurement bottleneck | P2 |
| 6 | **Tiered cash discounts** (2/10 net 30) + early-payment GL posting | P2 |
| 7 | **Intercompany sales + transfer pricing** — IC transaction entity exists but not wired to SO/billing | P2 |
| 8 | **PM auto-scheduling** — getDuePlans() is query-only; no MO generation job | P2 |
| 9 | **PM warranty + refurbishment + MTBF/MTTR** | P2 |
| 10 | **QM vendor quality scoring + quality certificates + calibration** | P2 |
| 11 | **Garnishments + employee loans/advances** | P2 |
| 12 | **US W-2/1099 + UAE WPS file export** — statutory form generation | P2 |
| 13 | **SPC / control charts / AQL sampling** | P3 |
| 14 | **Wave management + handling units (WMS)** | P3 |
| 15 | **SD output/message determination** | P3 |
| 16 | **Variant configuration** (configurable products) | P3 |
| 17 | **LMS depth** (SCORM, certifications, learning paths) | P3 |
| 18 | **Driver-based planning + what-if scenarios** | P3 |
| 19 | **Global statutory packs** (UK / EU / SG / AU) | P3 |
| 20 | **Consolidation depth** (currency translation, minority interest, equity method) | P3 |
| 21 | **Validation/substitution rules** (account combination engine) | P3 |
| 22 | **Engineering change management** (ECN/ECO) | P3 |
| 23 | **KANBAN / repetitive manufacturing** | P4 |
| 24 | **Co-products / by-products** in production orders | P4 |
| 25 | **Variant configuration** (configurable products / ATO) | P4 |
