#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
PG_DATABASE_URL="${PG_DATABASE_URL:-${DATABASE_URL%%\?schema=*}}"
UPLOAD_DIR="${UPLOAD_DIR:-.data/uploads}"
DESTINATION="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
if ! command -v "$PG_DUMP_BIN" >/dev/null 2>&1 && [ -x /Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump ]; then
  PG_DUMP_BIN=/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump
fi
command -v "$PG_DUMP_BIN" >/dev/null 2>&1 || { printf 'pg_dump was not found; set PG_DUMP_BIN\n' >&2; exit 1; }

mkdir -p "$DESTINATION"
"$PG_DUMP_BIN" "$PG_DATABASE_URL" --format=custom --file="$DESTINATION/database.dump"

if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$DESTINATION/attachments.tgz" -C "$UPLOAD_DIR" .
else
  mkdir -p "$DESTINATION/empty-attachments"
  tar -czf "$DESTINATION/attachments.tgz" -C "$DESTINATION/empty-attachments" .
  rmdir "$DESTINATION/empty-attachments"
fi

printf 'Backup written to %s\n' "$DESTINATION"
