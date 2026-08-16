# Hetzner CX22 — Deploy From Scratch (~€4/month)

Stand up the whole stack (API + web + Postgres + HTTPS) on one Hetzner Cloud
server. CX22 = 2 vCPU / 4 GB / 40 GB (x86), plenty for this app — no swap
needed. Pairs with `DEPLOYMENT.md`.

Cost: CX22 ~€3.79/mo + one public IPv4 ~€0.50/mo ≈ **€4.30/mo**.

---

## 1. Prerequisites

- A **domain name** you control (needed for HTTPS). Point it at the server in
  step 4. A cheap `.com`/`.xyz` from Namecheap/Cloudflare/Porkbun is fine.
- An **SSH key** on your machine. Create one if you don't have it:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/erp_hetzner -C erp
  cat ~/.ssh/erp_hetzner.pub      # you'll paste this in step 3
  ```

## 2. Create a Hetzner account + project

1. Sign up at **console.hetzner.cloud** (new accounts may need ID/photo
   verification — can take a few minutes to a few hours).
2. Create a **New Project** (e.g. "erp").

## 3. Create the server

**Add Server**, then:

- **Location**: nearest to your users (Nuremberg/Falkenstein/Helsinki = EU,
  Ashburn = US East, Hillsboro = US West, Singapore = APAC).
- **Image**: **Ubuntu 24.04**.
- **Type**: **Shared vCPU** → **x86 (Intel/AMD)** → **CX22**.
- **Networking**: keep **Public IPv4** enabled.
- **SSH keys**: **Add SSH key** → paste the `.pub` from step 1.
- **Firewalls**: **Create Firewall** → add inbound **TCP 22, 80, 443** from
  `Any IPv4`/`Any IPv6` (or skip — Hetzner's Ubuntu image leaves ports open by
  default; a firewall is just good hygiene).
- **Name**: `erp-server`.
- **Create & Buy Now**. Note the **public IP** shown on the server page.

## 4. Point your domain at it

At your domain registrar/DNS, add an **A record**:

```
erp.yourdomain.com   A   <server-public-IP>
```

(Optionally an `AAAA` record to the server's IPv6.) Wait a couple of minutes
for it to resolve — Caddy needs this working to issue the TLS cert.

## 5. SSH in and install Docker

```bash
ssh -i ~/.ssh/erp_hetzner root@<server-public-IP>

# on the server (you are root, so no sudo needed):
curl -fsSL https://get.docker.com | sh
```

## 6. Clone, configure, launch

The deployment files live on the `claude/app-build-setup-ntay5k` branch (the
PR isn't merged), so check that branch out.

```bash
git clone https://github.com/ananteshwark/ananteshwark.git erp
cd erp
git checkout claude/app-build-setup-ntay5k
cp .env.production.example .env
nano .env
```

> **Private repo?** If `git clone` prompts for credentials, use a GitHub
> Personal Access Token as the password (github.com → Settings → Developer
> settings → Tokens), or make the repo public temporarily.

Set these four in `.env` (generate each secret with `openssl rand -hex 32`):

```
DOMAIN=erp.yourdomain.com
DATABASE_PASSWORD=<long-random-string>
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<different openssl rand -hex 32>
```

Leave `DATABASE_SSL` unset (Postgres runs locally in the stack). Then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes a few minutes. It brings up Postgres, the API (migrations
run automatically on boot), the web build, and Caddy (which fetches a
Let's Encrypt cert for your domain).

## 7. Verify

```bash
docker compose -f docker-compose.prod.yml ps          # all Up
docker compose -f docker-compose.prod.yml logs -f api # "Application running on port 3000"
curl -s https://erp.yourdomain.com/api/health         # ok
```

Open `https://erp.yourdomain.com`, click **Register**, create your first
tenant — the starter kit seeds automatically and you're in.

## 8. Next

- **Backups**: nightly `pg_dumpall` cron + off-box copy (one dump covers the ERP
  and every contracts tenant database) — see `DEPLOYMENT.md` step 6.
- **Updates**: `git pull && docker compose -f docker-compose.prod.yml up -d --build`
  (migrations apply on API start).
- **Troubleshooting**: `DEPLOYMENT.md` step 8 (cert not issuing, API
  restarting, etc.).

## Common gotchas

- **Cert not issued / site not loading over HTTPS**: the domain's A record
  must resolve to this server and ports 80/443 must be reachable. If you
  created a Hetzner Firewall, confirm 80/443 are allowed.
  `docker compose -f docker-compose.prod.yml logs caddy` shows ACME errors.
- **`git clone` auth prompt**: private repo — use a PAT (above).
- **Build seems stuck/killed**: unlikely on 4 GB, but if so, add swap
  (`DEPLOYMENT.md` / VM-config notes).
