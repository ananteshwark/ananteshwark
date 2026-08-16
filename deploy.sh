#!/usr/bin/env bash
# Offline deploy for the air-gapped CMS box (tarball-only, no git remote).
#
# Usage:  sudo bash deploy.sh <cms-offline-*.tar.gz> [app_dir] [backend_port]
#   app_dir      defaults to /opt/cms/app
#   backend_port defaults to 8000
#
# Extracts the release, updates BOTH halves (backend + prebuilt frontend/dist),
# backs up the current ones, restarts the service, reloads nginx, then verifies
# the new routes and the served bundle. Fails loudly if the update didn't take,
# so a stale deploy can never silently serve old code.
set -euo pipefail

TARBALL="${1:?usage: sudo bash deploy.sh <cms-offline-*.tar.gz> [app_dir] [backend_port]}"
APP="${2:-/opt/cms/app}"
PORT="${3:-8000}"
STAMP="$(date +%Y-%m-%d-%H%M)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo ">> extracting $TARBALL"
tar -xzf "$TARBALL" -C "$STAGE"
SRC="$STAGE/cms-offline"
[ -d "$SRC/backend" ] && [ -d "$SRC/frontend/dist" ] || {
  echo "!! tarball is missing backend/ or frontend/dist/ — wrong file?"; exit 1; }

echo ">> backing up current backend + dist to $APP.bak.$STAMP"
mkdir -p "$APP.bak.$STAMP/frontend"
[ -d "$APP/backend" ]        && cp -a "$APP/backend"        "$APP.bak.$STAMP/"          || true
[ -d "$APP/frontend/dist" ]  && cp -a "$APP/frontend/dist"  "$APP.bak.$STAMP/frontend/" || true

echo ">> copying backend + frontend/dist into place"
# NEVER let --delete remove runtime state that isn't in the code bundle
# (virtualenv, secrets, uploaded files, data, logs). This is what took the
# service down once — excluding them makes the sync safe to repeat.
rsync -a --delete \
  --exclude 'venv/' --exclude '.venv/' --exclude '.env' --exclude '*.env' \
  --exclude '__pycache__/' --exclude '*.pyc' \
  --exclude 'manual_uploads/' --exclude 'attachments/' --exclude 'uploads/' \
  --exclude 'data/' --exclude 'logs/' --exclude '*.log' --exclude '*.sqlite*' \
  "$SRC/backend/" "$APP/backend/"
mkdir -p "$APP/frontend/dist"
rsync -a --delete "$SRC/frontend/dist/" "$APP/frontend/dist/"
# node_modules is only needed if you ever rebuild on the box; copy when shipped.
[ -d "$SRC/frontend/node_modules" ] && \
  rsync -a --delete "$SRC/frontend/node_modules/" "$APP/frontend/node_modules/" || true
chown -R cms:cms "$APP" 2>/dev/null || true

echo ">> restarting cms-backend (runs additive migrations on boot)"
systemctl restart cms-backend

echo ">> waiting for the backend to become healthy (migrations run on boot)…"
up=0
for i in $(seq 1 40); do            # up to ~40s
  if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then up=1; break; fi
  sleep 1
done
if [ "$up" != 1 ]; then
  echo "!! backend did not become healthy in time — check: journalctl -u cms-backend -n 40"
  exit 2
fi

echo ">> reloading nginx"
nginx -s reload 2>/dev/null || systemctl reload nginx || true

echo ">> verifying new backend routes"
fail=0
for p in /api/clauses/curated /api/clauses/curate /api/settings/prompt-catalog /api/settings/page-access /api/authoring/field-policy; do
  if curl -fsS "http://localhost:${PORT}/openapi.json" | grep -q "$p"; then
    echo "   OK   $p"
  else
    echo "   FAIL $p missing — backend did not update"; fail=1
  fi
done
[ "$fail" = 0 ] || { echo "!! backend verification failed"; exit 2; }

echo ">> checking the served frontend bundle"
ASSET="$(curl -fsS http://localhost/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
if [ -n "$ASSET" ] && curl -fsS "http://localhost/$ASSET" | grep -q "Compact to 5"; then
  echo "   OK   served frontend is current"
else
  echo "   WARN served frontend looks stale or cached — hard-refresh the browser (Ctrl+Shift+R)"
fi

echo ">> done. Backup at $APP.bak.$STAMP"
