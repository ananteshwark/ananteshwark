# Build Roadmap & Resume Guide

This file tracks build progress so any session can resume cleanly from a fresh
checkout. **To continue the build, reply `continue` and work proceeds from the
next unchecked phase below.**

Branch: `claude/app-build-setup-ntay5k`

## How to resume (clean, lossless)
1. `git checkout claude/app-build-setup-ntay5k && git pull`
2. Pick up at the first unchecked phase in "Build order" below.
3. Each phase: data model → migrations → services (with business rules) →
   controllers (RBAC + Swagger) → frontend pages → seed data → build + smoke
   test → commit & push.

All completed work is committed to the branch, so a reclaimed/restarted
container loses nothing — just re-clone and continue.

---

## COMPLETED — Foundation Build (Phases 1–20)

- [x] **Phase 1** — Multi-tenant core, auth (JWT), users, RBAC, workflow, notifications, audit, API gateway, React shell
- [x] **Phase 2** — Finance core: GL, AP, AR, bank & reconciliation, financial reports
- [x] **Phase 3** — HR: employee master, org structure, attendance, leave, timesheets, ESS/MSS
- [x] **Phase 4** — Payroll: pay components, runs, payslips, bank files; India statutory (PF/ESI/PT/TDS/Form 16)
- [x] **Phase 5** — Procurement S2P: requisition → RFQ → PO → GRN → 3-way match → AP
- [x] **Phase 6** — Talent: ATS, onboarding, L&D, succession, OKRs, reviews, appraisals, calibration
- [x] **Phase 7** — Inventory/warehouse, Projects, Expenses, CRM
- [x] **Phase 8** — Localization packs: US + UAE
- [x] **Phase 9** — Fixed Assets: register, depreciation, disposals, GL postings
- [x] **Phase 10** — Sales Orders: quote→order→invoice, price lists
- [x] **Phase 11** — ESS/MSS Portal
- [x] **Phase 12** — Contract Management (CLM)
- [x] **Phase 13** — Dunning & Collections
- [x] **Phase 14** — Manufacturing: BOM, work centers, production orders, material issuance
- [x] **Phase 15** — Quality Management: inspection plans, lots, non-conformance
- [x] **Phase 16** — Plant Maintenance: equipment, maintenance plans, work orders
- [x] **Phase 17** — Benefits: plans, enrollment, salary bands, merit cycles
- [x] **Phase 18** — Inventory: lot/serial, bin, reorder points, stock valuation, cycle count, RMA
- [x] **Phase 19** — Analytics: report builder, scheduled reports, budgeting, variance analysis
- [x] **Phase 20** — Platform: SSO/SAML, GRC/SOD, tax engine base, e-Invoicing, rate limiting, data archiving
- [x] **Phase 21** — Admin-configurable org levels (mandatory/optional per level, dynamic hierarchy)
- [x] **Phase 22** — Generic field configuration system for all modules (enable/disable/relabel per field per tenant)

---

## SAP PARITY ROADMAP — Gap Closure (Phases 23–50)

### Priority Levels
- **P1** — Blocks financial close / legally required / core business process broken without it
- **P2** — Major SAP feature missing, high business value
- **P3** — Standard SAP parity, improves depth
- **P4** — Advanced/niche SAP features, platform extensibility

---

### SPRINT A — Financial Infrastructure (P1)

- [x] **Phase 23 — Tax Engine (Full)** `P1` ✅ DONE
  - `TaxCode` entity: code, name, type (GST/VAT/WITHHOLDING/NONE), rate, components (CGST/SGST/IGST/CESS)
  - Tax determination: auto-apply tax code on bill line / invoice line based on vendor/customer/item tax class
  - Tax line calculation on posting: separate debit/credit to tax GL accounts
  - GST invoice format: GSTIN, HSN/SAC code, CGST/SGST/IGST split per line
  - VAT handling (UAE/UK): inclusive vs exclusive tax
  - Withholding tax on vendor payment: TDS deduction, payable to tax authority
  - Tax settings page (admin): create tax codes, map to GL accounts
  - Tax report: output tax summary, input tax summary, net payable by period

- [x] **Phase 24 — GR/IR Clearing + Inventory Valuation** `P1`
  - Add `unitCost` (pulled from PO price) and `totalValue` to GRN lines and StockLedger
  - `StockBalance.totalValue` = quantity × weighted average cost
  - On GRN post: DR Stock Account (item's GL), CR GR/IR Clearing (auto-created system account)
  - On vendor invoice match to PO: DR GR/IR Clearing, CR Accounts Payable, DR Tax Input
  - Moving average price recalculation on every receipt
  - GR/IR reconciliation report: open items (received not invoiced / invoiced not received)
  - Material valuation settings: moving average price vs standard price per item category
  - Price variance posting when invoice price ≠ PO price

- [x] **Phase 25 — Controlling (CO-CCA)** `P1`
  - `CostCenter` entity enrichment: responsible person, hierarchy node, validity dates, budget
  - `ProfitCenter` entity: code, name, parent, GL accounts assigned
  - Every GL posting must carry cost center + profit center (mandatory on P&L accounts)
  - CO document created parallel to FI document (statistical postings for balance sheet)
  - Assessment cycle: distribute overhead costs from sender to receiver cost centers
  - Distribution cycle: redistribute primary costs between cost centers
  - Activity types on work centers with planned/actual rates
  - Cost center actual vs plan report
  - Profit center P&L report (contribution margin by profit center)

- [x] **Phase 26 — Payroll → GL Posting** `P1`
  - On payroll run approval: generate journal entry posting payroll costs to cost centers
  - Earnings → DR Salary Expense (per cost center of employee), CR Payroll Payable
  - Deductions → DR Payroll Payable, CR statutory liabilities (PF Payable, ESI Payable, TDS Payable)
  - Employer contributions → DR Employer PF, DR Employer ESI, CR Respective Payable accounts
  - Payroll GL mapping settings: map each pay component type to a GL account
  - Payroll reconciliation report: headcount, gross pay, deductions, net pay vs GL

---

### SPRINT B — Platform Infrastructure (P1-P2)

- [x] **Phase 27 — Document Management System (DMS)** `P1`
  - `Attachment` entity: entityType, entityId, originalName, storagePath, mimeType, fileSize, uploadedBy, uploadedAt
  - Upload endpoint: `POST /attachments` (multipart, stored to local filesystem / configurable S3)
  - Download endpoint: `GET /attachments/:id/download`
  - List endpoint: `GET /attachments?entityType=&entityId=`
  - Delete endpoint: `DELETE /attachments/:id`
  - Reusable `<AttachmentsList>` React component — used on: Employee, PO, Bill, Invoice, GRN, Asset, Contract, Payslip, Leave Application, Expense Claim
  - Max file size config per tenant, allowed MIME types
  - Virus scan hook (pluggable, disabled by default)

- [x] **Phase 28 — PDF Generation** `P1`
  - PDF template engine (use `puppeteer` headless or `@react-pdf/renderer`)
  - Templates: Purchase Order, Vendor Invoice, AR Invoice, Payslip, Offer Letter, Experience Letter, Asset Register, Contract
  - Print preview endpoint: `GET /[module]/[id]/pdf`
  - Download PDF button on all relevant pages
  - Configurable company letterhead: logo, address, footer text (per tenant)
  - GST tax invoice format (required for India): GSTIN, HSN, tax breakup

- [x] **Phase 29 — Transactional Email Notifications** `P1`
  - SMTP configuration per tenant (host, port, user, password, from address)
  - `EmailTemplate` entity: code, subject, body (Handlebars), module
  - Events that trigger email: leave approved/rejected, PO approved, payslip published, invoice due reminder, offer letter issued, password reset, new user invite, GRN posted
  - Queue-based delivery (BullMQ or simple retry) — don't block API response
  - Email log: track sent/failed/bounced per email
  - Unsubscribe token per notification type
  - Admin: email template editor with preview, SMTP test button

---

### SPRINT C — Procurement Depth (P1-P2)

- [x] **Phase 30 — Vendor Master Enrichment** `P2`
  - Add to Vendor: payment terms (Net 30/60/90, 2/10 Net 30), bank account details (IBAN/SWIFT/IFSC), default tax code, PAN/GST number, vendor type (domestic/foreign/government), credit limit, reconciliation GL account
  - Partner functions: alternate payee, ordering address, goods-supplier (separate addresses)
  - Vendor block: payment block flag, order block flag with reason
  - Vendor balance report: open items, payment history

- [x] **Phase 31 — Purchasing Info Records** `P2`
  - `PurchasingInfoRecord` entity: vendorId, itemId, price, currency, leadTimeDays, minimumQty, validFrom, validTo
  - Auto-populate PO line price from info record when vendor + item selected
  - Last purchase price visible on PO line
  - Info record update on PO invoice match (actual price paid)
  - Info record list/search page

- [x] **Phase 32 — Outline Agreements (Framework Contracts)** `P2`
  - `OutlineAgreement` entity: vendor, type (VALUE_CONTRACT/QTY_CONTRACT/SCHEDULING_AGREEMENT), value/qty limit, validity
  - Release orders against framework: PO references agreement, reduces available amount
  - Agreement utilization report: released vs total
  - Scheduling agreement: delivery schedule lines with firm/forecast zones

- [x] **Phase 33 — Service Procurement (Entry Sheets)** `P1`
  - `ServicePO` line type: description, UOM = days/hours, unit rate
  - `ServiceEntrySheet` entity: references service PO, period, actual hours/days, description, status (DRAFT/SUBMITTED/APPROVED)
  - Approval workflow for service entry sheets
  - On approval: GRN-equivalent posting to GR/IR for services
  - Link to vendor invoice for 3-way match

- [x] **Phase 34 — Invoice Tolerance + Matching Controls** `P2`
  - Tolerance keys: price variance %, quantity variance %, configurable per vendor/item category
  - Auto-post if within tolerance; flag for manual review if outside
  - Two-way match (PO → invoice, no GRN) and three-way match (PO → GRN → invoice) per item/PO type
  - Blocked invoice report: invoices pending because of tolerance breach

- [x] **Phase 35 — Returns to Vendor (Debit Note)** `P2`
  - `PurchaseReturn` entity: references original GRN, return lines, reason
  - On post: reverse stock receipt (reduce stock + value), DR Accounts Payable, CR Stock/GR/IR
  - Generate debit note document for vendor
  - Link debit note to open vendor invoices for netting

---

### SPRINT D — HR Depth (P1-P2)

- [x] **Phase 36 — Position Management** `P1`
  - `Position` entity: positionCode, title, departmentId, gradeId, budgetedHeadcount, status (OPEN/FILLED/FROZEN)
  - Employee linked to position (position.incumbentId)
  - Headcount planning: positions vs filled vs vacant dashboard
  - Position budget: approved HC per department per year
  - Manpower requisition links to open position
  - Org chart shows position boxes (filled vs vacant)

- [x] **Phase 37 — Time Evaluation Engine** `P1`
  - Configurable time types: PRESENT, ABSENT, HALF_DAY, ON_DUTY, LATE, EARLY_DEPARTURE, OVERTIME
  - Rules engine: if clock-in > shift_start + grace_period → LATE; if hours > 8 → OVERTIME_MINS
  - Monthly time evaluation run: process all attendance records → generate absence quota deductions
  - Loss-of-pay calculation: LOP days = absences not covered by leave balance
  - Overtime calculation: hours beyond standard shift, rate multiplier (1.5x/2x)
  - Comp-off: overtime → generates comp-off leave credit
  - Output feeds into payroll run (LOP days, OT hours per employee)

- [x] **Phase 38 — Exit Management** `P2`
  - `ExitRequest` entity: employeeId, lastWorkingDate, reason (RESIGNATION/RETIREMENT/TERMINATION), exitInterviewDate
  - Exit checklist: configurable items (laptop return, ID card, NOC from departments, final settlement)
  - `ExitChecklistItem` entity: item, assignedTo, status (PENDING/CLEARED)
  - Full & Final (F&F) settlement: pending salary, leave encashment, gratuity, recovery → net amount
  - Experience letter generation (PDF)
  - Rehire eligibility flag + cooling period

- [x] **Phase 39 — Dependent & Nominee Management** `P2`
  - `Dependent` entity: employeeId, name, relationship, dateOfBirth, gender
  - `Nominee` entity: employeeId, name, relationship, percentage (must sum to 100%), for: GRATUITY/PF/ESI/INSURANCE
  - Visible on employee profile, editable by employee in ESS
  - Used in benefits enrollment (family health plan)
  - Nominees exported to PF form

- [x] **Phase 40 — Retro Payroll** `P1`
  - Track salary history with effective dates on `EmployeeSalary` (fromDate, toDate)
  - On payroll run: detect salary changes effective in past periods
  - Calculate arrears: new salary − old salary × retroactive months
  - Arrears component auto-added to current period payslip
  - Retro payroll report: employee-wise arrears breakdown

---

### SPRINT E — Sales Depth (P1-P2)

- [x] **Phase 41 — Pricing Conditions Engine** `P1`
  - `PriceCondition` entity: conditionType (PRICE/DISCOUNT/SURCHARGE/TAX), key (customer/material/customerGroup/materialGroup), validFrom, validTo, rate/amount, scaleQty
  - Pricing procedure: ordered sequence of conditions applied to determine final price
  - Auto-fetch base price from condition on order/invoice line
  - Volume discounts: quantity scale pricing
  - Customer-specific pricing: override standard price for a specific customer
  - Net price calculation: base − discount + surcharge + tax

- [x] **Phase 42 — Credit Management** `P1`
  - `CreditAccount` on Customer: creditLimit, creditExposure (open invoices + unshipped orders), creditRating
  - On sales order save: check if order value + existing exposure > credit limit
  - Block order if limit exceeded; alert only if configured for warning mode
  - Credit release workflow: finance approves blocked orders
  - Credit exposure report by customer

- [x] **Phase 43 — Available-to-Promise (ATP)** `P1`
  - On sales order line save: check available stock = stock_balance − already_committed_on_other_orders
  - Committed qty tracked on stock_balance per item/warehouse
  - ATP response: available date if insufficient stock (based on expected GRN)
  - Partial delivery: confirm available qty, backorder remainder
  - ATP dashboard: item-wise stock vs committed vs available

- [x] **Phase 44 — Returns & Credit Memos (AR)** `P2`
  - `ReturnOrder` entity: references original sales order, return lines, reason
  - On goods receipt of return: inventory increases, creates credit memo request
  - `CreditNote` entity: reduces customer AR balance
  - Return reason codes: defective, wrong item, not needed
  - Customer debit note for pricing disputes

- [x] **Phase 45 — Delivery Processing** `P2`
  - `DeliveryOrder` entity: created from sales order, delivery lines, picking status
  - Picking: allocate specific lot/bin to delivery line
  - Packing: pack lines into shipment packages
  - Goods issue: post inventory reduction + revenue recognition trigger
  - Proof of delivery: confirm delivered quantity, update AR
  - Carrier + tracking number on delivery

---

### SPRINT F — Manufacturing Depth (P1)

- [x] **Phase 46 — Routing & Capacity Planning** `P1`
  - `Routing` entity: item, version, operations[]
  - `RoutingOperation` entity: sequence, workCenterId, description, setupTime, machineTime, laborTime, yieldPercent
  - Work center capacity: available hours per day/week, shifts
  - `CapacityRequirement` on production order: scheduled start/finish per operation
  - Backward scheduling: from required date → operation start dates
  - Capacity load report: work center utilization by week
  - Overload detection: flag when capacity > 100%

- [x] **Phase 47 — MRP (Material Requirements Planning)** `P1`
  - MRP views on item master: MRP type (MRP/reorder/no-planning), lot size (EX/FX/MB), safety stock, reorder point, planned delivery days
  - MRP run: explode demand (sales orders + forecast) through BOM, net against stock + open POs
  - Generate: planned purchase orders (for bought items), planned production orders (for made items)
  - Planning horizon: configurable days forward
  - Exception messages: reschedule in, reschedule out, cancel, new
  - Convert planned order to: real PO (procurement) or production order (manufacturing)
  - MRP exception report: planners action list
  - MRP stock requirements list per item

- [x] **Phase 48 — Production Order Costing & Confirmation** `P1`
  - Planned cost on production order: BOM cost + routing cost (standard)
  - Material issuance to production: actual material cost booked
  - Operation confirmation: actual hours per work center per operation
  - Actual cost = actual material + actual labor (hours × activity rate)
  - Variance = actual − planned (material variance, labor variance)
  - Settlement: close production order → post variance to variance GL account
  - WIP calculation: partially completed orders carry WIP balance
  - COGS recognition on goods receipt of finished goods

---

### SPRINT G — Banking & Payments (P1-P2)

- [x] **Phase 49 — Bank Statement Import** `P1`
  - Support formats: CSV (configurable column mapping), MT940 (SWIFT), BAI2
  - `BankStatementImport` entity: file name, import date, bank account, from/to date, transaction count
  - Auto-matching algorithm: match imported transaction to open vendor payments / customer receipts by: amount, date proximity, reference number
  - Manual matching UI: show unmatched statement lines vs unmatched payments
  - On match: mark both as reconciled, post any differences
  - Bank reconciliation status report: statement balance vs GL balance

- [x] **Phase 50 — Automated Payment Run (F110 equivalent)** `P1`
  - `PaymentRun` entity: run date, company, posting date, payment method, banks selected
  - Proposal step: select all open vendor invoices due ≤ next payment date
  - Apply: cash discounts (if within discount deadline), withholding tax deduction
  - Payment grouping: one payment per vendor (or per bank account)
  - Generates: payment journal entry + bank file (NEFT/RTGS/ACH/SEPA per config)
  - Bank file formats: PAIN.001 (SEPA), NACHA (US ACH), RBI NEFT format (India)
  - Remittance advice email to vendor per payment
  - Exception list: blocked invoices, invoices over limit

---

### SPRINT H — Advanced Analytics (P2)

- [x] **Phase 51 — Budget vs Actual + Commitment Accounting** `P2`
  - `Budget` enrichment: monthly/quarterly/annual amounts per GL account + cost center
  - Commitment tracking: approved POs that are not yet invoiced reduce budget
  - Budget check on PR/PO creation: warn or block if budget exceeded
  - Budget vs actual report: budget / committed / actual / available per cost center per period
  - Budget revision workflow: change request → approval → updated budget
  - Budget carry-forward at year end

- [x] **Phase 52 — Financial Consolidation** `P2`
  - `ConsolidationGroup` entity: parent entity, subsidiaries, elimination rules
  - Intercompany elimination: IC receivable vs IC payable automatic offset
  - Currency translation: translate subsidiary P&L at average rate, balance sheet at closing rate
  - Consolidated P&L, Balance Sheet, Cash Flow
  - Minority interest calculation
  - Consolidation journal entries for adjustments

- [x] **Phase 53 — Cross-Module Embedded Analytics** `P2`
  - Hire-to-Retire metrics: time-to-hire, cost-per-hire, attrition rate, tenure distribution
  - Procure-to-Pay metrics: PO cycle time, vendor payment aging, savings vs last price
  - Order-to-Cash metrics: order fill rate, DSO, invoice aging, collection effectiveness index
  - Finance KPIs: working capital ratio, current ratio, EBITDA, cash conversion cycle
  - Drill-down: click any metric → source transactions
  - Configurable KPI widgets on dashboard (drag to rearrange)

---

### SPRINT I — CRM Depth (P2)

- [x] **Phase 54 — Service Tickets & SLA Management** `P2`
  - `ServiceTicket` entity: customer, subject, description, priority (LOW/MEDIUM/HIGH/CRITICAL), category, status (OPEN/IN_PROGRESS/PENDING_CUSTOMER/RESOLVED/CLOSED)
  - SLA matrix: response time + resolution time per priority
  - SLA breach tracking: auto-escalate if SLA breached
  - Ticket assignment: to support agent or team queue
  - Customer email-to-ticket: inbound email creates ticket (via configured mailbox)
  - Ticket merge, link related tickets
  - Customer satisfaction survey on close (CSAT score)
  - Service ticket dashboard: open/breached/resolved by agent/category

- [x] **Phase 55 — Customer 360 View** `P2`
  - Unified customer profile: all interactions in one timeline
  - Timeline items: quotes, sales orders, invoices, receipts, service tickets, CRM activities, emails
  - Financial summary: outstanding balance, credit utilization, payment history, average days-to-pay
  - Engagement score: activity frequency
  - Next best action suggestions (rule-based)

---

### SPRINT J — Quality & Maintenance Depth (P2-P3)

- [x] **Phase 56 — QM Characteristics & Results Recording** `P2`
  - `QualityCharacteristic` entity: code, name, type (MEASURED/QUALITATIVE), unit, lower limit, upper limit, target
  - Link characteristics to inspection plan
  - `InspectionResult` entity: inspectionLotId, characteristicId, actualValue, verdict (PASS/FAIL)
  - Results recording UI: enter measurements per characteristic
  - Usage Decision: ACCEPT (move stock to unrestricted) / REJECT (block or return) / CONDITIONAL
  - Quality notification auto-created on REJECT
  - Acceptance Quality Level (AQL) sampling plan

- [x] **Phase 57 — PM Functional Locations & Counter-based Maintenance** `P2`
  - `FunctionalLocation` entity: code, description, parentId, structureIndicator (PLANT/PROCESS/UNIT/TAG)
  - `CounterMeasurement` entity: equipmentId, counter (HOURS/KM/CYCLES), reading, readingDate
  - Counter-based maintenance plan: trigger after X hours/km/cycles
  - Due date calculation: last measurement + counter interval
  - Maintenance order work center costing: actual hours → cost center settlement
  - External service order: maintenance work order → create PO for external technician

---

### SPRINT K — Platform Depth (P2-P3)

- [x] **Phase 58 — Approval Delegation** `P2`
  - `ApprovalDelegation` entity: delegatorId, delegateeId, fromDate, toDate, modules (HR/Finance/Procurement/All)
  - When delegator is approver: system checks active delegation, routes to delegatee
  - Delegation request/approval: manager requests, HR admin approves
  - Active delegation indicator on approver's profile
  - Delegation audit trail: all approvals done under delegation flagged

- [x] **Phase 59 — Global Cross-Module Search** `P2`
  - Search index across: employees, vendors, customers, POs, invoices, bills, assets, contracts, tickets
  - Instant results grouped by entity type
  - Deep link: click result → navigate directly to that record
  - Keyboard shortcut: Ctrl+K opens command palette / search
  - Recent items: last 10 records viewed per user

- [x] **Phase 60 — Custom Field Creator** `P2`
  - Admin UI: add custom fields to any entity (employee, vendor, customer, PO, invoice)
  - Field types: text, number, date, dropdown (with configurable options), checkbox, multi-select
  - `CustomFieldDefinition` entity: entityType, fieldName, fieldType, required, options, tenantId
  - `CustomFieldValue` entity: entityType, entityId, fieldDefinitionId, value
  - Custom fields appear in forms, list views (optional column), and exports
  - Available in report builder as filterable/sortable columns

- [x] **Phase 61 — Intercompany Transactions** `P2`
  - `IntercompanyRelationship` entity: entity A, entity B, markupPercent, eliminationGLAccount
  - IC sales: legal entity A invoices entity B → auto-creates corresponding bill in entity B's books
  - IC elimination: consolidated run removes IC balances
  - IC reconciliation report: A/R in entity A vs A/P in entity B (should net zero)

- [x] **Phase 62 — Down Payment / Advance Management** `P2`
  - Vendor down payment request: create special GL posting (not normal AP)
  - Record advance payment against request
  - Clear advance against vendor invoice on final payment
  - Customer advance receipt: deferred revenue posting
  - Clear on invoice creation
  - Down payment aging report: uncleared advances

---

### SPRINT L — Mobile & Integration (P3-P4)

- [x] **Phase 63 — Public API + Webhooks** `P3`
  - API documentation portal (Swagger already exists — enrich with examples)
  - Webhook subscriptions: `POST /webhooks` with event types + target URL
  - Events: employee.created, invoice.posted, po.approved, payroll.run.completed, etc.
  - HMAC signature on webhook payload for security
  - Webhook retry with exponential backoff
  - Webhook delivery log + test endpoint

- [x] **Phase 64 — SSO Implementation (SAML/OIDC)** `P3`
  - SSO entity exists; implement actual SAML 2.0 flow
  - Support IdPs: Azure AD, Okta, Google Workspace
  - JIT provisioning: auto-create user on first SSO login
  - Attribute mapping: email, displayName, department → local user fields
  - SSO bypass: emergency local login if IdP down

- [x] **Phase 65 — Barcode / QR Scanning** `P3`
  - QR code generation on: PO, GRN, asset, employee badge, item label
  - Mobile camera scan (progressive web app camera API) to:
    - Look up item in inventory
    - Confirm GRN line
    - Record attendance (QR-based clock-in)
    - Look up asset in maintenance

- [x] **Phase 66 — Multi-Language (i18n)** `P3`
  - Extract all UI strings to locale files (en.json as base)
  - Add: Hindi (hi), Arabic (ar, RTL), French (fr)
  - Language selector in user profile
  - RTL layout support for Arabic
  - Number/date/currency formatting per locale

- [x] **Phase 67 — Mobile App (PWA)** `P4`
  - Progressive Web App (PWA) — installable on iOS/Android from browser
  - Offline capability: view recent records, queue approvals
  - Push notifications: PO approval needed, leave request, payslip ready
  - Key flows: approve/reject (leave, PO, expense), clock in/out, view payslip, submit expense

- [x] **Phase 68 — EDI Integration** `P4`
  - Support EDI 850 (PO to vendor), EDI 855 (vendor PO acknowledgment), EDI 856 (ship notice), EDI 810 (invoice)
  - EDI trading partner configuration
  - Inbound EDI: create vendor invoice / shipment notice from EDI file
  - Outbound EDI: send PO to vendor in EDI format
  - EDI transaction log

---

## SAP Gap Remediation Phases (P1 → P3)

_Based on SAP-GAP-ANALYSIS.md — closing the gap between this ERP and SAP S/4HANA._

- [x] **Phase 69 — Inventory Valuation Methods (FIFO + Standard Cost)** `P1`
  - FIFO: track per-receipt cost layers; issues consume oldest layers first
  - Standard Cost: receive at item.standardCost; compute Purchase Price Variance (PPV) and post GL entry
  - `valuationMethod` field already on Item entity; only MOVING_AVERAGE was computed — now all three methods branch correctly
  - Frontend: show current valuation method and FIFO layers on item detail

- [x] **Phase 70 — BOM Standard Cost Roll-up (Product Costing)** `P1`
  - Costing run: traverse multi-level BOM, sum material cost + labor (routing × activity rate) + overhead
  - Update item.standardCost from roll-up result
  - Store costing run history with cost breakdown per component
  - Manufacturing variance becomes meaningful once standard cost is accurate

- [x] **Phase 71 — Parallel Ledgers + Asset Parallel Depreciation Areas** `P1`
  - Add `ledgerCode` dimension to journal entries (e.g. "IFRS", "LOCAL")
  - Depreciation area per fixed asset: each area has its own method, life, accumulated depreciation
  - Period-end generates separate depreciation postings per ledger
  - Financial reports filter by ledger

- [x] **Phase 72 — Document Splitting (Segment/Profit-Center Balancing)** `P2`
  - Splitting rules: define which account types trigger split, which dimension (segment/profit center) carries the balance
  - On journal post: apply splitting rules to generate zero-sum balancing lines per segment
  - Segment-level trial balance becomes possible

- [x] **Phase 73 — MM Special Procurement (Subcontracting + Consignment + STO)** `P2`
  - Subcontracting PO: issue components to vendor, receive finished goods, consume components on GR
  - Consignment: track vendor-owned stock; settlement run to convert to owned stock
  - Stock Transport Orders: inter-plant / inter-company stock moves with proper inventory and GL postings

- [x] **Phase 74 — CO Internal Orders + CO-PA (Profitability Analysis)** `P2`
  - Internal order object for event/project cost capture; settle to cost center / P&L at period-end
  - CO-PA: profitability segments (product/customer/region), contribution-margin reporting
  - Activity types with planned/actual activity rates for allocation

- [x] **Phase 75 — SD Billing Plans + Rebate Management** `P2`
  - Billing plans: milestone billing (% of contract on date) and periodic billing (monthly/quarterly)
  - Rebate agreements: accruals on invoicing, periodic settlement run to issue credit memo
  - Partial billing from sales order lines

- [x] **Phase 76 — Recurring Journals + Accrual Engine + Period-Close Cockpit** `P3`
  - Recurring document templates: frequency (monthly/quarterly), auto-post or require approval
  - Accrual engine: prepaid/deferred postings with automatic reversal on next period open
  - Period-close cockpit: orchestrated checklist (depreciation → accruals → allocations → forex revaluation → close)

- [x] **Phase 77 — Treasury & Cash Management (TRM)** `P3`
  - Liquidity forecast: consolidate bank balances + AR/AP aging into rolling cash-flow projection
  - Financial instruments: money market, FX forwards, interest rate instruments
  - Hedge accounting: designate hedging relationships, effectiveness test, P&L/OCI reclassification

- [x] **Phase 78 — Finite Capacity Scheduling + Batch Management + Extended WMS** `P3`
  - Finite scheduling: capacity leveling, dispatch list, sequencing rules per work center
  - Batch management: batch master, batch characteristics, FEFO determination on issue
  - Extended WMS: putaway/picking strategies, wave management, handling units, warehouse tasks

---

## Phase 79–104 — SAP Gap Remediation (Round 2)

_Derived from the v2 SAP-GAP-ANALYSIS.md evidence-based survey. Ordered by business-correctness impact._

- [ ] **Phase 79 — Activity Types + Overhead Costing Sheet** `P1`
  - Activity type master: code, unit (hours/cycles), planned/actual rate per cost center
  - Activity price calculation: planned rate = planned cost / planned activity quantity
  - Activity confirmation on production operations: confirm activity quantity, debit production order, credit cost center
  - Overhead costing sheet: define base (material/labor cost), overhead %, overhead account; apply to production order on costing run
  - CO-PA enrichment: populate activity-based contribution margin fields

- [ ] **Phase 80 — Transactional GL for GR/IR + Production Order Settlement** `P1`
  - Wrap GRN GL call in a database transaction — if GL fails the GRN fails (no silent loss)
  - Wrap production order `completeOrder()` + `settleOrder()` GL calls transactionally
  - Wrap service entry sheet approval GL call transactionally
  - Add compensating-transaction reversal endpoint: if GL fails post-commit, expose a retry/reverse path
  - Add reconciliation report: GRN/settlement rows with missing GL entry for ops alerting

- [ ] **Phase 81 — Payroll Bank File Export** `P1`
  - NEFT/RTGS flat-file format (India): header + transaction records per employee, batch total
  - NACHA ACH format (US): 94-char fixed-width records, batch control, file control
  - WPS SIF format (UAE): fixed-column salary information file
  - Generic SEPA XML (EU/UK placeholder)
  - Bank file run entity: associates payroll run → file format → generated file (DMS attachment)
  - Re-generation endpoint; mark employees paid vs pending

- [x] **Phase 82 — Statutory Form Generation (W-2, 1099, WPS, EOSB)** `P1`
  - US: W-2 generation per employee (boxes 1–20 from payroll year aggregates); 1099-NEC for contractors
  - US: employer W-3 summary; SSA-format electronic submission XML
  - UAE: WPS SIF file validation rules; EOSB settlement calculation with approval workflow
  - India: existing Form 16 — verify completeness of Part A (TDS certificate) + Part B (income detail)
  - PDF generation via existing PDF service; email dispatch to employees

- [ ] **Phase 83 — Parallel Ledgers Complete** `P1`
  - Ledger group entity: code, description, member ledgers (e.g. IFRS + LOCAL)
  - Ledger-group-filtered financial reports: TB, P&L, BS per ledger
  - Ledger group reconciliation matrix: cross-ledger difference report
  - Posting rules: which transaction sources post to which ledger(s) (GL only vs all ledgers)
  - Period-close cockpit: separate close checklist per ledger group

- [ ] **Phase 84 — Source List + Quota Arrangement + Auto Source Determination** `P2`
  - Source list: item → preferred vendor(s) with validity dates and fixed/blocked flags
  - Quota arrangement: split demand across vendors by percentage per period
  - Auto source determination: on PR approval, auto-propose vendor from source list / quota
  - Integration: MRP-generated planned orders use source determination to pre-assign vendor on PO conversion
  - UI: source list maintenance + quota planning screen

- [ ] **Phase 85 — Tiered Cash Discounts + Early-Payment GL** `P2`
  - Payment term tiers: e.g. 2% if paid within 10 days, 1% within 20 days, net 30
  - Store tiers as JSONB array on `PaymentTerm` entity; compute discount on invoice due date vs payment date
  - AP payment run: auto-apply discount if within window; post discount to cash discount account
  - AR: record early-payment discount on receipt; post to discount expense/income GL account
  - Report: cash discount utilization by vendor/customer

- [ ] **Phase 86 — Intercompany Sales + Transfer Pricing** `P2`
  - IC sales order type: mark SO as intercompany; link to IC relationship entity
  - Transfer pricing: price determined by IC price list (cost-plus %, fixed, or market rate)
  - Automatic IC billing: on SO invoice post, generate mirror AP bill in buying entity
  - IC markup posting: revenue in selling entity, expense in buying entity, elimination on consolidation
  - Extend consolidation module: IC sales/purchases elimination journal entries

- [ ] **Phase 87 — PM Preventive Maintenance Auto-Scheduling** `P2`
  - Scheduled job (Bull queue): runs daily, queries `getDuePlans()`, auto-creates maintenance orders
  - Strategy plan entity: multi-counter decision (e.g. "whichever is earlier — 6 months or 500 hours")
  - Reusable task list templates: separate entity; plans reference task list by ID
  - MO auto-number + status GENERATED; notify assigned technician group
  - Counter-based trigger: on `counter-reading.entity` insert, evaluate whether plan threshold crossed

- [ ] **Phase 88 — PM Warranty + Refurbishment + MTBF/MTTR** `P2`
  - Warranty master: equipment → warranty period, start date, expiry, coverage type, vendor
  - Expiry alert: notify maintenance planner 30/60/90 days before expiry
  - Refurbishment order type: special MO for overhaul; tracks parts consumed, serial-history before/after
  - Equipment history log: each MO completion appends a history record (failure code, duration, cost)
  - MTBF / MTTR analytics: calculated from history log per equipment / functional location

- [ ] **Phase 89 — QM Vendor Quality Scoring + Quality Certificates + Calibration** `P2`
  - Vendor quality score: weighted aggregate of lot acceptance rate, defect rate, on-time delivery
  - Quality notification entity: formal issue raised against vendor with corrective action tracking
  - Quality certificate (COC): incoming cert linked to GRN lot; outgoing cert for customer shipment
  - Certificate template (PDF via existing service); attach to DMS
  - Calibration instrument master: equipment tag, calibration interval, responsible lab
  - Calibration due-date tracking: alerts; calibration result record with pass/fail

- [ ] **Phase 90 — Garnishments + Employee Loans + Off-Cycle Payroll** `P2`
  - Garnishment entity: court order reference, deduction type (child support/tax levy/creditor), amount/%, priority, start/end date
  - Employee loan entity: principal, disbursement date, installment amount, remaining balance; auto-deducts from payslip
  - Salary advance: quick-draw against next payslip; deducted in next run
  - Off-cycle payroll: full run → GL posting → payslip → bank file for a subset of employees on any date
  - Garnishment disbursement: separate bank file for court/agency payments

- [ ] **Phase 91 — SPC / Control Charts + AQL Sampling** `P3`
  - Sampling procedure: AQL (Acceptable Quality Level) tables, sample size calculation from lot size
  - Control chart entity: UCL/LCL/CL from historical data (X-bar, R-chart, p-chart)
  - Results trigger control chart update on recording; flag out-of-control points
  - Periodic inspection auto-scheduling: recurrence interval → auto-create inspection lot on due date
  - Stability study: time-point schedule, environmental conditions, pass/fail criteria per interval

- [ ] **Phase 92 — Wave Management + Handling Units** `P3`
  - Wave entity: groups warehouse tasks for coordinated release; status OPEN/RELEASED/COMPLETED
  - Wave creation rules: by carrier/zone/ship-date/cut-off time
  - Wave release: sets all included tasks to IN_PROGRESS simultaneously
  - Handling unit (HU): pallet/carton entity with weight/dimensions; items packed into HU
  - HU picking: pick entire HU; HU transfer task; HU label (QR code via existing QR service)
  - Putaway strategy rules: zone assignment by item category, weight class, temperature requirement

- [ ] **Phase 93 — SD Output / Message Determination** `P3`
  - Output condition table: document type × partner function × medium (print/email/EDI) → output type
  - Output type entity: linked PDF template (via existing PDF service), email template, EDI transaction
  - Trigger on save/post: evaluate output conditions, enqueue output requests
  - Reprint / resend endpoint per document
  - Cover: sales order confirmation, delivery note, invoice, credit memo, purchase order to vendor

- [ ] **Phase 94 — Engineering Change Management (ECN/ECO)** `P3`
  - ECN (Engineering Change Notice) entity: change number, effectivity date, affected BOM(s), reason, approval workflow
  - BOM effective-date versioning: BOM lines gain validFrom/validTo; `getBomAtDate()` returns correct version
  - Routing effectivity: same versioning on routing operations
  - MRP uses ECN-aware BOM at planned order conversion date
  - Production order locks to BOM/routing version at release

- [ ] **Phase 95 — LMS Depth (SCORM + Certifications + Learning Paths)** `P3`
  - Learning path entity: ordered list of courses with prerequisites; completion = all courses done
  - Certification entity: name, validity period, passing score, linked course(s); auto-renew alert
  - SCORM 1.2/2004 runtime: store xAPI/SCORM state per enrollment; track completion/score from LMS payload
  - Content library: course materials stored via DMS; version-controlled
  - Compliance training: mandatory courses per role/department with deadline tracking

- [ ] **Phase 96 — Driver-Based Planning + What-If Scenarios** `P3`
  - Scenario entity: copy of a budget with name/description/status (DRAFT/ACTIVE/ARCHIVED)
  - Driver model: define revenue drivers (headcount × avg salary, units × price); formula-based projection
  - What-if simulation: change a driver value → re-compute all dependent budget lines
  - Scenario comparison: side-by-side P&L/BS across base + N scenarios
  - Promote scenario to plan: copy scenario lines to the active budget version

- [ ] **Phase 97 — Global Statutory Payroll Packs** `P3`
  - UK: PAYE (tax codes, NIC Class 1A/1B), P60/P45 form generation, RTI submission format
  - EU / Germany: Lohnsteuer brackets, Sozialversicherung (KV/PV/RV/AV), ELSTER XML
  - Singapore: CPF contribution rates, IR8A / IR21 form generation, MOM levy
  - Australia: PAYG withholding, Super Guarantee, STP Phase 2 Single Touch Payroll XML
  - Shared localization framework: each pack registers tax brackets + contribution tables; payroll engine picks pack by employee work country

- [ ] **Phase 98 — Consolidation Depth (Currency Translation + Minority Interest)** `P3`
  - Currency translation method: current rate (all BS at closing rate, P&L at average) vs temporal (monetary at closing, non-monetary at historical)
  - Translation difference: post CTA (Cumulative Translation Adjustment) to OCI equity
  - Minority interest: ownership % per subsidiary; compute NCI share of equity + net income
  - Equity method: for associates (20–50% ownership); pick up share of profit/loss
  - Elimination matrix: configurable eliminations (IC revenue vs expense, IC receivable vs payable, IC profit in inventory)
  - Consolidation report: group P&L / BS showing eliminations as a column

- [ ] **Phase 99 — Validation + Substitution Rules** `P3`
  - Validation rule entity: condition expression (account type / cost center / amount range) + error/warning
  - Evaluated on journal entry POST: block if HARD error; warn if SOFT warning
  - Substitution rule: when condition met, auto-fill a field (e.g. cost center → profit center)
  - UI: rule builder with condition and result dropdowns; test mode against sample entry
  - Covers: account combination validity, mandatory fields by account type, amount thresholds

- [ ] **Phase 100 — KANBAN + Repetitive Manufacturing** `P4`
  - KANBAN card entity: item, work center, quantity per card, replenishment strategy (INTERNAL/EXTERNAL/ONE_CARD/TWO_CARD)
  - KANBAN board: visual lane per status (FULL/EMPTY/IN_TRANSIT); move card by scan
  - Replenishment trigger: on card marked EMPTY, auto-create production order or PO
  - Repetitive manufacturing: rate-based production (quantity/shift vs discrete order); backflush on reporting point
  - Production list: daily/weekly target quantity; actual vs planned per work center

- [ ] **Phase 101 — Co-products + By-products in Production Orders** `P4`
  - BOM output lines: mark lines as CO_PRODUCT or BY_PRODUCT with cost split allocation method (% or equivalence units)
  - Production order: multiple output items with individual planned/produced quantities
  - Settlement: split production cost across co-products by allocation method; post each to its stock account
  - Inventory receipt: separate goods receipt per output item on order completion
  - MRP: co-products count as supply for their items when netting requirements

- [ ] **Phase 102 — Variant Configuration (Configurable Products / ATO)** `P4`
  - Characteristic master: code, values, data type (string/numeric/boolean)
  - Configuration profile: set of characteristics per material class
  - BOM explosion at order entry: match characteristic values to BOM selection conditions → explode correct components
  - Sales order: configurable item selection UI; captures characteristic values; explodes BOM on confirmation
  - Routing selection: same condition logic selects routing operations based on configuration

- [ ] **Phase 103 — Consignment Sales + Backorder Rescheduling** `P4`
  - Consignment fill-up order type: ship to customer consignment stock; no invoice at ship time
  - Consignment issue/return: invoice when customer withdraws from consignment; return reduces customer stock
  - Consignment stock report: quantity at each customer location by material
  - Backorder rescheduling: when ATP check fails at delivery, auto-split into confirmed + backorder line
  - Backorder proposal: batch rescheduling run suggests new dates based on incoming supply (MRP pegging)

- [ ] **Phase 104 — Total Rewards Statement + ESS/MSS Portal Hardening** `P4`
  - Total rewards statement PDF: annual summary of salary + bonus + benefits value + equity + PF contribution
  - ESS enhancements: leave self-service (apply/cancel/check balance) with manager approval in-portal
  - MSS enhancements: team leave calendar, timesheet approval, salary change request initiation
  - Org chart viewer: interactive drill-down using existing org hierarchy data
  - Comp planning UI: manager views team's salary vs band; requests merit increase; approval workflow

---

## Quick Reference — What Each Gap Unlocks

| Gap | Business Value |
|-----|---------------|
| Tax Engine | Legal compliance, tax filings, GST/VAT returns |
| GR/IR + Inventory Valuation | Accurate COGS, balance sheet stock value, 3-way match |
| Controlling CO-CCA | Cost center P&L, overhead allocation, management reporting |
| Payroll GL | Books balance at month-end; payroll cost hits P&L |
| Document Attachments | Attach PO/invoice/payslip PDFs, audit evidence |
| PDF Generation | Send POs to vendors, payslips to employees |
| Email Notifications | Workflow automation, no manual follow-ups |
| Position Management | Headcount control, org planning |
| Time Evaluation | Accurate LOP/overtime for payroll |
| Retro Payroll | Salary corrections without manual adjustments |
| MRP | Never stock-out, never over-stock |
| Routing + Capacity | Realistic production schedules |
| Production Costing | Accurate product margin |
| Pricing Conditions | Complex pricing without Excel |
| Credit Management | Block high-risk orders automatically |
| ATP Check | Promise accurate delivery dates |
| Service Tickets | Customer support tracking |
| Budget vs Actual | Spending control |

---

## Cross-cutting principles (apply every phase)
- Configuration over customization; localization is pluggable.
- Financial correctness is non-negotiable: double-entry, period close, audit.
- Tenant isolation: every entity carries `tenant_id`.
- API-first: every UI action backed by a documented, RBAC-guarded endpoint.
- TypeORM `synchronize: true` in dev — new nullable columns auto-create without migrations.

## Local run (Docker Desktop)
`docker-compose up` → web http://localhost:5173, API http://localhost:3000,
docs http://localhost:3000/api/docs. Login: admin@demo.com / Admin@123, tenant slug `demo`.
