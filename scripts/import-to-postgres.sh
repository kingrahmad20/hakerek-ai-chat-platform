#!/bin/sh
# Import SQLite backup into PostgreSQL.
# Run this AFTER the new PostgreSQL container is up and the schema is applied.
# Usage: sh scripts/import-to-postgres.sh

set -e

BACKUP_DIR="/opt/hakerek/backup"

if [ ! -f "$BACKUP_DIR/settings.sql" ] || [ ! -f "$BACKUP_DIR/users.sql" ]; then
  echo "Backup files not found. Run scripts/export-sqlite.sh first."
  exit 1
fi

echo "Importing users..."
cat "$BACKUP_DIR/users.sql" | docker compose -f /opt/hakerek/docker-compose.yml exec -T postgres psql -U hakerek hakerek

echo "Importing settings..."
cat "$BACKUP_DIR/settings.sql" | docker compose -f /opt/hakerek/docker-compose.yml exec -T postgres psql -U hakerek hakerek

echo ""
echo "Import complete!"
echo "Verify with: docker compose -f /opt/hakerek/docker-compose.yml exec postgres psql -U hakerek hakerek -c 'SELECT key FROM \"Setting\";'"
