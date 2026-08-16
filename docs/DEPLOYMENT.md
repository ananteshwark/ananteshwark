# Deployment Runbook

Target: a single Ubuntu 22.04/24.04 LTS VM (4 vCPU / 8 GB / 100–200 GB SSD),
Postgres + the FastAPI backend on the box, nginx serving the built frontend and
reverse-proxying `/api`, TLS via Let's Encrypt.

> **One backend instance only.** The folder watcher, extraction worker, and the
> daily reminder scheduler run *inside* the FastAPI process. Run uvicorn with a
> single worker. If you ever add more app processes for API load, set
> `CMS_BACKGROUND_SERVICES=false` on all but one, or you'll get duplicate
> reminder emails and racing watchers.

Replace `cms.example.com` with your domain and every `CHANGE_ME` with a real
secret before running.

---

## 1. System packages

```bash
sudo apt update && sudo apt upgrade -y

# Python, Postgres, nginx, OCR toolchain, build helpers
sudo apt install -y \
  python3 python3-venv python3-dev build-essential \
  postgresql postgresql-contrib \
  nginx \
  tesseract-ocr poppler-utils \
  git curl

# Node.js 20 (to build the frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

`tesseract-ocr` + `poppler-utils` are what make OCR of scanned PDFs/images work.
Enable NTP so reminder scheduling stays accurate:

```bash
sudo timedatectl set-ntp true
```

---

## 2. Dedicated service user and app directory

```bash
sudo useradd --system --create-home --home-dir /opt/cms --shell /usr/sbin/nologin cms
sudo -u cms git clone https://github.com/ananteshwark/CMS.git /opt/cms/app
```

If deploying the PR branch before merge:

```bash
sudo -u cms git -C /opt/cms/app checkout claude/contract-management-system-buhdr3
```

Create the folder(s) that will be watched for incoming contracts:

```bash
sudo -u cms mkdir -p /opt/cms/watched
```

---

## 3. PostgreSQL database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER cms WITH PASSWORD 'CHANGE_ME_DB_PASSWORD';
CREATE DATABASE cms OWNER cms;
SQL
```

The default local `postgresql` install listens on `localhost:5432` and is not
exposed to the network — leave it that way.

---

## 4. Backend: virtualenv, config, first run

```bash
cd /opt/cms/app/backend
sudo -u cms python3 -m venv .venv
sudo -u cms .venv/bin/pip install --upgrade pip
sudo -u cms .venv/bin/pip install -r requirements.txt
```

Create `/opt/cms/app/backend/.env` (loaded automatically from the working
directory). Generate real secrets:

```bash
python3 -c "import secrets; print('JWT_SECRET=' + secrets.token_urlsafe(48))"
```

```ini
# /opt/cms/app/backend/.env
DATABASE_URL=postgresql+psycopg2://cms:CHANGE_ME_DB_PASSWORD@localhost:5432/cms
JWT_SECRET=CHANGE_ME_TO_THE_GENERATED_VALUE
JWT_EXPIRY_MINUTES=480

# Claude — can also be set later from the Admin Settings screen
ANTHROPIC_API_KEY=sk-ant-CHANGE_ME
CLAUDE_MODEL=claude-opus-4-8

# Watched folder(s); more can be added at runtime in Admin Settings
WATCH_ROOT=/opt/cms/watched
WATCH_ENABLED=true

TIMEZONE=Asia/Kolkata
REMINDER_RUN_TIME=08:00

# SMTP — keep dry-run on until verified, then flip to false
SMTP_HOST=smtp.your-relay.example.com
SMTP_PORT=587
SMTP_USER=CHANGE_ME
SMTP_PASSWORD=CHANGE_ME
SMTP_FROM=cms-reminders@example.com
SMTP_TLS=true
EMAIL_DRY_RUN=true

APP_BASE_URL=https://cms.example.com
```

Lock down and seed the database (creates tables, the default extraction prompt,
and the admin/validator/viewer users):

```bash
sudo chmod 600 /opt/cms/app/backend/.env
sudo chown cms:cms /opt/cms/app/backend/.env
cd /opt/cms/app/backend
sudo -u cms .venv/bin/python -m scripts.seed
```

> Seeded logins are `admin@example.com / admin12345` (plus validator/viewer).
> **Change the admin password immediately after first login**, or create a new
> admin and delete the seeded one.

---

## 5. Backend as a systemd service

```bash
sudo tee /etc/systemd/system/cms-backend.service >/dev/null <<'UNIT'
[Unit]
Description=CMS FastAPI backend (API + folder watcher + reminder scheduler)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=cms
Group=cms
WorkingDirectory=/opt/cms/app/backend
ExecStart=/opt/cms/app/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now cms-backend
sudo systemctl status cms-backend --no-pager
curl -s http://127.0.0.1:8000/api/health         # liveness -> {"status":"ok"}
curl -s http://127.0.0.1:8000/api/health/ready   # readiness -> {"status":"ready","database":"ok"}
```

Point your load balancer / orchestrator liveness probe at `/api/health` and its
readiness probe at `/api/health/ready` (returns 503 if the database is
unreachable).

---

## 6. Frontend build

```bash
cd /opt/cms/app/frontend
sudo -u cms npm ci
sudo -u cms npm run build      # outputs static files to frontend/dist/
```

The built app calls `/api` on the same origin, so nginx (next step) handles
routing — no build-time API URL needed.

---

## 7. nginx: static frontend + /api reverse proxy

```bash
sudo tee /etc/nginx/sites-available/cms >/dev/null <<'NGINX'
server {
    listen 80;
    server_name cms.example.com;

    root /opt/cms/app/frontend/dist;
    index index.html;

    # Uploaded contract documents can be large; allow big request bodies
    client_max_body_size 64m;

    # API + document downloads -> uvicorn
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;    # extraction/report calls can be slow
    }

    # SPA fallback for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/cms /etc/nginx/sites-enabled/cms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 8. TLS

### 8a. Offline / air-gapped: a purchased wildcard certificate

The production box (`iksdc-078`, `vendorcontracts.ikshealth.com`) has no
internet access, so Let's Encrypt/certbot is not an option. It uses a purchased
RapidSSL/DigiCert `*.ikshealth.com` wildcard certificate. The
[`setup-https.sh`](../setup-https.sh) helper at the repo root does the whole
install; copy it plus the three cert files to the box and run:

```bash
# leaf cert, private key, and the intermediate CA (RapidSSL TLS RSA CA G1)
sudo bash setup-https.sh star_ikshealth_com.crt ikspk.txt RapidSSLTLSRSACAG1.crt
```

It decrypts the key (prompting for the passphrase — which never leaves the box),
builds the full chain, verifies the key matches the certificate, writes the
nginx server block (HTTP→HTTPS redirect + `listen 443 ssl`), and reloads.

Things that bit us and are worth knowing:

- **Ship the intermediate.** The purchased `.crt` is only the *leaf*. nginx must
  serve `leaf + intermediate` (`ssl_certificate` must point at a **fullchain**),
  or non-browser clients (Java, curl, some mobiles) fail chain validation. The
  intermediate ships with the cert as a `*.ca-bundle`/second `.crt`.
- **The key is passphrase-encrypted** (`BEGIN ENCRYPTED PRIVATE KEY`). Decrypt it
  once with the passphrase — nginx cannot load an encrypted key without a
  password file:
  ```bash
  openssl pkey -in ikspk.txt -out /etc/nginx/ssl/vendorcontracts.key   # prompts for passphrase
  chmod 600 /etc/nginx/ssl/vendorcontracts.key
  ```
- **Verify the key matches the cert** with `openssl rsa` for the key (NOT
  `openssl pkey`, which has no `-modulus` option and silently returns empty):
  ```bash
  openssl x509 -in /etc/nginx/ssl/vendorcontracts.fullchain.crt -noout -modulus | openssl md5
  openssl rsa  -in /etc/nginx/ssl/vendorcontracts.key           -noout -modulus | openssl md5
  # the two MD5s must be identical
  ```
- **`http2 on;` needs nginx ≥ 1.25.** On the older nginx here use the portable
  form `listen 443 ssl http2;` (the helper already does this).

The resulting server block:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vendorcontracts.ikshealth.com;
    return 301 https://$host$request_uri;   # drop this block if an upstream LB terminates TLS
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name vendorcontracts.ikshealth.com;

    ssl_certificate     /etc/nginx/ssl/vendorcontracts.fullchain.crt;   # leaf + intermediate
    ssl_certificate_key /etc/nginx/ssl/vendorcontracts.key;             # decrypted, mode 600
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    add_header Strict-Transport-Security "max-age=31536000" always;

    root /opt/cms/app/frontend/dist;
    index index.html;
    client_max_body_size 64m;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Confirm from a **client** machine (`Verify return code: 0 (ok)` = complete chain):

```bash
echo | openssl s_client -connect vendorcontracts.ikshealth.com:443 \
       -servername vendorcontracts.ikshealth.com 2>/dev/null | grep 'Verify return code'
```

**Renewal:** the current cert expires **17 Dec 2026**. To renew, replace
`/etc/nginx/ssl/vendorcontracts.fullchain.crt` (rebuild `leaf + intermediate`)
and the key if it changed, then `sudo nginx -t && sudo systemctl reload nginx`.

### 8b. Internet-connected installs: Let's Encrypt

For a box that *can* reach the internet, certbot is simpler:

```bash
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d cms.example.com --redirect --agree-tos -m you@example.com
```

Certbot rewrites the nginx server block to listen on 443, redirects 80→443, and
installs a renewal timer.

---

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Only 22, 80, and 443 need to be reachable. Postgres and uvicorn stay bound to
localhost.

---

## 10. Backups (the entire system state = Postgres + the documents)

```bash
sudo mkdir -p /opt/cms/backups && sudo chown cms:cms /opt/cms/backups

sudo tee /etc/cron.d/cms-backup >/dev/null <<'CRON'
# Nightly pg_dump at 01:30; keep 14 days
30 1 * * * cms pg_dump cms | gzip > /opt/cms/backups/cms-$(date +\%F).sql.gz && find /opt/cms/backups -name 'cms-*.sql.gz' -mtime +14 -delete
CRON
```

Also snapshot the watched/document folders (`/opt/cms/watched` and any network
mounts) with your VM provider's volume snapshots or `restic`/`borg` — the
database stores file *paths*, so the documents must be preserved alongside it.

---

## Optional: Google Sign-In (SSO)

To let users log in with their Google account:

1. In Google Cloud Console → **APIs & Services → Credentials**, create an
   **OAuth 2.0 Client ID** of type *Web application*. Add your app origin
   (`https://cms.example.com`) under **Authorized JavaScript origins**.
2. In the app: **Admin Settings → Google Sign-In** — enable it, paste the
   **Client ID**, and optionally set an **allowed email domain** and turn on
   **auto-provision** (which creates unknown users in that domain with the
   configured default role). Save.
3. The login page then shows a Google button. The Client ID is public; the
   backend verifies each Google ID token server-side against it.

The frontend loads Google's Identity Services script from
`https://accounts.google.com/gsi/client`. If you add a Content-Security-Policy
in nginx, allow `https://accounts.google.com` (script/frame) and
`https://*.googleusercontent.com` — the default config in this runbook sets no
CSP, so it works out of the box.

## Optional: Google Drive monitoring

To ingest contracts from Google Drive in addition to (or instead of) local
folders:

1. In Google Cloud Console, create a **service account** and a JSON key for it,
   and enable the **Google Drive API** for the project.
2. **Share** each Drive folder you want monitored with the service account's
   email address (Viewer access is enough).
3. In the app: **Admin Settings → Google Drive monitoring** — enable it, paste
   the service-account JSON, add the folder ID(s) (one per line; the ID is the
   last segment of the folder's URL), set the poll interval, and save. Use
   **Poll Drive now** to import immediately.

The service-account JSON is stored write-only (masked in the API like the API
key and SMTP password). Downloaded files land in the staging directory
(`GDRIVE_STAGING`, default `backend/gdrive_staging`) — keep it on the same
backed-up volume as the other documents, since `contract_link` references those
paths. The Google client libraries are already in `requirements.txt`; no extra
system packages are needed.

## Updating to a new version

```bash
cd /opt/cms/app
sudo -u cms git pull
# backend deps + any schema-additive changes (tables auto-create on boot)
sudo -u cms backend/.venv/bin/pip install -r backend/requirements.txt
sudo systemctl restart cms-backend
# frontend
sudo -u cms npm --prefix frontend ci
sudo -u cms npm --prefix frontend run build
sudo systemctl reload nginx
```

## Operational checks

```bash
journalctl -u cms-backend -f                 # live backend logs (ingestion, reminders)
systemctl status cms-backend nginx postgresql
```

- Drop a PDF into `/opt/cms/watched/` and watch it appear in the Ingestion Log.
- Add more watched folders and set the API key / SMTP from **Admin Settings** at
  runtime — no redeploy needed.
- Verify the daily reminder run: Admin → Reminder Rules → **Run daily check now**.
- Flip `EMAIL_DRY_RUN` to `false` (env or Admin Settings) only after a dry-run
  confirms the messages look right.
