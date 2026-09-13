#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
PG_DATABASE_URL="${PG_DATABASE_URL:-${DATABASE_URL%%\?schema=*}}"
: "${CONFIRM_RESTORE:?Set CONFIRM_RESTORE=yes after checking the target database}"
[ "$CONFIRM_RESTORE" = "yes" ] || { printf 'CONFIRM_RESTORE must equal yes\n' >&2; exit 1; }
[ "$#" -eq 1 ] || { printf 'Usage: CONFIRM_RESTORE=yes scripts/restore.sh BACKUP_DIRECTORY\n' >&2; exit 1; }

SOURCE=$1
UPLOAD_DIR="${UPLOAD_DIR:-.data/uploads}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
if ! command -v "$PG_RESTORE_BIN" >/dev/null 2>&1 && [ -x /Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore ]; then
  PG_RESTORE_BIN=/Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore
fi
command -v "$PG_RESTORE_BIN" >/dev/null 2>&1 || { printf 'pg_restore was not found; set PG_RESTORE_BIN\n' >&2; exit 1; }
[ -f "$SOURCE/database.dump" ] && [ -f "$SOURCE/attachments.tgz" ] || { printf 'Backup files are missing\n' >&2; exit 1; }

"$PG_RESTORE_BIN" --clean --if-exists --no-owner --dbname="$PG_DATABASE_URL" "$SOURCE/database.dump"
mkdir -p "$UPLOAD_DIR"
tar -xzf "$SOURCE/attachments.tgz" -C "$UPLOAD_DIR"
printf 'Restore completed from %s\n' "$SOURCE"
