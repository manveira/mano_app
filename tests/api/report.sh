#!/usr/bin/env bash
# tests/api/report.sh — Convierte tests/api/results/latest.tsv en un informe markdown.
# Uso:  bash tests/api/report.sh [salida.md]      (default: docs/BASELINE_RESULTS.md)
# El bloque de "Interpretación" y "Hallazgos" es texto fijo curado a mano (editar aquí).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TSV="$HERE/results/latest.tsv"
OUT="${1:-$ROOT/docs/BASELINE_RESULTS.md}"
[ -s "$TSV" ] || { echo "No hay resultados en $TSV (corre tests/api/run-all.sh)"; exit 1; }

total=$(wc -l < "$TSV")
cnt(){ awk -F'\t' -v s="$1" '$3==s{n++} END{print n+0}' "$TSV"; }
{
cat <<EOF
# BASELINE_RESULTS.md — Línea base de pruebas de la API (F0.6)

Generado: $(date '+%Y-%m-%d %H:%M') · Base probada: \`${BASE:-http://localhost:8080/api}\` · Backend: código actual, \`MOCK_MODE=true\`, BD recién sembrada
Cómo se reproduce: \`bash tests/api/run-all.sh\` (reinicia la BD local y corre las 12 suites en orden) · \`bash tests/api/report.sh\` regenera este archivo.

## Resumen

| PASS | FAIL | XFAIL (defecto conocido) | XPASS | SKIP | Total |
|---:|---:|---:|---:|---:|---:|
| $(cnt PASS) | $(cnt FAIL) | $(cnt XFAIL) | $(cnt XPASS) | $(cnt SKIP) | $total |

## Por suite

| Suite | PASS | FAIL | XFAIL | Casos |
|---|---:|---:|---:|---:|
EOF
awk -F'\t' '{t[$1]++; c[$1","$3]++; if(!($1 in o)){o[$1]=++n; names[n]=$1}} END{for(i=1;i<=n;i++){s=names[i]; printf "| %s | %d | %d | %d | %d |\n", s, c[s",PASS"], c[s",FAIL"], c[s",XFAIL"], t[s]}}' "$TSV"

echo
echo "## Casos fallidos o con defecto conocido"
echo
echo "| Caso | Estado | Detalle |"
echo "|---|---|---|"
awk -F'\t' '$3!="PASS"{d=$5; gsub(/\|/,"/",d); printf "| %s | %s | %s |\n", $2, $3, substr(d,1,260)}' "$TSV"

cat <<'EOF'

## Cómo interpretar esta línea base (importante)

1. **Verde NO significa "listo para producción".** Casi todos los flujos de dinero se prueban con `/mock/*` (`MOCK_MODE=true`), que *evita* el código real de Wompi. Por eso los defectos críticos #1–#4 (firma de integridad, checksum del webhook sin `timestamp`, webhook sin firma, auto-confirm inexistente fuera de mock) **no aparecen como fallos aquí**: se verifican en F4 con vectores de firma y con el sandbox de Wompi (gate G4).
2. **Lo que sí garantiza:** el comportamiento observable actual del API (rutas, códigos, formas de respuesta, reglas de negocio con mock). Es la red de seguridad para el refactor: cualquier cambio posterior (gateway, correcciones internas) debe reproducir estos mismos resultados.
3. **Documentación desactualizada:** los `docs/tests/*.md` describen un seed y precios que ya no existen (Pizzería Napoli, USD, ids fijos). Los scripts de `tests/api/` se adaptaron al seed real y comparan por deltas; cada diferencia queda como `note` dentro del caso.
4. **Repetibilidad:** las suites se diseñaron para correr en orden sobre una BD recién sembrada (`run-all.sh` la reinicia). Sin reinicio, algunas suites pueden variar por el estado acumulado (stock, saldos).
5. **Efectos sobre el estado:** cada corrida consume stock (p. ej. la Hamaca) y crea negocios/productos/usuarios de prueba con sufijo único.

## Hallazgos nuevos surgidos al automatizar (se suman a `ARCHITECTURE_CURRENT_STATE.md` sección 6)

| # | Hallazgo | Evidencia | Tratamiento |
|---|---|---|---|
| 18 | ~~Solo un usuario podía registrarse sin teléfono~~ **RESUELTO el 24-nov-2026** (índice único parcial `WHERE phone <> ''`) | AUTH-02, AUTH-16, REG-01 (PASS) | F4.13 ✅ |
| 19 | `POST /stories` no asigna `expires_at` (queda `0001-01-01`): las stories creadas por la API **nunca aparecen** en `/feed` ni `/stories`; solo se ve la story del seed, y esa desaparece a las 24 h | FEED-03 (XFAIL) | F4.14 |
| 20 | `GET /map/nearby` no filtra por `is_approved`: expone negocios no aprobados (el listado `/businesses` sí filtra) | GEO-01 (nota) | F4.15 |
| 21 | Listas vacías llegan como `null` en vez de `[]` (p. ej. `/map/nearby` → `"businesses": null`) | GEO-02 (nota) | Contrato: declarar arreglos como *nullable* en `openapi.yaml` (F1.2); los clientes Swift/Kotlin deben tolerarlo |
EOF
} > "$OUT"
echo "✅ Informe escrito en $OUT"
