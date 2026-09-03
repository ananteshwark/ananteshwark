# Operations Runbook
### Deploy, backup/DR, incident response for the ERP platform

**Companion:** `PRODUCTION_READINESS_ROADMAP.md` (P0.8). Everything here uses
capabilities that exist in this repo today — no aspirational tooling.

---

## 1. Topology & components

| Component | What it is | Scaling notes |
|---|---|---|
| API | NestJS (`apps/api`), stateless | Scale horizontally freely: background sweeps are lease-gated (`scheduler_leases`), so N instances fire each job once. |
| Web | Static Vite build (`apps/web/dist`) | Any static host/CDN. `VITE_API_URL` baked at build time. |
| PostgreSQL | System of record (all tenants) | The only stateful tier — all backup/DR effort concentrates here. |
| Redis | Bull queues (config in `app.module.ts`) | Loss = queue backlog loss only; safe to rebuild empty. |

Key env vars: `DATABASE_URL`, `APP_ENV` (`production` enables
migrations-on-boot and disables schema sync), `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `ALLOWED_ORIGINS`, `REDIS_HOST/PORT`, `APP_PORT`.
`JWT_SECRET`s must come from a secret manager, never the image.

## 2. Deploy procedure

1. Build: `npm run build` in `apps/api` (then `apps/web`).
2. Run database migrations — one of:
   - **Boot-time (default):** with `APP_ENV=production`, TypeORM runs pending
     migrations on startup (`migrationsRun: true`); the Baseline migration
     adopts an existing schema or creates a fresh one.
   - **Explicit (preferred for zero-downtime):** `npm run migration:run`
     against the target DB *before* rolling instances.
3. Roll API instances one at a time; `/health` gates readiness.
4. Verify: `/health` 200, `/metrics/summary` shows traffic, one canary login.

**Rollback:** application images roll back freely (schema is
backward-compatible by policy: additive migrations only in a release;
destructive changes ship one release after the code stops using the columns).
Never `migration:revert` in production — the baseline is irreversible by
design; restore from backup instead (§3).

## 3. Backup & disaster recovery

**Targets (defaults — tighten per contract):**
- **RPO ≤ 5 minutes** — continuous WAL archiving (PITR).
- **RTO ≤ 4 hours** — restore + redeploy, rehearsed quarterly.

**Postgres:**
- Enable WAL archiving / use the managed provider's PITR (RDS, Cloud SQL).
- Nightly logical dump as belt-and-braces:
  `pg_dump --format=custom "$DATABASE_URL" > erp-$(date +%F).dump`, retained
  30 days offsite, restore-tested monthly (`pg_restore --list` at minimum).
- **Restore drill:** provision empty instance → PITR/`pg_restore` → point a
  staging API at it (`APP_ENV=production` so migrations reconcile) → run the
  canary flow (login → create PR → approve). Time it; that number is your
  demonstrated RTO.

**Tenant-level export (portable backup / offboarding):** until a dedicated
export job ships, use per-tenant SQL extraction — every table carries
`tenant_id`, so `COPY (SELECT * FROM <table> WHERE tenant_id = $1) TO STDOUT
WITH CSV HEADER` over the table list from
`information_schema.tables WHERE table_schema='public'` produces a complete
tenant archive.

**Redis:** no backup needed; recreate empty. In-flight Bull jobs are lost —
the lease-gated sweeps self-heal on the next tick.

## 4. Incident response

**Correlate:** every response carries `X-Request-ID`; the access log line
(`method path status ms tenant=… rid=…`) is greppable by that id. Ask the
reporter for the id from the failing response.

**Golden signals:** scrape `/metrics` (Prometheus text) — request rate,
4xx/5xx counts, per-route latency sum/count/max. Alert suggestions:
`5xx rate > 1%/5min`, `http_request_duration_ms_max > 10s` on any route,
`app_uptime_seconds` reset (crash loop).

**Common playbooks:**
- *DB connection exhaustion:* symptoms — 500s across all routes, timeouts in
  logs. Check `pg_stat_activity`; restart the worst API instance; raise pool
  limits only after finding the leaking query.
- *Duplicate scheduled events (multi-instance):* verify `scheduler_leases` has
  one unexpired row per job; if the lease store is unreachable, sweeps skip
  ticks by design (fail closed) — restore DB connectivity, nothing to replay.
- *Suspected credential stuffing:* accounts lock after 5 failures; check the
  access log for 401 bursts per IP; add the CIDR to the security module's IP
  allowlist/blocklist; force resets for affected accounts.
- *Stuck approvals:* `GET /workflow/approval-matrix/resolve?...` shows which
  rule a document routes to; the instance history records who is pending.

## 5. Security operations

- MFA: enrollments live in `mfa_enrollments`; login enforces any verified,
  active TOTP enrollment. To unlock a user who lost their device: deactivate
  the enrollment row (support ticket + identity verification first).
- Account lockout: `users.failed_login_attempts >= 5` sets `status=LOCKED`;
  a password reset unlocks.
- Secrets rotation: JWT secrets rotate by deploying with both old and new
  accepted... (current code accepts one secret — rotation therefore implies
  a forced re-login window; schedule in off-hours).
- Response headers, HSTS, rate limiting (100 req/min via Throttler) are
  active by default — verify with `curl -sI /health`.

## 6. Data lifecycle & compliance

- GDPR erasure: privacy module (`/privacy` erasure requests) is the intake;
  process within 30 days.
- E-invoice register (`gst_einvoices`) and audit logs are append-only by
  policy — exclude them from any data-cleanup scripts.
- Retention defaults: audit logs 7 years (finance), access logs 90 days,
  idempotency keys 30 days (safe to purge by `created_at`).

## 7. Quarterly checklist

- [ ] Restore drill executed and RTO recorded
- [ ] `migration:show` clean on production (no never-run migrations)
- [ ] Alert rules fire on synthetic 5xx (test the pager, not just the app)
- [ ] Dependency audit (`npm audit --omit=dev`) triaged
- [ ] Access review: tenant-admin role assignments per tenant exported and
      signed off
