# MIGRATION_PLAN.md — De la arquitectura actual a la objetivo

Plan de migración por tareas. Destino: lo descrito en `architecture.html` / `ARCHITECTURE_CURRENT_STATE.md` (clientes web/iOS/Android → API Gateway → backend + BD, con servicios laterales para lo nuevo).

Última actualización: 27 oct 2026 · Versión 0.1 (borrador para pulir contigo)

---

## 0. Reglas del plan

1. **Local primero.** Cada fase termina en un *Gate local*. Hasta que el gate pase en tu máquina, no se toca remoto (Azure, GHCR, DNS, tiendas). La promoción a remoto es la fase F8 y es la última.
2. **Imágenes del diseñador intocables.** Ninguna tarea modifica, mueve ni optimiza imágenes. Las tareas de UI solo programan botones/hotspots sobre ellas. Se verifica con `scripts/verify-design-assets.sh` en cada gate de F0–F3 y F6. (Regla completa: `.kiro/steering/design-assets-immutable.md`.)
3. **Contrato congelado.** El backend no cambia rutas, campos ni formas de respuesta. Las correcciones internas (F4) se validan demostrando que `contract/openapi.yaml` no cambió y que los tests de contrato siguen pasando.
4. **Una tarea = un cambio verificable.** Cada tarea tiene entregable, verificación local con comandos y criterio de aceptación. Si no se puede verificar, no está terminada.
5. **Honestidad de verificación.** El entorno donde trabaja el agente puede no tener Go/Node/Docker. En ese caso el agente escribe el código y los scripts, y **tú corres los comandos de verificación** y me pegas el resultado antes de marcar la tarea como hecha.
6. **Bloqueos por decisión.** Las tareas marcadas 🔒 dependen de una decisión pendiente (D1–D9 en `ARCHITECTURE_CURRENT_STATE.md` sección 8).

Leyenda: ⬜ pendiente · 🟡 en curso · ✅ hecha · 🔒 bloqueada por decisión · 👤 la ejecuta el usuario · 🤖 la ejecuta el agente

---

## 1. Entorno local objetivo

Se levanta con un solo comando y reproduce la arquitectura objetivo sin salir de tu máquina.

| Servicio | Puerto local | Notas |
|---|---|---|
| **gateway** | `http://localhost:8000` (`/v1/*`, alias `/api/*`) | Único punto de entrada para todos los clientes |
| **core** (backend Go) | interno (`8080` solo con perfil `debug`) | No accesible directo desde clientes |
| **postgres** | `5433` | Datos de desarrollo con seed |
| **redis** | `6379` | Usado por `auth-session` (F5) |
| **web (estático)** | `http://localhost:3000` | Archivos estáticos servidos por nginx; en desarrollo también `next dev` |
| **minio** | `9000` / consola `9001` | Sustituto local de Cloudflare R2 (F5.2) |
| **mailpit** | `8025` | Captura de emails SMTP en local |
| **Wompi** | sandbox (`pub_test_…`) o `MOCK_MODE=true` | Nunca claves de producción en local |

Clientes móviles en local: iOS Simulator usa `http://localhost:8000`; Android Emulator usa `http://10.0.2.2:8000`.

---

## 2. Mapa de fases

| Fase | Objetivo | Depende de | Toca backend | Gate |
|---|---|---|---|---|
| **F0** | Fundaciones y guardrails | — | No | G0 |
| **F1** | Contrato OpenAPI congelado + clientes generados | F0 | No | G1 |
| **F2** | Gateway local delante del backend | F1 | No | G2 |
| **F3** | Web aislado: cliente generado, headers, estático, hotspots | F2 | No | G3 |
| **F4** | Correcciones internas del backend (sin cambiar contrato) 🔒D1 | F1 (puede ir en paralelo a F2–F3) | **Sí (interno)** | G4 |
| **F5** | Servicios laterales: auth-session, uploads, push, realtime | F2 | No | G5 |
| **F6** | Apps iOS y Android 🔒D3 | F1, F2, F5 (mínimo F5.1) | No | G6 |
| **F7** | Endurecimiento y observabilidad | F3–F6 | Interno | G7 |
| **F8** | Promoción a remoto (staging → producción) | G0–G7 | — | G8 |

Camino crítico: F0 → F1 → F2 → F3. F4 corre en paralelo desde F1 y **debe estar completa antes de F8**: sin ella los pagos reales no funcionan.

```
F0 ─▶ F1 ─▶ F2 ─▶ F3 ───────────┐
        │     └─▶ F5 ─▶ F6 ─────┤
        └─▶ F4 (paralelo) ──────┼─▶ F7 ─▶ F8
```

---

## F0 — Fundaciones y guardrails

**Objetivo:** poder trabajar seguro y repetible antes de cambiar nada.

### F0.1 — Confirmar el repositorio git real 🟡 👤
- La copia analizada **no tiene `.git`**. Ubicar el repo real (el que está en GitHub) y trabajar ahí.
- Entregable: rama `refactor/multifront` y tag `baseline-pre-refactor` sobre el estado actual.
- Verificación: `git status` limpio · `git tag -l baseline-pre-refactor` · `git branch --show-current`.
- **Hecho (24-nov-2026):** el repo es `github.com/manveira/mano_app`; la carpeta de trabajo no es un repo git, así que se versiona con `scripts/github-sync.sh` (clon en `~/mano-push`) hacia la rama `refactor/multifront` y el PR #1. **Falta:** el tag `baseline-pre-refactor` sobre el `main` anterior (`5ddd98d`) 👤.

### F0.2 — Guardrails de imágenes ✅ 🤖
- Entregado: `.kiro/steering/design-assets-immutable.md`, hook `.kiro/hooks/protect-design-assets.json` + `.kiro/scripts/guard-design-assets.sh`, `mano_app/design-assets/` (README + `MANIFEST.sha256` con las 7 imágenes actuales), `scripts/verify-design-assets.sh` y `scripts/register-design-assets.sh`.
- Verificación: `bash mano_app/scripts/verify-design-assets.sh` → `✅ OK`.

### F0.3 — Neutralizar el deploy automático ✅ 🤖
- Hoy cada push a `main` despliega a Azure (`.github/workflows/deploy.yml`). Cambiar el trigger a `workflow_dispatch` únicamente, hasta F8. **Hecho:** el trigger `push` fue eliminado y se dejó un comentario de advertencia.
- Verificación: el YAML solo tiene `workflow_dispatch`; un push de prueba a una rama no dispara `deploy`.
- Aceptación: imposible desplegar por accidente.

### F0.4 — Entorno local reproducible ✅ 🤖 + 👤
- Entregables: `docker-compose.local.yml` (postgres y core; **Redis y MinIO se añaden en F5, el gateway en F2, el web en F3; Mailpit queda descartado por ahora** porque `pkg/notifications` usa `PlainAuth`, que no funciona con un SMTP sin TLS), `.env.local.example`, `scripts/local-up.sh`, `scripts/local-down.sh`, `scripts/local-reset.sh` (borra volúmenes; pide confirmación).
- Verificación 👤: `bash scripts/local-up.sh && curl -s localhost:8080/api/health` → `{"status":"ok"}`.
- **Evidencia (27 oct 2026, ejecutado por el agente):** `local-up.sh` construyó la imagen del backend y levantó `postgres:15` + `core`; ambos sanos.
- Aceptación: un compañero nuevo levanta todo con 1 comando.

### F0.5 — Smoke test automatizado ✅ 🤖 + 👤
- Entregable: `scripts/smoke.sh` con los 5 casos de `docs/tests/README.md` (health, login, negocios, mock status, flujo completo con 3 splits que suman 120000). Acepta `BASE` como variable para poder apuntarlo luego al gateway.
- Verificación 👤: `BASE=http://localhost:8080/api bash scripts/smoke.sh` → 5/5.
- **Evidencia (27 oct 2026):** 5 OK, 0 fallidos (health, login, 2 negocios, mock activo, flujo completo con 3 splits = 120000).

### F0.6 — Línea base de pruebas ✅ 🤖 + 👤
- Convertir los 128 casos `curl` de `docs/tests/*.md` en scripts ejecutables bajo `tests/api/` (un archivo por sprint).
- Ejecutarlos y registrar en `docs/BASELINE_RESULTS.md` qué pasa y qué falla **hoy** (los que fallen por los hallazgos de la sección 6 quedan etiquetados con su número).
- Aceptación: tenemos la foto "antes" contra la cual probar que no rompemos nada.
- **Hecho (27 oct 2026):** `tests/api/` con `lib.sh`, `run-all.sh`, `report.sh` y 11 suites (161 casos). Resultado sobre BD limpia: **158 PASS · 0 FAIL · 3 XFAIL**. Informe: `docs/BASELINE_RESULTS.md`. Reproducir: `bash tests/api/run-all.sh`.
- **Advertencia:** verde ≠ listo. Los flujos de dinero usan `/mock/*`, que evita el código real de Wompi; los hallazgos #1–#4 se prueban en F4/G4, no aquí.
- Hallazgos nuevos: #18 (registro sin teléfono), #19 (stories sin `expires_at`), #20 (`/map/nearby` sin filtrar aprobados), #21 (`null` en vez de `[]`).

### F0.7 — CI mínimo en PR ✅ 🤖
- Workflow `ci.yml` (en `pull_request`): `go vet ./...`, `go build ./...`, `go test ./...` (cuando existan), `tsc --noEmit`, `scripts/verify-design-assets.sh`, `docker compose config`.
- Verificación: abrir un PR de prueba y ver verde.
- **Hecho:** `.github/workflows/ci.yml` con 5 jobs (backend, web, design-assets, compose, api-tests); YAML validado y `docker compose config` probado en local. **Pendiente 👤:** confirmar que corre en verde en GitHub (requiere el repo real, F0.1). No despliega nada.

### Gate G0 👤
- [x] `verify-design-assets.sh` OK · [x] `local-up.sh` levanta (web + backend + Postgres) · [x] `smoke.sh` 5/5 · [x] `BASELINE_RESULTS.md` existe · [x] `deploy.yml` solo manual · [x] CI verde en GitHub (F0.7: PR #1, 5 trabajos en verde en 2 ejecuciones, 24-nov-2026) · [ ] tag `baseline-pre-refactor` (F0.1, 👤).

---

## F1 — Contrato OpenAPI congelado

**Objetivo:** que el contrato exista por escrito y deje de ser implícito.

### F1.1 — Esqueleto desde el router 🟡 🤖
- `contract/openapi.yaml` con las ~70 rutas de `router.go`, tags por dominio, esquema de seguridad `bearerAuth`, parámetros de ruta/query, respuestas de error `{error: string}`. Excluir `/mock/*` del contrato público (se documenta aparte).
- Verificación: `npx @redocly/cli lint contract/openapi.yaml` sin errores.

### F1.2 — Schemas por dominio 🟡 🤖
Auth · Catálogo · Órdenes · Pagos/Wompi · Comisionistas (`/sell/*`) · Dashboards · Admin · Social (feed/stories/ads) · Delivery. Documentar tal cual las inconsistencias (respuestas envueltas vs. directas, `float64` de montos, etc.).
- Aceptación: cada ruta tiene schema de request y de respuesta(s).

### F1.3 — Ejemplos reales ⬜ 🤖 + 👤
- Capturar respuestas del backend local con el seed y guardarlas como `examples` del contrato.
- Verificación 👤: script `scripts/capture-examples.sh` genera los ejemplos; revisión de diff.

### F1.4 — Tests de contrato ⬜ 🤖 + 👤
- Schemathesis (o Dredd) contra el backend local. Si hay desviaciones, **se corrige el YAML** (el contrato describe la realidad), no el backend.
- Verificación 👤: `bash tests/contract/run.sh` → 0 fallos.

### F1.5 — Cobertura frente al web ⬜ 🤖
- Script que extrae todas las rutas que consume `web/pages/**` y comprueba que existen en el contrato.
- Aceptación: 100 % de lo que usa el web está especificado. (Las rutas sin UI —stories, ads, disputas, Pro, payment-methods— se incluyen según la decisión D7.)

### F1.6 — Congelar v1 ⬜ 🤖 + 👤
- Tag `contract-v1.0.0`, `contract/CHANGELOG.md`, política: solo cambios aditivos; incompatibles → `/v2`. Check en CI que falla si se elimina o cambia un campo existente (`oasdiff breaking`).

### F1.7 — Generación de clientes ⬜ 🤖
- Pipeline `contract/generate.sh` → `contract/clients/typescript` (ya), `swift` y `kotlin` (se compilan en F6).
- Verificación: el cliente TypeScript compila (`tsc --noEmit`).

### Gate G1 👤
- [ ] lint OK · [ ] contract tests 0 fallos · [ ] cobertura web 100 % · [ ] tag `contract-v1.0.0` · [ ] cliente TS compila.

---

## F2 — Gateway local

**Objetivo:** que todo cliente pase por un único punto central. Decisión por defecto: Kong OSS DB-less (**D4**; si eliges Traefik/nginx las tareas son las mismas con otra sintaxis).

### F2.1 — Gateway en compose ⬜ 🤖 + 👤 🔒D4
- Servicio `gateway` en `:8000` con config declarativa en `gateway/`; `core` deja de publicar puertos (solo perfil `debug`).
- Verificación 👤: `curl localhost:8000/v1/health` → 200 · `curl localhost:8080/api/health` → conexión rechazada (sin perfil debug).

### F2.2 — Reescritura `/v1` → `/api` + alias ⬜ 🤖
- `/v1/**` → `core:/api/**`; `/api/**` sigue funcionando (alias temporal para el web actual).
- Verificación: `BASE=http://localhost:8000/v1 bash scripts/smoke.sh` y `BASE=http://localhost:8000/api bash scripts/smoke.sh` → 5/5 en ambos.

### F2.3 — Allow-list y bloqueos ⬜ 🤖
- Solo rutas del contrato. `/v1/mock/*` **no existe** salvo perfil `local-mock`. `/admin/*` solo por host `admin.mano.local` (o header interno en local).
- Verificación: `curl -i localhost:8000/v1/mock/status` → 404 · ruta desconocida → 404 · admin desde host público → 403/404.

### F2.4 — CORS ⬜ 🤖
- Orígenes permitidos: `http://localhost:3000` (y los que se definan). Las apps nativas no usan CORS.
- Verificación: preflight `OPTIONS` con `Origin: http://localhost:3000` → headers `Access-Control-*`; con `Origin: http://evil.test` → sin ellos.

### F2.5 — Rate limiting ⬜ 🤖
- Estricto en `/auth/*`, `/orders/guest`, `/payments/wompi/guest`, `/r/:slug`; moderado en el resto; clave por IP + `X-Mano-Device-Id`.
- Verificación: 20 `POST /v1/auth/signin` seguidos → aparece `429`.

### F2.6 — Headers de cliente, versión mínima y request-id ⬜ 🤖
- Lee `X-Mano-Client` (`web|ios|android`), `X-Mano-Client-Version`, `X-Mano-Device-Id`; genera `X-Request-Id` si falta y lo propaga; versión mínima configurable por plataforma → `426 Upgrade Required`.
- Fase inicial *permisiva* (warn si falta el header) y luego *estricta* (F3.5).
- Verificación: `X-Mano-Client-Version: 0.0.1` con mínimo `1.0.0` → 426 · sin header → pasa con warning en logs · el log JSON contiene client/version/request-id.

### F2.7 — Webhooks ⬜ 🤖
- `/v1/webhooks/*`: solo POST, body ≤ 64 KB, sin CORS, sin rate limit por usuario (límite por IP).
- Verificación: POST de 1 MB → `413` · GET → `405/404`.

### F2.8 — Logs y métricas ⬜ 🤖
- Access log JSON y métricas Prometheus del gateway.
- Verificación: `curl localhost:8001/metrics` (puerto admin interno) muestra latencia por ruta.

### F2.9 — Suite de gateway + regresión ⬜ 🤖 + 👤
- `tests/gateway/*.sh` con todas las verificaciones anteriores. Re-ejecutar la línea base F0.6 **a través del gateway**: debe dar los mismos resultados que directo.

### Gate G2 👤
- [ ] smoke 5/5 por `/v1` y `/api` · [ ] `tests/gateway` verde · [ ] baseline vía gateway == baseline directo · [ ] core no accesible directo · [ ] `verify-design-assets.sh` OK.

---

## Estado de las pantallas del diseñador (24-nov-2026)

Las 9 imágenes definitivas (`Mano_images/` → `web/public/branding/`) reemplazaron a las 7 anteriores. Ya hay flujo funcional de entrada (splash → rol → registro → sesión) y las pantallas del comisionista con su lógica real; detalle botón por botón y pendientes en **`docs/SCREENS.md`**. Cambios de backend hechos para soportarlo (todos aditivos o internos, contrato regenerado): índice parcial de teléfono (#18), validación y unicidad de `username`, roles `courier` y `service_provider`, `PATCH /me`, `GET /me` con datos propios, `GET /sell/movements`, `business_id` en la vitrina, y permisos del domiciliario para tomar y actualizar entregas. Pruebas: API 174 PASS / 0 FAIL / 1 XFAIL (suite nueva `sprint-7-registro-roles`) y UI 31/31 (`tests/e2e/ui-smoke.js`). Esto adelanta partes de F3.3 (hotspots tipados con modo `?debugHotspots=1`, hecho) y F3.1 (cliente con headers `X-Mano-*`, hecho para las páginas nuevas; las páginas legacy siguen con `fetch` directo).

---

## F3 — Web aislado

**Objetivo:** el web es un cliente más: habla solo con el gateway, se publica como archivos estáticos, y sus imágenes siguen intactas.

### F3.1 — Capa de cliente API 🟡 🤖
- `web/lib/api/`: cliente generado + `AuthStore` (interfaz; implementación `localStorage` para web) + inyección de headers `X-Mano-*` + manejo uniforme de errores y 401/426.
- Verificación: tests unitarios (Vitest) de headers, 401 → logout, 426 → pantalla de actualización.

### F3.2 — Ubicación central de imágenes 👤
- **Decisión tuya**: mantener las imágenes en `web/public/branding/` o centralizarlas en `design-assets/web/`. Si centralizas, **tú** copias los archivos (no se mueven con herramientas del agente) y corres `register-design-assets.sh` + `verify-design-assets.sh`. Solo después el agente cambia las referencias en el código.
- Aceptación: hashes idénticos antes/después.

### F3.3 — Hotspots tipados 🟡 🤖
- Extraer los porcentajes inline de `index.tsx`, `signup.tsx` y `profile.tsx` a `web/lib/hotspots/*.ts` (un archivo por pantalla). Añadir modo de depuración `?debugHotspots=1` que dibuja los rectángulos sobre la imagen.
- Verificación: captura de pantalla Playwright en 390×844 antes y después → **diferencia de píxeles 0** en modo normal; `verify-design-assets.sh` OK.
- Aceptación: cada área táctil tiene `aria-label`.

### F3.4 — Migrar páginas al cliente generado ⬜ 🤖 (por lotes)
| Lote | Páginas | Verificación manual local |
|---|---|---|
| A | `signin`, `signup`, `profile` | registro → login → perfil → logout |
| B | `businesses/*`, `negocio/[slug]`, `feed`, `map` | listados, filtros, mapa con geolocalización |
| C | `cart`, `checkout`, `orders`, `r/[slug]` | compra guest por link con MOCK y compra con usuario |
| D | `sell` | afiliar, copiar link, retiro |
| E | `dashboard`, `create-business`, `create-product`, `advertise`, `apply` | alta de negocio y producto |
| F | `admin`, `courier`, `delivery/[id]` | aprobaciones, disputas, tracking |
- Por lote: build sin errores + prueba manual + `verify-design-assets.sh`.

### F3.5 — Sin mismo origen ⬜ 🤖
- Quitar `rewrites` de `next.config.js`; `NEXT_PUBLIC_API_URL=http://localhost:8000/v1`; en el gateway pasar a modo estricto para `X-Mano-Client`.
- Verificación: el web en `:3000` funciona contra `:8000` con CORS, sin proxy de Next.

### F3.6 — Limpieza de dependencias ⬜ 🤖
- Quitar `axios` y `@stripe/*` (no se usan), revisar `strict` de TypeScript por etapas.
- Verificación: `npm ci && npx tsc --noEmit && npm run build`.

### F3.7 — Export estático ⬜ 🤖 + 👤 (decisión D8)
- Ajustar las 4 rutas dinámicas (`businesses/[id]`, `negocio/[slug]`, `r/[slug]`, `delivery/[id]`) para funcionar como archivos estáticos con fallback; servir con nginx en el servicio `web` del compose local.
- Verificación 👤: abrir **directamente** (F5/recarga) `http://localhost:3000/r/hamaca-casa-narino-maria-x7k2`, `/negocio/cafe-la-esquina`, `/businesses/1`, `/delivery/1` → cargan.

### F3.8 — Dominio del carrito ⬜ 🤖
- Mover reglas del carrito (un solo negocio, totales) a `web/lib/domain/cart.ts` con tests, para replicarlas igual en móvil.

### F3.9 — E2E web ⬜ 🤖 + 👤
- Playwright: signup → signin; compra guest por `/r/:slug` con `MOCK_MODE`; confirmar recepción; ver splits.
- Verificación 👤: `npm run test:e2e` verde contra el compose local.

### F3.10 — Archivos de deep links ⬜ 🤖
- `web/public/.well-known/apple-app-site-association` y `assetlinks.json` con marcadores de posición (se completan en F6/F8 con los identificadores reales).

### F3.11 — Pipeline de build estático ⬜ 🤖
- Script/CI que genera el artefacto estático (sin imagen Docker del frontend). La publicación real queda para F8.

### Gate G3 👤
- [ ] `grep -r "NEXT_PUBLIC_API_URL" web/pages` sin `fetch` directo (todo por el cliente) · [ ] E2E verde · [ ] rutas dinámicas con recarga OK · [ ] pixel-diff 0 · [ ] `verify-design-assets.sh` OK · [ ] gateway en modo estricto.

---

## F4 — Correcciones internas del backend (sin cambiar el contrato) 🔒D1

**Objetivo:** que el dinero funcione de verdad. Cada tarea trae test unitario y **no puede modificar `contract/openapi.yaml`**.
Requisito previo: tu confirmación de D1 (contrato congelado, código corregible).

| ID | Hallazgo (sección 6) | Cambio interno | Prueba |
|---|---|---|---|
| F4.1 ✅ | #1 Firma de integridad | SHA256 simple de `ref+monto+COP+secreto` | Vector oficial de Wompi: `sk8-438k4-xmxm392-sn2m` + `2490000` + `COP` + `prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6` ⇒ `37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5` |
| F4.2 ✅ | #2 Checksum del webhook | Incluir `timestamp` entre propiedades y secreto (orden: propiedades → timestamp → secreto) | Test con evento firmado por el propio test siguiendo el algoritmo de la doc de Wompi. **Ojo:** el hash de ejemplo de la doc (`3476DDA5…`) no se reproduce al calcularlo (la cadena de la doc da `5a18ec5e…`), así que no sirve como vector; validar además contra un evento real del sandbox (G4) |
| F4.3 ✅ | #3 y #11 Secretos | **Parcial (24-nov-2026):** fuera de `MOCK_MODE`, el webhook responde 503 sin `WOMPI_EVENTS_SECRET` y `initiate` responde 503 sin `WOMPI_PUBLIC_KEY`/`WOMPI_INTEGRITY_SECRET`. Falta el fallo al arrancar y `JWT_SECRET`. Plan original: arranque falla si faltan `WOMPI_EVENTS_SECRET` o `JWT_SECRET` (salvo `MOCK_MODE=true`) | Test de arranque: sin secreto → el proceso sale con error |
| F4.4 | #4 Auto-confirm | Worker interno (ticker) que libera órdenes `held` vencidas usando `AUTO_CONFIRM_HOURS` | Orden con `auto_confirm_at` pasado → `released` sin llamar al mock; las `disputed` no se tocan |
| F4.5 | #8 Atribución guest | Aceptar `referral_link_id` (campo **aditivo**) en `/orders/guest`, resolver comisionista y comisión | Compra por `/r/slug` → orden con `freelancer_id` y `freelancer_commission` correctos |
| F4.6 | #7 Anti-fraude | Aplicar la regla de misma cédula en el flujo real | Comprador = comisionista → comisión 0 |
| F4.7 🟡 | #9 Atomicidad | Transacciones DB en retiro, creación de orden + stock, `handleWompiApproved`, `releaseEscrow`; webhook idempotente | Test de concurrencia: dos retiros simultáneos → solo uno pasa; webhook repetido no duplica splits |
| F4.8 | #5 Cobros de ads/Pro | Activar solo tras pago aprobado; expiración con `ExpiresAt` 🔒 decisión de producto | Compra sin pago → anuncio inactivo |
| F4.9 ✅ | #6 Seed en producción | `SEED_DEMO_DATA` (true en local, false por defecto en prod) | Con `false` no se crean usuarios de prueba |
| F4.10 | #10 Ruta Stripe | Deshabilitar o alinear al escrow 🔒 decisión | Documentar resultado |
| F4.14 | #19 Stories sin expiración | Asignar `expires_at = now + 24h` en `CreateStory` | FEED-03 pasa a PASS y la story creada aparece en `/feed` |
| F4.15 | #20 `/map/nearby` | Filtrar por `is_approved = true` | Un negocio no aprobado no aparece en `/map/nearby` |
| F4.13 ✅ | #18 Registro sin teléfono | Índice único parcial `WHERE phone <> ''` (BD nuevas por etiqueta GORM; BD existentes por `ensurePartialPhoneIndex` al arrancar) | **Hecho 24-nov-2026.** REG-01, AUTH-02 y AUTH-16 pasan; teléfono duplicado real sigue dando 400 |
| F4.11 | — | Suite `go test ./...` con Postgres de prueba; añadirla a CI | CI verde |
| F4.12 | — | Re-ejecutar F1.4 (contrato) y F0.6 (baseline) | Contrato sin cambios; los casos antes fallidos por estos hallazgos ahora pasan |
| F4.16 ✅ | (nuevo 24-nov) Historial de pagos y conciliación | `GET /payments`, `GET /payments/{ref}`, `POST /payments/wompi/sync` (aditivos); conciliador; bitácora `wompi_events`; confirmación de APPROVED contra la API de Wompi | `tests/api/sprint-8-pagos-wompi.sh` (8 casos), `go test ./internal/handlers`, pago real en sandbox (orden 49) conciliado |
| F4.17 ✅ | (nuevo 24-nov) Administrador inicial en producción | `ADMIN_EMAIL`/`ADMIN_PASSWORD` crean el primer admin solo si no existe ninguno (≥ 12 caracteres) | Probado en un entorno desechable con `MOCK_MODE=false`: sin cuentas demo, admin entra, `/mock` 403 |

### Gate G4 👤
- [ ] vector de firma de integridad de Wompi pasa (F4.1) y el webhook valida con un evento real del sandbox · [ ] `oasdiff` sin cambios incompatibles · [ ] baseline mejorada sin regresiones · [ ] E2E de pago con **sandbox de Wompi** (webhook real firmado) en local con túnel temporal 👤 · [ ] `go test ./...` verde.

---

## F5 — Servicios laterales (edge services)

| ID | Servicio | Entregable | Verificación local |
|---|---|---|---|
| F5.1 | `auth-session` | Login que entrega JWT corto + refresh rotativo en Redis; logout y revocación | Refresh funciona tras expirar el JWT; el refresh usado no se reutiliza |
| F5.2 | `uploads` | URL prefirmada contra MinIO local (R2 en remoto) | Subir una foto de producto con la URL y verla en `image_url` |
| F5.3 | `push` | Registro de device token + envío (stub local; FCM/APNs reales en F8) | Endpoint `/v1/devices` guarda token; evento de orden genera notificación en el stub |
| F5.4 | `realtime` | SSE `/v1/deliveries/:id/stream` | Cambiar estado de delivery → el stream emite en < 2 s |
| F5.5 | Integración | Rutas en gateway, compose, contrato **aditivo** (`/v1/uploads`, `/v1/devices`, `/v1/auth/refresh`) → `contract-v1.1.0` | Tests de contrato + `tests/gateway` verdes |

### Gate G5 👤
- [ ] los 4 servicios arriba en compose · [ ] contrato v1.1.0 solo aditivo · [ ] pruebas de cada servicio verdes.

---

## F6 — Apps iOS y Android 🔒D3

Las apps **no son contenedores**: se compilan y se prueban en simulador/emulador contra el gateway local.

| ID | Tarea | Verificación local |
|---|---|---|
| F6.1 | Decidir stack (D3) y crear `apps/ios` y `apps/android` con cliente generado compilando | La app abre y llama `GET /v1/health` |
| F6.2 | `AuthStore` seguro (Keychain / Keystore), headers `X-Mano-*` (`ios`/`android`, versión, build, device-id), manejo de 401 y 426 | Test unitario; cambiar la versión mínima en el gateway muestra la pantalla de actualización |
| F6.3 | **Pantallas desde las imágenes mobile del diseñador**: la imagen se muestra tal cual; los botones son áreas táctiles nativas con etiquetas de accesibilidad. Hotspots en archivos de configuración, igual que en web | Pixel-diff 0 de la imagen; `verify-design-assets.sh` OK; VoiceOver/TalkBack leen los botones |
| F6.4 | Flujos MVP: signup/login, catálogo, compra guest por link, pago Wompi en navegador in-app, retorno por Universal/App Link, órdenes | Compra completa contra gateway local en simulador y emulador |
| F6.5 | Flujos comisionista y negocio | Afiliarse, compartir link nativo, dashboard |
| F6.6 | Push (token), subida de fotos, tracking en vivo | Con los servicios de F5 locales |
| F6.7 | Pruebas: unitarias + UI (XCUITest / Espresso) en CI local | Suites verdes |

### Gate G6 👤
- [ ] flujo de compra completo en ambos SO contra el gateway local · [ ] cuentas de prueba funcionando · [ ] imágenes intactas · [ ] no se usó ningún secreto dentro de la app.

---

## F7 — Endurecimiento

| ID | Tarea | Verificación |
|---|---|---|
| F7.1 | Migraciones versionadas (golang-migrate) en lugar de solo `AutoMigrate` | Migrar desde cero y desde la línea base sin pérdida |
| F7.2 | App Attest / Play Integrity para proteger endpoints guest (opcional) | Petición sin atestación → rechazada en el gateway |
| F7.3 | Pruebas de carga (k6) sobre crear orden y pagar | p99 < 500 ms en local con carga definida |
| F7.4 | Backup y restauración de Postgres probados | Restaurar en un compose limpio y pasar smoke |
| F7.5 | Revisión de seguridad (cabeceras, límites, logs sin datos sensibles) | Checklist firmado |
| F7.6 | Observabilidad: dashboards de latencia/errores por plataforma y versión | Panel local con datos de las suites |

### Gate G7 👤 — todos los puntos anteriores + `go test`, E2E web, suites móviles y contrato verdes.

---

## F8 — Promoción a remoto (solo tras G0–G7)

> **Estado 24-nov-2026:** el usuario pidió empezar a desplegar con MCP de GitHub y luego Azure. MCP de GitHub preparado: token validado (usuario `manveira`, admin sobre `manveira/mano_app`), servidor oficial probado (47 herramientas) y configuración en `Repos/.kiro/settings/mcp.json` (excluida de git por `Repos/.kiro/.gitignore`; alternativa a nivel de usuario: `scripts/setup-github-mcp.sh`). Nada se ha subido ni desplegado. Antes de producción deben cerrarse al menos los hallazgos críticos F4.1 a F4.4, F4.3 y F4.9 (firma Wompi, checksum del webhook, secretos obligatorios, auto-confirm, seed sin `password123`); se recomienda pasar primero por **staging**. Todo push, merge, ejecución de workflow o cambio en Azure requiere confirmación explícita del usuario por acción.
>
> **Revisión del remoto (solo lectura, 24-nov-2026):** `github.com/manveira/mano_app` es público, tiene solo la rama `main` (7 commits, último `5ddd98d` del 7-ago-2026) y su `deploy.yml` sigue con `push` a `main`: **un push a `main` despliega a Azure**. Plan seguro: (1) F0.1: clonar el repo y llevar nuestra copia a una rama `refactor/multifront` (no a `main`); (2) abrir un PR para que corra `ci.yml` y se revise el diff completo; (3) antes de fusionar a `main`, mover `AZURE_VM_PASSWORD` de *variable* a *secret* (o usar llave SSH), cerrar F4 críticos y confirmar el servidor Azure de destino; (4) recién entonces, deploy manual (`workflow_dispatch`) a staging.

| ID | Tarea | Notas |
|---|---|---|
| F8.1 | **Staging** en Azure con la misma composición que local (gateway, core, edge, Postgres, Redis) | Credenciales de **sandbox** de Wompi |
| F8.2 | DNS y TLS: `api.`, `admin.`, `mano.app`; certificados | Mantener alias `/api` hasta retirar el web antiguo |
| F8.3 | Hosting del web (archivos estáticos) y archivos de deep links con identificadores reales | Decisión D8 |
| F8.4 🟡 | Pipeline de despliegue con aprobación manual y rollback | Corrige la inconsistencia `vars.AZURE_VM_PASSWORD` → secretos/llave SSH |
| F8.5 | E2E en staging (web + móviles con builds internas: TestFlight / Play interno) | Sandbox de Wompi, webhooks reales |
| F8.6 | Corte a producción con ventana, copia de seguridad previa y plan de reversión | `SEED_DEMO_DATA=false`, `MOCK_MODE=false` |
| F8.7 | Publicación en App Store y Google Play | Tiempos de revisión; versión mínima configurada en el gateway |

### Gate G8 👤 — staging estable una semana · backups verificados · reversión probada.

---

## 3. Seguimiento

Marca el estado de cada tarea en este archivo (⬜ → 🟡 → ✅). Al cerrar una fase, guarda la salida de los comandos del gate en `docs/gates/G<n>.md` como evidencia.

## 4. Próximos pasos inmediatos

1. 👤 F0.1: ubicar el repo git real y crear la rama/tag.
2. 🤖 F0.3 → F0.7: neutralizar deploy, entorno local, smoke, línea base, CI.
3. 👤 Responder D1, D3, D4 y D8 (las demás pueden esperar).


> **Estado 24-nov-2026 (Wompi sandbox):** corregidos F4.1 (firma de integridad = SHA256 simple, ya no HMAC), F4.2 (checksum del webhook con `timestamp`, propiedades leídas de `signature.properties`, acepta el header `X-Event-Checksum`), idempotencia del webhook (transacción + bloqueo de fila; un evento repetido no duplica splits), validación de monto y moneda contra lo registrado, y un rechazo tardío ya no deshace un pago aprobado. Pruebas: `go test ./internal/handlers -run Wompi` con vectores (integridad: oficial de la doc; evento: calculado con `sha256sum`), `scripts/wompi-webhook-sim.sh` (12 verificaciones contra el backend real con secretos de prueba), `tests/api` 174/0/1 y `smoke` 5/5. **Pendiente:** E2E con el sandbox real de Wompi (llaves del usuario + túnel temporal) 👤, F4.3 completo, F4.4 (auto-confirm), F4.9 (seed). Contrato sin cambios.

> **Estado 24-nov-2026 (sandbox real de Wompi):** con las llaves de pruebas del usuario el flujo llegó hasta la pantalla de pago de Wompi (firma, llave pública y URL aceptadas). Dos intentos terminaron en `ERROR` por usar datos que no son de prueba (tarjeta y Nequi `…4517`). Hallazgo: `checkout.wompi.co` da 403 (CloudFront) con `redirect-url` a `localhost`; se necesita túnel https. Herramienta nueva: `scripts/wompi-sandbox.sh` (`up` / `status` / `down`). Procedimiento repetible: `docs/WOMPI_SANDBOX.md` y skill §14. **Pendiente del gate F4:** ver un `APPROVED` con webhook real firmado (el usuario debe guardar la URL de eventos en Wompi y pagar con `4242 4242 4242 4242` o Nequi `3991111111`), luego DECLINED, ERROR y evento repetido; F4.3 completo, F4.4, F4.9.


---

## Avance real (corte 24-nov-2026)

**Resumen honesto:** de las 9 fases del refactor de `docs/architecture.html` (§9), **ninguna ha pasado su gate formal todavía**. Se avanzó mucho en F0 y en F4 (pagos), algo en F1 y F3, y **no se ha empezado** F2 (gateway), F5 (servicios laterales), F6 (apps iOS/Android) ni F7. De las 76 tareas del plan, 13 están hechas (✅) y 7 en curso (🟡): ≈ 17 % hechas, ≈ 26 % contando las parciales (cuenta del 24-nov-2026, F4 incluye las 2 tareas nuevas F4.16 y F4.17). La arquitectura objetivo (gateway + edge services + web estático + apps nativas) **no existe aún**: hoy sigue siendo el monolito Go detrás de nginx con el web de Next.js.

| Fase | Qué es | Hecho | Pendiente | Estado |
|---|---|---|---|---|
| F0 Fundaciones | Guardrails, entorno local, smoke, línea base, CI | 6 de 7 ✅ (CI verde en GitHub, PR #1) | F0.1: falta el tag `baseline-pre-refactor` 👤 | 🟡 casi cerrada |
| F1 Contrato OpenAPI | Contrato escrito y congelado + clientes | Borrador: 27 rutas, 31 operaciones, 86 schemas (hay 72 registros en el router, 8 son `/mock`) | Cubrir todas las rutas, ejemplos reales, tests de contrato, congelar v1, generar clientes | 🟡 borrador |
| F2 Gateway | Kong/Traefik delante del core (CORS, límites, `/v1`) | Nada (el nginx de producción sumó límite de intentos en `/api/auth/` y cabeceras) | Todo; depende de decidir D4 | ⬜ |
| F3 Web aislado | Cliente generado, headers, estático | Hotspots tipados (9 pantallas), `lib/api.ts` con headers `X-Mano-*`, sesión, `useAuthGuard`; pantalla `/pagos` | Cliente generado, migrar páginas legacy, export estático, E2E en CI | 🟡 parcial |
| F4 Correcciones del backend | Que el dinero funcione sin cambiar el contrato | F4.1, F4.2, F4.3, F4.9, F4.13, F4.16, F4.17 ✅; F4.7 🟡 (webhook atómico e idempotente) | **F4.4 auto-confirm 24 h**, F4.5 atribución guest, F4.6 anti-fraude real, F4.7 (retiros y liberación), F4.8 ads/Pro, F4.10, F4.11, F4.12, F4.14, F4.15 | 🟡 ≈ 45 % |
| F5 Servicios laterales | auth-session, uploads, push, realtime | Nada | Todo | ⬜ |
| F6 Apps iOS/Android | Apps nativas sobre el contrato | Nada (espera imágenes mobile y decidir D3) | Todo | ⬜ |
| F7 Endurecimiento | Migraciones versionadas, carga, backups, observabilidad | Respaldo de BD antes de cada despliegue; cabeceras y límite en nginx | Migraciones (`golang-migrate`), k6, restauración probada, métricas | ⬜ |
| F8 Promoción a remoto | Staging → producción | F8.4 casi: workflow manual con confirmación, SHA, respaldo, salud y reversión | Staging real, DNS/TLS, secretos en GitHub, E2E con Wompi real | 🟡 adelantada |

**Desviación consciente (decisión del usuario, 24-nov-2026):** subir el código a GitHub y dejar listo el despliegue en Azure **antes** de los gates G0–G7. Se acepta como un *despliegue de la arquitectura actual en modo staging*, con llaves de **sandbox** de Wompi, `MOCK_MODE=false`, `SEED_DEMO_DATA=false`. **No** es la promoción F8 completa: no se debe cobrar dinero real hasta cerrar al menos F4.4–F4.7.

**Ruta recomendada desde aquí:** (1) PR #1 con CI verde ✅ (falta fusionarlo y poner el tag) → G0; (2) cerrar F4 (F4.4 primero) con el sandbox de Wompi; (3) decidir D4 y levantar el gateway (F2) para tener el contrato en `/v1`; (4) F1 completo + clientes generados y F3 restante; (5) F5 (auth-session primero) y F6 cuando haya imágenes mobile; (6) F7 y F8.

> **Costos (24-nov-2026):** cada fase tiene su costo de infraestructura en `docs/COSTS.md` §6 (hoy ≈ $39/mes; refactor económico $76–90; administrado ligero $82–150; con SLA/HA ≈ $580). Hallazgo para F4/F8: la tarifa de Wompi (2,65 % + $700 + IVA) supera la comisión del 4 % en pedidos menores de ≈ $98.400 COP; decidir quién la paga **antes** de cobrar dinero real.
