#!/bin/sh
set -e
cd /opt/hakerek

echo "[1/5] Building new image (includes next build)..."
docker compose build

echo "[2/5] Starting postgres..."
# --no-recreate prevents volume loss when compose config changes
docker compose up -d --no-recreate postgres

echo "[3/5] Applying database schema (prisma db push)..."
docker compose --profile migrate run --rm db-migrate

echo "[4/5] Starting web service..."
docker compose up -d hakerek-web

echo "[5/5] Reloading reverse proxy..."
docker exec docker-nginx nginx -s reload || true

echo "Removing unused images and build cache..."
docker image prune -f
docker builder prune -f

echo "Done. Disk usage:"
docker system df
