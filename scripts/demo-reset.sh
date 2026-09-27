#!/usr/bin/env bash
# Resets the public demo to a clean IRIS (fresh data volume) and re-applies the demo
# passwords. The tunnel container is left running, so the public URL does not change.
# Usage (on the demo server, from the repository root): scripts/demo-reset.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Passwords live in .env.demo (chmod 600, ignored by git) or in the environment.
if [ -f .env.demo ]; then set -a; . ./.env.demo; set +a; fi
: "${IRISOPS_ADMIN_PASSWORD:?set IRISOPS_ADMIN_PASSWORD}" "${IRISOPS_DEMO_PASSWORD:?set IRISOPS_DEMO_PASSWORD}"

# With TUNNEL_TOKEN set (named tunnel on your own domain), include that override too.
files=(-f docker-compose.yml -f docker-compose.demo.yml)
if [ -n "${TUNNEL_TOKEN:-}" ]; then files+=(-f docker-compose.named-tunnel.yml); fi
compose() { docker compose "${files[@]}" "$@"; }

echo "Stopping IRIS and MCP (tunnel stays up)..."
compose stop iris mcp
compose rm -f iris mcp
volume=$(docker volume ls -q --filter label=com.docker.compose.volume=irisops-data | head -1)
if [ -n "$volume" ]; then docker volume rm "$volume"; fi

echo "Starting a fresh IRIS..."
compose up -d iris mcp
for _ in $(seq 1 90); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' irisops 2>/dev/null)" = healthy ] && break
  sleep 5
done
[ "$(docker inspect -f '{{.State.Health.Status}}' irisops)" = healthy ] || { echo "IRIS did not become healthy" >&2; exit 1; }

echo "Applying demo passwords..."
compose exec -T -e IRISOPS_ADMIN_PASSWORD -e IRISOPS_DEMO_PASSWORD iris iris session IRIS -U %SYS < scripts/demo-setup.script
echo "Demo reset complete."
