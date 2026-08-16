# Go-Live Checklist — Contract Management System

A production cutover checklist for the offline / air-gapped deployment
(`iksdc-078`, `/opt/cms/app`, service `cms-backend`, user `cms`). Work top to
bottom; each item is a gate, not a suggestion.

## 1. Build & artifact
- [ ] Offline tarball built from `git archive HEAD` **plus** `frontend/dist` and
      `frontend/node_modules` (TipTap/ProseMirror) so the box needs no npm registry.
- [ ] `frontend/dist` is the build of the exact commit being shipped
      (`npm run build` green, no local edits).
- [ ] Backend test suite green on the build host (`python -m pytest -q`).

## 2. Configuration (`.env`)
- [ ] `DATABASE_URL` points at the production Postgres (real password, not the
      `CHANGE_ME_DB_PASSWORD` placeholder). Note: `pg_dump`/`psql` do not accept
      the SQLAlchemy `+psycopg2` scheme — strip it for CLI use
      (`PGURL=$(echo "$DATABASE_URL" | sed -E 's#\+psycopg2##')`).
- [ ] `APP_BASE_URL` is the real hostname used in emailed links (OTP, share,
      approval, nudge, executed-contract notices).
- [ ] `TIMEZONE` set (e.g. `Asia/Kolkata`) — drives reminder scheduling and
      lifecycle date rollovers.
- [ ] Secrets present as needed: AI provider key(s), SMTP password, DocuSign JWT
      key, event-webhook secret. Confirm they are **not** printed in logs.

## 3. Database & migrations
- [ ] Fresh DB: tables auto-created on boot (`Base.metadata.create_all`).
- [ ] Existing DB: additive migrations applied on boot (`app/migrations.py` —
      idempotent `ADD COLUMN`, Postgres enum extensions). Confirm boot log shows
      no migration errors.
- [ ] Take a base backup before cutover (`pg_dump` with the scheme-stripped URL).

## 4. Integrations
- [ ] **SMTP**: send a test email from Settings → provider settings; confirm
      delivery. If `email_dry_run=true`, emails are logged, not sent — turn off
      for production.
- [ ] **AI provider** (optional): Settings shows provider/model; run a clause
      "Summarize" or "Polish" to confirm. All AI features degrade to the
      deterministic engine if unavailable — verify that fallback too.
- [ ] **DocuSign** (optional): configure JWT grant in Settings; send a test
      envelope on the DocuSign **demo** environment; confirm the Connect webhook
      reaches `/api/esign/webhook` (HMAC verified) and the signed PDF + Certificate
      of Completion are retrieved on completion.
- [ ] **Event webhooks** (optional): if enabled, confirm the target receives a
      signed `contract.validated` event.

## 5. Scheduled work
- [ ] Reminder/daily job runs on schedule (expiry reminders, **lifecycle expiry
      sweep**, **vendor due-date nudges**). Trigger once manually and confirm
      counts in the logs.
- [ ] Digest email (if enabled) delivers.

## 6. Health & observability
- [ ] `GET /api/health` returns `ok` (liveness).
- [ ] `GET /api/health/ready` returns `ready` with `database: ok`.
- [ ] `GET /api/metrics` (admin) returns request counts/latency; every response
      carries `X-Response-Time-ms`.
- [ ] Application logs are captured by the service manager and rotated.

## 7. Security & access
- [ ] Default/admin credentials rotated; roles assigned (Admin/Validator/Viewer,
      Author/Legal/Approver).
- [ ] Vendor links are token-only, expiring, revocable; OTP + rate-limit/lockout
      verified on the vendor portal.
- [ ] Approval-before-share gate configured if required
      (`require_approval_before_share`).
- [ ] Notification templates and authoring prompts reviewed (Settings) — no
      placeholder text leaking to vendors.

## 8. Data & retention
- [ ] Retention policy reviewed; negotiation ledger and tracked changes are
      retained (never hard-deleted for validated contracts).
- [ ] Backup/restore rehearsed at least once.

## 9. Smoke test (post-cutover)
- [ ] Ingest → validate a contract (auto-learn feeds the clause library).
- [ ] Author a draft → insert/drag a clause → share with a test vendor → vendor
      submits an inline suggestion → decide → notify.
- [ ] Send for signature (mock or DocuSign demo) → complete → executed contract
      appears in the register with signed PDF + certificate.
- [ ] Confirm a contract past its end date shows `EXPIRED` immediately on read.
