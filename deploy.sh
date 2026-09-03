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

# Which commit is on the box now, and which one is in the tarball. `git archive`
# substitutes these at release time via export-subst (see .gitattributes), so
# they identify the running server exactly. Printing both turns "did that
# actually deploy?" into something you can read off the screen.
commit_of() { grep -oE 'BUILD_COMMIT = "[0-9a-f]{7,40}"' "$1" 2>/dev/null | grep -oE '[0-9a-f]{7,40}' || true; }
OLD_COMMIT="$(commit_of "$APP/backend/app/_build_stamp.py")"
NEW_COMMIT="$(commit_of "$SRC/backend/app/_build_stamp.py")"
echo ">> deploying ${NEW_COMMIT:-unknown-commit} over ${OLD_COMMIT:-unknown-commit}"
if [ -n "$NEW_COMMIT" ] && [ "$NEW_COMMIT" = "$OLD_COMMIT" ]; then
  echo "   note: same commit as the running release — this is a redeploy, not an upgrade"
fi

echo ">> backing up current backend + dist to $APP.bak.$STAMP"
mkdir -p "$APP.bak.$STAMP/frontend"
[ -d "$APP/backend" ]        && cp -a "$APP/backend"        "$APP.bak.$STAMP/"          || true
[ -d "$APP/frontend/dist" ]  && cp -a "$APP/frontend/dist"  "$APP.bak.$STAMP/frontend/" || true

# Put the previous release back and restart. Called on any failure after the
# new code is in place — the old script left the box broken and printed where
# the backup was, which is the least useful moment to be reading a path.
#
# Deliberately does NOT undo migrations. They are additive by design (new
# nullable columns, new tables), so the previous release runs fine against the
# newer schema; trying to reverse them is how a rollback turns into data loss.
#
# The virtualenv is left on the newer dependencies too. They are a superset of
# what the previous release needs, and reinstalling under an outage adds
# minutes and another way to fail.
rollback() {
  echo "!! rolling back to ${OLD_COMMIT:-the previous release} ($APP.bak.$STAMP)"
  if [ -d "$APP.bak.$STAMP/backend" ]; then
    rsync -a --delete \
      --exclude 'venv/' --exclude '.venv/' --exclude '.env' --exclude '*.env' \
      --exclude '__pycache__/' --exclude '*.pyc' \
      --exclude 'manual_uploads/' --exclude 'attachments/' --exclude 'uploads/' \
  --exclude 'letterheads/' \
      --exclude 'data/' --exclude 'logs/' --exclude '*.log' --exclude '*.sqlite*' \
      "$APP.bak.$STAMP/backend/" "$APP/backend/"
  fi
  [ -d "$APP.bak.$STAMP/frontend/dist" ] && \
    rsync -a --delete "$APP.bak.$STAMP/frontend/dist/" "$APP/frontend/dist/"
  chown -R cms:cms "$APP" 2>/dev/null || true
  systemctl restart cms-backend
  for _i in $(seq 1 40); do
    if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
      nginx -s reload 2>/dev/null || systemctl reload nginx || true
      echo "!! rolled back and healthy. The failed release is NOT deployed."
      return 0
    fi
    sleep 1
  done
  echo "!!!! ROLLBACK FAILED — the service is down."
  echo "     journalctl -u cms-backend -n 60"
  echo "     the previous release is still at $APP.bak.$STAMP"
  return 1
}

echo ">> copying backend + frontend/dist into place"
# NEVER let --delete remove runtime state that isn't in the code bundle
# (virtualenv, secrets, uploaded files, letterhead artwork, data, logs). This is
# what took the service down once — excluding them makes the sync safe to
# repeat. Letterheads default to backend/letterheads, so without that exclude
# every deploy would quietly put all business units back on plain paper.
rsync -a --delete \
  --exclude 'venv/' --exclude '.venv/' --exclude '.env' --exclude '*.env' \
  --exclude '__pycache__/' --exclude '*.pyc' \
  --exclude 'manual_uploads/' --exclude 'attachments/' --exclude 'uploads/' \
  --exclude 'letterheads/' \
  --exclude 'data/' --exclude 'logs/' --exclude '*.log' --exclude '*.sqlite*' \
  "$SRC/backend/" "$APP/backend/"
mkdir -p "$APP/frontend/dist"
rsync -a --delete "$SRC/frontend/dist/" "$APP/frontend/dist/"
# node_modules is only needed if you ever rebuild on the box; copy when shipped.
[ -d "$SRC/frontend/node_modules" ] && \
  rsync -a --delete "$SRC/frontend/node_modules/" "$APP/frontend/node_modules/" || true
chown -R cms:cms "$APP" 2>/dev/null || true

# ---- Python dependencies -------------------------------------------------
# This script used to rsync code and restart, never installing anything. Every
# deploy therefore ran new code against whatever happened to already be in the
# venv: a release that added a dependency started throwing ImportError at
# runtime, and an optional provider that was never installed looked like a
# broken API key. Install from the lockfile so the box runs the versions the
# release was tested against.
VENV="$APP/backend/venv"
[ -d "$VENV" ] || VENV="$APP/venv"
if [ -x "$VENV/bin/pip" ]; then
  REQ="$APP/backend/requirements.lock.txt"
  [ -f "$REQ" ] || REQ="$APP/backend/requirements.txt"
  echo ">> installing Python dependencies from $(basename "$REQ")"
  "$VENV/bin/pip" install --quiet --no-input --disable-pip-version-check -r "$REQ" || {
    echo "!! dependency install failed — not restarting; the running service is untouched"
    exit 3
  }
else
  echo "!! no virtualenv found at $VENV — skipping dependency install"
  echo "   the service may fail to start if this release added a dependency"
fi

# ---- Secrets -------------------------------------------------------------
# The app refuses to start without JWT_SECRET (see backend/app/config.py). A
# first deploy onto a fresh box would otherwise fail the health check with no
# obvious cause, so generate one here — and never touch an existing value,
# because rewriting it would sign every user out.
ENV_FILE="$APP/backend/.env"
if [ -f "$ENV_FILE" ] && grep -qE '^JWT_SECRET=.+' "$ENV_FILE"; then
  echo ">> JWT_SECRET already configured — leaving it alone"
else
  echo ">> generating a JWT_SECRET into $ENV_FILE"
  SECRET="$(openssl rand -hex 32)"
  touch "$ENV_FILE"
  if grep -qE '^JWT_SECRET=' "$ENV_FILE"; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" "$ENV_FILE"
  else
    printf '\nJWT_SECRET=%s\n' "$SECRET" >> "$ENV_FILE"
  fi
  chown cms:cms "$ENV_FILE" 2>/dev/null || true
  chmod 600 "$ENV_FILE"
fi

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
  echo "   a 'Refusing to start — insecure configuration' line means $ENV_FILE is incomplete"
  rollback || exit 4
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
if [ "$fail" != 0 ]; then
  echo "!! backend verification failed — the new code is not serving the routes it should"
  rollback || exit 4
  exit 2
fi

echo ">> checking the served frontend bundle"
ASSET="$(curl -fsS http://localhost/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
if [ -n "$ASSET" ] && curl -fsS "http://localhost/$ASSET" | grep -q "Compact to 5"; then
  echo "   OK   served frontend is current"
else
  echo "   WARN served frontend looks stale or cached — hard-refresh the browser (Ctrl+Shift+R)"
fi

echo ">> done. Running ${NEW_COMMIT:-unknown-commit}. Backup at $APP.bak.$STAMP"
