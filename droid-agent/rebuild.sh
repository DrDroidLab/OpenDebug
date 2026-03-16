#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Stopping containers..."
docker compose down -v

echo "Removing image..."
docker rmi droid-agent-droid-agent 2>/dev/null || true

echo "Rebuilding and starting..."
docker compose up -d --build

echo ""
echo "Done. Open http://localhost:7433"
