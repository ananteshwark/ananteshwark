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

- [ ] **Phase 30 — Vendor Master Enrichment** `P2`
  - Add to Vendor: payment terms (Net 30/60/90, 2/10 Net 30), bank account details (IBAN/SWIFT/IFSC), default tax code, PAN/GST number, vendor type (domestic/foreign/government), credit limit, reconciliation GL account
  - Partner functions: alternate payee, ordering address, goods-supplier (separate addresses)
  - Vendor block: payment block flag, order block flag with reason
  - Vendor balance report: open items, payment history

- [ ] **Phase 31 — Purchasing Info Records** `P2`
  - `PurchasingInfoRecord` entity: vendorId, itemId, price, currency, leadTimeDays, minimumQty, validFrom, validTo
  - Auto-populate PO line price from info record when vendor + item selected
  - Last purchase price visible on PO line
  - Info record update on PO invoice match (actual price paid)
  - Info record list/search page

- [ ] **Phase 32 — Outline Agreements (Framework Contracts)** `P2`
  - `OutlineAgreement` entity: vendor, type (VALUE_CONTRACT/QTY_CONTRACT/SCHEDULING_AGREEMENT), value/qty limit, validity
  - Release orders against framework: PO references agreement, reduces available amount
  - Agreement utilization report: released vs total
  - Scheduling agreement: delivery schedule lines with firm/forecast zones

- [ ] **Phase 33 — Service Procurement (Entry Sheets)** `P1`
  - `ServicePO` line type: description, UOM = days/hours, unit rate
  - `ServiceEntrySheet` entity: references service PO, period, actual hours/days, description, status (DRAFT/SUBMITTED/APPROVED)
  - Approval workflow for service entry sheets
  - On approval: GRN-equivalent posting to GR/IR for services
  - Link to vendor invoice for 3-way match

- [ ] **Phase 34 — Invoice Tolerance + Matching Controls** `P2`
  - Tolerance keys: price variance %, quantity variance %, configurable per vendor/item category
  - Auto-post if within tolerance; flag for manual review if outside
  - Two-way match (PO → invoice, no GRN) and three-way match (PO → GRN → invoice) per item/PO type
  - Blocked invoice report: invoices pending because of tolerance breach

- [ ] **Phase 35 — Returns to Vendor (Debit Note)** `P2`
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

- [ ] **Phase 38 — Exit Management** `P2`
  - `ExitRequest` entity: employeeId, lastWorkingDate, reason (RESIGNATION/RETIREMENT/TERMINATION), exitInterviewDate
  - Exit checklist: configurable items (laptop return, ID card, NOC from departments, final settlement)
  - `ExitChecklistItem` entity: item, assignedTo, status (PENDING/CLEARED)
  - Full & Final (F&F) settlement: pending salary, leave encashment, gratuity, recovery → net amount
  - Experience letter generation (PDF)
  - Rehire eligibility flag + cooling period

- [ ] **Phase 39 — Dependent & Nominee Management** `P2`
  - `Dependent` entity: employeeId, name, relationship, dateOfBirth, gender
  - `Nominee` entity: employeeId, name, relationship, percentage (must sum to 100%), for: GRATUITY/PF/ESI/INSURANCE
  - Visible on employee profile, editable by employee in ESS
  - Used in benefits enrollment (family health plan)
  - Nominees exported to PF form

- [ ] **Phase 40 — Retro Payroll** `P1`
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

- [ ] **Phase 44 — Returns & Credit Memos (AR)** `P2`
  - `ReturnOrder` entity: references original sales order, return lines, reason
  - On goods receipt of return: inventory increases, creates credit memo request
  - `CreditNote` entity: reduces customer AR balance
  - Return reason codes: defective, wrong item, not needed
  - Customer debit note for pricing disputes

- [ ] **Phase 45 — Delivery Processing** `P2`
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

- [ ] **Phase 51 — Budget vs Actual + Commitment Accounting** `P2`
  - `Budget` enrichment: monthly/quarterly/annual amounts per GL account + cost center
  - Commitment tracking: approved POs that are not yet invoiced reduce budget
  - Budget check on PR/PO creation: warn or block if budget exceeded
  - Budget vs actual report: budget / committed / actual / available per cost center per period
  - Budget revision workflow: change request → approval → updated budget
  - Budget carry-forward at year end

- [ ] **Phase 52 — Financial Consolidation** `P2`
  - `ConsolidationGroup` entity: parent entity, subsidiaries, elimination rules
  - Intercompany elimination: IC receivable vs IC payable automatic offset
  - Currency translation: translate subsidiary P&L at average rate, balance sheet at closing rate
  - Consolidated P&L, Balance Sheet, Cash Flow
  - Minority interest calculation
  - Consolidation journal entries for adjustments

- [ ] **Phase 53 — Cross-Module Embedded Analytics** `P2`
  - Hire-to-Retire metrics: time-to-hire, cost-per-hire, attrition rate, tenure distribution
  - Procure-to-Pay metrics: PO cycle time, vendor payment aging, savings vs last price
  - Order-to-Cash metrics: order fill rate, DSO, invoice aging, collection effectiveness index
  - Finance KPIs: working capital ratio, current ratio, EBITDA, cash conversion cycle
  - Drill-down: click any metric → source transactions
  - Configurable KPI widgets on dashboard (drag to rearrange)

---

### SPRINT I — CRM Depth (P2)

- [ ] **Phase 54 — Service Tickets & SLA Management** `P2`
  - `ServiceTicket` entity: customer, subject, description, priority (LOW/MEDIUM/HIGH/CRITICAL), category, status (OPEN/IN_PROGRESS/PENDING_CUSTOMER/RESOLVED/CLOSED)
  - SLA matrix: response time + resolution time per priority
  - SLA breach tracking: auto-escalate if SLA breached
  - Ticket assignment: to support agent or team queue
  - Customer email-to-ticket: inbound email creates ticket (via configured mailbox)
  - Ticket merge, link related tickets
  - Customer satisfaction survey on close (CSAT score)
  - Service ticket dashboard: open/breached/resolved by agent/category

- [ ] **Phase 55 — Customer 360 View** `P2`
  - Unified customer profile: all interactions in one timeline
  - Timeline items: quotes, sales orders, invoices, receipts, service tickets, CRM activities, emails
  - Financial summary: outstanding balance, credit utilization, payment history, average days-to-pay
  - Engagement score: activity frequency
  - Next best action suggestions (rule-based)

---

### SPRINT J — Quality & Maintenance Depth (P2-P3)

- [ ] **Phase 56 — QM Characteristics & Results Recording** `P2`
  - `QualityCharacteristic` entity: code, name, type (MEASURED/QUALITATIVE), unit, lower limit, upper limit, target
  - Link characteristics to inspection plan
  - `InspectionResult` entity: inspectionLotId, characteristicId, actualValue, verdict (PASS/FAIL)
  - Results recording UI: enter measurements per characteristic
  - Usage Decision: ACCEPT (move stock to unrestricted) / REJECT (block or return) / CONDITIONAL
  - Quality notification auto-created on REJECT
  - Acceptance Quality Level (AQL) sampling plan

- [ ] **Phase 57 — PM Functional Locations & Counter-based Maintenance** `P2`
  - `FunctionalLocation` entity: code, description, parentId, structureIndicator (PLANT/PROCESS/UNIT/TAG)
  - `CounterMeasurement` entity: equipmentId, counter (HOURS/KM/CYCLES), reading, readingDate
  - Counter-based maintenance plan: trigger after X hours/km/cycles
  - Due date calculation: last measurement + counter interval
  - Maintenance order work center costing: actual hours → cost center settlement
  - External service order: maintenance work order → create PO for external technician

---

### SPRINT K — Platform Depth (P2-P3)

- [ ] **Phase 58 — Approval Delegation** `P2`
  - `ApprovalDelegation` entity: delegatorId, delegateeId, fromDate, toDate, modules (HR/Finance/Procurement/All)
  - When delegator is approver: system checks active delegation, routes to delegatee
  - Delegation request/approval: manager requests, HR admin approves
  - Active delegation indicator on approver's profile
  - Delegation audit trail: all approvals done under delegation flagged

- [ ] **Phase 59 — Global Cross-Module Search** `P2`
  - Search index across: employees, vendors, customers, POs, invoices, bills, assets, contracts, tickets
  - Instant results grouped by entity type
  - Deep link: click result → navigate directly to that record
  - Keyboard shortcut: Ctrl+K opens command palette / search
  - Recent items: last 10 records viewed per user

- [ ] **Phase 60 — Custom Field Creator** `P2`
  - Admin UI: add custom fields to any entity (employee, vendor, customer, PO, invoice)
  - Field types: text, number, date, dropdown (with configurable options), checkbox, multi-select
  - `CustomFieldDefinition` entity: entityType, fieldName, fieldType, required, options, tenantId
  - `CustomFieldValue` entity: entityType, entityId, fieldDefinitionId, value
  - Custom fields appear in forms, list views (optional column), and exports
  - Available in report builder as filterable/sortable columns

- [ ] **Phase 61 — Intercompany Transactions** `P2`
  - `IntercompanyRelationship` entity: entity A, entity B, markupPercent, eliminationGLAccount
  - IC sales: legal entity A invoices entity B → auto-creates corresponding bill in entity B's books
  - IC elimination: consolidated run removes IC balances
  - IC reconciliation report: A/R in entity A vs A/P in entity B (should net zero)

- [ ] **Phase 62 — Down Payment / Advance Management** `P2`
  - Vendor down payment request: create special GL posting (not normal AP)
  - Record advance payment against request
  - Clear advance against vendor invoice on final payment
  - Customer advance receipt: deferred revenue posting
  - Clear on invoice creation
  - Down payment aging report: uncleared advances

---

### SPRINT L — Mobile & Integration (P3-P4)

- [ ] **Phase 63 — Public API + Webhooks** `P3`
  - API documentation portal (Swagger already exists — enrich with examples)
  - Webhook subscriptions: `POST /webhooks` with event types + target URL
  - Events: employee.created, invoice.posted, po.approved, payroll.run.completed, etc.
  - HMAC signature on webhook payload for security
  - Webhook retry with exponential backoff
  - Webhook delivery log + test endpoint

- [ ] **Phase 64 — SSO Implementation (SAML/OIDC)** `P3`
  - SSO entity exists; implement actual SAML 2.0 flow
  - Support IdPs: Azure AD, Okta, Google Workspace
  - JIT provisioning: auto-create user on first SSO login
  - Attribute mapping: email, displayName, department → local user fields
  - SSO bypass: emergency local login if IdP down

- [ ] **Phase 65 — Barcode / QR Scanning** `P3`
  - QR code generation on: PO, GRN, asset, employee badge, item label
  - Mobile camera scan (progressive web app camera API) to:
    - Look up item in inventory
    - Confirm GRN line
    - Record attendance (QR-based clock-in)
    - Look up asset in maintenance

- [ ] **Phase 66 — Multi-Language (i18n)** `P3`
  - Extract all UI strings to locale files (en.json as base)
  - Add: Hindi (hi), Arabic (ar, RTL), French (fr)
  - Language selector in user profile
  - RTL layout support for Arabic
  - Number/date/currency formatting per locale

- [ ] **Phase 67 — Mobile App (PWA)** `P4`
  - Progressive Web App (PWA) — installable on iOS/Android from browser
  - Offline capability: view recent records, queue approvals
  - Push notifications: PO approval needed, leave request, payslip ready
  - Key flows: approve/reject (leave, PO, expense), clock in/out, view payslip, submit expense

- [ ] **Phase 68 — EDI Integration** `P4`
  - Support EDI 850 (PO to vendor), EDI 855 (vendor PO acknowledgment), EDI 856 (ship notice), EDI 810 (invoice)
  - EDI trading partner configuration
  - Inbound EDI: create vendor invoice / shipment notice from EDI file
  - Outbound EDI: send PO to vendor in EDI format
  - EDI transaction log

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
