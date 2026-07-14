# Deployment Guide — Free / Minimum-Cost Hosting

This guide gets the full stack (PostgreSQL + NestJS API + React web + HTTPS)
running on a single small server for **$0** (Oracle Cloud Always Free) or
**~€4/month** (any small VPS such as Hetzner). Everything ships in this repo:

| File | Purpose |
| --- | --- |
| `docker-compose.prod.yml` | Production stack: Postgres, API, web, Caddy |
| `docker/caddy/Caddyfile` | Reverse proxy + automatic HTTPS (Let's Encrypt) |
| `.env.production.example` | Template for the required secrets/config |
| `docker-compose.yml` | Local development stack (not for production) |
| `OPERATIONS_RUNBOOK.md` | Backups, restore drills, incident procedures |

Why a single VM instead of a free PaaS: the API is a **long-running process**
— an hourly scheduler drives license billing, scheduled report emails,
SLA/compliance sweeps and Studio jobs. Free tiers that sleep on idle
(e.g. Render free) silently stop those. A VM also keeps DMS file uploads on
a persistent disk and avoids cold starts. See "Alternative: free PaaS" at
the end if you only need a demo.

---

## 1. Get a server

**Option A — Oracle Cloud Always Free ($0, recommended).**
Sign up at cloud.oracle.com (card required for identity, not billed). Create
a Compute instance:

- Shape: `VM.Standard.A1.Flex` (Ampere ARM) — up to 4 OCPU / 24 GB RAM free.
  2 OCPU / 8 GB is plenty for this stack.
- Image: Ubuntu 24.04 (aarch64).
- Boot volume: up to 200 GB free.
- If "out of capacity" for A1 in your region, retry off-peak or pick another
  availability domain; the two `VM.Standard.E2.1.Micro` (1 GB x86) instances
  are also free but 1 GB is too tight for this API — prefer A1.

Open ingress in the VCN security list: TCP **80** and **443** from `0.0.0.0/0`
(22 is open by default). Ubuntu images also run a host firewall — allow the
same ports there (step 3 handles it).

**Option B — small VPS (~€4–6/month).**
Hetzner CX22 (2 vCPU / 4 GB), or equivalents from OVH, Contabo, DigitalOcean.
Ubuntu 24.04. This avoids Oracle's ARM capacity lottery and is the setup to
pick for anything business-critical.

**DNS.** Point an `A` record (e.g. `erp.example.com`) at the server's public
IP before first boot — Caddy needs it resolving to issue the certificate.
A free Cloudflare account in front (DNS + proxy) adds CDN and DDoS cover;
if you enable the orange-cloud proxy, set SSL mode to **Full (strict)**.

## 2. Install Docker

SSH in, then:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker          # or log out/in
```

## 3. Open the firewall (Oracle/Ubuntu)

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true
```

(On Hetzner/DigitalOcean default images, ports are open unless you enabled
a cloud firewall — mirror 80/443 there.)

## 4. Clone and configure

```bash
git clone <your-repo-url> erp && cd erp
cp .env.production.example .env
nano .env
```

Set at minimum:

- `DOMAIN` — the DNS name from step 1.
- `DATABASE_PASSWORD` — long random string.
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — two different outputs of
  `openssl rand -hex 32`.

Optional but recommended:

- `SMTP_HOST/PORT/USER/PASS/FROM` — outbound email (password resets and
  scheduled report delivery). Brevo's free tier (300 emails/day) works;
  tenants can also configure their own SMTP in-app which overrides these.
- `ANTHROPIC_API_KEY` — enables receipt OCR, CV parsing and the LLM copilot
  planner; everything degrades gracefully without it.
- `CHANNEL_WEBHOOKS_ENABLED=true` — live Teams/Slack webhook delivery.

## 5. Launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes several minutes (installs + compiles both apps). What
happens on boot:

- Postgres initialises with your credentials on the `postgres_data` volume.
- The API runs with `APP_ENV=production`: schema **migrations run
  automatically** (the Baseline migration provisions all tables on a fresh
  database; `synchronize` is off).
- Caddy requests a Let's Encrypt certificate for `DOMAIN` and starts
  routing: `/*` → web, `/api/*` → API (prefix stripped).
- DMS attachments persist on the `uploads_data` volume
  (`DMS_STORAGE_DIR=/data/uploads`).

Verify:

```bash
docker compose -f docker-compose.prod.yml ps          # all Up
docker compose -f docker-compose.prod.yml logs -f api # "Application running on port 3000"
curl -s https://<DOMAIN>/api/health
```

Then open `https://<DOMAIN>`, click **Register**, and create the first
tenant — registration seeds the starter kit (leave types, letter templates,
recognition badges, KB categories, onboarding/offboarding journeys), so the
instance is immediately usable. No demo data is loaded in production.

## 6. Backups (do this before you rely on it)

Nightly Postgres dump, keeping 14 days:

```bash
mkdir -p ~/backups
crontab -e
# add:
0 2 * * * docker compose -f ~/erp/docker-compose.prod.yml exec -T postgres pg_dump -U erp_user erp_db | gzip > ~/backups/erp-$(date +\%F).sql.gz && ls -t ~/backups/erp-*.sql.gz | tail -n +15 | xargs -r rm
```

Copy them off-box (free options: Cloudflare R2 10 GB, Backblaze B2 10 GB via
`rclone`). Also back up the uploads volume occasionally:

```bash
docker run --rm -v erp_uploads_data:/data -v ~/backups:/out alpine tar czf /out/uploads-$(date +%F).tar.gz -C /data .
```

Restore: `gunzip -c erp-YYYY-MM-DD.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U erp_user erp_db`
(details and drills in `OPERATIONS_RUNBOOK.md`).

## 7. Updating

```bash
cd ~/erp
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

New migrations apply automatically on API start. Watch
`docker compose -f docker-compose.prod.yml logs -f api` on the first boot
after an update.

## 8. Sizing & troubleshooting

- **Footprint**: idle stack uses roughly 700 MB–1 GB RAM (Postgres ~100 MB,
  API ~350–500 MB, nginx/Caddy small). 2 GB total RAM is the practical
  minimum; 4 GB+ is comfortable.
- **Certificate not issued**: `DOMAIN` must resolve to this server and ports
  80/443 must be reachable (Oracle: check *both* the VCN security list and
  the host iptables). `docker compose ... logs caddy` shows ACME errors.
- **API restarts on boot**: usually a bad `DATABASE_PASSWORD`/URL mismatch —
  the compose file derives `DATABASE_URL` from the `DATABASE_*` values, so
  change them only via `.env` and recreate (`up -d`).
- **Emails not sending**: schedules record `No active SMTP configuration
  found` in their last-status rather than failing silently — set the
  `SMTP_*` values or configure SMTP in-app (Settings → Email).
- **One instance is by design**: the scheduler uses DB leader election, so
  scaling the API to N containers is safe, but you don't need to.

## Alternative: free PaaS (demo-grade only)

If you just want to show the app around without a VM:

- **Web**: Cloudflare Pages or Netlify free — build `apps/web` with
  `VITE_API_URL=https://<your-api-host>` and publish `dist/`.
- **API**: Render free web service (512 MB). It **sleeps after ~15 min
  idle** — cold starts and, more importantly, the hourly sweeps (billing,
  scheduled reports, SLA/compliance) don't run while asleep. A free monitor
  (cron-job.org, UptimeRobot) pinging `/health` every 10 minutes mitigates
  this, but it is a workaround.
- **Database**: Neon free (0.5 GB) or Supabase free (500 MB) — set
  `DATABASE_URL` accordingly. Both autosuspend on idle.
- **Uploads**: the container disk is ephemeral — acceptable for demos;
  for real use wire the DMS `ObjectStorageAdapter` seam to Cloudflare R2
  (10 GB free).

For anything beyond a demo, use the VM path above.
