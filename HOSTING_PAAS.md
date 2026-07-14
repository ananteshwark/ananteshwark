# Option 2 — Free PaaS Hosting (no server to manage)

Host the app across free managed platforms instead of a VM. Nothing to
patch or SSH into, and the base cost is **$0**. The layout:

| Layer | Platform (free tier) | Notes |
| --- | --- | --- |
| Web (React SPA) | **Cloudflare Pages** or Netlify | Genuinely free, always on |
| API (NestJS) | **Render** free web service | ⚠️ sleeps after ~15 min idle |
| Database | **Neon** free Postgres | 0.5 GB, autosuspends |
| File uploads | container disk (ephemeral) → **Cloudflare R2** | See step 6 |
| Email (optional) | **Brevo** SMTP | 300 emails/day |

**Read this first — the honest trade-off.** Render's free API **sleeps
when idle**. Two consequences: the first request after idle takes 30–60 s
(cold start), and while asleep the **hourly scheduler does not run** —
license billing, scheduled report emails, and SLA/compliance sweeps are
skipped until traffic wakes it. Step 5 adds a free keep-alive ping that
mostly mitigates this, but it is a workaround. For anything beyond a
demo/pilot, prefer the VM path in `DEPLOYMENT.md` (Oracle Always Free is
also $0 and runs the scheduler properly).

> This guide assumes your code is pushed to a GitHub/GitLab repo that
> Render and Cloudflare can connect to.

---

## 1. Database — Neon (free Postgres)

1. Sign up at **neon.tech** → **Create project** (pick a region near where
   the API will run — Render's default is Oregon/Frankfurt).
2. After creation, open **Connection string** and copy the **pooled**
   connection string. It looks like:
   `postgresql://user:pass@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`
3. Keep it handy — it becomes `DATABASE_URL` in step 2. No schema setup
   needed: the API runs its migrations automatically on first boot.

(Supabase free works too — use its **Connection Pooler** string from
Project Settings → Database. Same `DATABASE_URL` + `DATABASE_SSL=true`.)

## 2. API — Render (free web service)

1. Sign up at **render.com** → **New → Web Service** → connect your repo.
2. Configure:
   - **Root Directory**: `apps/api`  (the API builds self-contained from
     here — it does not need the workspace root).
   - **Runtime/Environment**: Node.
   - **Build Command**: `corepack enable && corepack prepare pnpm@9.15.4 --activate && pnpm install --ignore-workspace && pnpm run build`
   - **Start Command**: `node dist/main`
   - **Instance Type**: Free.

   > Don't use `pnpm install -g pnpm` / `npm install -g pnpm` on Render — a
   > global install fails with `ERR_PNPM_NO_GLOBAL_BIN_DIR`. `corepack`
   > (bundled with Node 20) provisions pnpm without a global bin dir.
   > `--ignore-workspace` makes pnpm install just this package (ignoring the
   > monorepo root), matching the Docker build.
3. **Environment variables** (Advanced → Add):

   | Key | Value |
   | --- | --- |
   | `APP_ENV` | `production` |
   | `APP_PORT` | `3000` |
   | `NODE_VERSION` | `20` |
   | `DATABASE_URL` | the Neon pooled string from step 1 |
   | `DATABASE_SSL` | `true`  ← **required for Neon/Supabase/Render PG** |
   | `JWT_SECRET` | output of `openssl rand -hex 32` |
   | `JWT_REFRESH_SECRET` | a *different* `openssl rand -hex 32` |
   | `ALLOWED_ORIGINS` | your web URL (fill in after step 3, e.g. `https://your-erp.pages.dev`) |

   Optional: `ANTHROPIC_API_KEY` (AI features), `CHANNEL_WEBHOOKS_ENABLED=true`
   (Teams/Slack), and `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`
   (step 7).

4. **Create Web Service**. First deploy takes a few minutes; migrations run
   on boot (watch the logs for "Application running on port 3000"). Your API
   is now at `https://<name>.onrender.com` — verify:
   `https://<name>.onrender.com/health` returns ok.

> `DATABASE_SSL=true` is essential — managed Postgres requires TLS and the
> app only enables it when this flag is set (local/VM Postgres stays
> plaintext). Without it you'll see connection or self-signed-cert errors
> in the Render logs.

## 3. Web — Cloudflare Pages

1. Sign up at **dash.cloudflare.com** → **Workers & Pages → Create →
   Pages → Connect to Git** → pick your repo.
2. Build settings:
   - **Framework preset**: None (Vite).
   - **Root directory**: `apps/web`.
   - **Build command**: `corepack enable && corepack prepare pnpm@9.15.4 --activate && pnpm install --ignore-workspace && pnpm run build`
   - **Build output directory**: `dist`
   - **Environment variables**: `VITE_API_URL` = your API origin from step 2,
     e.g. `https://<name>.onrender.com` (no trailing slash, no `/api`) — a
     **build-time** var, so changing it means a redeploy — and
     `NODE_VERSION` = `20`.
3. **Save and Deploy**. You get a URL like `https://your-erp.pages.dev`.

(Netlify is equivalent: base directory `apps/web`, same corepack build
command, publish directory `dist`, env `VITE_API_URL` + `NODE_VERSION=20`.)

## 4. Close the CORS loop

Go back to Render → your service → Environment → set `ALLOWED_ORIGINS` to
the exact Pages URL from step 3 (e.g. `https://your-erp.pages.dev`), then
**Save** (Render redeploys). The API only accepts browser requests from
origins listed here, so this must match precisely (scheme + host, no
trailing slash). For a custom domain, list that instead/as well
(comma-separated).

Now open the Pages URL, click **Register**, create your first tenant — the
starter kit seeds automatically and you're in.

## 5. Keep the API awake (mitigate the sleep)

Free external cron, hitting the health endpoint every ~10 minutes so the
instance rarely sleeps and the hourly sweeps get a chance to run:

1. Sign up at **cron-job.org** (free) — or UptimeRobot.
2. New cronjob → URL `https://<name>.onrender.com/health` → interval
   **every 10 minutes**.

This does not give true always-on (Render still enforces monthly free
hours), but it keeps the app responsive during the day and lets the
scheduler fire. If reliable scheduling matters, move to the VM path.

## 6. File uploads (DMS attachments)

Render's free disk is **ephemeral** — uploaded documents vanish on every
redeploy/restart. Fine for a demo. For real use, either:

- accept it for now (attachments are non-critical to try the app), or
- upgrade to Render's paid persistent disk, or
- wire the DMS `ObjectStorageAdapter` seam to **Cloudflare R2** (10 GB
  free, S3-compatible). The seam already exists
  (`apps/api/src/modules/dms/object-storage.adapter.ts`); it needs an S3
  client implementation swapped in for the local-disk default. Tell me and
  I'll build the R2/S3 adapter.

## 7. Email (optional, for password resets + scheduled reports)

Scheduled report delivery and password-reset emails need SMTP. Free option:

1. Sign up at **brevo.com** → **SMTP & API → SMTP** → copy the server,
   port (587), login and an SMTP key.
2. On Render, set: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`,
   `SMTP_USER=<login>`, `SMTP_PASS=<smtp-key>`, `SMTP_FROM=you@yourdomain`.

Without SMTP the app still runs; scheduled reports just record
"No active SMTP configuration found" as their last status instead of
sending. Tenants can also set their own SMTP in-app (Settings → Email),
which overrides these.

---

## Cost summary

| | Free tier | If you outgrow it |
| --- | --- | --- |
| Cloudflare Pages | unlimited static hosting | stays free |
| Render API | free (sleeps; limited monthly hours) | ~$7/mo always-on |
| Neon Postgres | 0.5 GB, autosuspend | ~$19/mo or scale-to-zero paid |
| Brevo email | 300/day | pay per volume |
| **Total** | **$0 (demo-grade)** | ~$26/mo (small always-on) |

Compare with the VM path (`DEPLOYMENT.md`): **$0** on Oracle Always Free
or ~€4/mo on a VPS, *with* the scheduler running properly, persistent
uploads, and no cold starts — which is why that's the recommendation for
anything real. Use this PaaS route when you want zero server management and
are okay with demo-grade behavior.
