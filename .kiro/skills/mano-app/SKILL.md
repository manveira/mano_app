---
name: mano-app
description: Fuente de verdad de Mano App (marketplace local con negocios, comisionistas, compradores, domiciliarios y prestadores de servicios). Úsala SIEMPRE antes de trabajar en el backend Go, el web Next.js (pantallas hechas con imágenes del diseñador y botones encima), las apps iOS/Android, el API Gateway, el contrato OpenAPI, pagos/escrow/Wompi, GitHub/Azure/CI-CD/despliegue, el MCP, las pruebas locales o cualquier imagen del diseñador. Contiene dónde está todo, las reglas inviolables, el estado actual, las decisiones del usuario, cómo probar y cuál es el siguiente paso.
---

# Mano App — Skill fuente de verdad (v1.0, 24-nov-2026)

> El usuario solo dice: **"lee la skill mano-app"**. Con esta skill y los documentos que cita (§0) el agente tiene todo el contexto. Si algo de aquí contradice el código o los docs, **avisa al usuario y corrige la skill** tras confirmar cuál es lo correcto. Esta skill se actualiza en cada tarea (regla §1.2).

## 0. Empieza aquí

**Qué es:** marketplace local (Tumaco/Nariño, Colombia). Negocios suben productos y fijan la comisión; comisionistas los comparten y ganan por venta; compradores compran por link o vitrina; admin, domiciliarios y prestadores de servicios completan el ecosistema. Backend Go, web Next.js, pagos con Wompi, escrow propio.

**Dónde está todo (importante):**
- **Proyecto:** `C:\Users\mdigital\Downloads\Repos\mano_app` (WSL: `/mnt/c/Users/mdigital/Downloads/Repos/mano_app`). **No** es `Documents\Repos` (ahí solo hay una carpeta vacía `mano_app\nginx.local.conf`; no trabajar ahí).
- **Configuración del agente:** `Repos/.kiro/` → esta skill, `steering/` (3 reglas), `hooks/` (`protect-design-assets.json` y `sync-docs-and-test-local.json`), `scripts/guard-design-assets.sh`, `settings/mcp.json` (MCP de GitHub, **contiene un token**). Los hooks, steering y skill nuevos deben crearse **en `Downloads/Repos/.kiro/`**; si una herramienta los crea en la carpeta donde se abrió la sesión (p. ej. `Documents/Repos/.kiro/`), copiarlos.
- **Abrir Kiro CLI desde `C:\Users\mdigital\Downloads\Repos`** para que cargue skill, reglas, hooks y MCP. Comprobar con `/mcp` que `github` esté conectado.
- **Sin `.git` en esta copia.** El remoto es `https://github.com/manveira/mano_app` (público, rama `main`). Existe `mano_app - backup/` (copia vieja anterior a los cambios; no tocar).

**Estado en una línea (24-nov-2026):** local funcionando y probado (API 182 PASS / 0 FAIL / 1 XFAIL; interfaz 31/31; smoke 5/5; simulador de webhook 12/12; `go test` verde; 18 hashes de imágenes intactos). Pagos con **Wompi sandbox funcionando de punta a punta** (orden 49 aprobada por Wompi y conciliada). Backend con confirmación servidor↔Wompi, conciliador, historial `/pagos`, arranque seguro y sin seed en producción. Despliegue a Azure **preparado y manual** (§15). **Azure: suscripción `manve-subs` ya Enabled (24-nov-2026); VM `mano-app-vm` = D2s_v3, encendida el 24-nov 11:29 UTC; primer despliegue falló solo por falta de credencial SSH como secret (§15).** Costos: hoy ≈ $76/mes, refactor $78–580 (§17); ⚠️ la tarifa de Wompi supera la comisión del 4 % en pedidos < ≈ $98.400. Refactor de `architecture.html`: **ninguna fase pasó su gate**; ver §16.

**Lee además, según la tarea:** `mano_app/docs/SCREENS.md` (cada pantalla, ruta, lógica de cada botón y pendientes) · `mano_app/docs/MIGRATION_PLAN.md` (fases F0–F8 y gates; F8 = subida a remoto) · `mano_app/docs/ARCHITECTURE_CURRENT_STATE.md` (arquitectura y los 21 hallazgos) · `.kiro/steering/*.md`.

**Siguiente paso pendiente (decisión del usuario, propuesta A + B):**
- **A)** Preparar en local un clon de `manveira/mano_app` y una rama `refactor/multifront` con nuestro trabajo (excluir `.next/`, `node_modules/`, `tests/api/results/`, `mano_app - backup/`, `.kiro/settings/mcp.json` y todo secreto), mostrar el diff completo y **no subir nada sin confirmación**.
- **B)** En paralelo, cerrar los críticos de pagos antes de producción: F4.1 firma de integridad Wompi, F4.2 checksum del webhook, F4.3 secretos obligatorios, F4.4 auto-confirm de 24 h, F4.9 seed sin `password123`; y pasar `AZURE_VM_PASSWORD` de *variable* a *secret* (o llave SSH).
- **Primera acción con el MCP de GitHub: solo lectura** (workflows, ejecuciones, nombres de secrets). Push, rama remota, PR, merge, workflows y Azure: **solo con confirmación explícita del usuario por cada acción.**

**Decisiones y preferencias del usuario (no volver a preguntarlas):**
- Las 9 imágenes definitivas van **tal cual**, con sus datos de ejemplo "quemados"; el diseñador las hará dinámicas después. Se programa la lógica debajo de cada botón.
- **Todo botón debe hacer algo real.** Si falta backend, se programa (aditivo). Solo quedan en aviso los que dependen de credenciales de terceros o de diseño ajeno (ver `docs/SCREENS.md` → Pendientes).
- Es una app profesional: el backend se corrige para funcionar de verdad. **D1 decidida: contrato congelado, código corregible.**
- **Documentar siempre** (skill, steering, docs, contrato) y **levantar la app local** para que el usuario pruebe a mano y dé feedback; con eso decide qué pedir después.
- El usuario compartió un token de GitHub por chat y pidió **no insistir en revocarlo**. No repetirlo ni escribirlo en ningún archivo salvo `Repos/.kiro/settings/mcp.json`.
- **Llaves de Wompi sandbox (24-nov-2026):** el usuario las pasó por chat y pidió que el agente las ponga en los archivos, **no las comparta con nadie y no le hable de revocarlas**. Viven solo en `mano_app/.env.local` (en `.gitignore`; variables `LOCAL_WOMPI_*`). No escribirlas en docs, skill, logs ni respuestas (al verificar, mostrar solo el prefijo y la longitud). Comercio de Wompi: "Mano app", sandbox activo; panel en `comercios.wompi.co` → Desarrollo → Programadores. Guía: `docs/WOMPI_SANDBOX.md`.
- Idioma: español colombiano, trato cercano y directo.
- Quiere ir a desplegar con MCP de GitHub y luego Azure, "donde ya lo tenía" (VM de Azure con CI/CD en el repo).

## 1. Reglas inviolables (leer primero)

1. **Imágenes del diseñador = fuente de verdad intocable.** Nunca se editan, optimizan, renombran, mueven, sobrescriben ni regeneran. Solo se programan botones/hotspots encima. Si el código no calza con la imagen, se cambia el código. Si la imagen parece mal, se avisa y se detiene. Detalle: `.kiro/steering/design-assets-immutable.md`. Protegen: hook `.kiro/hooks/protect-design-assets.json`, manifiesto `mano_app/design-assets/MANIFEST.sha256` (18 hashes: `web/public/branding/` y `Mano_images/`) y `mano_app/scripts/verify-design-assets.sh`. Las 9 JPG definitivas están en `web/public/branding/` (copia idéntica por hash de `Mano_images/Mano/`); tienen espacios y mayúsculas en el nombre y **no se renombran** (se referencian con `encodeURIComponent`). `register-design-assets.sh` solo lo corre el agente si el usuario lo pide explícitamente (`--replace`, `--forget`).
2. **Costos siempre:** todo cambio de infraestructura o de servicios de pago actualiza `mano_app/docs/COSTS.md` y `architecture.html` § 11 en el mismo turno (precios verificados, USD y COP, 🟡 si no se pudo verificar). Ver §17.
2. **Documentar siempre y probar en local siempre** (`.kiro/steering/workflow-docs-and-local-testing.md` + hook `sync-docs-and-test-local`, que se dispara al terminar cada turno). Cada cambio actualiza esta skill, los steering/hooks, `mano_app/docs/` y el contrato **en el mismo turno**; después se levanta la app local, se verifica y se entrega al usuario la URL y los pasos para probar. Al final de cada respuesta se lista qué documentos se actualizaron.
3. **Local primero.** Nada va a remoto (Azure, GHCR, DNS, tiendas) hasta que el *Gate local* de la fase pase **y el usuario lo confirme**. No `git push`, no tocar Azure, no credenciales reales de Wompi/SMTP. `.kiro/steering/local-first-and-contract.md`.
4. **Contrato congelado, código corregible.** Solo cambios aditivos o `/v2`. Las correcciones internas del backend están aprobadas si el contrato no cambia (se prueba con `tests/api` y se regenera `contract/openapi.yaml`). **No se cambian textos de error** que el contrato o los tests fijan.
5. **Los frontends son clientes, no servidores.** iOS/Android se instalan desde las tiendas; el web son archivos que ejecuta el navegador. Todos hablan solo con el gateway (`api.mano.app/v1`).
6. **Los headers de cliente no autorizan.** `X-Mano-*` sirven para enrutar, medir y versionar; la autorización es el JWT y el rol que valida el backend.
7. **Verificar de verdad.** Si una prueba no se pudo ejecutar, decirlo. No afirmar que algo funciona sin evidencia.
8. **Secretos:** nunca en código, docs, skill, steering ni commits. El repo remoto es **público**. `Repos/.kiro/.gitignore` excluye `settings/mcp.json`.

## 2. Qué es Mano

Roles: **`business_owner`** (Negocio), **`freelancer`** (Comisionista), **`customer`** (comprador, también compra sin cuenta como *guest*), **`courier`** (Domiciliario: toma pedidos pagados y actualiza su entrega), **`service_provider`** (Prestación de servicios: se registra; su inicio y lógica de negocio están por diseñar), **`admin`** (aprobaciones, disputas, retiros; solo se crea por seed/mock).

### Modelo de dinero
- Plataforma: **4 % fijo** del total. Comisionista: % del producto (10–40 %). Negocio: el resto. Ejemplo $120.000 con 20 %: negocio $91.200 · comisionista $24.000 · plataforma $4.800.
- **Escrow propio** en BD: `pending → held → released | refunded`. Se libera cuando el comprador confirma, a las 24 h (auto-confirm) o por resolución de disputa.
- Anti-fraude: comprador con la misma cédula que el comisionista ⇒ comisión 0. Un celular = una cuenta (si hay teléfono). Bono $5.000 al referidor en la primera venta liberada del referido. Retiro mínimo $5.000 (Nequi, 1–2 días hábiles).
- Ingresos extra: publicidad (básico $29.990/7 d, premium $69.990/14 d, destacado $129.990/30 d), Plan Pro del comisionista ($15.000/mes).
- Pagos: **Wompi** (COP: Nequi, PSE, tarjetas). Stripe es código legado.

### Glosario
- **Vitrina:** página pública del comisionista, `/vendedor/<username>`, con los productos a los que se afilió.
- **Afiliarse:** `POST /sell/affiliate` crea un link único `/r/<slug>` comisionista × producto.
- **Split:** reparto de una orden en `platform`, `business` y `freelancer` (`CommissionSplit`).
- **Hotspot:** área táctil invisible (porcentajes) colocada sobre la imagen del diseñador.
- **Datos quemados:** textos de ejemplo que trae la imagen ("Manuel Angulo", "$1.250.200"…).

## 3. Arquitectura objetivo (resumen)

```
Dispositivo del usuario            Servidor
App iOS (App Store)   ┐
App Android (Play)    ├─ HTTPS + X-Mano-* ─▶ API GATEWAY ─▶ mano-core (Go, contrato congelado) ─▶ PostgreSQL
Navegador (web)       ┘                       (api.mano.app/v1)     └▶ edge services: auth-session · uploads · push · realtime ─▶ Redis
   ▲ el web se descarga de mano.app (hosting de archivos estáticos; fuera del camino de la API)
```
- Hoy: nginx `/` → Next.js y `/api/` → Go en el mismo origen, en una VM de Azure con Docker Compose, imágenes en GHCR y deploy por SSH desde GitHub Actions.
- Gateway previsto: TLS, CORS, rate limit, `/v1 → /api`, allow-list, bloqueo de `/mock` y `/admin` públicos, versión mínima (`426`), `X-Request-Id`; recomendado Kong DB-less (D4).
- Headers de cliente: `X-Mano-Client` (`web|ios|android`), `X-Mano-Client-Version`, `X-Mano-Build`, `X-Mano-Device-Id`, `X-Request-Id`. Las apps instaladas no se actualizan a la fuerza ⇒ el contrato solo crece de forma aditiva.
- Detalle: `docs/ARCHITECTURE_CURRENT_STATE.md`, `docs/architecture.html`, `docs/MIGRATION_PLAN.md`.

## 4. Mapa del repo (`Repos/mano_app`)

| Ruta | Qué hay |
|---|---|
| `backend/` | Go 1.22 · Gin · GORM · JWT HS256. `internal/app/router.go` (rutas), `internal/handlers/*` (lógica: `handlers.go`, `_wompi`, `_business`, `_stats`, `_admin`, `_mock`, `_profile`, `_movements`), `internal/models`, `internal/database` (AutoMigrate + seed + `ensurePartialPhoneIndex`), `pkg/config`, `pkg/notifications` |
| `web/` | Next.js 14 (Pages Router), Tailwind, TypeScript. **Pantallas del diseñador:** `index`, `elegir-rol`, `registro`, `comisionista`, `buscar-negocios`, `catalogo`, `comisiones`, `profile`, `vendedor/[username]`; **sin imagen aún:** `movimientos`, `ajustes`, `ayuda`, `signin`. **Infra nueva:** `lib/session.ts`, `lib/api.ts` (headers `X-Mano-*`, `friendlyError`), `lib/useAuthGuard.ts` (+ `shareOrCopy`), `lib/hotspots/*.ts`, `components/Screen.tsx` (`Screen`, `Hotspot`, `HotspotInput`, `OverlayMessage`), `components/Toast.tsx`. Las páginas legacy (`sell`, `dashboard`, `admin`, `courier`, `cart`, `checkout`, `orders`, `negocio/[slug]`, etc.) siguen con `fetch` directo. `public/branding/` = imágenes del diseñador (**intocables**) |
| `contract/` | `src/` (fuente) → `python contract/build.py` genera `openapi.yaml` (24 rutas documentadas hoy; F1 en curso). Ejecutar con `uv run --with pyyaml python contract/build.py`. Cuidado con comas/backticks sin comillas en YAML de flujo |
| `design-assets/` | README + `MANIFEST.sha256` (hashes de las imágenes) |
| `docs/` | Documentación, plan, `SCREENS.md`, `BASELINE_RESULTS.md`, pruebas por sprint (`docs/tests`) |
| `tests/` | `tests/api` (12 suites curl+jq, 175 casos) y `tests/e2e/ui-smoke.js` (Playwright, 31 pasos del flujo del comisionista; ver `tests/e2e/README.md`) |
| `scripts/` | `wompi-sandbox.sh` (`up`/`status`/`down`: túnel https, backend y verificación del sandbox de Wompi; ver §14), `wompi-webhook-sim.sh` (eventos firmados de Wompi contra el backend), `local-up.sh`, `local-down.sh`, `local-reset.sh`, `smoke.sh`, `verify-design-assets.sh`, `register-design-assets.sh`, `setup-github-mcp.sh` (alternativa a nivel de usuario para el MCP), `setup-server.sh`, `install-docker-wsl.sh`, `grant-docker-access.sh` |
| compose / nginx | `docker-compose.local.yml` + `nginx.local.conf` (local), `docker-compose.yml` (dev viejo), `docker-compose.prod.yml` + `nginx.prod.conf` (producción actual en Azure) |
| `.github/workflows/` | `ci.yml` (en `pull_request` y manual: backend, web, design-assets, compose, api-tests) y `deploy.yml` (**solo `workflow_dispatch` en nuestra copia**; el remoto aún despliega en cada push a `main`) |

## 5. Convenciones

- **API:** todo bajo `/api` (hoy) → `/v1` por el gateway. JSON `snake_case`. Errores `{"error": "mensaje"}`. Montos en COP como número. Auth `Authorization: Bearer <jwt>` (72 h, claims `user_id`, `role`, `email`). Roles en §2. Los roles se validan dentro de cada handler.
- **Respuestas inconsistentes por historia** (algunas envueltas `{businesses:[…]}`, otras directas; listas vacías pueden llegar `null`). Se documentan, no se "arreglan".
- **Novedades de la API v1.1 (aditivas, 24-nov-2026):** roles `courier` y `service_provider` en `POST /auth/signup`; `username` normalizado (minúsculas, 3–30 caracteres `[a-z0-9._-]`; errores `invalid username…` y `username already taken`); registro sin teléfono permitido (índice único parcial `WHERE phone <> ''`); `GET /me` devuelve `phone`, `document_id`, `nequi_number`, `referral_code`; **`PATCH /me`** (Ajustes); **`GET /sell/movements`** (comisiones liberadas + retiros); `business_id` en cada producto de `GET /vendedor/:username`; el domiciliario puede `POST /deliveries` (pedido `paid` sin entrega ⇒ queda asignado, `type=mano_courier`) y `PATCH /deliveries/:id/status` en su entrega.
- **Web:** TypeScript, Tailwind. Páginas nuevas usan `lib/api.ts`; las legacy se migran en F3.
- **Pantallas basadas en imagen:** la imagen se muestra tal cual y todo lo interactivo va encima: botones invisibles (`Hotspot`) y `<input>` reales (`HotspotInput`, transparentes mientras están vacíos para que se vea el texto de ejemplo de la imagen). Coordenadas en `web/lib/hotspots/<pantalla>.ts` (porcentajes de la imagen 4500×8000; medidas leyendo píxeles en memoria, sin escribir imágenes), `aria-label` en todo, `?debugHotspots=1` dibuja los rectángulos. Se usa `<img>` plano (sin `next/image`) para no optimizar. Los avisos son `useToast` (`data-testid="toast"`). Cada pantalla nueva o botón nuevo se registra en `docs/SCREENS.md`.
- **Categorías del diseño:** chips Todos/Moda/Alimentos/Hogar agrupan las categorías libres de los negocios (`CHIP_GROUPS` en `lib/hotspots/types.ts`). Los formularios de negocio ya ofrecen Moda/Alimentos/Hogar.
- **Rutas web:** `/` splash → `/elegir-rol` → `/registro` → inicio del rol. `homeForRole`: `freelancer→/comisionista`, `business_owner→/dashboard`, `courier→/courier`, `service_provider→/profile`, `admin→/admin`, `customer→/businesses`. `/signup` redirige a `/elegir-rol` conservando `?ref=`.

## 6. Cómo probar en local

```bash
export PATH=$HOME/.local/go/bin:$HOME/.local/node/bin:$HOME/.local/bin:$PATH
cd /mnt/c/Users/mdigital/Downloads/Repos/mano_app
bash scripts/local-up.sh        # reconstruye y levanta postgres + core + web + proxy (web http://localhost:3000, API http://localhost:8080/api)
bash scripts/smoke.sh           # 5 casos
bash tests/api/run-all.sh       # 12 suites, 175 casos; REINICIA la BD local
bash scripts/verify-design-assets.sh
(cd web && npx tsc --noEmit --incremental false)
(cd backend && go build ./... && go vet ./...)
NODE_PATH=/tmp/mano/e2e/node_modules LD_LIBRARY_PATH=/tmp/mano/libs/root/usr/lib/x86_64-linux-gnu:/tmp/mano/libs/root/lib/x86_64-linux-gnu node tests/e2e/ui-smoke.js
```
- **Antes de resetear la BD**, respaldar: `docker exec mano-local-postgres-1 pg_dump -U user mano > ~/mano-backups/mano-local-$(date +%Y%m%d-%H%M%S).sql` (hay un respaldo del 24-nov en `~/mano-backups/`).
- Para reconstruir solo el web: `docker compose -f docker-compose.local.yml up -d --build web` y reiniciar `proxy`.
- **Cuentas de prueba** (contraseña `password123`): `maria@example.com` (comisionista, link `hamaca-casa-narino-maria-x7k2`), `juan@example.com` (negocio), `carlos@example.com` (comprador). Admin solo con `POST /api/mock/seed-admin` (`MOCK_MODE=true`).
- **Playwright** vive en `/tmp/mano/` (se pierde si WSL se reinicia; recrear con `tests/e2e/README.md`: Chromium + 4 librerías `libnss3 libnspr4 libasound2t64 libasound2-data` extraídas con `apt-get download` + `dpkg -x`, sin `sudo`). Chrome de Windows no es alcanzable desde WSL por CDP y Windows no tiene Node.
- Verde con `/mock` no prueba el código real de Wompi.
- **Wompi sandbox exige URL `https` pública:** `checkout.wompi.co` da 403 (CloudFront) si `redirect-url` es `http://localhost…`. Para probar pagos: túnel al puerto 3000, `LOCAL_APP_BASE_URL=<túnel>` en `.env.local`, recrear `core`, pegar `<túnel>/api/webhooks/wompi` en Wompi y navegar la app por la URL del túnel. Procedimiento completo y repetible en §14.
- **Rendimiento conocido:** las imágenes (36 Mpx) tardan ~4 s en decodificarse; los tests de interfaz usan esperas largas (15–20 s). El splash precarga la ruta siguiente (`Router.prefetch`) por eso.

## 7. Hallazgos conocidos del backend (a corregir en F4, sin cambiar contrato)

**Corregidos 24-nov-2026:** firma de integridad Wompi (#1), checksum del webhook con `timestamp` (#2), webhook y `initiate` exigen secretos fuera de `MOCK_MODE` (#3), `JWT_SECRET` obligatorio de 32+ caracteres fuera de mock (#11), seed de demostración solo con `SEED_DEMO_DATA`/`MOCK_MODE` (#6), webhook idempotente y atómico, confirmación de APPROVED contra la API de Wompi, conciliador de pagos pendientes; guía en `docs/WOMPI_SANDBOX.md`, simulador `scripts/wompi-webhook-sim.sh`; falta el E2E con el sandbox real 👤. Pendientes: sin auto-confirm real fuera de mock · ads y Plan Pro se activan sin cobrar · seed con `password123` también en prod · atribución del comisionista perdida en compra guest (`referral_link_id` ignorado; afecta compras desde la vitrina) · anti-fraude solo en el flujo mock · operaciones de dinero sin transacciones · ruta Stripe divergente · `JWT_SECRET` con default · stories por API sin `expires_at` (#19, XFAIL FEED-03) · `/map/nearby` expone negocios no aprobados (#20) · listas vacías como `null` (#21) · `CourierAvailableOrders` abierto a cualquier usuario autenticado · `GET /deliveries/:id` público · KYC a medias. **Resuelto:** #18 registro sin teléfono (24-nov-2026). Lista completa en `ARCHITECTURE_CURRENT_STATE.md` §6.

## 8. Estado de decisiones

| ID | Tema | Estado |
|---|---|---|
| D1 | "Inmutable" = ¿contrato o código? | **Decidida: contrato congelado, código corregible** |
| D2 | Auto-confirm: worker interno vs job externo | Pendiente (recomendado: worker interno) |
| D3 | Móvil nativo vs React Native/Expo | Pendiente |
| D4 | Gateway: Kong / Traefik / nginx | Pendiente (recomendado: Kong DB-less) |
| D5 | Dominios `api.` y `admin.` | Pendiente |
| D6 | Rol `courier` | **Decidida: se programa** (`courier` y `service_provider`, aditivo) |
| D7 | Alcance del contrato v1 | Pendiente |
| D8 | Hosting del web (estático vs standalone; VM vs Static Web Apps) | Pendiente (recomendado: estático) |
| D9 | Nombres de headers y política de versión mínima | Pendiente |

Decididas además: imágenes tal cual con datos de ejemplo · se programa todo botón · frontends = clientes · local antes que remoto · imágenes intocables.

## 9. Cómo trabajar una tarea

1. Leer esta skill, `docs/SCREENS.md` (si es UI) y la tarea en `MIGRATION_PLAN.md`.
2. Confirmar que no viola las reglas de §1.
3. Cambio mínimo; sin tocar imágenes ni textos de error del contrato.
4. Backend: probar con `tests/api` (agregar casos a la suite que corresponda o a `sprint-7-registro-roles.sh`). Web: `tsc`, build y `ui-smoke.js`.
5. Actualizar: estado en `MIGRATION_PLAN.md`, `docs/SCREENS.md`, contrato (`contract/build.py`), `BASELINE_RESULTS.md` (`bash tests/api/report.sh`) y **esta skill**.
6. **Levantar la app local, verificar y dar al usuario la URL y los pasos para probar.** Responder listando los documentos actualizados.

## 10. Entorno de desarrollo (WSL Ubuntu, usuario `manve`)

| Herramienta | Versión | Ruta |
|---|---|---|
| Go | 1.22.12 | `~/.local/go` (no usar ≥ 1.23 sin probar: dependencias antiguas) |
| Node / npm | 20.20.2 / 10.8.2 | `~/.local/node` |
| uv | 0.13.6 | `~/.local/bin` |
| jq | 1.8.2 | `~/.local/bin` |
| Docker + Compose | 29.9.2 / v5.6.1 | sistema |
| cloudflared | 2026.11.2 | `~/.local/bin` (instalado 24-nov-2026 sin sudo; túnel temporal para el webhook de Wompi: `bash scripts/wompi-sandbox.sh up` lo abre/reutiliza (puerto 3000 = web + /api); la URL `trycloudflare.com` cambia en cada arranque y hay que repegarla en Wompi → URL de Eventos) |

- En comandos no interactivos anteponer el `PATH` de §6. **El DNS de WSL falla a ratos** (`server misbehaving`): reintentar descargas e imágenes.
- El agente **no tiene `sudo`**. Los scripts que lo requieren los corre el usuario (`install-docker-wsl.sh`, `grant-docker-access.sh`).
- Verificado 24-nov-2026: `go build/vet` OK · `tsc --noEmit` OK · `next build` OK (vía `local-up.sh`) · API 174/0/1 · interfaz 31/31 · smoke 5/5 · `verify-design-assets.sh` OK.

## 11. GitHub, Azure y despliegue

**Remoto `manveira/mano_app` (revisión de solo lectura, 24-nov-2026):** público; una sola rama `main`; 7 commits (último `5ddd98d`, 7-ago-2026, "rebuild frontend with official brand images"); un único workflow `deploy.yml` con **`on: push: branches: [main]`** ⇒ **cada push a `main` despliega a Azure** (última ejecución exitosa 7-ago-2026; 8 ejecuciones). Usa `vars.AZURE_VM_HOST/USER/PASSWORD` (la contraseña SSH está en una *variable*, no en un secret) y `secrets.GHCR_TOKEN`. No tiene `contract/`, `design-assets/`, `Mano_images/`, `tests/`, scripts de F0, `docker-compose.local.yml`, `ci.yml` ni nuestros cambios.

**Reglas derivadas:** (1) **nunca empujar a `main` directamente**: rama `refactor/multifront` + PR (dispara `ci.yml`, no el deploy); (2) el `deploy.yml` local ya no tiene `push`, pero mientras no llegue a `main` el remoto sigue desplegando; (3) repo público ⇒ nunca subir `.kiro/settings/mcp.json`, `.env` ni credenciales; (4) antes de fusionar a `main`: contraseña SSH a secret/llave, críticos de pagos cerrados (§7), servidor Azure de destino confirmado, y primero **staging** con `workflow_dispatch`. Documentos del repo remoto sobre el despliegue: `docs/DEPLOY.md`, `docs/INFRASTRUCTURE.md`, `scripts/setup-server.sh`.

**MCP de GitHub:** `Repos/.kiro/settings/mcp.json` (nivel de espacio de trabajo; solo se carga si Kiro se abre en `Downloads/Repos`). Servidor oficial `ghcr.io/github/github-mcp-server` v2.2.0 en Docker, toolsets `context,repos,pull_requests,issues,actions` (47 herramientas, probado). Token del usuario `manveira` con alcances `repo` y `workflow`, admin sobre el repo. El agente **no puede escribir** `~/.kiro/settings/mcp.json` (regla de permisos), sí el del espacio de trabajo. Si Kiro no reconecta solo, reiniciar la sesión. Alternativa a nivel de usuario: que el usuario copie el archivo o corra `scripts/setup-github-mcp.sh`.

**MCP de Azure:** pendiente (lo hará el usuario más adelante; misma técnica, otra entrada en `mcp.json`).

## 12. Sesiones de Kiro CLI

- Las sesiones se guardan en `~/.kiro/sessions/<hash>/sess_<uuid>` (en WSL, no en el proyecto), asociadas a la carpeta desde la que se abrió Kiro; el `<hash>` son los 16 primeros caracteres del SHA-256 de la ruta (`…/Downloads/Repos` → `8649e242cd27a1fb`, `…/Documents/Repos` → `b20b2466ba833866`; verificado leyendo `~/.kiro`, no documentado oficialmente). **No editar esos archivos con la sesión abierta.**
- Reanudar: `kiro-cli chat --resume`, `--resume-picker`, `--resume-id <UUID>`; dentro: `/chat resume`, `/sessions` (desactivar "current workspace only" para ver otras carpetas), `/session-id`. Una sesión reanudada conserva su carpeta original, por eso el `mcp.json` del espacio de trabajo no se ve si la sesión nació en otra carpeta.
- La conversación larga original (`sess_fccbb7ae-26bd-4974-bd0f-a6cf7ac5d655`, carpeta `Documents/Repos`) sigue guardada; ya no hace falta: todo su contexto está en esta skill y en los docs.

## 14. Runbook: probar pagos con el sandbox de Wompi (repetible)

**Datos y números de prueba completos (tarjetas, Nequi, PSE, Daviplata, estados, endpoints, cuentas del seed y matriz de casos a ejecutar): `.kiro/skills/mano-app/references/wompi-sandbox-datos-de-prueba.md`** (léelo antes de cada sesión de pagos y marca ahí los casos que se completen). Detalle ampliado y tabla de problemas: `mano_app/docs/WOMPI_SANDBOX.md`. **Nunca escribir llaves en docs, skill ni respuestas** (solo prefijo y longitud). El usuario pidió no hablarle de revocarlas.

**Qué hay ya hecho (no repetir):** comercio "Mano app" creado en `comercios.wompi.co` (Persona Natural; sin activar el comercio, no hace falta para sandbox); modo de pruebas activo (panel **Desarrollo → Programadores**, debe decir "Estás en Sandbox"); las 4 llaves de pruebas en `mano_app/.env.local` (`LOCAL_WOMPI_PUBLIC_KEY`, `_PRIVATE_KEY`, `_INTEGRITY_SECRET`, `_EVENTS_SECRET`, prefijos `pub_test_`, `prv_test_`, `test_integrity_`, `test_events_`); `cloudflared` instalado en `~/.local/bin`. El backend ya está corregido (firma de integridad SHA256, checksum del webhook con `timestamp`, idempotencia, validación de monto, secretos obligatorios fuera de `MOCK_MODE`).

**Por qué un túnel https (hallazgo 24-nov-2026):** `checkout.wompi.co` devuelve **403 de CloudFront** si `redirect-url` es `http://localhost…`; con https público devuelve 200. Además Wompi no puede llamar a `localhost` para el webhook. Por eso la app se prueba por una URL `https://….trycloudflare.com` que apunta al puerto 3000, y `LOCAL_APP_BASE_URL` se pone con esa URL.

### Cada sesión de pruebas (pasos)
1. `cd /mnt/c/Users/mdigital/Downloads/Repos/mano_app && export PATH=$HOME/.local/go/bin:$HOME/.local/node/bin:$HOME/.local/bin:$PATH`
2. App arriba: `bash scripts/local-up.sh` (si no está).
3. `bash scripts/wompi-sandbox.sh up` (`--new` fuerza un túnel nuevo). Hace: valida llaves → reutiliza o abre el túnel → `LOCAL_APP_BASE_URL=<túnel>` → recrea `core` → crea una orden de prueba → comprueba que `checkout.wompi.co` dé 200 y que el túnel llegue al backend → imprime las URLs.
4. **Solo si el script dice "túnel nuevo":** pedir al usuario que pegue `https://<túnel>/api/webhooks/wompi` en Wompi → Desarrollo → Programadores → **URL de Eventos** (con el sandbox activo) y guarde. Es un paso del usuario 👤; el agente no puede hacerlo.
5. El usuario abre la app **por la URL del túnel** (no `localhost`; la sesión es por origen) e inicia sesión con `carlos@example.com` / `password123`.
6. Camino de pago en la UI: `/checkout?order_id=N` (la que imprime el script) **o** `/businesses` → negocio → **Añadir** (sin aviso) → `/cart` a mano (el menú no tiene enlace) → **Crear pedido y pagar** → **Pagar $… COP** → **Ir a pagar en Wompi →** (no redirige solo).
7. En la pantalla de Wompi, **solo datos de prueba**: tarjeta `4242 4242 4242 4242` (APPROVED), `4111 1111 1111 1111` (DECLINED), cualquier otra tarjeta = ERROR; Nequi `3991111111` (APPROVED) / `3992222222` (DECLINED), cualquier otro = ERROR ("Número no válido en Sandbox"); PSE "Banco que aprueba/rechaza". Fecha futura y CVC de 3 dígitos.
8. El agente revisa: `bash scripts/wompi-sandbox.sh status N`. Muestra webhooks recibidos, estado en BD y lo que Wompi tiene de cada referencia (consulta con la llave privada, sin imprimirla).
9. Al terminar: `bash scripts/wompi-sandbox.sh down` (cierra el túnel y restaura `LOCAL_APP_BASE_URL=http://localhost:3000`). **Hacerlo antes de `tests/api`**.

### Lo que el backend hace ahora con los pagos (24-nov-2026)
- **Webhook** (`POST /api/webhooks/wompi`): valida el checksum (propiedades + `timestamp` + secreto de eventos), ignora repetidos (`wompi_events.checksum` único), y para un APPROVED **consulta a Wompi** (`GET /transactions/{id}` con la llave privada) antes de marcar la orden pagada. Si Wompi no responde → 503 y Wompi reintenta (30 min, 3 h, 24 h).
- **Sincronización** (`POST /payments/wompi/sync {order_id}`): la llama `/orders` al volver del checkout (`?id=` en la URL) y el botón "Verificar pagos pendientes" de `/pagos`. Solo el comprador de la orden; 429 si se repite en < 5 s; 503 sin llave privada.
- **Conciliador:** cada 2 min (`WOMPI_RECONCILE_SECONDS`, `WOMPI_RECONCILE=false` lo apaga) revisa los PENDING `MANO-%` de las últimas 48 h contra Wompi. Probado de verdad: marcó solo las órdenes 46 y 47 como fallidas con el motivo de Wompi, y `sync` dejó la 49 `paid/held`.
- **Historial** (`GET /payments`, `GET /payments/{ref}`): comprador ve los suyos; `business_owner` ve los recibidos con `?scope=received`, sin datos del pagador; ajeno → 404. Web: `/pagos`.
- Un solo punto aplica los cambios: `applyWompiTransaction` (transacción + bloqueo + idempotencia + validación de monto/moneda + bitácora `wompi_events`).
- **Simulador de webhook:** necesita el backend **sin** `WOMPI_PRIVATE_KEY` (si no, el APPROVED simulado se confirmaría contra Wompi real y se ignoraría). Las instrucciones de §14 ya recrean `core` sin esa llave.

### Cómo interpretar `status`
- Wompi `APPROVED` + orden `paid/held` = todo bien. Wompi `APPROVED` o `ERROR/DECLINED` con la orden en `pending_payment` = **el webhook no llegó** (URL de eventos sin guardar, túnel distinto o muerto). Wompi "no tiene transacción" = el comprador no llegó a pagar.
- Log `wompi: webhook con firma inválida` en un evento real = `LOCAL_WOMPI_EVENTS_SECRET` no coincide con el del panel (copiar de nuevo el de Eventos del **sandbox**).

### Resultados reales hasta hoy (24-nov-2026)
- Orden 46 (tarjeta no de prueba) → Wompi ERROR "La tarjeta usada no es admitida para el ambiente Sandbox". Orden 47 ($120.000, Nequi `…4517`) → ERROR "Número no válido en Sandbox". Ambos por datos no válidos; el flujo hasta Wompi funciona (firma, llave, URL, pantalla de pago).
- **Orden 49 ($10.000, Nequi de prueba) → Wompi APPROVED** (comprobado con `status`), pero nginx y el backend **no registraron ninguna llamada de Wompi** a `/api/webhooks/wompi` (solo una prueba manual y un GET desde Chrome, que da 404 porque la ruta es solo POST). El `GET /v1/merchants/<llave pública>` no expone la URL de eventos, así que no se puede verificar por API: hay que mirar el panel. Causa probable: la URL de eventos no está guardada en el ambiente **sandbox**.
- En los intentos anteriores (órdenes 46 y 47) el backend **no recibió el webhook** tampoco (solo el de una prueba manual): la URL de eventos probablemente no estaba guardada. **Pendiente:** guardarla y repetir con `4242…` o `3991111111` hasta ver `APPROVED` + orden `paid/held` + escrow `held`; después probar DECLINED, ERROR y repetición del evento.

### Trampas conocidas
- El DNS de WSL falla a ratos (`Could not resolve host`, HTTP 000): reintentar; el script ya reintenta y obtiene el token directo del backend local.
- No usar `pkill -f "cloudflared tunnel"` dentro de un comando que contenga ese texto (se mata a sí mismo); el script guarda el PID en `/tmp/mano-tunnel.pid`. Lanzar con `setsid nohup … &`. `/tmp` se pierde si WSL reinicia.
- Si hay que probar el webhook sin Wompi: `scripts/wompi-webhook-sim.sh` (necesita el backend con el mismo `LOCAL_WOMPI_EVENTS_SECRET`; después restaurar con `wompi-sandbox.sh up`). Vectores: `go test ./internal/handlers -run Wompi`.
- Las órdenes de prueba creadas (43–48 y más) quedan en la BD local sin pagar; es normal.
- El hash de ejemplo de eventos de la doc de Wompi (`3476DDA5…`) no reproduce su propia cadena; el test usa el SHA256 real.
- UX del checkout pendiente de tu decisión: "Añadir" sin aviso, sin enlace al carrito, "Redirigiendo a Wompi…" sin redirección.
- Producción: `pub_prod_…` y el link de pagos del panel cobran dinero real; no usarlos para probar. Persona Natural + escrow/reparto a terceros: consultar a Wompi y a un contador/abogado antes de producción.

## 15. GitHub y Azure: estado y cómo desplegar (24-nov-2026)

**Decisión del usuario:** subir todo a GitHub y dejar el despliegue listo, "que yo solo le dé start a la VM". Paso a paso completo y tabla de problemas: `mano_app/docs/DEPLOY.md`.

- **Código:** rama `refactor/multifront` en `manveira/mano_app`, **PR #1 FUSIONADO a `main`** (merge `437a2a0`, 24-nov-2026 09:39 UTC; CI verde, 5 trabajos; el merge **no** disparó despliegue, comprobado). Para trabajo nuevo: `bash scripts/github-sync.sh "mensaje" nombre-de-rama` (crea la rama desde `main`; nunca `main` directo) y abrir un PR nuevo. Ya en `main`: `deploy.yml` manual (Actions → Deploy Mano App → Run workflow). Se sube con `bash scripts/github-sync.sh "mensaje" [rama]` (clon en `~/mano-push`; la carpeta de trabajo no es un repo git). **Nunca empujar a `main` directo.** El workflow `ci.yml` corre en el PR. Imágenes del diseñador: viajan en el repo (web/public/branding y Mano_images).
- **Despliegue (`deploy.yml`):** solo `workflow_dispatch`, con campo `confirm` = `DEPLOY`; test → build (GHCR, tag = SHA) → deploy por SSH a `/opt/mano-app`: valida `.env`, `git checkout <sha>`, respaldo `pg_dump` en `/opt/mano-backups`, `docker compose up -d`, chequeo de salud y **reversión automática** a `.last_good_tag`. Entorno `production` (se le puede exigir aprobación). Opcional: `APP_URL` para chequeo externo.
- **Qué debe hacer el usuario (no se puede por MCP):** (1) Azure: suscripción activa → **Iniciar** `mano-app-vm`; IP pública Estática; (2) GitHub: secrets `GHCR_TOKEN`, `AZURE_SSH_KEY` (o `AZURE_VM_PASSWORD` como **secret**, no variable) y variables `AZURE_VM_HOST`, `AZURE_VM_USER` (+ `APP_URL`); (3) en la VM, `/opt/mano-app/.env` con `DOMAIN` (**variable nueva**), `JWT_SECRET` ≥ 32, llaves de Wompi de **pruebas**, `ADMIN_EMAIL`/`ADMIN_PASSWORD`; (4) correr el workflow; (5) pegar `https://DOMINIO/api/webhooks/wompi` en Wompi.
- **Producción = `docker-compose.prod.yml`:** `MOCK_MODE=false`, `SEED_DEMO_DATA=false`, imágenes `${IMAGE_TAG}`, nginx con plantilla `${DOMAIN}`, límite de 10 intentos/min en `/api/auth/`, cabeceras de seguridad, logs rotados. El backend **no arranca** sin `JWT_SECRET` fuerte.
- **Azure vía MCP:** funciona con la suscripción Enabled (24-nov-2026). Lectura: `compute_vm_get` (con `instance-view`), `compute_disk_get`, `pricing_get`. Escritura: `compute_vm_power-state` (start/deallocate) — **el 24-nov se usó `start` para desplegar; el usuario había pedido desplegar, pero conviene confirmar antes de cualquier cambio en Azure**. Grupo `rg-mano-app` (eastus): VM `mano-app-vm` (**D2s_v3**), IP `mano-app-vm-ip`, NSG, disco `StandardSSD_LRS` 30 GB.
- **Aún NO listo para dinero real:** faltan F4.4 (auto-confirm 24 h), F4.5, F4.6, F4.7 (retiros/liberación atómicos) y revisión legal/contable del escrow con terceros. Primer despliegue = Wompi **sandbox**.

## 16. Estado real del refactor de `docs/architecture.html` (24-nov-2026)
Detalle y tabla por fase en `mano_app/docs/MIGRATION_PLAN.md` § "Avance real". Resumen: de 76 tareas, **13 ✅ y 7 🟡 (≈ 17 % / 26 %)**; ningún gate (G0–G8) pasó. **Hecho:** F0 casi completa, contrato en borrador (27 rutas, 31 operaciones de ~64 reales), hotspots/cliente/sesión del web, F4 ≈ 45 % (pagos). **No existe:** gateway (F2), servicios laterales (F5), apps iOS/Android (F6), migraciones versionadas (F7), staging real (F8). La arquitectura objetivo sigue siendo el monolito Go detrás de nginx. Decisiones abiertas: D2 (auto-confirm), D3 (móvil nativo vs RN), D4 (gateway), D5, D7, D8, D9. Siguiente en la ruta: PR #1 ya fusionado → solo falta el tag `baseline-pre-refactor` sobre `5ddd98d` (G0) → F4.4 → decidir D4 y levantar F2.

## 17. Costos (corte 24-nov-2026) — fuente: `mano_app/docs/COSTS.md` y `architecture.html` § 11
**Regla:** "costos siempre" (decisión del usuario): cada cambio de infraestructura, gateway, base de datos, hosting, apps o pasarela se refleja en esos dos documentos con precio por mes (USD y COP), supuestos y fuente.

- **Hoy (Azure, eastus), verificado 24-nov-2026:** monolito en 1 VM **`Standard_D2s_v3`** (2 vCPU, 8 GB) ≈ **$76,13/mes** (VM $70,08 + disco Standard SSD E4 $2,40 + IP $3,65) ≈ 266 mil COP; apagada (desasignada) ≈ $6. Se había supuesto B2s ($39) antes de poder leer Azure: **era un error**, corregido. Ahorro posible: B2ms $60,74 / B2as_v2 $54,90 (misma RAM, CPU burstable; probar).
- **Refactor:** A (Kong + servicios en la VM actual, que ya tiene 8 GB) **$78–92**; B (APIM Consumption + Container Apps + PostgreSQL Flexible + Redis Basic) **$82–150** (escala ≈ $433); C (APIM Basic v2 $150 + BD con réplica + Front Door) **≈ $580**. APIM: Consumption $3,50/millón tras 1 M gratis · Developer $48 (sin SLA) · Basic v2 $150 · Standard v2 $700 · Premium $2.795. ⚠️ Container Apps: la API muestra un "Environment Management Hour" de $0,10/h (≈ $73/mes) desde 01-sep-2026; **sin confirmar** si aplica al plan de consumo.
- 🔴 **Margen:** Wompi cobra **2,65 % + $700 + IVA** por transacción exitosa; la comisión de plataforma es 4 %. Con pedidos menores de **≈ $98.400 COP** la plataforma **pierde** dinero (ej. $60.000 → −$325; $10.000 → −$748). El código no descuenta la tarifa de nadie. Es una decisión de producto pendiente (cargo al comprador, mínimo por pedido, repartir, negociar).
- **¿Proveedor más barato que Wompi? (24-nov-2026)** En tarjetas **no**: todas 2,5–3,3 % + $300–900 + IVA; Wompi→Davipay ahorra ≈ $19 COP/pedido de $60.000. Ningún plan de tarjeta cierra el hueco bajo ≈ $93.000. Sí ayudan **PSE** (fijo ≈ $1.500–2.500 + IVA; equilibrio ≈ $44.600–74.400) y **Bre-B** (≈ $0; operando desde 6-oct-2025; por cotizar con Wompi). "Punto rojo" se interpretó como Puntored (corresponsales, sin tarifas públicas, ≈ 3,5 % en efectivo vía pasarela). Las tarifas de terceros no son oficiales (🟡). Detalle: `COSTS.md` §5b y `architecture.html` § 11. Pendiente: preguntar a Wompi si PSE va con tarifa fija y si soporta Bre-B.
- 🟡 **Ancho de banda:** lo domina el peso de las imágenes (0,4–1,8 MB). Con 50.000 usuarios ≈ 1 TB/mes ≈ $78. Pedir al diseñador una exportación liviana (no se editan las imágenes) + CDN gratuito.
- **Apps:** Apple $99/año, Google $25 una vez 🟡; push FCM/APNs $0.
- **TRM supuesta $3.500** (rango de la última semana ≈ $3.310–3.510). Cómo consultar precios: herramienta de precios de Azure (`pricing_get` con filtro OData `serviceName`, `armRegionName`, `priceType eq 'Consumption'`); las consultas con nombres de servicio equivocados devuelven vacío.
- **Aún sin cotizar:** Wompi "Pagos a terceros" (para pagar retiros), impuestos (IVA de la comisión, ICA, 4×1000), tarifas por PSE/Nequi si difieren.

## 13. Pendientes para pulir esta skill
- Mobile: documentar hotspots cuando el diseñador entregue imágenes de iOS/Android; IDs de bundle/package para deep links (F3.10/F6).
- Cuando exista el gateway (F2) y el cliente generado (F1.7), actualizar §3, §4 y §5.
- Cuando se suba el repo (F0.1), anotar la rama, el PR y el resultado de `ci.yml`.
- Pantallas pendientes de diseño y credenciales de terceros: `docs/SCREENS.md` → Pendientes.

## 18. Primer despliegue a Azure (24-nov-2026): bitácora y lección
- Run `45384680807` de `deploy.yml` desde `main` (`7a01883`): `confirm` ✅, `test` ✅, `build` ✅ (imágenes `mano-backend` y `mano-frontend` en GHCR con tag = SHA y `latest`), **`deploy` ❌ en 1 segundo**: `error: can't connect without a private SSH key or password`.
- **Causa:** el workflow nuevo lee la credencial SSH de **secrets** (`AZURE_SSH_KEY` o `AZURE_VM_PASSWORD`) y la contraseña seguía guardada como **variable** (`vars.AZURE_VM_PASSWORD`, como el workflow viejo). No es un fallo del código ni de la VM; falló **antes** de conectarse, así que la VM y su base de datos no se tocaron (nada que revertir).
- **Arreglo (lo hace el usuario en GitHub → Settings → Secrets and variables → Actions):** crear el **secret** `AZURE_VM_PASSWORD` (mismo valor que tenía la variable) **o** `AZURE_SSH_KEY`; además `GHCR_TOKEN` (secret) y las variables `AZURE_VM_HOST` y `AZURE_VM_USER`. Después: Actions → Deploy Mano App → **Re-run failed jobs** (reutiliza las imágenes ya construidas; no hay que escribir DEPLOY otra vez).
- Los logs de un job se leen con `get_job_logs` (reintentar si el DNS de WSL falla) y los pasos con `get_workflow_job`.
- **Intento descartado (24-nov-2026):** hacer que `deploy.yml` aceptara la contraseña desde `vars.AZURE_VM_PASSWORD`. **Se revirtió antes de ejecutarlo**: las variables no se ocultan en los logs y los logs de este repo (público) lo mostrarían en claro. La credencial SSH va **solo como secret** (o llave SSH). Nunca usar `vars.*` para credenciales.
- **Estado de GitHub (leído de las pantallas que pegó el usuario, 24-nov-2026):** variables `AZURE_VM_HOST` (IP pública de la VM), `AZURE_VM_PASSWORD` (**credencial como variable: expuesta**), `AZURE_VM_USER`; secret `GHCR_TOKEN` existe. **Falta** el secret `AZURE_VM_PASSWORD` (o `AZURE_SSH_KEY`). La contraseña pegada en el chat y la guardada como variable desde junio deben considerarse comprometidas: recomendar cambiarla en la VM. No repetirla ni escribirla en ningún archivo.
