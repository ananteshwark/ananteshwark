#!/usr/bin/env bash
# Back up everything that cannot be rebuilt from the tarball: the database and
# the contract documents on disk.
#
# Usage:  sudo bash backup.sh [dest_dir] [app_dir]
#   dest_dir defaults to /var/backups/cms
#   app_dir  defaults to /opt/cms/app
#
# The code is disposable — a release tarball reproduces it exactly. These are
# not: the register itself, and the PDFs and DOCX files the register points at.
# Losing either loses the contracts.
#
# Restoring is the half that matters and is the half nobody practises, so it
# has its own script (restore.sh) and a drill in docs/DEPLOYMENT.md. A backup
# nobody has ever restored is a guess, not a backup.
set -euo pipefail

DEST="${1:-/var/backups/cms}"
APP="${2:-/opt/cms/app}"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
OUT="$DEST/$STAMP"
KEEP_DAYS="${CMS_BACKUP_KEEP_DAYS:-30}"

# Read the deployed configuration so the backup follows the box, not defaults.
ENV_FILE="$APP/backend/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi
DATABASE_URL="${DATABASE_URL:-}"
MANUAL_UPLOAD_DIR="${MANUAL_UPLOAD_DIR:-$APP/backend/manual_uploads}"
ATTACHMENTS_DIR="${ATTACHMENTS_DIR:-$APP/backend/attachments}"
LETTERHEAD_DIR="${LETTERHEAD_DIR:-$APP/backend/letterheads}"

mkdir -p "$OUT"
echo ">> backing up to $OUT"

# ---- database ------------------------------------------------------------
if [ -z "$DATABASE_URL" ]; then
  echo "!! DATABASE_URL is not set in $ENV_FILE — cannot back up the database"
  exit 1
fi
case "$DATABASE_URL" in
  postgres*|postgresql*)
    # pg_dump understands the URL directly. Custom format (-Fc) so pg_restore
    # can be selective and so the dump is compressed.
    PG_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's|^postgresql\+psycopg2://|postgresql://|')"
    echo ">> pg_dump"
    pg_dump --format=custom --no-owner --no-privileges --file="$OUT/database.dump" "$PG_URL"
    ;;
  sqlite*)
    DB_PATH="$(printf '%s' "$DATABASE_URL" | sed -E 's|^sqlite:/{2,4}||')"
    echo ">> sqlite backup of $DB_PATH"
    # .backup rather than cp: safe while the app is running.
    sqlite3 "$DB_PATH" ".backup '$OUT/database.sqlite'"
    ;;
  *)
    echo "!! unrecognised DATABASE_URL scheme — not backing up the database"; exit 1 ;;
esac

# ---- documents -----------------------------------------------------------
# The register stores absolute paths to these files. Without them the rows
# survive and every "Original file" is a 404. Letterheads are the same bargain:
# the letterheads table names files on disk, and without them every business
# unit's contracts silently come out on plain paper.
for dir in "$MANUAL_UPLOAD_DIR" "$ATTACHMENTS_DIR" "$LETTERHEAD_DIR"; do
  if [ -d "$dir" ]; then
    name="$(basename "$dir")"
    echo ">> archiving $dir"
    tar -czf "$OUT/$name.tar.gz" -C "$(dirname "$dir")" "$name"
  else
    echo "   (no $dir — skipping)"
  fi
done

# ---- manifest ------------------------------------------------------------
# What this backup is of, so a restore can be matched to a release.
{
  echo "taken_at=$STAMP"
  echo "app_dir=$APP"
  echo "commit=$(grep -oE 'BUILD_COMMIT = "[0-9a-f]{7,40}"' "$APP/backend/app/_build_stamp.py" 2>/dev/null | grep -oE '[0-9a-f]{7,40}' || echo unknown)"
  echo "database_url_scheme=${DATABASE_URL%%:*}"
  echo "manual_upload_dir=$MANUAL_UPLOAD_DIR"
  echo "attachments_dir=$ATTACHMENTS_DIR"
  echo "letterhead_dir=$LETTERHEAD_DIR"
} > "$OUT/manifest.txt"

# ---- verify --------------------------------------------------------------
# An unreadable dump is worse than no dump, because it is trusted. Check it
# now, while someone is watching, rather than during an outage.
if [ -f "$OUT/database.dump" ]; then
  if pg_restore --list "$OUT/database.dump" >/dev/null 2>&1; then
    echo "   OK   dump is readable ($(du -h "$OUT/database.dump" | cut -f1))"
  else
    echo "!! the dump could not be read back by pg_restore — treat this backup as failed"
    exit 2
  fi
fi
for f in "$OUT"/*.tar.gz; do
  [ -e "$f" ] || continue
  tar -tzf "$f" >/dev/null 2>&1 || { echo "!! $f is not a readable archive"; exit 2; }
  echo "   OK   $(basename "$f") ($(du -h "$f" | cut -f1))"
done

# ---- retention -----------------------------------------------------------
find "$DEST" -maxdepth 1 -type d -name '20*' -mtime "+$KEEP_DAYS" -print -exec rm -rf {} + 2>/dev/null || true

echo ">> done: $OUT"
echo "   restore with: sudo bash restore.sh $OUT"
