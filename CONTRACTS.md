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

## Running it in production (opt-in)

The CMS is **not** part of the default stack. Enable it with the overlay:

```bash
# 1. In .env, set: CONTRACTS_DOMAIN, CONTRACTS_DB_PASSWORD, CONTRACTS_JWT_SECRET
#    and ANTHROPIC_API_KEY (the CMS uses it for contract extraction).
# 2. Point a DNS A record for CONTRACTS_DOMAIN at the same VM.
# 3. Bring the whole stack up (ERP + contracts):
docker compose -f docker-compose.prod.yml -f docker-compose.contracts.yml up -d --build
```

This adds three containers — `contracts-db` (its own Postgres), `contracts-backend`
(FastAPI, runs migrations on boot), `contracts-web` (nginx serving the built SPA)
— and gives the shared **Caddy** a second site block for `CONTRACTS_DOMAIN`, which
gets its own auto-provisioned HTTPS certificate.

Why a subdomain: both apps serve routes under `/api`, so they can't share one
origin. `contracts.example.com/api/*` → CMS backend; everything else → CMS SPA.
The ERP on `example.com` is completely unaffected.

### Files that make this work

| File | Purpose |
|------|---------|
| `docker-compose.contracts.yml` | Overlay adding the three CMS services + Caddy wiring |
| `docker/contracts/contracts.caddy` | Caddy site block for the contracts subdomain |
| `docker/caddy/Caddyfile` | `import /etc/caddy/conf.d/*.caddy` (no-op until the overlay mounts the block) |
| `scripts/sync-contracts.sh` | One-command upstream upgrade pull |
| `contracts/frontend/Dockerfile`, `nginx.conf`, `.dockerignore` | Container build for the SPA (local additions; upstream ships a prebuilt-`dist` deploy instead) |

Everything except those three `contracts/frontend/*` files lives **outside**
`contracts/`, so `git subtree pull` stays clean. The three in-tree additions only
conflict if upstream later adds files at the same paths — a rare, one-time resolve.

## Not enabling it changes nothing

Running just `docker compose -f docker-compose.prod.yml up -d` behaves exactly as
before: the Caddy `import` glob matches no files, and none of the contracts
services start.
