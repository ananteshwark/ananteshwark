#!/usr/bin/env bash
# Restore a backup taken by backup.sh.
#
# Usage:  sudo bash restore.sh <backup_dir> [app_dir]
#
# This is destructive: it replaces the current database contents and the
# document directories. It stops the service first, restores, then starts it —
# restoring underneath a running app leaves the two disagreeing about what
# exists.
#
# Rehearse it. docs/DEPLOYMENT.md has a drill that restores into a scratch
# database, which is the only way to find out that a backup works before the
# day it has to.
set -euo pipefail

SRC="${1:?usage: sudo bash restore.sh <backup_dir> [app_dir]}"
APP="${2:-/opt/cms/app}"
[ -d "$SRC" ] || { echo "!! no such backup directory: $SRC"; exit 1; }

echo ">> restoring from $SRC"
[ -f "$SRC/manifest.txt" ] && sed 's/^/   /' "$SRC/manifest.txt"

ENV_FILE="$APP/backend/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi
DATABASE_URL="${CMS_RESTORE_DATABASE_URL:-${DATABASE_URL:-}}"
MANUAL_UPLOAD_DIR="${MANUAL_UPLOAD_DIR:-$APP/backend/manual_uploads}"
ATTACHMENTS_DIR="${ATTACHMENTS_DIR:-$APP/backend/attachments}"
LETTERHEAD_DIR="${LETTERHEAD_DIR:-$APP/backend/letterheads}"
[ -n "$DATABASE_URL" ] || { echo "!! DATABASE_URL is not set"; exit 1; }

# Refuse to run unattended. The whole point of this script is that it destroys
# what is there now.
if [ "${CMS_RESTORE_YES:-}" != "1" ]; then
  echo
  echo "This will REPLACE:"
  echo "  database:    $DATABASE_URL"
  echo "  documents:   $MANUAL_UPLOAD_DIR"
  echo "               $ATTACHMENTS_DIR"
  echo "  letterheads: $LETTERHEAD_DIR"
  printf "Type 'restore' to continue: "
  read -r answer
  [ "$answer" = "restore" ] || { echo "aborted"; exit 1; }
fi

STOPPED=0
if systemctl is-active --quiet cms-backend 2>/dev/null; then
  echo ">> stopping cms-backend"
  systemctl stop cms-backend
  STOPPED=1
fi

# ---- database ------------------------------------------------------------
case "$DATABASE_URL" in
  postgres*|postgresql*)
    PG_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's|^postgresql\+psycopg2://|postgresql://|')"
    [ -f "$SRC/database.dump" ] || { echo "!! $SRC/database.dump is missing"; exit 1; }
    echo ">> pg_restore (dropping and recreating objects)"
    # --clean --if-exists so a restore over a populated database replaces it
    # rather than colliding. Errors are reported but do not abort: dropping
    # objects that were never there is normal and not a failure.
    pg_restore --clean --if-exists --no-owner --no-privileges \
               --dbname="$PG_URL" "$SRC/database.dump" || {
      echo "   (pg_restore reported errors — check them; drops of absent objects are expected)"
    }
    ;;
  sqlite*)
    DB_PATH="$(printf '%s' "$DATABASE_URL" | sed -E 's|^sqlite:/{2,4}||')"
    [ -f "$SRC/database.sqlite" ] || { echo "!! $SRC/database.sqlite is missing"; exit 1; }
    echo ">> replacing $DB_PATH"
    cp "$SRC/database.sqlite" "$DB_PATH"
    ;;
  *)
    echo "!! unrecognised DATABASE_URL scheme"; exit 1 ;;
esac

# ---- documents -----------------------------------------------------------
restore_dir() {
  local archive="$1" target="$2"
  [ -f "$archive" ] || { echo "   (no $(basename "$archive") in this backup — skipping)"; return 0; }
  echo ">> restoring $target"
  mkdir -p "$(dirname "$target")"
  rm -rf "$target"
  tar -xzf "$archive" -C "$(dirname "$target")"
}
restore_dir "$SRC/$(basename "$MANUAL_UPLOAD_DIR").tar.gz" "$MANUAL_UPLOAD_DIR"
restore_dir "$SRC/$(basename "$ATTACHMENTS_DIR").tar.gz" "$ATTACHMENTS_DIR"
restore_dir "$SRC/$(basename "$LETTERHEAD_DIR").tar.gz" "$LETTERHEAD_DIR"
chown -R cms:cms "$MANUAL_UPLOAD_DIR" "$ATTACHMENTS_DIR" "$LETTERHEAD_DIR" 2>/dev/null || true

# ---- back up ------------------------------------------------------------
if [ "$STOPPED" = 1 ]; then
  echo ">> starting cms-backend"
  systemctl start cms-backend
  for _i in $(seq 1 40); do
    if curl -fsS "http://localhost:8000/api/health" >/dev/null 2>&1; then
      echo ">> healthy"
      exit 0
    fi
    sleep 1
  done
  echo "!! the service did not come back — journalctl -u cms-backend -n 60"
  exit 2
fi
echo ">> done (service was not running; start it when ready)"
