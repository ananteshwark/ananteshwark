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
- [ ] **Phase 4 — Payroll + Statutory Compliance (India first)**: pay
      components/structures, payroll runs (multi-currency, arrears, off-cycle),
      payslips, bank files; India pack: PF/ESI/PT/TDS (24Q/Form 16)/gratuity,
      compliance calendar. GL postings to finance.
- [x] **Phase 5 — Procurement (S2P)**: vendors, requisitions → RFQ → PO,
      approval matrices, GRN, 3-way match into AP.
- [ ] **Phase 6 — Talent + Goal/Performance**: ATS, onboarding, L&D,
      succession; OKRs/goals, reviews, appraisal cycles, calibration.
- [ ] **Phase 7 — Additional modules**: inventory/warehouse, projects,
      expenses, CRM (enable per tenant).
- [x] **Phase 8 — Localization packs**: add US + UAE to prove the pluggable
      localization/tax framework.

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
