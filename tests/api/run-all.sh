#!/usr/bin/env bash
# tests/api/run-all.sh — Ejecuta todas las suites de la API EN ORDEN sobre una BD recién sembrada
# y genera el reporte tests/api/results/latest.tsv (+ resumen en consola).
#
# Uso:
#   bash tests/api/run-all.sh                 # reinicia la BD local (con confirmación automática) y corre todo
#   bash tests/api/run-all.sh --no-reset      # corre sobre el estado actual (los resultados pueden variar)
#   BASE=http://localhost:8000/v1 bash tests/api/run-all.sh --no-reset   # vía gateway (F2+)
#   bash tests/api/run-all.sh sprint-0 sprint-1a   # solo algunas suites (prefijo del nombre)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
export BASE="${BASE:-http://localhost:8080/api}"
export RESULTS="$HERE/results/latest.tsv"

RESET=1; ONLY=()
for a in "$@"; do case "$a" in --no-reset) RESET=0;; *) ONLY+=("$a");; esac; done

if [ "$RESET" -eq 1 ]; then
  echo "▶ Reiniciando la BD local (volumen mano-local) ..."
  bash "$ROOT/scripts/local-reset.sh" --yes >/dev/null 2>&1 || { echo "❌ No se pudo reiniciar el entorno local"; exit 2; }
fi
curl -fsS -m 5 "$BASE/health" >/dev/null || { echo "❌ La API no responde en $BASE/health"; exit 2; }

mkdir -p "$HERE/results"; : > "$RESULTS"
ORDER=(sprint-0-auth sprint-1a-negocios-productos sprint-1b-comisionistas sprint-1c-pagos-escrow
       sprint-1d-ordenes-feed-dashboard sprint-2-registro-negocios sprint-3-plan-pro sprint-4-reglas-negocio
       sprint-5-disputa sprint-6-vitrina-comisionista sprint-tests2 sprint-7-registro-roles sprint-8-pagos-wompi)

rc=0
for s in "${ORDER[@]}"; do
  if [ ${#ONLY[@]} -gt 0 ]; then
    match=0; for o in "${ONLY[@]}"; do [[ "$s" == "$o"* ]] && match=1; done; [ $match -eq 1 ] || continue
  fi
  f="$HERE/$s.sh"
  if [ ! -f "$f" ]; then echo "⏭  $s (aún no automatizada)"; continue; fi
  SUITE="$s" bash "$f" || rc=1
  echo
done

echo "════════ RESUMEN ════════"
awk -F'\t' '{c[$3]++} END{printf "✅ PASS %d   ❌ FAIL %d   🟡 XFAIL %d   🟢 XPASS %d   ⏭ SKIP %d   (total %d)\n", c["PASS"],c["FAIL"],c["XFAIL"],c["XPASS"],c["SKIP"],NR}' "$RESULTS"
echo "Detalle: $RESULTS"
exit $rc
