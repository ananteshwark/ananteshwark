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

## Build order (per the original spec, section 8)
- [x] **Phase 1 — Foundation**: multi-tenant core (RLS, tenant context), auth
      (JWT + refresh), users + invites, RBAC, workflow engine, notifications,
      audit trail, i18n (en/hi), API gateway + Swagger, React UI shell + theming.
- [x] **Phase 2 — Finance core**: GL (chart of accounts, journals,
      double-entry, periods/close), AP (vendors, bills, payments), AR (customers,
      invoices, receipts), bank & reconciliation, financial reports (trial
      balance, P&L, balance sheet, GL detail, cash flow).
- [x] **Phase 3 — HR core + Attendance + Leave**: employee master & lifecycle,
      org structure, ESS/MSS, shifts/rosters/holidays, time capture, leave types
      & accruals & approvals, timesheets.
- [x] **Phase 4 — Payroll + Statutory Compliance (India first)**: pay
      components/structures, payroll runs (multi-currency, arrears, off-cycle),
      payslips, bank files; India pack: PF/ESI/PT/TDS (24Q/Form 16)/gratuity,
      compliance calendar. GL postings to finance.
- [x] **Phase 5 — Procurement (S2P)**: vendors, requisitions → RFQ → PO,
      approval matrices, GRN, 3-way match into AP.
- [x] **Phase 6 — Talent + Goal/Performance**: ATS, onboarding, L&D,
      succession; OKRs/goals, reviews, appraisal cycles, calibration.
- [x] **Phase 7 — Additional modules**: inventory/warehouse, projects,
      expenses, CRM (enable per tenant).
- [x] **Phase 8 — Localization packs**: add US + UAE to prove the pluggable
      localization/tax framework.

## Gap-closure phases (SAP/Oracle parity — identified 2026-06)
- [x] **Phase 9 — Fixed Assets (FAM)**: asset register, depreciation engine
      (SLM/WDV/DB), asset categories, acquisitions, disposals, GL postings,
      depreciation runs, asset reports. Frontend: asset list, detail, run page.
- [x] **Phase 10 — Sales Orders (Quote→Order→Invoice)**: convert CRM quotes to
      sales orders, order lines, fulfilment status, auto-create AR invoice on
      ship/complete; price lists & discounts; sales order reports.
- [x] **Phase 11 — ESS / MSS Portal**: employee self-service (view own payslips,
      leave balance, leave apply, profile, documents, payroll history); manager
      self-service (team leave approvals, team timesheets, headcount).
- [x] **Phase 12 — Contract Management (CLM)**: purchase & sales contracts,
      contract templates, terms, milestones, renewal alerts, link to PO/Invoice.
- [x] **Phase 13 — Dunning & Collections**: dunning levels/templates, dunning
      runs on overdue AR, dunning letters, payment plans, write-off workflow.
- [x] **Phase 14 — Manufacturing (PP)**: bill of materials (BOM multi-level),
      work centers, routings, production orders (planned→released→completed),
      material issuance, yield, scrap, GL postings (COGS/WIP/FG).
- [x] **Phase 15 — Quality Management (QM)**: inspection plans, inspection lots
      (GRN-triggered/production-triggered), usage decisions, non-conformance
      reports, CAPA workflow, quality certificates.
- [x] **Phase 16 — Plant Maintenance (PM)**: equipment/functional locations,
      maintenance plans (time/counter-based), maintenance orders, breakdown
      notifications, spare parts, cost postings.
- [x] **Phase 17 — Benefits Administration + Compensation Planning**: benefit
      plans (health/dental/401k), enrollment periods, employee elections,
      payroll deduction integration; salary bands, merit cycles, comp letters.
- [x] **Phase 18 — Inventory completeness**: lot/serial tracking, bin management,
      reorder points (min/max), stock valuation (FIFO/WA), cycle counting,
      multi-UoM, returns/RMA.
- [x] **Phase 19 — Advanced Analytics + Report Builder**: custom report designer,
      scheduled email delivery, embedded charts (P&L trend, cash flow, headcount),
      budgeting & forecasting module, variance analysis.
- [x] **Phase 20 — Platform hardening**: SSO/SAML/OAuth2 IdP integration, GRC
      (segregation-of-duties rules engine), tax engine (GST/VAT auto-calc on
      transactions), e-Invoicing (India GST IRN/e-way bill), API rate limiting,
      data archiving/retention policies.

## Cross-cutting principles (apply every phase)
- Configuration over customization; localization is pluggable (never bake one
  country's rules into core).
- Financial correctness is non-negotiable: double-entry, period close, audit.
- Tenant isolation is non-negotiable: every entity carries `tenant_id`; no
  cross-tenant reads.
- API-first: every UI action backed by a documented, RBAC-guarded endpoint.

## Local run (Docker Desktop)
`docker-compose up` → web http://localhost:5173, API http://localhost:3000,
docs http://localhost:3000/api/docs. Login: admin@demo.com / Admin@123, tenant
slug `demo`.
