# Production Readiness Roadmap
### Gap analysis vs Oracle Fusion Cloud, SAP S/4HANA, and DarwinBox

**Date:** 2026-07-05 · **Branch:** `claude/app-build-setup-ntay5k`
**Companion docs:** `ORACLE_FUSION_GAP_ANALYSIS.md` (functional Fusion map), `SAP-GAP-ANALYSIS.md` (functional S/4 map), `ROADMAP.md` (build tracker).

This document answers a different question than the two functional gap analyses:
**what stands between this codebase and running it in production for real
customers at the standard set by Fusion / S/4HANA / DarwinBox?** Functional
breadth is largely there (verified below); the deciding gaps are
platform-grade concerns.

---

## 1. Where the application already stands

Verified in-code (not aspirational):

| Pillar | Depth found |
|---|---|
| Finance | GL, AP, AR, bank+recon, payment runs, dunning, collections, lockbox, GR/IR, cash discount, encumbrance, budget, tax, currency, ledgers, **close-management cockpit**, **intercompany**, consolidation, treasury, lease (ASC 842), revenue recognition (ASC 606), fixed assets, controlling |
| Supply chain | Requisition→RFQ→PO→GRN→3-way match→AP invoice; inventory + WMS + valuation/costing + genealogy; **MRP + CRP + FCS**; demand planning; transportation; quality; maintenance (CMMS) |
| Sales | CPQ, pricing conditions, credit mgmt, ATP/promising, deliveries+POD, billing plans, returns/credit notes, incentives, CTO |
| HCM | Employee lifecycle (transfers, probation, confirmation), attendance+shifts+time evaluation, leave, OTL, payroll (components/runs/retro/statutory India/GL costing), exits+F&F, headcount, skills |
| Talent | ATS, hiring, onboarding, LMS, goals/OKR, performance+calibration, appraisal, succession, **BGV** |
| Employee experience | Surveys/eNPS, recognition, company feed, HR helpdesk (SLA), HR letters, travel |
| Platform | Multi-tenant + licensing, RBAC (catalog-enforced), workflow engine + BPM, **automation rule engine wired into every workflow (30+ events)**, webhooks, custom fields, SSO config, DMS, search, audit interceptor, i18n/localization packs, GDPR/privacy (erasure requests), delegation, IP allowlisting, session registry, TOTP primitives, rate limiting (@nestjs/throttler), assistant |

Tests: **152 suites / 1,456 unit tests** green; API + web builds clean.

---

## 2. P0 — Production blockers (platform-grade)

These are the items a Fusion/S4/DarwinBox operations review would fail the
deployment on. **Status column reflects work done in this enhancement pass.**

| # | Gap | Why it blocks production | Status |
|---|---|---|---|
| P0.1 | **No database migration path.** `synchronize` runs only in development; `migration:run` scripts pointed at a non-existent `src/database/data-source.ts`; the migrations folder was empty. Production had no way to create or evolve the schema. | Every peer product ships versioned, repeatable schema migrations; schema-sync in prod risks destructive DDL. | ✅ **BUILT** — `src/database/data-source.ts`, adopt-or-create baseline migration, `migrationsRun` on in production, working npm scripts. |
| P0.2 | **MFA never enforced at login.** TOTP enrollment existed (Security module + UI tab) but `POST /auth/login` issued full tokens regardless — enrollment was a dead end. | SOC 2 / customer security reviews require step-up auth actually gating token issuance. | ✅ **BUILT** — login returns an MFA challenge for verified enrollments; `/auth/mfa/verify` completes login; two-step LoginPage. |
| P0.3 | **No security response headers.** No helmet/no equivalent: missing `X-Content-Type-Options`, `X-Frame-Options`, HSTS, `Referrer-Policy`, `Permissions-Policy`. | Baseline OWASP hardening expected of any SaaS. | ✅ **BUILT** — dependency-free security-headers middleware applied globally. |
| P0.4 | **No request tracing or metrics.** No correlation IDs, no structured access log, no `/metrics`. Incidents would be undebuggable; no SLO measurement possible. | Fusion/S4 ops rely on tracing + golden signals; DarwinBox publishes uptime SLAs. | ✅ **BUILT** — `X-Request-ID` propagation + access log line per request + in-memory metrics registry exposed in Prometheus text format at `/metrics`. |
| P0.5 | **Scheduler durability.** Automation sweeps use in-process `setInterval`; multi-instance deployments would double-fire, and restarts lose schedule state. | Peers use durable job queues (Redis/DB-backed) with leader election. | ✅ **BUILT** — `scheduler_leases` table + atomic acquire (`INSERT … ON CONFLICT` that only steals expired leases); timer ticks are lease-gated so a scaled-out deployment fires each sweep exactly once; crashed leaders replaced within one tick. Durable one-shot `jobs` table remains a follow-up. |
| P0.6 | **No idempotency keys on mutating APIs.** Retried POSTs (mobile/webhook callers) can double-create documents. | Fusion REST and S/4 OData both support idempotent replay semantics. | ✅ **BUILT** — opt-in `Idempotency-Key` header on POSTs: first execution stores its response in `idempotency_keys`; retries replay it (marked `X-Idempotent-Replay: true`) without re-running the handler. |
| P0.7 | **No optimistic concurrency.** No `@VersionColumn` anywhere; two users editing the same PO silently last-write-wins. | S/4 uses ETags; Fusion uses object version numbers. | ✅ **BUILT** — `@VersionColumn` on PO, SO, AR invoice, vendor invoice, expense claim, employee; update paths reject a stale echoed version with 409 CONFLICT (`assertVersion` guard); clients that send no version keep legacy behavior. |
| P0.8 | **Backup/DR & data lifecycle runbooks absent.** Nothing defines RPO/RTO, PITR configuration, tenant export, or archival. | Contractual table stakes for enterprise SaaS. | ◻ Next: document + tenant-level export job (JSON per module) as the portable-backup primitive. |

## 3. P1 — Functional parity gaps that matter for deals

| # | Gap vs peer | Peer reference | Proposed shape |
|---|---|---|---|
| P1.1 | **E-invoicing / statutory tax returns.** Payroll statutory (India) exists, but there is no GST e-invoice (IRN/QR), no GSTR-1/3B return prep, no PEPPOL/UBL export. | S/4 Document & Reporting Compliance; Fusion tax reporting | ✅ **BUILT (India GST)** — `compliance/` module: INV-01 payload builder (CGST/SGST vs IGST by GSTIN state codes), deterministic IRN (SHA-256 supplier+FY+doc), e-invoice register with the 24-hour cancel rule, `GET /compliance/gst/gstr1` (B2B by GSTIN + B2C bucket) and `/gstr3b` (output tax vs ITC net). Live IRP transmission adapter + PEPPOL/UBL remain follow-ups. |
| P1.2 | **Bank connectivity formats.** Payment runs exist; no ISO 20022 pain.001 export / camt.053 import (bank files page is India-format oriented). | S/4 Advanced Payment Management | ✅ **BUILT** — `GET /finance/payment-runs/:id/pain001` renders pain.001.001.03 (one credit transfer per vendor, IBAN or Othr fallback, BIC or IFSC clearing routing, remittance from bill numbers, control sums). `POST /finance/bank/imports/camt053` parses camt.053 statements (signed amounts from CdtDbtInd, booking dates, EndToEndId/AcctSvcrRef references) into the existing import + auto-match pipeline. |
| P1.3 | **Landed cost.** GRN/valuation exist; no freight/duty allocation to inventory cost. | S/4 landed costs; Fusion Cost Mgmt | ✅ **BUILT** — LC-numbered documents charging freight/duty/insurance/handling against a GRN, allocated over accepted lines by VALUE (qty × PO price) or QUANTITY with rounding absorbed by the last line so totals reconcile exactly; per-line unit-cost delta computed; DRAFT→POSTED lifecycle (posted docs reverse via a new document). Valuation-layer push is the follow-up. |
| P1.4 | **Approval matrix depth.** Workflow engine supports role/user approvers; peers ship amount-band × org-unit approval matrices with delegation windows (delegation module exists — matrices don't). | Fusion AMX; S/4 flexible workflow | ✅ **BUILT** — `wf_approval_matrix` rules (docType × amount band × org unit → sequential approver chain). Each rule auto-generates a workflow definition, so matrix approvals reuse the engine's authorization/history/escalation. Resolution specificity: org-unit match > narrowest band > priority. Endpoints: rules CRUD, `GET .../resolve` preview, `POST .../start` to route a document. |
| P1.5 | **Interactive dashboards / embedded analytics.** Analytics module exists (cross-module KPIs); peers ship pivot/drill semantic layer. | SAC embedded; Fusion OTBI | Saved-query semantic layer over existing analytics endpoints |
| P1.6 | **Workforce scheduling / shift roster optimization.** Shifts exist; auto-rostering and coverage planning do not. | DarwinBox WFM; SAP TM | Coverage-demand table + greedy assigner (phase 1) |
| P1.7 | **Payroll country packs beyond India.** Statutory engine is India-first; US/UAE localization packs exist for finance, not payroll. | DarwinBox multi-country payroll | Pluggable statutory calculators per country pack |

## 4. P2 — Differentiators (build after P0/P1)

- **AI copilots per module** (assistant module exists as chat; peers ship task-completing agents: "create a PO from this email").
- **Org network analysis / attrition prediction** (DarwinBox Talent Intelligence).
- **Mobile offline** (mobile module is API-side; peers ship offline-first apps with sync).
- **Marketplace/app store** for tenant extensions (extensibility module is the seed).
- **Continuous close / anomaly detection on journals** (S/4 "continuous accounting").

## 5. Sequencing recommendation

1. **Now (this pass):** P0.1–P0.4 — shipped. ✅
2. **Next sprint:** P0.5 (scheduler leader election), P0.6 (idempotency), P0.7 (optimistic locking) — small, self-contained, high risk-reduction.
3. **Then:** P1.1 e-invoicing + P1.2 bank formats (unlocks India + EU go-lives), P1.4 approval matrices (most-requested enterprise control).
4. **Ongoing:** P0.8 runbooks alongside first real deployment; P1.5–P1.7 by pipeline demand; P2 as roadmap bets.

---

*Sections 2–4 were verified against the codebase on the date above (module
inventory, `main.ts` bootstrap, database config, auth flow, scheduler
implementation). Peer capability references are drawn from the published
capability maps of Oracle Fusion Cloud ERP/HCM, SAP S/4HANA, and DarwinBox.*
