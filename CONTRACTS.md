# Contract Management System (CMS) integration

The **contracts/** directory is the Contract Management System from
[`ananteshwark/cms`](https://github.com/ananteshwark/cms), stitched into this
repo with **git subtree** so its code lives here *and* future upstream upgrades
can be pulled in with one command.

It is a **standalone FastAPI (Python) + React app** — a different stack from the
ERP (NestJS/TypeScript). It was therefore vendored as a **co-deployed service on
its own subdomain**, not rewritten as a NestJS module. That is deliberate:
rewriting it would make upstream upgrades impossible to track, which is the
opposite of what was asked.

## Pulling future upgrades from the original codebase

Whenever the CMS repo is updated, bring those changes here:

```bash
bash scripts/sync-contracts.sh
# (optionally pass a branch: bash scripts/sync-contracts.sh main)
```

That runs `git subtree pull --prefix=contracts cms-upstream <branch> --squash`,
which creates a merge commit under `contracts/`. Review it, rebuild, and push.
The working tree must be clean before you run it.

Under the hood the link is a plain git remote:

```
cms-upstream  ->  https://github.com/ananteshwark/cms.git
```

The initial import was `git subtree add --prefix=contracts cms-upstream
claude/contract-management-system-buhdr3 --squash`.

### After a sync, read the upstream diff for operational steps

A subtree pull brings code, not the actions that code assumes someone took.
Skim the upstream changes for new required settings, new on-disk state, and
one-off migrations before you rebuild — the compose files here only cover what
was known at the time they were written.

The sync of 2026-09-03 is the worked example:

- **New on-disk state.** Per-business-unit letterheads are stored as files, not
  rows. Both compose files now mount `/app/letterheads` on a named volume; the
  nightly backup added by `scripts/provision-server.sh` archives it. Without the
  volume a routine `up -d --build` would have discarded every business unit's
  stationery, and the only symptom would be contracts quietly printing on blank
  paper.
- **Stricter start-up validation.** The CMS now refuses to boot on a missing,
  placeholder, or under-32-character `JWT_SECRET`, or on a development
  `APP_BASE_URL`. Both compose files already satisfy this — `CONTRACTS_JWT_SECRET`
  is required via `:?` and generated with `openssl rand -hex 32` (64 chars), and
  `APP_BASE_URL` is derived from the tenant's real domain.
- **One-off actions after deploying it.** Everyone is signed out once, because
  sessions moved from `localStorage` into an HttpOnly cookie. An admin must
  re-index (Repository AI → index status) before semantic ranking is correct
  again; search keeps working throughout.

## Running it for a single organisation (opt-in)

The CMS is **not** part of the default stack. For a single-organisation
deployment, enable the one bundled instance with the overlay:

```bash
# 1. In .env, set: CONTRACTS_DOMAIN, CONTRACTS_JWT_SECRET
#    and ANTHROPIC_API_KEY (the CMS uses it for contract extraction).
# 2. Point a DNS A record for CONTRACTS_DOMAIN at the same VM.
# 3. Bring the whole stack up (ERP + contracts):
docker compose -f docker-compose.prod.yml -f docker-compose.contracts.yml up -d --build
```

> **Serving more than one ERP tenant? Do NOT use this single overlay for them.**
> The CMS is single-tenant, so one shared instance would expose every tenant's
> contracts to the others. Use the per-tenant silos described in
> [Multi-tenancy](#multi-tenancy) below instead.

This adds `contracts-backend` (FastAPI, runs migrations on boot) and
`contracts-web` (nginx serving the built SPA), and gives the shared **Caddy** a
second site block for `CONTRACTS_DOMAIN` with its own auto-provisioned HTTPS cert.

**Database — shared server, separate database, least-privilege role.** To save
memory on a small VM, the CMS does *not* run its own Postgres. It reuses the
ERP's Postgres container but connects as a dedicated **non-superuser** role
(`cms_app`) that owns only its own database (`cms` by default) — never as the
ERP superuser (`erp_user`). So even if the CMS (which ingests untrusted
documents and calls an LLM) is compromised, its credentials cannot read or write
the ERP database. A one-shot `contracts-db-init` service creates the role and
database if missing (via `docker/contracts/init-cms-db.sql`) — idempotent, and
it works whether the Postgres volume is brand new or the ERP was already running
before you enabled contracts. Set `CONTRACTS_DB_PASSWORD` in `.env`.

Why a subdomain: both apps serve routes under `/api`, so they can't share one
origin. `contracts.example.com/api/*` → CMS backend; everything else → CMS SPA.
The ERP on `example.com` is completely unaffected.

## Multi-tenancy

**The ERP is multi-tenant (row-level `tenant_id` everywhere). The vendored CMS
is single-tenant — it has no tenant column at all**, so one CMS instance holds
exactly one organisation's users, vendors and contracts. Its "internal
entities" are your own signing subsidiaries, not tenants.

That mismatch has one hard rule:

> **Never put more than one ERP tenant behind a single CMS instance.** There is
> no row-level isolation inside the CMS, so a shared instance would let every
> tenant read and edit every other tenant's contracts.

We do **not** fix this by adding a `tenant_id` to the CMS: that would fork its
schema and break the `git subtree` upgrade path (the whole reason it was
vendored this way). Instead each tenant gets a fully isolated **silo**:

| Isolated per tenant | Shared |
|---------------------|--------|
| Database (`cms_<slug>`), its own least-privilege DB role + password, backend + web containers, subdomain, JWT signing secret, upload/data volumes | The Postgres **server** process and the Caddy TLS front door |

### Provisioning a tenant

```bash
bash scripts/contracts-add-tenant.sh <slug> <subdomain>
# e.g.
bash scripts/contracts-add-tenant.sh acme contracts.acme.example.com
```

This generates an isolated overlay under `deploy/contracts/<slug>/` (a compose
file, a Caddy site block, and a freshly generated per-tenant `JWT_SECRET` in a
`chmod 600` env file — all gitignored, all regenerable). Then point DNS for the
subdomain at the VM and bring the tenant up alongside the ERP — one `-f` per
tenant you run:

```bash
docker compose -f docker-compose.prod.yml \
  -f deploy/contracts/acme/compose.yml \
  -f deploy/contracts/globex/compose.yml up -d --build
```

Each tenant's `contracts-init-<slug>` one-shot creates its own `cms_<slug>`
database in the shared Postgres; the backend never sees another tenant's data.
A broken tenant can't take down Caddy, the ERP, or the other tenants (Caddy has
no hard dependency on any CMS container — a down silo just 502s its own
subdomain).

**Cost:** each tenant adds a backend + web container (~a few hundred MB RAM).
This is the unavoidable price of isolating a single-tenant app — budget VM size
by how many tenants will actually use contracts, or enable it selectively.

**Backups** already cover every tenant: the nightly `pg_dumpall`
(`DEPLOYMENT.md` §6) dumps all `cms_<slug>` databases in one file. Uploads live
in per-tenant volumes (`erp_contracts_uploads_<slug>`) — back those up too.

### Files that make this work

| File | Purpose |
|------|---------|
| `docker-compose.contracts.yml` | Single-org overlay (shares the ERP Postgres, db `cms`, role `cms_app`) + Caddy wiring |
| `docker/contracts/init-cms-db.sql` | Idempotently creates the least-privilege DB role + owned database |
| `scripts/contracts-add-tenant.sh` | Generates an isolated per-tenant silo (own db/backend/web/subdomain/secret) |
| `docker/contracts/contracts.caddy` | Caddy site block for the single-org contracts subdomain |
| `docker/caddy/Caddyfile` | `import /etc/caddy/conf.d/*.caddy` (no-op until an overlay mounts a block) |
| `scripts/sync-contracts.sh` | One-command upstream upgrade pull |
| `contracts/frontend/Dockerfile`, `nginx.conf`, `.dockerignore` | Container build for the SPA (local additions; upstream ships a prebuilt-`dist` deploy instead) |

Everything except those three `contracts/frontend/*` files lives **outside**
`contracts/`, so `git subtree pull` stays clean. The three in-tree additions only
conflict if upstream later adds files at the same paths — a rare, one-time resolve.

## Not enabling it changes nothing

Running just `docker compose -f docker-compose.prod.yml up -d` behaves exactly as
before: the Caddy `import` glob matches no files, and none of the contracts
services start.
