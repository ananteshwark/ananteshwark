# Contract Management System (CMS)

A full-stack application that automates contract intake from a watched folder,
extracts contract data with the **Anthropic Claude API**, routes records through a
**human validation workflow**, detects **duplicates** (file-level and fuzzy
record-level), maintains **vendor-wise contract history**, and sends configurable
**expiry reminders** governed by department-level rules.

## Stack

| Layer      | Technology |
|------------|------------|
| Backend    | Python 3.11+, FastAPI, SQLAlchemy 2 |
| Database   | PostgreSQL (SQLite for local dev) |
| Scheduling | APScheduler (daily reminder run, Asia/Kolkata) |
| Watching   | `watchdog` (recursive folder monitoring + startup reconciliation) |
| Extraction | Pluggable AI provider — Anthropic Claude / OpenAI (ChatGPT) / Google Gemini (structured JSON outputs), pypdf / python-docx / pytesseract OCR |
| Frontend   | React 18 + Vite + React Router |
| Auth       | JWT (PBKDF2-hashed passwords), role-based: Admin / Validator / Viewer |

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp ../.env.example .env          # edit: set ANTHROPIC_API_KEY, JWT_SECRET, DATABASE_URL
python -m scripts.seed            # creates admin/validator/viewer users + demo data
uvicorn app.main:app --reload --port 8000
```

Seeded logins:

| Role      | Email                  | Password      |
|-----------|------------------------|---------------|
| Admin     | admin@example.com      | admin12345    |
| Validator | validator@example.com  | validator123  |
| Viewer    | viewer@example.com     | viewer12345   |

For OCR of scanned PDFs/images install the system packages `tesseract-ocr` and
`poppler-utils` (already included in the Docker image).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api to :8000)
```

### 3. Drop a contract in the watched folder

Copy a PDF/DOCX/JPG/PNG into `backend/watched/` (or the folder configured in
Admin Settings). The pipeline runs automatically:

```
detect file → wait for stable size → SHA-256 dedupe → queue → text extract (OCR
if scanned) → Claude structured extraction → PENDING_VALIDATION → human validates
→ duplicate detection → VALIDATED → reminder scheduler
```

### Docker

```bash
export ANTHROPIC_API_KEY=sk-ant-...
docker compose up --build     # Postgres + backend on :8000
```

## Module map

| Module | Where |
|--------|-------|
| 1 — Folder monitoring & ingestion | `backend/app/services/watcher.py` (local), `backend/app/services/gdrive.py` (Google Drive), Ingestion Log screen |
| 2 — AI extraction | `backend/app/services/extraction.py` (provider dispatcher) + `claude_extractor.py` / `openai_extractor.py` / `gemini_extractor.py`, versioned prompt in `app/prompts/` + Admin Settings |
| 3 — Human validation | `backend/app/api/contracts_api.py`, Validation Queue / Validation screens |
| 4 — Duplicate detection | `backend/app/services/duplicates.py`, Duplicate Review screen |
| 5 — Vendor history | `backend/app/api/vendors_api.py`, Vendor Master / History screens |
| 6 — Expiry reminders | `backend/app/services/reminders.py` + `scheduler.py`, Reminder Rules screen |
| 7 — Dashboard & reports | `backend/app/api/dashboard_api.py`, `reports_api.py` |

Database schema/ERD: [`docs/ERD.md`](docs/ERD.md).
Production deployment runbook (Ubuntu VM + nginx + Postgres + TLS):
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Key behaviors

- **File-level duplicates**: identical SHA-256 → logged as `DUPLICATE` with a link
  to the original ingestion record; extraction skipped.
- **Record-level duplicates** (on Save & Validate): fuzzy vendor match
  (token-set ratio ≥ 90, ignoring Pvt Ltd/LLP/Inc suffixes) + same PO number, OR
  same vendor + signing entity + overlapping dates + same service. Candidates are
  shown in a compare view and are never silently discarded — they land in the
  Duplicate Review screen where a validator confirms **Duplicate** (link+archive),
  **Renewal/Amendment** (linked into the contract thread), or **Not a duplicate**.
- **Derived dates**: if tenure is stated but end date is not, `end_date =
  start_date + tenure` (inclusive) and the field is flagged *derived* (violet
  highlight); vice versa for start dates.
- **Organization entities**: an admin-configurable list of the organization's
  own names (default: Inventurus, TruBridge, Arai, WWMG, Western Washington) is
  injected into the extraction prompt so Claude records those parties as the
  signing entity and treats the other party as the vendor. Works with any prompt
  version — if the active prompt lacks the `{organization_entities}` placeholder,
  the guidance is prepended automatically. A **deterministic post-extraction
  guard** then double-checks the result: if a known organization entity was
  still placed in the vendor field, it swaps the two parties (and their signing
  authorities), flags both fields for validator review, and records an audit
  entry — a belt-and-suspenders correction on top of the prompt.
- **Vendor merge (reversible)**: select multiple vendors in the Vendor Master
  and merge them into one survivor — contracts are re-pointed, names/aliases/
  addresses/contacts are folded in, and the absorbed vendors are archived
  (audited). Every merge is logged and can be **undone** from the "Recent
  merges" panel, which restores the source vendors, re-points their contracts
  back, and strips the aliases/addresses/contacts that were folded in.
- **Manual contract entry**: create a contract by hand (e.g. a paper contract)
  with an optional document upload; it enters the normal validation workflow.
- **Bulk import**: upload an Excel/CSV in the 15-column register format (round-
  trips with the export). Vendors and departments are matched by name (created
  if new); complete rows import as validated, incomplete rows go to the
  validation queue. Includes a dry-run preview with per-row error reporting.
- **Document attachments**: attach additional documents (amendments, annexures,
  signed copies) to a contract beyond the primary document — list, preview,
  download, soft-delete. The primary document and each attachment can be
  **previewed inline** (images and PDFs) without leaving the contract detail;
  files are fetched with the auth header and rendered from an in-memory blob,
  so nothing bypasses access control.
- **Full-text search**: the extracted/OCR'd document body is stored and
  searchable — global search returns document-text matches with a highlighted
  snippet, and the Contracts list has an "in document text" toggle.
- **Dashboard charts**: dependency-free bar charts for the 12-month expiry
  trend, contracts-by-department, and contract-value-by-department, alongside
  the existing stat tiles and expiry tables.
- **Vendor concentration / dependency risk**: the Reports screen shows how
  concentrated spend is across vendors — the Herfindahl-Hirschman Index (HHI),
  the largest vendor's share, how many vendors make up 80% of spend, and each
  vendor's share/cumulative share with a flag for any exceeding a configurable
  threshold — to surface over-reliance on a single supplier.
- **Contract value analytics**: the Reports screen shows spend analytics over
  active contracts — total value and count, value by department and by
  contract type, the value of contracts expiring per month over the next 12
  months, and the top vendors by value — all from a single
  `/reports/value-analytics` endpoint.
- **Obligations & milestones**: track deliverables/obligations within a
  contract (e.g. "Submit SLA report", "Renewal-notice deadline") as milestones
  with their own due dates and done/pending status. The contract detail lists
  and manages them (overdue items flagged), and the Dashboard surfaces the
  obligations due within 30 days or overdue across all contracts.
- **Contract notes**: validators/admins can leave collaboration notes on a
  contract (author + timestamp; author or admin can delete); viewers read-only.
- **Reminder log CSV export**: the reminder log (global on the Reminder Rules
  screen, or per-contract on the contract detail) can be exported to CSV,
  honoring the active delivery-status/contract filter, for reporting or audit.
- **Audit log CSV export**: the organization-wide audit trail can be exported
  to CSV from the Audit Log screen, honoring the entity-type/action filters
  (admin only).
- **Bulk contract-type assignment**: alongside bulk tag add/remove, the
  validation queue can set (or clear) a contract type across the selected
  contracts in one action; unchanged rows are reported as skipped.
- **Dashboard quick-links**: saved views appear as one-click links on the
  Dashboard that open the Contracts list pre-filtered (filters are also
  seeded from the URL, so a filtered view is shareable/bookmarkable).
- **Calendar (.ics) export**: export the filtered contracts' expiration dates
  as an iCalendar file (`/contracts/calendar.ics`) to import into Google
  Calendar or Outlook — each contract becomes an all-day event on its end date
  with vendor, service, department and value in the description.
- **Saved views**: on the Contracts list, save the current combination of
  filters (status, department, type, tag, search text) as a named, per-user
  preset and re-apply it in one click. Saved views are private to each user,
  re-saving a name updates it in place, and each can be deleted from the
  toolbar.
- **Contract types & tags**: each contract has a **type** (NDA, MSA, SOW,
  Lease, …) chosen from an admin-configurable vocabulary, and any number of
  free-form **tags** (labels like "urgent" or "auto-renew", optionally
  colored). Both are editable on the contract detail screen, surfaced as
  columns and filters on the Contracts list (filter by type or tag, and the
  Excel export honors the active filter), and audited on change. Tags are
  managed in Admin Settings (create/delete with in-use counts); deleting a tag
  detaches it from every contract.
- **Scheduled digest email**: an optional daily or weekly rollup emailed to
  admins/managers summarizing what needs attention — contracts awaiting
  validation, contracts expiring within 30 days, and documents that failed
  extraction — with deep links to each record. Frequency, day-of-week, send
  time and recipients are admin-configurable; a second APScheduler job runs it
  (rescheduled live on change), and "Send digest now" previews it on demand.
- **Extraction-failure alerts**: when a document fails extraction, admins are
  notified by email (configurable recipients, defaulting to all admins) and
  optionally via a webhook JSON POST — configured in Admin Settings.
- **Reminder snooze**: temporarily pause a contract's reminders until a chosen
  date (quick 7/30/90-day buttons or an explicit date, cleared any time) from
  the contract detail. The daily scheduler skips snoozed contracts until the
  date passes, and the schedule preview shows when reminders resume. Audited.
- **Reminder schedule preview**: each contract shows the actual upcoming dates
  its reminders will fire (computed from the resolved rule/offsets with the same
  logic the daily scheduler uses), or why they're stopped.
- **Renewal thread diff**: the contract detail shows every version in a
  contract's renewal thread side-by-side (`/contracts/{sr}/thread`), in
  chronological order, highlighting the fields that changed from the previous
  version (vendor, dates, value, service, type, PO, department…) so you can see
  how terms evolved across renewals/amendments at a glance.
- **Renewal workflow**: "Renew…" on a validated contract creates a linked draft
  pre-filled from it (vendor, service, department, value, tenure, reminder rule
  and recipients), with the new start date defaulting to the day after the old
  end date and the end date derived from the tenure. The renewal joins the same
  contract thread and enters the validation queue.
- **In-app notifications**: a notification bell in the sidebar shows each
  user's unread count and recent items; being assigned a contract creates an
  in-app notification linking straight to it. Items can be opened (marked read
  and navigated) or all marked read at once. Notifications are per-user.
- **Assignee workflow**: assign a validator or admin as the owner of a
  contract (from the validation queue's per-row picker, the contract detail,
  or a bulk "Assign to…" action). The queue can be filtered to "Assigned to
  me" or "Unassigned", assignments are audited, and only active
  validators/admins are assignable (surfaced via a validator-accessible
  assignable-users endpoint).
- **Bulk actions in the validation queue**: select many pending contracts and
  bulk-assign a department, bulk-add or bulk-remove a tag, bulk-reject, or
  bulk-validate (only rows with all mandatory fields validate; the rest are
  reported as skipped). Tag changes are per-contract audited and a no-op row
  is reported as skipped rather than updated.
- **Low-confidence highlighting**: fields below the configurable threshold
  (default 0.8) get an amber highlight on the validation screen.
- **Reminder rules**: offsets (e.g. 90/60/30/15/7/1 days before expiry),
  optional "then every N days until expiry", optional "every N days after expiry
  until acknowledged", optional escalation CC after N ignored reminders.
  Rules are mapped per department; contracts can override the rule, the offsets,
  and the recipients. Marking a contract Renewed/Terminated stops reminders.
- **Outbound event webhooks**: POST a JSON event to an external system when a
  contract is validated, rejected, renewed or terminated. The URL, an optional
  HMAC-SHA256 signing secret (delivered as an `X-CMS-Signature` header for
  receiver verification), and an optional event-subscription filter are set in
  Admin Settings, with a "send test event" button. Delivery is best-effort and
  never blocks the triggering request.
- **Notifications**: email via SMTP (set `EMAIL_DRY_RUN=false` to actually
  send), plus **Slack and Microsoft Teams** incoming-webhook channels. Add
  `slack`/`teams` to a reminder rule's delivery channels to route its reminders
  there, optionally mirror the scheduled digest to chat, and verify each
  webhook with a test button in Admin Settings. Webhook URLs are stored
  write-only. The channel layer (`app/services/notifications.py`) stays
  pluggable for further channels (WhatsApp, etc.).
- **Google Sign-In (SSO)**: users can sign in with their Google account
  alongside email/password. Admins configure the OAuth Client ID (public) in
  Admin Settings, with an optional allowed email domain and opt-in
  auto-provisioning (default role configurable). The backend verifies the
  Google ID token server-side; existing users are matched by email, and unknown
  emails are only created when auto-provision is on and a domain is set.
- **Data retention**: an admin **Data Retention** screen lists soft-deleted
  contracts, vendors and departments with counts, and lets an admin **restore**
  them (clear the soft-delete) or **permanently purge** them. Purge is a
  guarded hard delete — it cascades a contract's dependent rows (attachments,
  notes, recipients, tag links, reminder logs, duplicate candidates, and
  nulls ingestion/renewal references) and refuses to purge a vendor or
  department still referenced by a live contract. Every restore/purge is
  audited.
- **Audit**: every field change is recorded (old → new → who → when); destructive
  actions are soft-deletes only. Admins get an organization-wide **Audit Log**
  screen (filter by entity type/action, paginated) alongside the per-contract
  and per-vendor audit views.
- **User management**: admins can create users and change roles, activate/
  deactivate, reset passwords, and soft-delete accounts — with guards that
  prevent removing or demoting the last active administrator; every user can
  change their own password from the sidebar.
- **Operability**: send a **test email** from Admin Settings to verify SMTP
  (respects dry-run); **restore** a mistakenly rejected/archived contract back
  into the validation queue; Contracts, Ingestion Log and Audit screens are
  paginated to handle 10,000+ records. Health probes at `/api/health`
  (liveness) and `/api/health/ready` (readiness — DB check, 503 if down).
- **Security**: repeated failed logins for an email are throttled after a
  configurable threshold (`LOGIN_MAX_ATTEMPTS`, default 5) for a lockout window
  (`LOGIN_LOCKOUT_MINUTES`, default 15), returning HTTP 429 with Retry-After.
- **Validator workload**: the Dashboard shows a workload table grouping
  pending-validation contracts by assignee (plus the unassigned backlog), with
  a "stale" count for items waiting more than 7 days, so leads can rebalance
  work.
- **Dashboard search**: search contracts from the main page by vendor name
  (matches the vendor master and raw extracted names) and/or by expiry month.
- **Multiple watched folders**: Admin Settings accepts one folder per line;
  each is monitored recursively and changes apply live (no restart needed).
- **Google Drive monitoring**: a second ingestion source. Configure a Google
  service-account credential (read-only) and one or more Drive folder IDs in
  Admin Settings; a background poller lists those folders recursively,
  downloads new files (Google Docs are exported to PDF) into a local staging
  area, and runs them through the same pipeline — SHA-256 dedupe, extraction,
  validation and reminders all apply. Each Drive file is imported once
  (tracked by its Drive file id); the Ingestion Log shows a Source column
  (Local / Google Drive), and admins can trigger an immediate poll.
- **AI extraction provider (Claude / ChatGPT / Gemini)**: choose the document-
  processing engine in Admin Settings — Anthropic Claude, OpenAI (ChatGPT), or
  Google Gemini — each with its own API key and model. A provider-agnostic
  dispatcher (`app/services/extraction.py`) assembles the prompt (including the
  organization-entity guidance and JSON-shape instruction) and delegates to the
  selected backend, which returns the same `{data, confidence}` structure so the
  rest of the pipeline is unchanged. Claude and OpenAI use native structured
  JSON outputs; Gemini uses JSON response mode. The `openai` and
  `google-generativeai` packages are optional and imported lazily — only needed
  when their provider is selected.
- **Token usage tracking**: the input/output tokens consumed by the AI provider
  when processing each file are captured from the provider response and stored
  on the ingestion record. The Ingestion Log shows per-file token counts (with
  an in/out breakdown on hover) and a running total across all processed files
  (`/ingestion/token-usage`), for cost visibility.
- **API keys**: the Claude key still falls back to `ANTHROPIC_API_KEY`
  server-side; all provider keys (Anthropic/OpenAI/Gemini) are configured in
  Admin Settings and stored write-only — the API returns a mask, never the key,
  and it is never exposed to the frontend. Models, SMTP host/port/credentials
  and dry-run mode are also admin-configurable at runtime.

## Tests

```bash
cd backend
python -m pytest tests/ -v
```

Covers duplicate detection (vendor normalization, both fuzzy rules, date
overlap), date derivation (parsing, tenure arithmetic), and reminder-offset
calculations (explicit offsets, periodicity, post-expiry, plus an end-to-end
run of the daily check against an in-memory DB).

## API

Interactive docs at `http://localhost:8000/docs` (OpenAPI). All endpoints are
under `/api` and JWT-protected; role checks: Admin (configuration), Validator
(queue + edits), Viewer (read-only).
