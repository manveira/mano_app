# BASELINE_RESULTS.md — Línea base de pruebas de la API (F0.6)

Generado: 2026-11-24 01:07 · Base probada: `http://localhost:8080/api` · Backend: código actual, `MOCK_MODE=true`, BD recién sembrada
Cómo se reproduce: `bash tests/api/run-all.sh` (reinicia la BD local y corre las 12 suites en orden) · `bash tests/api/report.sh` regenera este archivo.

## Resumen

| PASS | FAIL | XFAIL (defecto conocido) | XPASS | SKIP | Total |
|---:|---:|---:|---:|---:|---:|
| 174 | 0 | 1 | 0 | 0 | 175 |

## Por suite

| Suite | PASS | FAIL | XFAIL | Casos |
|---|---:|---:|---:|---:|
| sprint-0-auth | 17 | 0 | 0 | 17 |
| sprint-1a-negocios-productos | 21 | 0 | 0 | 21 |
| sprint-1b-comisionistas | 17 | 0 | 0 | 17 |
| sprint-1c-pagos-escrow | 18 | 0 | 0 | 18 |
| sprint-1d-ordenes-feed-dashboard | 23 | 0 | 1 | 24 |
| sprint-2-registro-negocios | 9 | 0 | 0 | 9 |
| sprint-3-plan-pro | 7 | 0 | 0 | 7 |
| sprint-4-reglas-negocio | 9 | 0 | 0 | 9 |
| sprint-5-disputa | 8 | 0 | 0 | 8 |
| sprint-6-vitrina-comisionista | 9 | 0 | 0 | 9 |
| sprint-tests2 | 22 | 0 | 0 | 22 |
| sprint-7-registro-roles | 14 | 0 | 0 | 14 |

## Casos fallidos o con defecto conocido

| Caso | Estado | Detalle |
|---|---|---|
| FEED-03 | XFAIL | gap: CreateStory no asigna expires_at (queda 0001-01-01), debería ser +24h; además la story creada no aparece en /feed ni /stories :: jq '(.expires_at / sub("\\.[0-9]+";"") / fromdateiso8601) > (now + 23*3600)' = 'false' (esperado 'true') |

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
