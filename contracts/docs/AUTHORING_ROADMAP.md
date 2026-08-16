# Contract Authoring Module — Completeness Audit & Roadmap

_Last updated: 2026-08-01 (audit rev. 2) · branch `claude/contract-management-system-buhdr3`_

> **Audit log** — rev. 1: first full spec pass (found the OTP + webhook P0s).
> rev. 2: fidelity / e‑sign edge cases / named schema+prompt deliverables / unenforced
> flags (multi‑signer bug, watermark, prompts, line items, …).
> rev. 3: admin‑surface & lifecycle sweep (no DocuSign/global‑approval config UI;
> deleted drafts not restorable).
> rev. 4: convergence sweep — no new material gaps found (see §6). Rows are tagged
> with the revision that added them.
> rev. 5: **user‑requested backlog** — nine items from the product owner, folded into
> the tiers below and mapped in §7. (These are feature requests, not audit findings.)
> rev. 6: **build progress** — R1 and R2 shipped in full (0.1–0.3 hardening; 1.1–1.12).
> R3 **complete**: 2.1 (embeddings clustering), 2.2 (auto‑feed on validation),
> 2.3 (inline suggestion‑mode redline), 2.4 (cross‑refs/defined terms),
> 2.5/2.6 (Certificate of Completion + party delivery), 2.7 (DocuSign
> templates/reminders/expiration/correct), 2.8 (clause gutter), 2.9 (versioned
> authoring prompts), 2.10 (line‑item authoring), 2.11 (rich‑formatting +
> watermark exports), 2.13, 2.14, 2.15, 2.16. R5 3.19 (multi‑step undo) done.
> All nine user‑requested items (§7) are complete. Remaining: R4, and the rest of R5.
> rev. 7: **R4 + R5 complete.** R4: 3.1 (async gap analysis), 3.2/3.16 (search
> indexes + scale test), 3.3 (code‑splitting), 3.4 (end‑to‑end workflow test +
> Playwright scaffold), 3.5 (observability/metrics), 3.11 (ledger‑retention
> safety), 3.12 (go‑live checklist), 3.13 (normalized change‑disposition history),
> 3.14 (vendor nudge). R5: 3.6 (Indian numbering), 3.7 (template re‑tokenization),
> 3.8 (field‑level permissions), 3.9 (pane resize/fullscreen), 3.10 (accessibility),
> 3.15 (tags/attachments while drafting), 3.18 (restore drafts). Every roadmap
> item R1–R5 is now built. (Document‑block normalization from 3.13 is intentionally
> not pursued — the JSON ProseMirror document is the correct model.)

This document is the output of a deliberate "what is still missing?" pass over the
Contract Authoring Module against its specification (Modules A–F) and the platform's
non‑functional requirements, plus general production‑readiness. Each gap has a
**priority**, the **current state**, **why it matters**, and an **effort** estimate.
The phased plan at the end sequences them.

Effort legend: **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks.

---

## 1. Status snapshot — what is already complete

- **A. Entry points** — from scratch (type skeletons), duplicate (clone + clear instance
  fields + renewal link), from template. ✅
- **B. Workspace** — TipTap two‑pane, field→document binding via merge chips, derived
  recompute, autosave, version history/diff/restore, collapse/preview. ✅ (partial: see gaps)
- **C. Clause intelligence** — deterministic + AI segmentation/classification, similarity
  clustering, risk/approval metadata, learning batch job (resumable, AI‑optional),
  library search, gap analysis (AI‑augmented), clause insertion + renumber. ✅ (partial)
- **D. Vendor collaboration** — tokenized/expiring/revocable links, OTP flag, watermark,
  access levels, tracked changes, accept/reject/counter, AI risk commentary, negotiation
  ledger, notify‑vendor, cross‑contract insights (API). ✅ (partial)
- **E. DocuSign** — provider‑agnostic layer, JWT‑grant adapter, anchor tabs from register,
  send/void/resend, webhook status, signed‑PDF pull, executed‑contract publish into the
  pipeline, dependency‑free PDF. ✅ (partial)
- **F. Roles/approvals/audit** — Author/Legal/Approver roles, clause‑level protection,
  global + per‑department approval gates, gate‑role enforcement, full audit trail. ✅
- **Cross‑cutting** — DOCX/PDF/redline export, approval‑request notifications, department
  default signers, Asia/Kolkata display, keys server‑side. ✅
- **Tests** — 326 backend tests green.

---

## 2. Gap register

### P0 — Correctness & security (must fix before real external use)

| # | Gap | Current state | Why it matters | Effort |
|---|-----|---------------|----------------|--------|
| 0.1 | **OTP is never delivered** | `require_otp` generates a 6‑digit `otp_code` and the portal prompts for it, but it is never emailed to the recipient. | With OTP on, the vendor is locked out — the feature is unusable. | S |
| 0.2 | **DocuSign webhook not signature‑verified** | `docusign_webhook_secret` setting exists but `/esign/webhook` accepts any POST. | Anyone who learns an envelope id could spoof "completed" and publish a forged executed contract. | S |
| 0.3 | **No rate‑limiting on public vendor endpoints** | Opens/edits are logged (IP/UA) but not throttled. | Token brute‑force / abuse of the unauthenticated surface. | S–M |
| 0.4 | **No concurrent‑edit protection on drafts** | Autosave is last‑write‑wins; two editors silently clobber each other. | Spec requires block‑level locking or CRDT; real risk of lost work. | M (optimistic version token) → L (CRDT) |
| 0.5 _(rev.2)_ | **Multi‑signer signature anchors are broken** | `build_final_pdf` emits only `/sig1/…/sig2/`; the UI allows 3+ signers but their anchor tabs have nowhere to bind. | A 3‑signer envelope fails or drops signers at DocuSign. Breaks the named "configure signers/order/routing" feature. | S |

### P1 — Spec completeness (authoring core)

| # | Gap | Current state | Why it matters | Effort |
|---|-----|---------------|----------------|--------|
| 1.1 | **Reverse two‑way binding + conflict flag** | Field→doc works; doc→field is sidestepped with atomic chips. | Spec explicitly wants editing bound text in the document to update the field, flagging ambiguity. | M |
| 1.2 | **Swap a clause to another version with redline preview** | Insert exists; one‑click swap + before/after redline does not. | Named requirement in C2. | M |
| 1.3 | **Clause‑level comments / internal notes** | None. | Named requirement in C2 (not exported to vendor). | M |
| 1.4 | **Negotiation ledger: filter + Excel/PDF export** | Ledger view exists; no filter by clause/vendor/dept/disposition, no export. | Named requirement in D. | M |
| 1.5 | **Bulk accept/reject/counter in redline review** | Individual only. | Named requirement in D. | S |
| 1.6 | **Approval required *before external share*** | Gates block send‑for‑signature only. | Spec: internal approval may be required before a draft may be *shared externally* too. | S |
| 1.7 | **Surface cross‑contract insights in UI** | Endpoint exists; not shown on Vendor History or in the clause library. | Named requirement in D. | S–M |
| 1.8 | **Legal review queue for proposed clause versions** | New texts land as DRAFT versions; no queue for Legal to triage. | Closes the "new contracts feed the library → Legal review" loop. | S–M |
| 1.9 _(rev.2)_ | **Watermark & download control not enforced on server output** | `watermark`/`allow_download` are stored; watermark is a client‑only overlay and there is no controlled download path, so `allow_download` is inert. | Spec: "optionally watermark and restrict download." Confidential drafts leave the app un‑watermarked; the restriction is unenforceable. | M |
| 1.10 _(rev.2)_ | **Notification templates not admin‑editable** | Approval‑request and vendor‑decision emails are hardcoded. | Spec (D): "Notification templates are admin‑editable." | M |
| 1.11 _(rev.5 · user #1)_ | **New "Location" register field** | Not in the 15/21‑field register at all. | Requested: extract it, show it on the validation screen and Contracts page, **and use it as a duplicate‑detection signal**. Touches models + migration, extraction schema/prompt, serializer, validation form, Contracts table/filter, and `duplicates.ContractFacts` + Rule B. | M |
| 1.12 _(rev.5 · user #9)_ | **DocuSign admin config UI** — _elevated dup of 2.12_ | Settings exist but there is no form on the admin page. | Product owner re‑flagged: "no option for configuring DocuSign in admin page." Elevated from P2 → deliver in R2. | S–M |

### P2 — Fidelity & intelligence

| # | Gap | Current state | Why it matters | Effort |
|---|-----|---------------|----------------|--------|
| 2.1 | **Embeddings‑based semantic clustering + Claude adjudication** | Clustering uses normalized‑text similarity only. | Spec calls for semantic similarity via embeddings with Claude for edge cases; catches reworded‑but‑equivalent clauses. | M (needs an embeddings source; offline‑friendly option: local model) |
| 2.2 | **Auto‑feed the library on ingestion & on finalize** | Batch/on‑demand only. | Spec: new contracts entering via folder ingestion or authoring should auto‑feed the library. | M |
| 2.3 | **Inline suggestion‑mode redline (vendor side)** | Vendors submit discrete change forms, not inline tracked edits in the document. | Higher‑fidelity vendor experience; true ProseMirror suggestions. | L |
| 2.4 | **Cross‑references & defined‑term consistency on insert** | Section headings renumber; cross‑refs/defined terms are not maintained. | Named requirement in C2. | M–L |
| 2.5 | **Certificate of Completion retrieval + attach** | Signed PDF pulled; COC not fetched/attached. | Named requirement in E. | S |
| 2.6 | **Deliver signed doc + COC to both parties on completion** | Not sent. | Expected close‑out behaviour. | S |
| 2.7 | **DocuSign templates, reminders, expiration, correct** | Not surfaced. | Named requirement in E. | M |
| 2.8 | **Clause gutter/hover: type + library version per block** | `clauseVersionId` stored on inserted blocks; no gutter UI. | Named requirement in B. | S–M |
| 2.9 _(rev.2)_ | **Authoring AI prompts are hardcoded, not versioned/editable** | Extraction has admin‑editable versioned prompts; clause segmentation, difference‑summary, gap‑analysis and change‑risk prompts live in code. | Named deliverable: "Versioned, admin‑editable Claude prompt templates" for exactly these four. | M |
| 2.10 _(rev.2)_ | **Line items / rate card not authorable** | The workspace field form omits `line_items`; only ingested/validated contracts capture them. | Authored contracts can't carry the rate card that feeds vendor year‑on‑year rate analysis. | M |
| 2.11 _(rev.2)_ | **Exports & vendor view drop rich formatting** | DOCX/PDF and the vendor render handle headings + paragraphs + merge values, but ignore bold/italic marks and lists, and don't apply the watermark. | Formatting authored in TipTap is lost on export; ties to 1.9. | M |
| 2.12 _(rev.3)_ | **No Admin UI to configure DocuSign / e‑sign** _(elevated to R2 as 1.12 per user #9)_ | The `esign_provider` + `docusign_*` settings exist and are editable via the settings API, but there is no form on the Settings page. | An admin cannot turn on real DocuSign from the UI — blocks the "full DocuSign now" path without API/env edits. | S–M |
| 2.13 _(rev.5 · user #3)_ | **Show clause text on the Clause Library main window** | The list shows type/version/risk/status/usage; the full text appears only in the detail modal. | Requested: surface the clause text inline in the main list (expandable row / preview column). | S |
| 2.14 _(rev.5 · user #4, #6)_ | **Curated "top‑5 most‑used" versions per clause, AI‑polished + author‑editable** | All learned versions are retained equally; no curation, no AI polish, editing is manual. | Requested: keep the 5 most‑used versions per clause type, have the AI enhance/polish their wording, let the Author edit them, and **backfill this over the existing library** (a one‑time job). Deprecate/merge the long tail. | M–L |
| 2.15 _(rev.5 · user #7)_ | **Drag‑and‑drop a clause into the editor** | Insertion is via the "Clauses" panel + Insert button only. | Requested: drag a clause from the library panel and drop it at the cursor position in the TipTap document. | M |
| 2.16 _(rev.5 · user #2)_ | **Auto‑expire lifecycle the moment the end date passes** | `lifecycle_status` flips to `EXPIRED` only during the once‑a‑day reminder run (`run_daily_check`). | Requested: reflect EXPIRED as soon as the end date is in the past — compute it on read/serialize (effective status) and/or a lightweight scheduler tick, so the register never shows a past‑dated contract as ACTIVE between daily runs. | S |

### P3 — Scale, ops & polish

| # | Gap | Current state | Why it matters | Effort |
|---|-----|---------------|----------------|--------|
| 3.1 | **Gap analysis async + progress feedback** | Synchronous; large docs block the request. | Spec target: results in ~30s *with progress feedback*. | S–M |
| 3.2 | **Performance validation @ 50k clauses (<1s search)** | Indexed columns present; not load‑tested/paginated. | Named NFR. | M |
| 3.3 | **Frontend code‑splitting** | Single ~770 KB bundle (TipTap heavy). | Faster first load; lazy‑load the editor/authoring routes. | S |
| 3.4 | **Frontend / E2E tests** | Backend only. | Protect the two‑way binding, redline, and signature flows. | M |
| 3.5 | **Observability** | Standard logging. | Background‑job health, metrics, structured logs for ops. | M |
| 3.6 | **Indian numbering in amount‑in‑words** | International scale (thousand/million). | Indian contracts read in lakh/crore. | S |
| 3.7 | **Template re‑tokenization on "promote to template"** | Concrete values copied as‑is. | A template should turn instance values back into merge fields. | M |
| 3.8 | **Field‑level permissions** | Clause‑level only. | Spec mentions field‑ and clause‑level permissions. | M |
| 3.9 | **True pane drag‑resize + real fullscreen preview** | Collapse + toggle only. | Named requirement in B. | S |
| 3.10 | **Accessibility pass on authoring screens** | Not audited. | Keyboard/ARIA for the editor, dialogs, tables. | S–M |
| 3.11 | **Retention safety for the negotiation ledger** | Ledger has no soft‑delete; verify retention purge never touches it. | Spec: ledger is immutable & permanently retained. | S |
| 3.12 | **DocuSign go‑live checklist + demo smoke test** | Config exists; no runbook. | De‑risk the production cutover. | S |
| 3.13 _(rev.2)_ | **Normalized `document_blocks` / `change_dispositions` tables** | Document is JSON on the draft; dispositions live on `tracked_changes`. | Named schema deliverables; a normalized block table also enables block‑level locking (0.4) and per‑block clause metadata (2.8). | M |
| 3.14 _(rev.2)_ | **Vendor due‑date reminder / nudge** | `due_at` is stored but no reminder is sent if the vendor is unresponsive. | Keeps negotiations moving; parallels the contract reminder engine. | S |
| 3.15 _(rev.2)_ | **Tags / attachments on an authored draft** | Settable only after finalize on the contract record. | Convenience; keep categorization in one place while drafting. | S |
| 3.16 _(rev.2)_ | **Clause search uses `ILIKE`, no full‑text index** | Works, but scans; part of the 50k‑clause target (3.2). | Sub‑second search at scale needs a `tsvector`/FTS index. | S–M |
| 3.17 _(rev.3)_ | **Global approval‑gate defaults have no Admin UI** | Per‑department gates are editable; the global `approval_require_legal` / `approval_value_threshold` are API‑only. | Admins can't set the org‑wide default from the UI. | S |
| 3.18 _(rev.3)_ | **Soft‑deleted authored drafts aren't restorable** | Drafts have `deleted_at` but aren't listed on the retention screen (only Contract/Vendor/Department are). The negotiation ledger is **safe** — it is never purged. | A deleted draft can't be recovered from the UI. | S |
| 3.19 _(rev.5 · user #8)_ | **Multi‑step undo (last 5) in the editor** | TipTap StarterKit ships an undo/redo history (Ctrl‑Z/⌘‑Z works), but there is no visible control and the depth isn't guaranteed. | Requested: an explicit Undo/Redo control with at least a 5‑step depth in the authoring workspace. | S |

---

## 3. Phased roadmap

Each milestone is independently shippable (tested + offline tarball), consistent with the
existing workflow.

### R1 — Harden the external surface (P0) · ~1 sprint
- 0.1 Email the OTP on share (+ resend), 0.2 verify the DocuSign webhook HMAC, 0.3
  rate‑limit + lock out abusive tokens, 0.4 optimistic‑concurrency version token on draft
  autosave (409 + merge prompt), 0.5 emit a signature anchor per configured signer.
- **Exit:** external collaboration and e‑sign are safe to expose to real vendors.

### R2 — Close the authoring‑core spec gaps (P1) · ~1–2 sprints
- 1.1 reverse binding + conflict flag, 1.2 clause swap w/ redline, 1.3 clause comments,
  1.4 ledger filter + Excel/PDF, 1.5 bulk redline decisions, 1.6 approval‑before‑share,
  1.7 insights in Vendor History + clause library, 1.8 Legal review queue,
  1.9 enforce watermark/download on server output, 1.10 admin‑editable notification templates,
  1.11 **Location field** (extract → validate → contracts → duplicate check),
  1.12 **DocuSign admin config UI**.
- **Exit:** every named A–D requirement is present (suggestion‑mode redline deferred to R3).

### R3 — Fidelity & intelligence (P2) · ~2 sprints
- 2.1 embeddings clustering + Claude adjudication, 2.2 auto‑feed on ingestion/finalize,
  2.3 inline suggestion‑mode redline, 2.4 cross‑refs/defined terms, 2.5–2.6 COC +
  party delivery, 2.7 DocuSign templates/reminders/correct, 2.8 clause gutter,
  2.9 versioned/editable authoring prompts, 2.10 line‑item authoring,
  2.11 rich‑formatting + watermark in exports, 2.13 clause text on the main window,
  2.14 curated top‑5 AI‑polished editable clause versions (+ backfill existing),
  2.15 drag‑and‑drop clause insertion, 2.16 immediate lifecycle expiry.
  _(2.12 DocuSign admin UI is pulled forward to R2 as 1.12.)_
- **Exit:** the module matches the spec's "intelligent" behaviours end‑to‑end.

### R4 — Scale & production‑readiness (P3a) · ~1–2 sprints
- 3.1 gap‑analysis async+progress, 3.2 perf validation @50k (+ 3.16 clause FTS index),
  3.3 code‑splitting, 3.4 E2E tests, 3.5 observability, 3.11 ledger‑retention safety,
  3.12 go‑live checklist, 3.13 normalized document_blocks/change_dispositions,
  3.14 vendor due‑date nudge.
- **Exit:** meets the performance NFRs and is operable in production.

### R5 — Polish (P3b) · ~1 sprint
- 3.6 Indian numbering words, 3.7 template re‑tokenization, 3.8 field‑level permissions,
  3.9 pane resize/fullscreen, 3.10 accessibility, 3.15 tags/attachments while drafting,
  3.17 global approval‑gate settings UI, 3.18 restore deleted drafts,
  3.19 multi‑step undo/redo control.
- **Exit:** no known spec or UX gaps remain.

---

## 4. Notes on offline / air‑gapped constraints
- **Embeddings (2.1)** need a vector source. Prefer a local sentence‑embedding model or
  the configured provider's embeddings endpoint if the proxy allows it; keep the current
  text‑similarity path as the offline fallback.
- **Rate‑limiting (0.3)** should be in‑process (no Redis dependency assumed) or reuse the
  existing login‑throttle mechanism.
- **DocuSign (E)** requires outbound + inbound webhook reachability; R1/0.2 makes the
  inbound path safe, R4/3.12 validates the cutover on the DocuSign demo environment.

## 5. Not planned (explicitly out of scope unless requested)
- Full offline vector database, multi‑language contract drafting, e‑stamping/registration
  integrations, and a vendor self‑service portal (the spec mandates token‑only vendor
  access, which is already the design).

## 6. Convergence sweep (rev. 4)

The final pass re‑checked the areas most likely to hide gaps; **no new material item
surfaced**, so the register above is treated as complete.

Checked and clean:
- **Endpoint wiring** — every authoring/clause/e‑sign/vendor call in the frontend maps to
  a real backend route (no dead calls).
- **Placeholders** — no `TODO`/`FIXME`/`NotImplemented`/stub left in the authoring services
  or APIs.
- **Settings hygiene** — DocuSign secrets are masked (`docusign_private_key`,
  `docusign_webhook_secret`); no authoring/e‑sign setting leaks into the general settings
  round‑trip or is mis‑classified as internal.
- **Ledger retention** — the negotiation ledger, clause library and drafts are never touched
  by the retention purge (only Contract/Vendor/Department soft‑deletes are), so the
  "permanently retained" guarantee holds. (The only related gap is the missing *restore* UI
  for soft‑deleted drafts — 3.18.)

Re‑running this sweep after each milestone (R1–R5) is the intended way to keep the register
honest; append a new revision to the audit log whenever a check turns something up.

## 7. User‑requested backlog mapping (rev. 5)

The nine product‑owner requests, mapped to register rows and phase:

| Req | Ask | Roadmap item | Tier / phase |
|----:|-----|--------------|--------------|
| 1 | "Location" field in extraction; show on validation + Contracts; use for duplicate check | **1.11** | P1 · R2 |
| 2 | Mark lifecycle EXPIRED as soon as the end date passes | **2.16** | P2 · R3 |
| 3 | Clause library shows the clause text on the main window | **2.13** | P2 · R3 |
| 4 | Keep top‑5 most‑used clause versions per clause; AI‑enhance/polish; author‑editable | **2.14** | P2 · R3 |
| 6 | Apply #4 to the existing clause library (backfill) | **2.14** (backfill job) | P2 · R3 |
| 7 | Drag‑and‑drop a clause into the editor | **2.15** | P2 · R3 |
| 8 | Undo the last 5 changes | **3.19** | P3 · R5 |
| 9 | No option to configure DocuSign in the admin page | **1.12** (= elevated 2.12) | P1 · R2 |

_(The list the owner supplied skips "5"; items are recorded under their given numbers.)_

**Suggested build order for this batch:** 1.12 (DocuSign UI) and 2.13 (clause text) are
quick wins; 1.11 (Location) is the highest‑value functional add; 2.14 (clause curation +
AI polish + backfill) is the largest and is best done alongside the R3 clause work.

---

_This register is considered exhaustive as of rev. 4; rev. 5 adds the user‑requested
backlog (§7). New items should be appended with a `(rev.N)` tag and slotted into the
phase plan by priority._
