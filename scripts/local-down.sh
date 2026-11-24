#!/usr/bin/env bash
# local-down.sh — Detiene el entorno local. CONSERVA los datos (volumen de Postgres).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.local.yml)
[ -f .env.local ] && COMPOSE+=(--env-file .env.local)
"${COMPOSE[@]}" down
echo "✅ Entorno local detenido (datos conservados). Para borrarlos: bash scripts/local-reset.sh"
