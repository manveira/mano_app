#!/usr/bin/env bash
# local-reset.sh — BORRA los datos del entorno LOCAL (volumen de Postgres) y lo recrea desde cero.
# Solo afecta al proyecto compose "mano-local". Pide confirmación (usa --yes para saltarla).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${1:-}" != "--yes" ]; then
  echo "⚠ Esto elimina la base de datos LOCAL (proyecto mano-local) y la vuelve a sembrar."
  read -r -p "Escribe 'borrar' para continuar: " ans
  [ "$ans" = "borrar" ] || { echo "Cancelado."; exit 1; }
fi

COMPOSE=(docker compose -f docker-compose.local.yml)
[ -f .env.local ] && COMPOSE+=(--env-file .env.local)
"${COMPOSE[@]}" down -v
exec bash "$ROOT/scripts/local-up.sh"
