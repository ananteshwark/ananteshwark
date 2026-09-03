# CLM Gap Analysis & Roadmap — vs. the Top 5 Global Contract Management Tools

**Author:** Application tester / product review
**Date:** 2026-08-14
**System under test:** IKS Contract Management System (air-gapped, FastAPI + React, offline deploy)

---

## 1. Method & scope

**Benchmark set — the five most widely deployed enterprise CLM platforms** (Gartner
Magic Quadrant for CLM, Forrester Wave, and G2/Capterra install base, 2024–2025):

| # | Tool | Known for |
|---|------|-----------|
| 1 | **Icertis** | Enterprise CLM leader; obligation & compliance management, AI (Copilot) |
| 2 | **DocuSign CLM + IAM** | Largest e-signature base; workflow, CLM, AI "Navigator" repository |
| 3 | **SAP Ariba / SAP CLM** | Procurement contracts, spend & sourcing integration |
| 4 | **Conga CLM (ex-Apttus)** | Salesforce-native, clause/template governance, X-Author for Word |
| 5 | **Ironclad** | Modern digital contracting, no-code Workflow Designer, AI redlining |

_Adjacent AI-first tools referenced where relevant: Evisort (now Workday), LinkSquares, SirionLabs, Agiloft, ContractPodAi._

**How compared:** capability-by-capability across the full contract lifecycle
(intake → authoring → negotiation → approval → signature → repository →
obligations → renewal → analytics), plus platform concerns (AI, integrations,
security, admin). Each capability is rated for **our system**: ✅ Have ·
🟡 Partial · ❌ Gap.

**Deployment caveat (important):** this system is **air-gapped / offline by
design**. Several "gaps" in cloud CLM tools (Salesforce/ERP connectors, cloud
SSO/IdP, hosted AI) are **partially or wholly out of scope** for this
deployment model — they are flagged **[cloud-dependent]** and de-prioritized.
The roadmap focuses on capabilities that deliver value **within** an air-gapped
enterprise install.

---

## 2. Current state — what this system already does well

This is a genuinely capable CLM, not a document store. Strengths that match or
exceed mid-market tools:

- **Ingestion & AI extraction** — folder watcher + Google Drive, multi-provider
  extraction (Claude / OpenAI / Gemini / custom), per-field confidence,
  field-learning from history, duplicate detection.
- **Authoring & negotiation** — template + clause library (curated top-N,
  versioned, usage analytics, AI polish), rich editor (tables, merge-field
  chips, drag-drop clauses), version history + side-by-side compare, tokenized
  **vendor portal** with inline **suggesting mode → tracked changes →
  accept/reject merge**, and a matching **internal review** workflow
  (multi-reviewer, section + whole-document suggestions, threaded replies).
- **E-signature** — provider-agnostic layer, DocuSign, envelopes, webhooks,
  completion certificate, signing order, approval gate before send.
- **Lifecycle** — validation queue, register, lifecycle states
  (active/expired/renewed/terminated), milestones, a **reminder rules engine**
  with a daily scheduler, **auto-renewal drafting**, expiry email
  renew/terminate token flow.
- **Master data** — vendor master (aliases, merge, rate history, concentration),
  internal-entity master (suffix-aware, merge, predefined enforcement).
- **Governance** — multi-role RBAC, page-access matrix, full audit log, data
  retention (soft-delete/restore/purge), CSP + upload hardening.

**Net:** the core "author → negotiate → sign → track → renew" loop is strong.
The gaps below are mostly in **workflow configurability, obligation management,
repository-scale AI, integrations, and financial/analytics depth** — the areas
where Icertis/Ironclad/Conga differentiate at the enterprise tier.

---

## 3. Capability comparison matrix

Legend: ✅ Have · 🟡 Partial · ❌ Gap · _[cloud]_ = cloud-dependent, lower priority for air-gapped

| Capability area | Us | Icertis | DocuSign CLM | SAP Ariba | Conga | Ironclad |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Intake / contract request forms** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **No-code workflow / approval designer** | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conditional / parallel / delegated approvals | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Clause playbooks / fallback language** | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Deviation / risk scoring vs standard** | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ |
| **Third-party paper: AI import + clause mapping** | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ |
| **Obligation extraction & tracking** | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ |
| **MS Word add-in / .docx round-trip redlining** | ❌ | ✅ | ✅ | 🟡 | ✅ (X-Author) | ✅ |
| **Repository-wide AI search / "chat with contracts"** | ❌ | ✅ | ✅ (Navigator) | 🟡 | 🟡 | ✅ |
| AI summarization / auto-abstract | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ✅ |
| **Custom fields / configurable schema per type** | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Custom report builder + scheduled reports** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cycle-time / bottleneck analytics** | ❌ | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Payment schedules / milestone billing | 🟡 | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| Spend under management / savings tracking | 🟡 | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| **Tasks / @mentions / assignments** | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SSO (SAML/OIDC) + SCIM provisioning** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Field-level permissions / legal hold | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 |
| CRM / ERP / procurement integration _[cloud]_ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-language UI / multi-currency FX | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Supplier onboarding / counterparty risk profile | ❌ | ✅ | 🟡 | ✅ | 🟡 | 🟡 |
| E-signature (core) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clause library + templates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Version history + compare | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Renewal automation + reminders | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Audit trail | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 4. Detailed gap analysis

### G1 — Contract request intake (self-service) ❌
**What leaders do:** business users submit a request via a configurable form
(counterparty, type, value, key terms); the system routes it to legal/procurement,
auto-selects a template, and starts the workflow. This is the front door of CLM.
**Us:** authoring starts from a blank draft/template/duplicate — no intake form,
no requester role, no routing.
**Why it matters:** removes email/ad-hoc requests, captures demand, measures
turnaround from request. **Effort: L.**

### G2 — Configurable workflow / approval engine 🟡→✅
**What leaders do:** no-code designers (Ironclad Workflow Designer, Icertis rules)
build conditional, multi-stage, parallel and sequential approvals with
value/type/department branching, delegation, escalation, and SLA timers.
**Us:** a single approval gate + department rules (`approval_require_legal`,
`approval_value_threshold`, default signers). No conditional/parallel steps,
no delegation/escalation, no visual designer.
**Why it matters:** approvals are the #1 CLM workflow; rigid gates force
work-arounds. **Effort: XL** (designer) / **L** (config-driven rules without UI builder).

### G3 — Clause playbooks, fallback language & deviation scoring 🟡→✅
**What leaders do:** an approved "playbook" defines standard clauses, **fallback
positions** (preferred → acceptable → walk-away), and auto-flags counterparty
language that **deviates** from standard, with a risk score and suggested
approved wording.
**Us:** clause library with curated/versioned entries + AI risk commentary on a
change — but **no playbook model, no fallback tiers, no automatic deviation
detection against a standard** during negotiation.
**Why it matters:** this is the core of legal-team efficiency and self-service
negotiation. **Effort: L–XL.**

### G4 — Obligation extraction & management 🟡→✅
**What leaders do:** AI extracts **obligations/commitments/deliverables** (who
owes what, by when), creates trackable tasks with owners and due dates, and
reports fulfillment/SLA status across the portfolio.
**Us:** manual `ContractMilestone` records + reminders. No automated obligation
extraction, no obligation register, no fulfillment tracking.
**Why it matters:** post-signature value leakage (missed obligations, SLAs,
price rises) is the #1 ROI claim of Icertis/Sirion. **Effort: L** (extraction
prompt + obligation model + tracking UI).

### G5 — MS Word add-in / .docx round-trip redlining ❌
**What leaders do:** legal edits in **Microsoft Word** (Conga X-Author,
DocuSign, Ironclad) with clauses/fields synced back to the CLM; counterparty
redlines in Word import as tracked changes.
**Us:** editing is in the browser TipTap editor; export is one-way .docx.
Counterparty Word redlines can't round-trip.
**Why it matters:** lawyers live in Word; this is the single biggest adoption
blocker for legal teams. **Effort: XL** (Office add-in) / **M** for a partial win:
**.docx import with tracked-changes → our change ledger** (no add-in).

### G6 — Repository-wide AI: semantic search, Q&A, summarization ❌/🟡
**What leaders do:** "chat with your contracts" — ask "which contracts auto-renew
in 90 days with no cap on liability?" across the whole repository; AI abstracts/
summaries per contract; anomaly detection.
**Us:** embeddings exist but only for **clause** similarity; repository search is
keyword/filters. No semantic search over contracts, no Q&A, no per-contract
AI summary.
**Why it matters:** fastest-growing CLM differentiator (Evisort, Ironclad AI,
DocuSign Navigator). Feasible **offline** with a local embedding model + the
already-configured LLM. **Effort: L–XL.**

### G7 — Custom fields / configurable schema per contract type 🟡→✅
**What leaders do:** admins define custom fields and field sets per contract type
without code; forms and reports adapt.
**Us:** a fixed register schema + a JSON `custom` blob; no admin-defined typed
custom fields, no per-type field sets, not reportable.
**Why it matters:** every org has bespoke metadata (cost center, matter #, risk
tier). **Effort: L.**

### G8 — Custom report builder + scheduled/subscribed reports ❌
**What leaders do:** drag-drop report/dashboard builder, saved reports, scheduled
email delivery, exports.
**Us:** a fixed set of reports (register, expiry, department, vendor-spend,
value-analytics, concentration) + digest email. No ad-hoc builder, no scheduling
of arbitrary reports.
**Why it matters:** self-service reporting for legal ops / finance. **Effort: L.**

### G9 — Cycle-time & process analytics ❌
**What leaders do:** time-in-stage, approval bottlenecks, author/reviewer
throughput, turnaround by type/department, aging.
**Us:** operational dashboard + validator workload, but no cycle-time/stage-
duration analytics across the authoring→signature funnel.
**Why it matters:** legal-ops KPI reporting; identifies bottlenecks. **Effort: M**
(the stage timestamps largely exist in audit/status history). 

### G10 — Tasks, @mentions & assignments 🟡→✅
**What leaders do:** assign tasks, @mention colleagues, activity feed, due dates,
notifications.
**Us:** internal review threads + notifications + assignee on contracts. No
general task objects, no @mentions.
**Why it matters:** coordination across legal/business. **Effort: M.**

### G11 — SSO (SAML/OIDC) + SCIM provisioning ❌ _[partially cloud]_
**What leaders do:** enterprise SSO (Okta/Entra/Ping), SCIM auto-provisioning,
MFA.
**Us:** local password + Google OAuth only.
**Air-gapped note:** many air-gapped enterprises run an **internal IdP** (ADFS,
Keycloak, Entra via internal endpoint) — **on-prem SAML/OIDC is feasible and
valuable**; cloud SCIM less so. **Effort: M–L.**

### G12 — Payment schedules, spend & savings 🟡→✅
**What leaders do:** milestone/payment schedules, invoice/PO linkage, spend under
management, negotiated-savings tracking, budget vs actual.
**Us:** contract value, line-item **rate history**, vendor **concentration** —
good analytics, but no payment schedule, no PO/invoice linkage, no savings
tracking.
**Why it matters:** procurement/finance value story (Ariba/Coupa core).
**Effort: L.**

### G13 — Third-party paper handling (counterparty templates) 🟡→✅
**What leaders do:** upload counterparty's contract → AI maps clauses to your
taxonomy, flags missing/risky clauses vs playbook, proposes fallback language.
**Us:** .docx/.pdf import creates a draft (text only). No clause mapping, no
playbook comparison, no gap flagging.
**Why it matters:** ~half of contracts start on the counterparty's paper.
Depends on G3 (playbooks). **Effort: L.**

### G14 — Supplier/counterparty onboarding & risk profile ❌
**What leaders do:** counterparty record with compliance docs (insurance, W-9,
certifications), expiry tracking, risk score, onboarding checklist.
**Us:** vendor master with contacts/addresses/aliases; no compliance-doc vault,
no counterparty risk profile. **Effort: M.**

### G15 — Multi-language & multi-currency FX 🟡
**What leaders do:** localized UI, multi-currency with FX normalization for
portfolio value.
**Us:** currency **field** but no FX conversion/normalization; English-only UI.
**Effort: M** (FX table + normalization) / **L** (i18n).

### G16 — Field-level permissions & legal hold 🟡
**What leaders do:** restrict specific fields/sections by role; legal hold freezes
records from edit/purge for litigation.
**Us:** page-level access + restricted authoring fields (partial); retention
purge exists but no legal-hold lock. **Effort: M.**

### G17 — Integrations (CRM/ERP/procurement/Slack/Teams) ❌ _[cloud]_
**Air-gapped note:** external SaaS connectors are largely **out of scope**. What
**is** in scope and valuable: a **documented outbound REST/webhook API** and
**Slack/Teams via internal incoming-webhook** (already partially present for
notifications). Prioritize an **open API + webhook catalog** over specific SaaS
connectors. **Effort: M.**

---

## 5. Roadmap

Phases are ordered by **value ÷ effort within the air-gapped model**. Effort:
S ≈ ≤3 d · M ≈ 1–2 wk · L ≈ 3–5 wk · XL ≈ 6 wk+.

### Phase A — Workflow & governance depth _(the biggest functional gap)_
Goal: match enterprise expectations for how contracts move and get approved.
1. **Contract request intake** (G1) — requester role, configurable intake form,
   auto-template selection, routing to a drafting queue. _(L)_
2. **Configurable approval workflow** (G2) — config-driven conditional/parallel/
   sequential approval stages with delegation, escalation and SLA timers; a
   simple stage editor before a full no-code designer. _(L → XL)_
3. **Cycle-time & process analytics** (G9) — stage-duration, bottleneck and
   turnaround reports from existing status/audit history. _(M)_
4. **Tasks & @mentions** (G10) — task objects with owner/due-date + @mention in
   comments/reviews. _(M)_

### Phase B — Legal-team efficiency (playbooks & third-party paper)
Goal: make negotiation and review self-service and risk-aware.
1. **Clause playbooks + fallback tiers** (G3) — standard/fallback/walk-away per
   clause type, tied to the clause library. _(L)_
2. **Deviation detection & risk scoring** (G3) — flag counterparty language that
   deviates from the playbook, with AI-suggested approved wording. _(L)_
3. **Third-party paper import + clause mapping** (G13) — map an uploaded
   counterparty doc to the taxonomy, flag missing/risky clauses. _(L, needs B1)_
4. **.docx tracked-changes round-trip** (partial G5) — import Word redlines into
   the change ledger; export with tracked changes. _(M)_ _(Full Word add-in = later XL.)_

### Phase C — Repository-scale AI
Goal: catch up to the AI-first differentiator, entirely on-prem.
1. **Per-contract AI abstract/summary** (G6) — one-paragraph summary + key-terms
   card, generated at validation. _(M)_
2. **Semantic search over the repository** (G6) — local embeddings index of
   contracts; hybrid keyword+vector search. _(L)_
3. **"Chat with contracts" Q&A** (G6) — natural-language questions answered with
   citations across the repository (RAG over the local index + configured LLM). _(L–XL)_
4. **AI obligation extraction** (G4) — extract obligations/SLAs into a trackable
   register. _(L)_

### Phase D — Obligations, financials & configurability
Goal: post-signature value capture + admin flexibility.
1. **Obligation & milestone management** (G4) — obligation register, owners, due
   dates, fulfillment/SLA status, portfolio view. _(L; pairs with C4)_
2. **Payment schedules & spend** (G12) — payment/milestone schedule, PO/invoice
   reference, spend-under-management + savings tracking. _(L)_
3. **Custom fields per contract type** (G7) — admin-defined typed fields + field
   sets; surfaced in forms, filters and reports. _(L)_
4. **Custom report builder + scheduling** (G8) — saved report definitions,
   scheduled email delivery, export. _(L)_

### Phase E — Enterprise platform & security
Goal: enterprise IT/security requirements for an on-prem install.
1. **On-prem SSO (SAML/OIDC)** (G11) — integrate an internal IdP (ADFS/Keycloak/
   Entra internal); keep local fallback. _(M–L)_
2. **Field-level permissions + legal hold** (G16) — per-field visibility/edit by
   role; legal-hold lock exempting records from edit/purge. _(M)_
3. **Open REST/webhook API + catalog** (G17) — documented outbound API,
   Slack/Teams internal webhooks, event catalog. _(M)_
4. **Counterparty onboarding & compliance vault** (G14) — compliance-doc store
   with expiry tracking + risk profile. _(M)_
5. **Multi-currency FX + i18n scaffolding** (G15) — FX normalization for
   portfolio value; externalize UI strings. _(M–L)_

### Explicitly de-scoped (air-gapped) 
Cloud CRM/ERP/procurement SaaS connectors, hosted-AI dependencies, cloud SSO/SCIM
to public IdPs, vendor-hosted analytics. Revisit only if the deployment model
changes.

---

## 6. Recommended sequencing (quick wins → strategic)

**Quick wins (highest value ÷ effort, do first):**
- Cycle-time analytics (G9) — data already exists.
- Per-contract AI summary (G6.1) — LLM already wired.
- Tasks & @mentions (G10).
- Custom fields per type (G7).

**Strategic bets (define the product's tier):**
- Configurable approval workflow (G2).
- Clause playbooks + deviation scoring (G3).
- Repository AI search + Q&A (G6).
- Obligation management (G4).

**Adoption unlockers (remove blockers):**
- Contract request intake (G1).
- On-prem SSO (G11).
- .docx tracked-changes round-trip (partial G5).

---

## 7. Caveats

- Competitor capabilities are assessed at the **category level** from public
  product documentation and analyst reports (2024–2025); exact feature depth
  varies by edition/tier and evolves quickly (especially AI).
- Ratings for **our system** reflect the codebase as of 2026-08-14.
- Effort estimates are engineering-only and assume the existing stack; they
  exclude change-management, data migration and security review.
