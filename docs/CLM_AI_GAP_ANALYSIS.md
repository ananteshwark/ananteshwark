# AI-CLM Gap Analysis & Enhancement Roadmap (Round 2)

**Date:** 2026-08-14 · **Build:** post-Phase-E (551 backend tests green)
**Scope:** hands-on testing of the running system, then benchmarking against the
AI-native CLM tier (Ironclad, Icertis Copilot, Luminance, Robin AI, Spellbook,
Sirion, Evisort/Workday, LinkSquares, DocuSign IAM).

> Round 1 (`CLM_GAP_ANALYSIS.md`) benchmarked against the *incumbent* CLM suites
> and produced Phases A–E, all now shipped. This round asks a harder question:
> against the tools whose entire pitch is AI, where do we still fall short?

---

## 1. How this was tested

Not a paper review. Against a live instance plus a static audit:

- Booted the app on a clean SQLite DB, seeded a super-admin, and probed the
  REST surface with a real token (33 routers, ~200 endpoints).
- Walked the register → draft → review → approval → signature → obligation
  path looking for breaks between the features shipped in Phases A–E.
- Audited feature wiring statically (does X actually feed Y?).
- **Measured retrieval quality directly** by scoring known paraphrase pairs
  through the production embedding function.

---

## 2. Verdict

Feature *breadth* is now genuinely competitive — the register, authoring,
playbooks, obligations, spend, reporting and enterprise controls all exist and
are tested. Two things separate us from the AI-native tier:

1. **The AI is advisory, never agentic.** We detect, flag and summarise. The
   leaders *act*: they propose the actual redline, draft the counter-offer, and
   pre-fill the intake. A reviewer still does 100% of the typing here.
2. **The AI layer has no quality floor.** Retrieval is lexical (measured below),
   citations are unverified, there is no eval harness, and no record of whether
   a human accepted or rejected any AI output. Nothing would tell us if quality
   regressed tomorrow.

There is also a third, cheaper category: **integration debt** — Phase A–E
features that work individually but were never wired to each other.

---

## 3. Gaps found

### Class 1 — Integration debt (built, not connected)

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **6 pages ungoverned by role access.** `reviews`, `requests`, `tasks`, `repository_ai`, `obligations`, `report_builder` are missing from the page-access catalogue, so admins cannot restrict them. Unknown keys default to *visible*. | `page_access.PAGES` lists 17 pages; nav renders 23 |
| 2 | **Obligations never trigger reminders or escalation.** They appear in the digest only. The reminder engine — with offsets, escalation and recipients — knows contract expiry, not obligation due dates. | no milestone path in `services/reminders.py` |
| 3 | **Dashboard predates Phases A–E.** No obligations, no risk, no cycle-time, no spend. Everything built in the last four phases is invisible on the landing page. | dashboard returns only ingestion/validation/expiry keys |
| 4 | **Obligation extraction is manual.** AI abstract + embedding run automatically at validation; obligations require someone to click per contract. | `index_contract` is called at validate; `extract_obligations` is not |
| 5 | **Playbook scoring is draft-only.** `GET /contracts/{id}/deviations` → 404. Executed contracts in the register can never be scored, so there is no portfolio risk position. | endpoint exists only under `/authoring/drafts/…` |
| 6 | **Risk scores are never persisted.** Computed on the fly and thrown away — no trend, no report column, no approval gate, no alerting. | no `risk_score` column in `models.py` |
| 7 | **Global search misses drafts, clauses and obligations.** Returns contracts, vendors and text matches only. | `/api/search` sections |
| 8 | **No bulk obligation actions.** Portfolio view lists hundreds; each must be ticked individually. | no bulk route in `obligations_api.py` |

### Class 2 — AI quality & trust (highest risk)

| # | Gap | Evidence |
|---|-----|----------|
| 9 | **"Semantic" search is lexical.** The offline hashing embedding scores character n-grams, not meaning. Measured: *"the vendor shall indemnify the company"* vs *"the supplier will hold us harmless"* = **0.165**, while *"teleradiology imaging"* vs *"cafeteria catering"* (unrelated) = **0.174** — a true paraphrase scores **lower than noise**. Retrieval for both search and RAG is fuzzy keyword matching. | measured against `services/embeddings.embed` |
| 10 | **Citations are unverified.** The Q&A prompt asks the model to cite `[#n]`; nothing checks the cited contract was actually retrieved, or that the claim appears in it. A confident wrong answer is indistinguishable from a right one. | no citation validation in `repository_ai_api.ask` |
| 11 | **No AI output audit.** No record of what the model produced, which prompt/model version made it, or whether the human accepted it. Required by most legal-ops AI policies, and it is also the training signal for improving. | no AI audit entity |
| 12 | **No eval harness.** No golden set, no regression gate. A prompt or model change ships blind. | no eval tests |
| 13 | **One global model for every task.** Extraction, summarisation, obligations, gap analysis and Q&A all share a single configured model with no per-feature routing, no cheap/expensive tiering, no fallback chain. | `ai_client._resolve` |
| 14 | **Retrieval is O(n) brute force in Python.** Every contract's 256-float vector is loaded and scored per query. Fine at hundreds; unusable at 50k+. No ANN, no pgvector. | `contract_ai.semantic_search` |

### Class 3 — Agentic capability (the frontier gap)

| # | Gap | What the AI-native tier does |
|---|-----|------------------------------|
| 15 | **No auto-redline.** We map third-party clauses and score deviation — then stop. | Luminance/Spellbook/Robin propose the actual replacement text as tracked changes, ready to accept |
| 16 | **No negotiation copilot.** | Suggests counter-language with rationale, drafts the reply to the counterparty, recalls what this vendor conceded last time |
| 17 | **No per-contract Q&A.** `/ask` is repository-wide only; you cannot interrogate the contract you are reading. | Ask-this-document is table stakes |
| 18 | **No multi-contract comparison.** | "Compare the liability caps across these 5 NDAs" as a structured table |
| 19 | **No intake copilot.** Requests are typed manually into a form. | NL request → auto-classify type → pick template → pre-fill → route for approval |
| 20 | **No email/mobile approval.** Approvers must log into the SPA. | One-tap approve from the notification e-mail |

---

## 4. Benchmark summary

| Capability | Us today | AI-native tier |
|---|---|---|
| Clause playbook + deviation detection | ✅ Strong | ✅ |
| Third-party paper clause mapping | ✅ | ✅ |
| **Proposes the redline** | ❌ | ✅ |
| **Negotiation copilot** | ❌ | ✅ |
| Contract abstract / key terms | ✅ | ✅ |
| Obligation extraction | ✅ (manual trigger) | ✅ (automatic + tracked to fulfilment) |
| Repository Q&A with citations | ⚠️ Unverified cites | ✅ Grounded + verified |
| Semantic retrieval | ❌ Lexical only | ✅ True embeddings |
| Per-document Q&A / comparison | ❌ | ✅ |
| Portfolio risk scoring & trend | ❌ | ✅ |
| AI governance (evals, audit, versioning) | ❌ | ✅ Enterprise requirement |
| Air-gapped operation | ✅ **Our advantage** | ⚠️ Mostly cloud-dependent |

Our differentiator remains that all of this runs on-prem with no external
dependency. The roadmap below preserves that: every item degrades gracefully
when no model is configured.

---

## 5. Roadmap

### Phase F — Close the loop *(integration debt; highest value ÷ effort)*
Everything here connects features that already exist. Mostly days, not weeks.

1. **F1 · Page-access registry** — register the 6 missing pages with sensible
   role defaults. _(S)_
2. **F2 · Obligations → reminders** — obligation due dates flow through the
   existing reminder engine: offsets, owner notification, escalation, overdue
   digest. Closes the extract→track→chase loop. _(M)_
3. **F3 · Dashboard 2.0** — obligation status, portfolio risk, cycle-time and
   spend widgets; role-aware. _(M)_
4. **F4 · Auto-extract obligations at validation** + a bounded backfill job,
   mirroring how the AI abstract already works. _(S)_
5. **F5 · Score contracts, not just drafts** — extend deviation analysis to
   register contracts, **persist the score**, expose it as a report column,
   filter, and approval gate. _(M)_
6. **F6 · Unified search** — drafts, clauses and obligations in global search. _(M)_
7. **F7 · Bulk obligation actions** — multi-select complete/assign/re-date. _(S)_

### Phase G — Make retrieval real *(unblocks everything AI)*
Phase H and I both depend on retrieval that actually works.

1. **G1 · Real embeddings, offline** — ship a small sentence-transformer
   (e.g. all-MiniLM, ~80MB, CPU-only) bundled in the tarball; keep the hashing
   embedding as the no-model fallback. Re-index in place. _(M)_
2. **G2 · Vector index at scale** — pgvector + HNSW on Postgres, with the
   in-memory path retained for SQLite. _(M)_
3. **G3 · Hybrid retrieval** — BM25/trigram + vector with reciprocal-rank
   fusion; the two signals cover each other's failure modes. _(M)_
4. **G4 · Citation enforcement** — post-validate every `[#n]`: the contract must
   have been retrieved, and the supporting span must exist. Unsupported claims
   are stripped or flagged, not shown as fact. _(M)_
5. **G5 · Per-contract Q&A + comparison** — ask this document; compare N
   contracts on chosen attributes as a table. _(M)_

### Phase H — Agentic drafting & negotiation *(the differentiator)*

1. **H1 · Auto-redline third-party paper** — for each off-playbook clause,
   generate the concrete replacement from the standard/fallback tier and emit it
   as **tracked changes** into the draft, each individually accept/reject-able.
   Builds directly on the existing playbook tiers + `.docx` tracked-changes
   engine. _(L)_
2. **H2 · Negotiation copilot** — counter-proposal with rationale, informed by
   this counterparty's concession history (the negotiation ledger already
   exists); drafts the reply message. _(L)_
3. **H3 · Intake copilot** — NL request → classify type → select template →
   pre-fill fields → route. _(M)_
4. **H4 · Email / mobile approval** — signed one-tap approve/reject links,
   reusing the tokenized-action pattern already built for renewals. _(M)_

### Phase I — AI governance & trust *(enterprise gate)*
Ship alongside H — legal teams will not run agentic AI without it.

1. **I1 · AI output audit** — persist every generation: feature, prompt version,
   model, inputs hash, output, latency, and the human accept/reject/edit. _(M)_
2. **I2 · Eval harness** — golden set per feature (extraction, obligations,
   deviation, Q&A) with scored regression runs in CI. _(M)_
3. **I3 · Prompt & model registry** — versioned prompts per feature (extend the
   existing `PromptTemplate`), per-feature model routing, fallback chain, and a
   cost/latency budget per call. _(M)_
4. **I4 · Confidence & abstention** — surface retrieval confidence; abstain
   rather than guess when evidence is weak. _(S)_

### Phase J — Portfolio intelligence *(after F+G land)*

1. **J1 · Structured clause attributes** — extract *liability cap = 12 months
   fees* as queryable data, not just text, so "every contract with uncapped
   liability" is a filter, not a search. _(L)_
2. **J2 · Risk trending & alerts** — portfolio risk over time, concentration and
   exposure analytics, alerts when a threshold is crossed. _(M)_
3. **J3 · Bulk AI operations** — batch summarise/extract/score with progress and
   resumability, reusing the existing job pattern. _(M)_

---

## 6. Recommended sequencing

**Do first (quick wins, ~2 weeks):** F1, F4, F7, I4 — small, self-contained, and
they make existing investment visible.

**Then (the unlock):** G1 → G2 → G3 → G4. Until retrieval is real, every
AI feature built on top of it inherits a weak foundation. G1 alone is the single
highest-leverage change in this document.

**Then (the differentiator):** F5 → H1 → H2, shipped with I1 + I2 so the agentic
output is auditable and regression-tested from day one.

**Then:** F2, F3, F6, H3, H4, then Phase J.

**Explicitly still out of scope (air-gapped):** cloud-hosted model APIs as a
*hard* dependency, public-IdP SCIM, SaaS procurement/CRM connectors, vendor-hosted
analytics. Every recommendation above runs fully on-prem.

---

## 7. Risk note

The most under-appreciated finding is **#9**. Semantic search and RAG Q&A both
present as working — endpoints return results, tests pass, the UI is complete —
but retrieval cannot match a paraphrase. Users will trust the answers because
the interface looks confident. Combined with **#10** (unverified citations),
that is the highest-risk item in the system today, and G1 + G4 should be treated
as correctness fixes rather than enhancements.
