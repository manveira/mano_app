#!/usr/bin/env bash
# local-up.sh — Levanta el entorno LOCAL (docker-compose.local.yml) y espera a que esté sano.
# Uso:  bash scripts/local-up.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v docker >/dev/null || { echo "❌ docker no está instalado/en el PATH"; exit 1; }
docker info >/dev/null 2>&1 || { echo "❌ No hay acceso al demonio de Docker (¿grant-docker-access.sh / grupo docker?)"; exit 1; }

COMPOSE=(docker compose -f docker-compose.local.yml)
[ -f .env.local ] && COMPOSE+=(--env-file .env.local)

echo "▶ Construyendo y levantando (la primera vez tarda por la descarga de módulos Go) ..."
# La red de WSL a veces falla al resolver DNS dentro del build: reintentamos.
for i in 1 2 3; do
  if "${COMPOSE[@]}" up -d --build; then break; fi
  [ "$i" -eq 3 ] && { echo "❌ Falló el arranque tras 3 intentos"; "${COMPOSE[@]}" logs --tail=40; exit 1; }
  echo "↻ reintento $i ..."; sleep 5
done

PORT="${LOCAL_CORE_PORT:-8080}"
echo "▶ Esperando a que el backend responda en http://localhost:$PORT/api/health ..."
for i in $(seq 1 60); do
  if curl -fsS -m 3 "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    echo "✅ Backend OK"
    WP="${LOCAL_WEB_PORT:-3000}"
    echo "▶ Esperando al web en http://localhost:$WP ..."
    for j in $(seq 1 60); do curl -fsS -m 3 "http://localhost:$WP/" >/dev/null 2>&1 && { echo "✅ Web OK"; break; }; sleep 2; done
    "${COMPOSE[@]}" ps
    cat <<EOF

URLs locales:
  WEB (navega aquí):                 http://localhost:${LOCAL_WEB_PORT:-3000}
  API vía proxy (mismo origen):      http://localhost:${LOCAL_WEB_PORT:-3000}/api
  API directa (temporal hasta F2):   http://localhost:$PORT/api
  Postgres:                          localhost:${LOCAL_POSTGRES_PORT:-5433}  (user/pass/mano por defecto)
Siguiente:  bash scripts/smoke.sh
EOF
    exit 0
  fi
  sleep 2
done
echo "❌ El backend no respondió en 2 minutos. Últimos logs:"; "${COMPOSE[@]}" logs --tail=60 core; exit 1
