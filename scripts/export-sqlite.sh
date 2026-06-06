#!/bin/sh
# Export critical data from SQLite before migrating to PostgreSQL.
# Run this on the server BEFORE deploying the new PostgreSQL setup.
# Usage: sh scripts/export-sqlite.sh

set -e

DB_FILE="/opt/hakerek/db/dev.db"
BACKUP_DIR="/opt/hakerek/backup"

if [ ! -f "$DB_FILE" ]; then
  echo "SQLite database not found at $DB_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Exporting Settings (API keys, model config)..."
sqlite3 "$DB_FILE" \
  "SELECT 'INSERT INTO \"Setting\" (id,key,value) VALUES (' || quote(id) || ',' || quote(key) || ',' || quote(value) || ') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;' FROM Setting;" \
  > "$BACKUP_DIR/settings.sql"

echo "Exporting Users..."
sqlite3 "$DB_FILE" \
  "SELECT 'INSERT INTO \"User\" (id,name,email,\"emailVerified\",image,password,role) VALUES (' || quote(id) || ',' || COALESCE(quote(name),'NULL') || ',' || COALESCE(quote(email),'NULL') || ',' || COALESCE(quote(emailVerified),'NULL') || ',' || COALESCE(quote(image),'NULL') || ',' || COALESCE(quote(password),'NULL') || ',' || quote(role) || ') ON CONFLICT (email) DO NOTHING;' FROM User;" \
  > "$BACKUP_DIR/users.sql"

echo ""
echo "Backup complete! Files saved to $BACKUP_DIR/"
echo "  $BACKUP_DIR/settings.sql  ($(wc -l < "$BACKUP_DIR/settings.sql") rows)"
echo "  $BACKUP_DIR/users.sql     ($(wc -l < "$BACKUP_DIR/users.sql") rows)"
echo ""
echo "After PostgreSQL is running, import with:"
echo "  sh /opt/hakerek/scripts/import-to-postgres.sh"
