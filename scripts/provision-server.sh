#!/usr/bin/env bash
#
# Take a bare Ubuntu 22.04/24.04 server to a live, HTTPS ERP deployment.
#
#   curl -fsSL https://raw.githubusercontent.com/ananteshwark/ananteshwark/claude/app-build-setup-ntay5k/scripts/provision-server.sh -o provision.sh
#   sudo bash provision.sh --domain erp.example.com
#
# Idempotent: safe to re-run. It never overwrites an existing .env (that file
# holds the only copy of your signing secrets and database password), and every
# step checks before it acts.
#
# What it does, in order:
#   1. preflight   root, OS, RAM, and — importantly — that DNS already points
#                  here, because Caddy asks Let's Encrypt for a certificate on
#                  first boot and a failed request against a wrong A record
#                  burns a strict, per-domain rate limit.
#   2. swap        a 2G file. The image build (tsc over 68 modules, then Vite)
#                  is the memory peak, not the running app; on 4G boxes the
#                  build is what gets OOM-killed.
#   3. packages    system update, git, ufw, fail2ban.
#   4. docker      official apt repo, not the distro's older packaging.
#   5. firewall    SSH first, then 80/443, THEN enable — that order is what
#                  keeps you from locking yourself out of your own server.
#   6. deploy      clone/update, generate .env with real random secrets, build
#                  and start the stack.
#   7. verify      wait for the API to report healthy, then check the public
#                  HTTPS endpoint through Caddy.
#   8. backups     nightly pg_dumpall, 14 days retained.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ananteshwark/ananteshwark.git}"
REPO_REF="${REPO_REF:-claude/app-build-setup-ntay5k}"
APP_DIR="${APP_DIR:-/opt/erp}"
DOMAIN=""
SKIP_DNS_CHECK=0

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage: sudo bash provision-server.sh --domain <fqdn> [options]

  --domain <fqdn>     Public hostname for the ERP (required). Its A record must
                      already point at this server.
  --app-dir <path>    Install location (default: /opt/erp)
  --ref <branch>      Git ref to deploy (default: ${REPO_REF})
  --skip-dns-check    Proceed even if DNS does not resolve here. Only for
                      split-horizon DNS; a wrong A record wastes a Let's
                      Encrypt rate limit that takes days to clear.
  -h, --help          This message
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --app-dir) APP_DIR="${2:-}"; shift 2 ;;
    --ref) REPO_REF="${2:-}"; shift 2 ;;
    --skip-dns-check) SKIP_DNS_CHECK=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1 (try --help)" ;;
  esac
done

# ---------------------------------------------------------------- 1. preflight
log "Preflight"
[ "$(id -u)" -eq 0 ] || die "Run as root (sudo bash $0 ...)."
[ -n "$DOMAIN" ] || { usage; die "--domain is required."; }
command -v apt-get >/dev/null || die "This script targets Debian/Ubuntu."

MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ]; then
  warn "Only ${MEM_MB}MB RAM. The image build needs ~4GB; swap below will help,"
  warn "but a 2GB box usually OOMs during 'tsc'. 4GB is the practical floor."
else
  ok "RAM ${MEM_MB}MB"
fi

apt-get update -qq >/dev/null 2>&1 || true
command -v dig >/dev/null 2>&1 || apt-get install -y -qq dnsutils >/dev/null 2>&1 || true
command -v curl >/dev/null 2>&1 || apt-get install -y -qq curl >/dev/null 2>&1 || true

PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"
[ -n "$PUBLIC_IP" ] && ok "Public IP ${PUBLIC_IP}"

if [ "$SKIP_DNS_CHECK" -eq 0 ] && [ -n "$PUBLIC_IP" ]; then
  RESOLVED="$(dig +short A "$DOMAIN" 2>/dev/null | tail -1 || true)"
  if [ -z "$RESOLVED" ]; then
    die "$DOMAIN has no A record yet. Add one pointing at ${PUBLIC_IP}, wait for
    it to propagate, then re-run. Starting Caddy before DNS resolves makes
    Let's Encrypt fail and consumes a rate limit."
  elif [ "$RESOLVED" != "$PUBLIC_IP" ]; then
    die "$DOMAIN resolves to ${RESOLVED}, not this server (${PUBLIC_IP}).
    Fix the A record, or pass --skip-dns-check if you know better."
  fi
  ok "DNS ${DOMAIN} -> ${PUBLIC_IP}"
fi

# --------------------------------------------------------------------- 2. swap
log "Swap"
if swapon --show | grep -q '/swapfile'; then
  ok "swapfile already active"
else
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "2G swapfile created and enabled"
fi

# ----------------------------------------------------------------- 3. packages
log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq git ufw fail2ban ca-certificates gnupg postgresql-client
ok "base packages installed"

# ------------------------------------------------------------------- 4. docker
log "Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "docker + compose plugin already present"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "docker installed"
fi

# ----------------------------------------------------------------- 5. firewall
log "Firewall"
# SSH is allowed BEFORE enabling, or `ufw enable` drops the session it is
# running in and the server becomes unreachable.
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1 || true
ok "ufw active (22, 80, 443); fail2ban running"
warn "Postgres is NOT exposed: it has no host port, only the compose network."

# ------------------------------------------------------------------- 6. deploy
log "Application"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$REPO_REF"
  git -C "$APP_DIR" checkout --quiet "$REPO_REF"
  git -C "$APP_DIR" reset --hard --quiet "origin/${REPO_REF}"
  ok "repo updated to origin/${REPO_REF}"
else
  git clone --quiet --branch "$REPO_REF" "$REPO_URL" "$APP_DIR"
  ok "repo cloned to ${APP_DIR}"
fi
cd "$APP_DIR"

if [ -f .env ]; then
  ok ".env exists — left untouched (it holds your only copy of the secrets)"
else
  umask 077
  cat > .env <<ENVFILE
# Generated by provision-server.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# These secrets exist ONLY here. Back this file up somewhere safe: losing
# DATABASE_PASSWORD makes the database volume unreadable.
DOMAIN=${DOMAIN}
DATABASE_NAME=erp_db
DATABASE_USER=erp_user
DATABASE_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ENVFILE
  chmod 600 .env
  ok ".env created with freshly generated secrets (mode 600)"
fi

log "Building and starting the stack (first build takes several minutes)"
docker compose -f docker-compose.prod.yml up -d --build

# ------------------------------------------------------------------- 7. verify
log "Verifying"
printf '    waiting for the API to report healthy '
for _ in $(seq 1 60); do
  state="$(docker compose -f docker-compose.prod.yml ps --format json api 2>/dev/null \
           | tr ',' '\n' | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 | head -1 || true)"
  [ "$state" = "healthy" ] && break
  printf '.'; sleep 5
done
printf '\n'
[ "${state:-}" = "healthy" ] || {
  docker compose -f docker-compose.prod.yml logs --tail 40 api || true
  die "API did not become healthy. Logs above; 'docker compose -f docker-compose.prod.yml logs -f api' for more."
}
ok "API healthy"

printf '    waiting for HTTPS (Caddy is obtaining a certificate) '
for _ in $(seq 1 40); do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "https://${DOMAIN}/api/health" 2>/dev/null || true)"
  [ "$code" = "200" ] && break
  printf '.'; sleep 5
done
printf '\n'
if [ "${code:-}" = "200" ]; then
  ok "https://${DOMAIN}/api/health returns 200"
else
  warn "Public HTTPS check did not return 200 yet (last: ${code:-none})."
  warn "Certificates can take a minute. Check: docker compose -f docker-compose.prod.yml logs caddy"
fi

# ------------------------------------------------------------------ 8. backups
log "Backups"
mkdir -p /root/backups
CRON='0 2 * * * cd '"$APP_DIR"' && docker compose -f docker-compose.prod.yml exec -T postgres pg_dumpall -U erp_user | gzip > /root/backups/all-$(date +\%F).sql.gz && ls -t /root/backups/all-*.sql.gz | tail -n +15 | xargs -r rm'
if crontab -l 2>/dev/null | grep -q 'pg_dumpall'; then
  ok "nightly backup cron already installed"
else
  ( crontab -l 2>/dev/null; echo "$CRON" ) | crontab -
  ok "nightly pg_dumpall at 02:00, 14 days retained, in /root/backups"
fi
# pg_dumpall covers every database on the shared instance — the ERP's and, when
# the contracts overlay is deployed, the CMS's too. What it cannot cover is the
# files: contract PDFs, attachments and business-unit letterheads live in Docker
# volumes, not in Postgres, and the rows that reference them are useless without
# them. Back the volumes up as well, but only the ones that exist, so this stays
# a no-op on an ERP-only box. The filters are substring matches, so per-tenant
# volumes (contracts_uploads_<slug>, …) are picked up automatically. Retention
# is by age rather than file count for the same reason: the number of archives
# per night grows with the number of tenants, so counting would start deleting
# yesterday's backups the moment a second silo was added.
VOLCRON='30 2 * * * for v in $(docker volume ls -q --filter name=contracts_uploads --filter name=contracts_letterheads --filter name=contracts_data); do docker run --rm -v "$v":/src:ro -v /root/backups:/dst alpine tar czf /dst/"$v"-$(date +\%F).tgz -C /src . ; done; find /root/backups -name "*contracts_*.tgz" -mtime +14 -delete'
if crontab -l 2>/dev/null | grep -q 'contracts_uploads'; then
  ok "nightly contracts volume backup already installed"
else
  ( crontab -l 2>/dev/null; echo "$VOLCRON" ) | crontab -
  ok "nightly contracts volume backup at 02:30 (no-op until the overlay is deployed)"
fi

warn "Backups are ON THE SAME DISK. Copy them off-box (rclone to R2/B2) before"
warn "you depend on them — a lost server loses the backups with it."

cat <<DONE

────────────────────────────────────────────────────────────────
 ERP is live:  https://${DOMAIN}
────────────────────────────────────────────────────────────────
 Register the first tenant in the browser; it becomes the admin
 and seeds its own starter data.

 Useful:
   cd ${APP_DIR}
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs -f api
   git pull && docker compose -f docker-compose.prod.yml up -d --build

 Secrets live in ${APP_DIR}/.env (mode 600) — back that file up.
 Optional contracts add-on: see CONTRACTS.md
────────────────────────────────────────────────────────────────
DONE
