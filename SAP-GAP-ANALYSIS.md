# SAP S/4HANA — Low-Level Feature Gap Analysis

_Comparison of this ERP against SAP S/4HANA module by module, based on source inspection (entities + service logic), not roadmap claims._

Legend: ✅ Implemented · 🟡 Present but shallow / not detailed enough · ❌ Missing

---

## FI — Financial Accounting

| SAP capability | Status | Notes |
|---|---|---|
| GL, journal posting, chart of accounts | ✅ | `journal-entry`/`journal-line`, post/reverse |
| AP / AR sub-ledgers | ✅ | vendor/customer, bills, invoices, payments |
| Bank & reconciliation, statement import | ✅ | `bank-reconciliation`, `bank-statement-import` |
| Multi-currency + exchange rates | ✅ | `exchange-rate`, FX **revaluation** of open items posts gain/loss JEs |
| Fixed assets, depreciation, disposal | ✅ | SLM / WDV / DB methods, GL postings |
| Tax incl. withholding | ✅ | `tax-code` with WITHHOLDING type |
| Fiscal year / periods, financial reports | ✅ | TB, P&L, BS, cash flow, GL detail; AP/AR ageing |
| Consolidation, intercompany | 🟡 | Basic consolidation run + IC reconciliation; **no currency-translation methods (current vs temporal), no minority interest, no equity-method, no elimination matrix** |
| **Document splitting** (segment / profit-center balancing) | ❌ | No splitting characteristics — can't produce segment-level balanced BS |
| **Parallel ledgers / ledger groups** (IFRS + local GAAP in parallel) | ❌ | Single ledger only; no ledger dimension on journals |
| **Special purpose ledger** | ❌ | — |
| **Asset parallel depreciation areas** (book vs tax vs IFRS) | ❌ | One method per asset; SAP runs N depreciation areas simultaneously |
| **Recurring journals / accrual engine** | ❌ | No recurring-document template or reversal automation |
| **Period-end closing cockpit** | ❌ | Periods open/close exist, but no orchestrated close checklist |
| **Cash discount terms / payment-term tiers** | 🟡 | Payment terms are net-days only; no 2/10-net-30 discount logic |

## CO — Controlling

| SAP capability | Status | Notes |
|---|---|---|
| Cost centers, profit centers | ✅ | |
| Assessment / distribution cycles | ✅ | `cost-allocation-cycle` ASSESSMENT/DISTRIBUTION |
| Budget vs actual + commitment accounting | ✅ | |
| **Internal orders** (real/statistical) | ❌ | No internal-order object for event/project cost capture |
| **Activity types & activity-based costing** | ❌ | No activity rates; allocations are amount/percent only |
| **Product costing** (cost estimate, standard-cost roll-up from BOM) | ❌ | Manufacturing uses item `standardCost` directly; no BOM cost roll-up / costing run |
| **Profitability Analysis (CO-PA)** | ❌ | No profitability segments / contribution-margin reporting |
| **Overhead costing sheet** | ❌ | No overhead surcharge calc in production costing |

## MM — Materials Management

| SAP capability | Status | Notes |
|---|---|---|
| Vendor master + info records | ✅ | enriched vendor, `purchasing-info-record` |
| PR → RFQ → PO → GRN → 3-way match → invoice | ✅ | full S2P incl. tolerance/matching controls |
| Outline agreements, service entry sheets | ✅ | |
| Returns to vendor / debit note | ✅ | |
| Approval matrix + delegation | ✅ | |
| Inventory valuation | 🟡 | **Only moving-average actually computed**; `valuationMethod` field allows FIFO/LIFO/STANDARD but none are implemented |
| **Subcontracting** (provide components, receive finished) | ❌ | No subcontracting PO / component consumption |
| **Consignment** (vendor-owned stock, settlement) | ❌ | — |
| **Stock transport orders** (inter-plant/inter-company STO) | ❌ | Stock transfer is intra-warehouse only |
| **Source list / quota arrangement / source determination** | ❌ | Info records exist but no auto source determination |
| **Batch management & batch determination** | ❌ | Lot/serial + expiry exist, but no batch master, batch characteristics, or FEFO determination |
| **Split valuation** (same material, different valuation) | ❌ | — |

## SD — Sales & Distribution

| SAP capability | Status | Notes |
|---|---|---|
| Quote → order → delivery → invoice | ✅ | |
| Pricing conditions engine | ✅ | `pricing-condition`, `price-list` |
| Credit management | ✅ | |
| ATP (available-to-promise) | ✅ | |
| Returns & credit memos | ✅ | |
| **Rebate / settlement management** | ❌ | No rebate agreements / accruals / settlement runs |
| **Billing plans** (milestone / periodic billing) | ❌ | One-shot invoicing only |
| **Output / message determination** | ❌ | No condition-based document output framework |
| **Variant configuration** (configurable products) | ❌ | — |
| **Consignment sales / backorder rescheduling** | 🟡 | ATP exists; no consignment fill-up/issue, no mass backorder reschedule |

## PP — Production Planning

| SAP capability | Status | Notes |
|---|---|---|
| BOM, work centers, routings | ✅ | |
| Production orders + confirmation | ✅ | |
| MRP | ✅ | `planned-order`, MRP run |
| Order costing (material/labor variance, WIP) | ✅ | WIP balance, material & labor variance, settlement to FG |
| Capacity planning | 🟡 | Load% per work center (infinite); **no finite scheduling / capacity leveling / dispatch** |
| **Standard cost roll-up from BOM** | ❌ | (see CO product costing) |
| **Repetitive manufacturing / KANBAN** | ❌ | Discrete orders only |
| **Co-products / by-products** | ❌ | Single output per order |

## QM — Quality Management

| SAP capability | Status | Notes |
|---|---|---|
| Inspection plans, lots, results, characteristics | ✅ | |
| Non-conformance | ✅ | |
| **Quality certificates (incoming/outgoing)** | ❌ | |
| **Vendor quality scoring / quality notifications** | ❌ | NC exists but no vendor scorecard |
| **SPC / control charts, sampling procedures** | ❌ | Manual results only |

## PM — Plant Maintenance

| SAP capability | Status | Notes |
|---|---|---|
| Equipment, functional locations | ✅ | |
| Maintenance plans, counter-based, breakdown notifications, work orders | ✅ | |
| **Maintenance task lists / strategy plans (multi-counter)** | 🟡 | Single-trigger plans; no reusable task lists or strategy packages |
| **Refurbishment / warranty / serial history** | ❌ | |

## HCM / Payroll / Talent

| SAP capability | Status | Notes |
|---|---|---|
| Employee master, org (admin-configurable levels), positions | ✅ | very detailed |
| Attendance, leave, timesheets, time evaluation | ✅ | rule-based time evaluation engine |
| Exit, dependents/nominees, ESS/MSS | ✅ | |
| Payroll: components, runs, payslips, bank files, retro, gratuity | ✅ | |
| Statutory localization | 🟡 | **India (PF/ESI/PT/TDS/Form 16) deep; US + UAE packs**; no global payroll for other geographies |
| Benefits, merit/comp cycles, salary bands | ✅ | |
| Talent: ATS, onboarding, L&D, OKR, reviews, succession, calibration | ✅ | |
| **Garnishments / off-cycle / mid-period actions** | ❌ | |
| **LMS depth (content, SCORM, certifications)** | 🟡 | course + enrollment only |

## Cross-cutting / Platform

| SAP capability | Status | Notes |
|---|---|---|
| Multi-tenant, RBAC, workflow, audit | ✅ | |
| SSO (SAML/OIDC), GRC/SOD, data retention | ✅ | `sod-rule`/`sod-violation`, `data-retention-policy` |
| Public API + webhooks, EDI (850/855/856/810) | ✅ | |
| Custom fields, i18n, PWA, DMS, global search | ✅ | |
| Analytics / report builder / scheduled reports / KPI | ✅ | |
| **Treasury & Cash Management (TRM)** — liquidity forecast, financial instruments, hedging | ❌ | Entirely absent |
| **Planning (BPC/SAC-style) — driver-based, what-if** | ❌ | Budgets are static |
| **Extended WMS** — putaway/picking strategies, waves, handling units, warehouse tasks | ❌ | Inventory is bin-level only |
| **Transportation Mgmt, PLM, Real Estate, EHS** | ❌ | Separate SAP products — out of typical core scope |

---

## Priority recommendations (highest ERP-correctness impact first)

1. **Inventory valuation methods (FIFO / standard + variance)** — `valuationMethod` field exists but only moving-average is computed; mismatched expectations are a correctness risk. `P1`
2. **Product costing / BOM standard-cost roll-up** — currently production costing trusts item `standardCost`; without roll-up, manufacturing variances are unreliable. `P1`
3. **Parallel ledgers + asset parallel depreciation areas** — required for any customer reporting under two GAAPs (IFRS + local). `P1`
4. **Document splitting** — needed for segment / profit-center-level financial statements. `P2`
5. **MM special procurement: subcontracting, consignment, STO** — common real-world procurement that's entirely missing. `P2`
6. **CO internal orders + CO-PA** — overhead/event cost capture and contribution-margin reporting. `P2`
7. **SD billing plans + rebates** — milestone billing and rebate settlement are frequent SD requirements. `P2`
8. **Recurring journals / accrual engine + period-close cockpit** — routine month-end mechanics. `P3`
9. **Treasury / cash management** — net-new module; large scope. `P3`
10. **Finite capacity scheduling, batch management, EWM strategies** — depth in PP/MM/WM. `P3`
