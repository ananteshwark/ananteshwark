# CMS — Enhancement Roadmap (Tester's Report)

_A full pass over the Contract Management System (backend, frontend, and
workflows) from an application-tester's lens: concrete, verified findings ranked
by severity, then organized into a phased development roadmap._

**Scope reviewed:** 27 frontend pages + 4 shared components, 21 backend API
modules, 45 services, 81 backend test files (~450 tests), and the end-to-end
workflows (ingestion → validation → register → authoring → negotiation →
signature → renewal).

**Overall health:** Strong. Backend test coverage is excellent, the domain model
is coherent, and the offline/air-gapped deployment story is solid. The gaps are
concentrated in **frontend polish, accessibility, responsive design, workflow
hard-gating, and a handful of correctness/consistency bugs** — none blocking, all
improvable.

Severity key: **P0** = correctness/data bug, fix now · **P1** = high-value UX or
workflow gap · **P2** = medium enhancement · **P3** = nice-to-have / future.

---

## 1. Correctness & consistency (P0–P1)

| # | Finding | Where | Severity |
|---|---------|-------|----------|
| 1.1 | **"Export view" / "Calendar" ignore the active column sort.** The table sorts server-side, but the export/ICS buttons build params without `sort`/`order`, so the spreadsheet always comes out in `sr_no` order — surprising after a user sorts by End date or Value. | `Contracts.jsx` (`buildParams` excludes sort) → `/contracts/export`, `/calendar.ics` | P1 |
| 1.2 | **Accepted vendor edits drop merge-field bindings.** When an author accepts an inline change, the block is replaced with plain text, so a bound field (e.g. an auto-computed date chip) becomes static text and stops updating. Correct for most negotiated clauses, wrong when the edited block held a live field. | `collaboration.apply_change_to_document` | P1 |
| 1.3 | **PHI-shared is not a first-class field.** The renewal flow captures "Any PHI shared?" but stores it only in `draft.fields.phi_shared`. It never lands on the `Contract` register, so it can't be filtered, reported, or seen on the contract detail. | `contract_actions.create_renewal_draft`, `models.Contract` | P1 |
| 1.4 | **COMMENT-access vendor links have no way to comment.** Removing the "Propose a change" form left inline editing (SUGGEST) as the only input path; a COMMENT-only share is now effectively view-only. | `VendorPortal.jsx` | P1 |
| 1.5 | **84 silently-swallowed frontend errors** (`.catch(() => {})`). Background fetches (departments, tags, suggestions, entities…) fail invisibly, so a page can render half-empty with no hint why. | across `frontend/src` | P1 |
| 1.6 | **Draft workflow stages are display-only.** The new stepper shows the stage but only the vendor-acceptance → send transition is hard-gated. "Internal review & confirmation" and "Ready for signature" can be skipped; there is no enforced internal sign-off before a draft is shared externally. | `authoring_api._draft_stage_index`, `esign_api.send_for_signature` | P1 |
| 1.7 | **`deploy.sh` staleness check is misleading.** It greps the `index-*.js` bundle for "Compact to 5", a string that lives in a code-split chunk — so the check is WARN-only and can cry stale on a fresh deploy. Use a stable string in the entry bundle or check a build hash. | `deploy.sh` | P2 |

---

## 2. Accessibility (P1)

The app is keyboard- and screen-reader-thin. This is the single biggest
cross-cutting gap.

- **Native `confirm()` / `alert()` / `prompt()` used in 33 places** (delete
  confirmations, "Save as template" name, reject reasons, merge undo). These are
  not stylable, break focus flow, and read poorly to assistive tech. Replace with
  the existing modal pattern + inline validation.
- **Only ~13 ARIA attributes across the whole frontend.** Missing: `aria-label`
  on icon-only buttons (bell, collapse chevrons, grip handles, ×/close),
  `aria-live` regions for the save-status and error/success banners, `aria-sort`
  on sortable table headers, `role="dialog"` + focus-trap on every modal (some
  have it, many don't).
- **No visible focus management** when modals open/close (focus should move into
  the dialog and return to the trigger on close).
- **Color-only signaling:** low-confidence fields and risk highlights rely on
  color; add an icon/text affordance for color-blind users and check contrast
  ratios (the amber `#e8a13c` on white is borderline).
- **The TipTap editor** needs a labelled toolbar and keyboard-reachable controls.

---

## 3. Responsive / mobile (P1)

- The layout is a **fixed flex sidebar + main** with essentially **no responsive
  behavior** (only 2 media queries in the whole stylesheet: reduced-motion and
  one detail-pane collapse). On a tablet or phone the sidebar eats the screen and
  wide tables overflow.
- **Add:** a collapsible / off-canvas sidebar with a hamburger toggle, fluid
  table wrappers with horizontal scroll affordances, and stacked form layouts
  under ~760px. The validation screen's split (document | fields) and the
  authoring workspace especially need a stacked mode.
- **No dark mode** — worth adding given long editing sessions (tokenize colors,
  honor `prefers-color-scheme`).

---

## 4. Workflow enhancements (P1–P2)

### Authoring & negotiation
- **Internal review gate (P1):** require a named internal reviewer/approver to
  sign off before "Share with vendor" is allowed — realizing the intended
  "internal stakeholders review, redlined and confirmation" stage as an enforced
  checkpoint, not just a label.
- **Side-by-side redline compare (P2):** a two-pane "current vs. proposed" diff
  view for a round, and a **version diff viewer** across draft snapshots.
- **Clause-level accept/reject in the inline editor (P2):** today acceptance is
  per tracked-change in a list; inline accept/reject markers would be faster.
- **Comment resolution threads (P2):** internal comments are flat; add resolve
  state and @mentions.

### Renewal
- **Scheduled auto-draft (P1):** proactively create renewal drafts N days before
  expiry (configurable) and drop them in the Drafting Queue, instead of relying
  on the recipient clicking the email link. The email flow stays as the
  decision capture.
- **Renewal chain visualization (P3):** show the full renewal lineage on the
  contract detail.

### Signature
- **Signing-order enforcement & decline handling UI (P2):** surface declines and
  allow re-send to a single signer.
- **"Pause all ingestion" one-click (P2):** a single control that flips folder
  watching, Drive polling, and extraction together (individual toggles exist).

### Validation
- **Bulk actions across the queue (P2):** bulk assign / reject / re-extract.
- **Single-field AI re-extract (P3):** re-ask the model for just one low-
  confidence field rather than the whole document.

---

## 5. Performance & scale (P2)

- **Vendors list is unpaginated** — the endpoint returns every vendor and sorts
  client-side. Fine at hundreds, a problem at thousands. Add server-side
  pagination + sort (mirror the Contracts pattern).
- **N+1 in list serializers.** `contract_out` touches `c.vendor.name` and
  `c.department.name` per row; a 500-row page lazy-loads relationships row by
  row. Add `selectinload`/`joinedload` on the list queries.
- **`extracted_text` stored up to 200 KB per contract** and searched with
  `ILIKE` when trigram indexes aren't available (SQLite / non-superuser
  Postgres). Confirm the pg_trgm indexes are actually created in production.
- **Notifications poll every 60 s.** Consider Server-Sent Events for near-real-
  time, lower-overhead updates.

---

## 6. Security & robustness (P2)

Good foundations already: login throttling, vendor-link rate limiting, OTP,
write-only secrets, HSTS at nginx, super-admin gating.

- **Upload validation:** the import endpoint checks extension but not size; add
  an explicit server-side size cap (nginx caps at 64 MB, but the app should too)
  and MIME sniffing, not just the filename suffix.
- **Content-Security-Policy header** is not set at the app layer — add a strict
  CSP (nginx or FastAPI middleware).
- **JWT expiry UX:** a 401 silently bounces to login mid-edit. Add a pre-expiry
  warning and/or token refresh so an author doesn't lose their place.
- **Audit coverage:** confirm every destructive/permission action (role change,
  page-access change, master-list edit, extraction pause) writes an audit row —
  most do; make it exhaustive.
- **51 broad `except Exception`** blocks — most are deliberate best-effort
  (email, thumbnails); audit that none mask a real failure silently in a
  data-writing path.

---

## 7. Testing & quality gates (P2)

- **Backend: ~450 tests — excellent.** Keep it up; add tests for the new
  contract-action token expiry edge cases and the workflow-stage transitions.
- **Frontend: effectively untested.** There are zero component/unit tests and a
  single 4-assertion Playwright smoke test. Add:
  - Component tests (Vitest + Testing Library) for `MultiSelect`, `ContractForm`,
    the Contracts filter/sort/URL-sync logic, and the vendor portal flows.
  - Expand the Playwright suite to cover the core journeys (login → validate →
    author → share → sign; and the public vendor / contract-action pages).
- **CI:** add a pipeline that runs backend pytest + frontend build + Playwright on
  every PR (a SessionStart hook or GitHub Action).
- **Accessibility CI:** add `axe` checks to the Playwright run.

---

## 8. Smaller UX polish (P3)

- Replace top-of-page error/success banners with **non-blocking toasts** (keep a
  history in the notification bell).
- **Loading skeletons / explicit empty states** on list pages (several render a
  bare table before data arrives).
- **Global search / command palette** (⌘K) across contracts, vendors, drafts,
  clauses.
- **Saved-view sharing** between users (saved filters are per-user today).
- **Export honors current sort** (ties to 1.1) and add **CSV** alongside XLSX.
- **Reports:** date-range picker, more chart types, and a PDF export of the
  dashboard.
- **Audit log:** filter by entity/user/date and export.
- **IngestionLog:** filters, bulk retry, and pagination.
- **i18n / locale:** `en-IN` and `INR` are hardcoded in several places; extract to
  config for future multi-locale support.
- **In-app backup trigger/status** surfaced in Admin (backups are documented but
  not visible in the UI).

---

## Phased roadmap

> **Delivery status (2026-08-12):** Phases 1, 2 and 3 are ✅ complete, and
> Phase 4 is delivered except the frontend test harness / PR CI item (still
> open — the backend suite covers the new server code with 472 passing tests).
> Every delivered increment shipped with tests and an offline tarball.

### Phase 1 — Correctness & trust (1–2 weeks) — ✅ complete
Fix the bugs and the invisible-failure problem so users trust what they see.
- 1.1 Export/Calendar honor the active sort (+ CSV export). _(S)_
- 1.3 Promote **PHI-shared** to a first-class `Contract` column + validation-form
  field + contracts filter. _(M, needs migration)_
- 1.4 Restore a **comment path** for COMMENT-access vendor links. _(S)_
- 1.5 Surface **background-fetch failures** (toast + retry) instead of swallowing
  them. _(M)_
- 1.2 Make accepted edits **preserve merge-field bindings** where the block is a
  single bound field. _(M)_

### Phase 2 — Accessibility & responsive (2–3 weeks) — ✅ complete
Make it usable on any device and to assistive tech.
- Replace native `confirm/alert/prompt` with accessible modals + inline
  validation. _(M)_
- ARIA pass: labels, `aria-live`, `aria-sort`, dialog focus-trap/return. _(M)_
- Responsive layout: collapsible sidebar, stacked forms, scrollable tables. _(L)_
- Dark mode. _(M)_

### Phase 3 — Workflow depth (3–4 weeks) — ✅ complete
Turn the workflow stages into an enforced, guided pipeline.
- 1.6 **Internal review gate** before vendor share (named approver sign-off). _(M)_
- **Scheduled renewal auto-drafting** N days before expiry. _(M)_
- Side-by-side **redline compare** + version **diff viewer**. _(L)_
- Bulk validation actions; single-field AI re-extract. _(M)_
- "Pause all ingestion" one-click. _(S)_

### Phase 4 — Scale, hardening & test coverage (ongoing)
- ✅ Vendors pagination + server-side sort; eager-load list serializers. _(M)_
- ⬜ Frontend test suite (Vitest + expanded Playwright) and PR CI with a11y
  checks — **still open.** _(L)_
- ✅ CSP header, upload size/MIME hardening, JWT-expiry UX. _(M)_
- ✅ Global search, loading skeletons (toasts landed in Phase 1). Richer
  Reports/Audit/Ingestion remains a future enhancement. _(L)_

_Effort key: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1 week+._

---

## Appendix — verification notes

These findings were checked against the code, not assumed:
- Export/Calendar params: `Contracts.jsx` `buildParams()` omits `sort`/`order`;
  `/contracts/export` orders by `Contract.sr_no`.
- Swallowed errors: 84 `.catch(() => {})` occurrences in `frontend/src`.
- N+1: `serializers.contract_out` dereferences `c.vendor` / `c.department` per row.
- Media queries: 2 total in `styles.css`; ARIA attributes: ~13 total.
- Frontend tests: 0 unit/component; 1 Playwright smoke (`frontend/e2e/smoke.spec.js`).
- Vendors endpoint returns the full list; sorting added client-side.
- Import endpoint validates extension only (no size/MIME guard).
