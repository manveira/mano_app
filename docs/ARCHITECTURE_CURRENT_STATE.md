# ARCHITECTURE_CURRENT_STATE.md — Mano App

Foto del estado real del repo (leído archivo por archivo) y propuesta de arquitectura objetivo **multi-frontend con API Gateway y backend congelado**.

- Fecha del análisis: 27 oct 2026
- Alcance leído: `backend/` (todos los .go), `web/` (config, lib, componentes y las 22 páginas), `docker-compose*.yml`, `nginx*.conf`, `.github/workflows/deploy.yml`, `scripts/setup-server.sh`, `.env.example` y `docs/` (incluye tests y matriz).
- Qué NO se pudo verificar: no se ejecutó nada (el entorno de análisis no tiene `go`, `node` ni `docker`). Lo que aquí se afirma sobre comportamiento viene de leer el código, salvo donde se indica que se contrastó con la documentación oficial de Wompi.
- El repo **no es un repo git** en esta copia (no hay `.git`), aunque `DEPLOY.md` habla de un commit `bae1a74`.

---

## 1. Resumen ejecutivo

Mano es un marketplace con tres actores (negocio, comisionista/freelancer, comprador) más admin y repartidor. Hoy es un **monolito Go (Gin + GORM + PostgreSQL)** y un **frontend Next.js 14 (Pages Router)** que habla con el backend **a través de nginx en el mismo origen** (`/api`). Se despliega en una VM de Azure con Docker Compose, imágenes en GHCR y deploy por SSH desde GitHub Actions.

Lo importante para el refactor:

1. El único "gateway" actual es nginx con dos reglas (`/api/` → backend, `/` → Next.js). No hay versionado, CORS, rate limit, ni control de rutas.
2. El contrato backend↔frontend **no está escrito en ningún lado**. Existe solo implícito en `router.go` + los handlers + `fetch()` repartidos en 20 páginas. Es el primer entregable del refactor.
3. El frontend web está acoplado al backend por **mismo origen**, `localStorage` para el JWT, `NEXT_PUBLIC_API_URL` horneado en build y `rewrites` de Next en desarrollo. Nada de eso sirve para iOS/Android.
4. **Modelo de ejecución (ver 7.1):** iOS y Android son apps instaladas desde las tiendas y el web es un conjunto de archivos que ejecuta el navegador; ninguno de los tres "corre" como servicio en el servidor. Solo el web necesita hosting (de archivos). Todos consumen la misma API por HTTPS e identifican su plataforma y versión con headers.
5. "El backend nunca cambia" choca con **defectos reales** en pagos/escrow (sección 6). Hay que decidir si congelamos *el contrato* (recomendado) o *el código*.

---

## 2. Topología actual

```
                     Internet
                        │  :80/:443
                 ┌──────▼───────┐
                 │ nginx (proxy)│  nginx.conf (dev) / nginx.prod.conf (TLS Let's Encrypt)
                 └───┬──────┬───┘
         /api/*      │      │   /*
          ┌──────────▼┐   ┌─▼───────────────┐
          │ backend   │   │ frontend        │
          │ Go :8080  │   │ Next.js :3000   │
          └─────┬─────┘   └─────────────────┘
                │
         ┌──────▼──────┐        ┌───────────┐
         │ PostgreSQL15│        │ Redis 7   │  ← desplegado, NADIE lo usa
         └─────────────┘        └───────────┘

Externos: Wompi (pagos COP), Stripe (código legado), SMTP (email al negocio)
Imágenes: solo URLs externas (Unsplash / campo image_url). No hay subida de archivos.
```

Entornos:

| | Dev (`docker-compose.yml`) | Prod (`docker-compose.prod.yml`) |
|---|---|---|
| Imágenes | build local | `ghcr.io/$OWNER/mano-{backend,frontend}:latest` |
| Postgres | expuesto en `5433` (user/pass fijos) | interno, con healthcheck, credenciales de `.env` |
| Backend | `MOCK_MODE=true`, `8080` expuesto | `MOCK_MODE=false`, solo red interna |
| Proxy | `nginx.conf` :80 | `nginx.prod.conf` :80/:443 + certbot en el host |

---

## 3. Backend (Go)

### 3.1 Estructura

```
backend/
  main.go                      config → database.New (migrate + seed) → app.NewRouter → Run
  internal/app/router.go       TODAS las rutas
  internal/database/database.go  AutoMigrate (17 modelos) + seed de paquetes + seed de datos de prueba
  internal/models/models.go    modelos GORM
  internal/handlers/
    handlers.go                auth, negocios, productos, órdenes, stripe, stories, ads, paquetes, mapa, delivery (1342 líneas)
    handlers_wompi.go          pago Wompi, webhook, escrow, splits, referidos, retiros, vitrina
    handlers_business.go       plan Pro, disputas, activar/desactivar producto
    handlers_stats.go          dashboards negocio/freelancer, courier, perfil público, KYC apply
    handlers_admin.go          admin, PATCH negocio, delivery status, feed v2
    handlers_mock.go           simulación de pagos/escrow (solo MOCK_MODE)
  pkg/config/config.go         6 variables (el resto se lee con os.Getenv suelto)
  pkg/notifications/email.go   SMTP "fire and forget" al crear orden
```

Stack: Go 1.22, Gin 1.9, GORM 1.26 + pgx, JWT HS256 (`golang-jwt/v5`), bcrypt, `stripe-go v74`. **No usa Redis, ni colas, ni WebSockets, ni migraciones versionadas (solo `AutoMigrate`).**

### 3.2 Superficie de API (≈70 rutas, todas bajo `/api`)

| Grupo | Rutas | Auth |
|---|---|---|
| Salud | `GET /health` | — |
| Auth | `POST /auth/signup`, `POST /auth/signin` | — |
| Catálogo público | `GET /businesses`, `/businesses/:id`, `/businesses/:id/products`, `/products`, `/negocio/:slug`, `/vendedor/:username` | — (`/products` lee JWT opcional para productos exclusivos Pro) |
| Social/ads | `GET /feed`, `/stories`, `/ads`, `/packages`, `/recommendations` | — |
| Mapa | `GET /map/nearby` | — |
| Referidos | `GET /r/:slug` (registra click: GET con efecto secundario) | — |
| Compra guest | `POST /orders/guest`, `POST /payments/wompi/guest` | — |
| Tracking | `GET /deliveries/:id` | — (cualquiera con el ID) |
| Webhooks | `POST /webhooks/wompi`, `POST /webhooks/stripe` | firma del proveedor |
| Usuario | `GET /me`, `/me/businesses` | JWT |
| Negocio | `POST /businesses`, `PATCH /businesses/:id`, `POST /businesses/apply`, `POST /products`, `PATCH /products/:id`, `POST /ads`, `POST /packages/purchase`, `GET /dashboard`, `/dashboard/business/stats` | JWT + rol `business_owner` (validado dentro del handler) |
| Órdenes | `POST/GET /orders`, `GET /orders/courier`, `GET /orders/:id`, `POST /orders/:id/{confirm,dispute,pay}`, `POST /payments/wompi/initiate` | JWT |
| Comisionista | `POST /sell/affiliate`, `GET /sell/{links,referral-code,stats}`, `POST /sell/{withdraw,upgrade-pro}`, `GET /dashboard/freelancer` | JWT + rol `freelancer` |
| Social | `POST /stories`, `/payment-methods` (GET/POST), `POST /deliveries`, `PATCH /deliveries/:id/status` | JWT |
| Admin | `/admin/{businesses/pending,applications,businesses/approve/:id,businesses/reject/:id,disputes,disputes/resolve/:id,withdrawals,withdrawals/process/:id}` + `POST /admin/disputes/:id/resolve` | JWT + `admin` |
| Mock | `/mock/{status,wompi/approve,wompi/decline,escrow/release,escrow/auto-confirm,fraud/check,flow/full-sale,seed-admin}` | `MOCK_MODE=true` |

Las rutas de rol no se validan en el router sino **dentro de cada handler** (`claims.Role == ...`). Esto importa para el gateway: no puede autorizar por rol sin conocer esa lógica.

### 3.3 Modelo de datos (17 tablas)

`User`, `Business`, `BusinessApplication`, `Product`, `ReferralLink`, `ReferralClick`, `Order`, `OrderItem`, `CommissionSplit`, `WompiTransaction`, `WithdrawalRequest`, `Story`, `Advertisement`, `PaymentMethod`, `PaymentTransaction`, `AdvertisingPackage`, `Delivery`.

Reglas de negocio ya codificadas:
- Plataforma 4% fijo (`platformCommissionRate`, constante en código; la variable `PLATFORM_COMMISSION_RATE` del compose **no se lee**).
- Comisión del comisionista por producto, rango 10%–40%.
- Escrow propio en BD: `pending → held → released/refunded`; splits `business/freelancer/platform`.
- Anti-fraude: comprador con misma cédula que el comisionista ⇒ comisión anulada (solo en el flujo mock; ver 6).
- Bono $5.000 al referidor en la primera venta liberada del comisionista referido.
- Límite mensual de unidades por negocio, stock descontado al crear la orden.
- Plan Pro (30 días), disputas (`disputed` bloquea escrow), KYC manual (`BusinessApplication`).

### 3.4 Autenticación

JWT HS256, 72 h, claims `{user_id, role, email}`. Sin refresh token, sin revocación, sin logout en servidor. Roles: `customer`, `business_owner`, `freelancer` (signup) y `admin` (solo por seed/mock). El rol `courier` está en la doc pero **no existe** en `allowedRoles`.

---

## 4. Frontend web (Next.js 14, Pages Router)

```
web/
  pages/ (22)  index, signin, signup, profile, sell, dashboard, admin, feed, map, cart, checkout,
               orders, courier, advertise, apply, create-business, create-product,
               businesses/{index,[id]}, negocio/[slug], r/[slug], delivery/[id]
  components/Header.tsx
  lib/api.ts          helper fetch con JWT — definido pero NO usado por ninguna página
  public/branding/    7 JPEG de diseño (pantallas completas con botones invisibles encima)
```

Stack: React 18, Tailwind 3, Leaflet (mapa, OSM), `qrcode.react`, axios y `@stripe/*` **instalados pero sin usar en el código** (el checkout real es redirección a Wompi). TypeScript con `strict: false`.

### 4.1 Cómo se acopla hoy al backend

| Acoplamiento | Dónde | Por qué rompe iOS/Android o el aislamiento |
|---|---|---|
| `fetch(process.env.NEXT_PUBLIC_API_URL + '/…')` copiado en ~20 páginas | todas | No hay cliente único; cada página reimplementa headers, errores y tipos. |
| Tipos TypeScript redefinidos por página | todas | No hay contrato compartido. |
| JWT en `localStorage` + lectura directa con `atob(token.split('.')[1])` para saber el rol | `Header`, `admin`, `delivery/[id]` | Los móviles no tienen `localStorage`; además la UI decide por claims sin validar. |
| Mismo origen vía nginx (`/api`) | `.env`, compose, Dockerfile (`NEXT_PUBLIC_API_URL=/api`) | Cualquier cliente en otro origen necesita CORS, y el backend **no tiene CORS**. |
| `rewrites` de Next en `development` | `next.config.js` | Es un gateway de juguete dentro del frontend. |
| Carrito en `localStorage` (`mano_cart`) | cart, businesses/[id], negocio/[slug] | Lógica de dominio en el cliente web; los móviles la duplicarán. |
| APIs de navegador | `navigator.geolocation`, `navigator.clipboard`, `window.location.href` (redirect a Wompi), `prompt()` | Cada una necesita su equivalente nativo. |
| Redirect de pago | backend arma `redirect_url = APP_BASE_URL + "/orders"` e **ignora** el `redirect_url` que manda el cliente | En móvil el retorno del pago cae en la web, no en la app (salvo universal links). |
| Polling cada 15 s | `delivery/[id]` | No hay push ni stream. |

### 4.2 Endpoints que el web realmente consume vs. los que existen

Usados por el web: auth, businesses (+filtros), `/negocio/:slug`, `/r/:slug`, orders (+guest, +confirm, +courier), payments/wompi (+guest), deliveries, feed, packages(+purchase), `/me`, `/me/businesses`, `/sell/{links,referral-code,affiliate,withdraw}`, dashboards, admin (4 listados + acciones), products, `/businesses/apply`.

**Existen en el backend y el web no usa** (hay que decidir si entran al contrato de los móviles): `POST /stories`, `POST /ads`, `/payment-methods`, `POST /orders/:id/pay` (Stripe), `POST /orders/:id/dispute`, `PATCH /products/:id`, `PATCH /businesses/:id`, `/sell/upgrade-pro`, `/sell/stats`, `/vendedor/:username` (no hay página), `/recommendations`, `/map/nearby`, `PATCH /deliveries/:id/status` solo desde `delivery/[id]`.

---

## 5. CI/CD e infraestructura

`deploy.yml` (push a `main`): `test` (go build + `tsc --noEmit`) → `build` (2 imágenes a GHCR, `NEXT_PUBLIC_API_URL=/api`) → `deploy` (SSH a la VM, `git pull`, `docker compose up -d --no-deps` de backend y luego frontend).

Observaciones:
- **No se ejecuta ningún test** (`go test`, lint, ni test del web). Los 128 casos de `docs/tests` son `curl` manuales.
- Frontend y backend se despliegan juntos en el mismo workflow; no hay pipeline independiente por componente.
- El deploy usa `vars.AZURE_VM_PASSWORD` (**variable, no secret** ⇒ visible en la config del repo) mientras `DEPLOY.md` documenta `AZURE_SSH_KEY` como secret. Inconsistencia a corregir.
- El deploy no recrea el `proxy`: un cambio en `nginx.prod.conf` se hace `git pull` pero nginx no recarga.
- `setup-server.sh` hace `sed -i` sobre `nginx.prod.conf` dentro del repo clonado (deja el working tree sucio ⇒ choca con futuros `git pull`).
- Redis se despliega con contraseña pero ningún servicio lo consume.
- Documentación con deriva: `docs/README.md` aún describe Stripe, comisión 5% y precios en USD; el código usa Wompi, 4% y COP.

---

## 6. Hallazgos que afectan la regla "el backend no cambia"

Ordenados por severidad. **Ninguno se puede corregir desde un gateway** salvo donde se indica.

### Críticos (pagos / dinero)

1. [CORREGIDO 24-nov-2026] **Firma de integridad de Wompi incorrecta.** `generateWompiCheckout` calcula `HMAC-SHA256(secret, ref+monto+COP+secret)`. La documentación oficial de Wompi pide un **SHA256 simple** de `<Referencia><Monto><Moneda><SecretoIntegridad>`. Con HMAC el checkout probablemente rechaza la firma. *(Contrastado con docs.wompi.co.)*
2. **[CORREGIDO 24-nov-2026]** **Verificación del webhook de Wompi incompleta.** `verifyWompiSignature` concatena las propiedades + secreto pero **omite el `timestamp`** del evento, que Wompi exige en el checksum. Con `WOMPI_EVENTS_SECRET` configurado, los eventos legítimos fallan con 401 ⇒ **ninguna orden pasaría a `paid` en producción**. *(Contrastado con docs.wompi.co.)*
3. **[CORREGIDO 24-nov-2026]** **Webhook sin firma cuando el secreto está vacío.** *(Ahora, fuera de `MOCK_MODE`, el webhook responde 503 sin `WOMPI_EVENTS_SECRET`; con llave privada además confirma cada APPROVED contra la API de Wompi.)* Si `WOMPI_EVENTS_SECRET` no está definido, `WompiWebhook` acepta cualquier POST ⇒ cualquiera puede marcar una orden como pagada y disparar splits. En `docker-compose.prod.yml` un `.env` incompleto produce justo ese caso.
4. **El auto-confirm de 24 h no existe fuera de mock.** Solo `POST /mock/escrow/auto-confirm` libera órdenes vencidas; no hay cron/worker. En producción el escrow solo se libera si el comprador confirma o el admin resuelve una disputa. Los comisionistas/negocios podrían quedar sin cobrar indefinidamente.
5. **Publicidad y Plan Pro gratis.** `PurchasePackage` crea la transacción en `pending` y **activa el anuncio de inmediato**; `UpgradePro` activa Pro sin cobrar. Además `Advertisement.ExpiresAt` nunca se llena ⇒ los anuncios no expiran.
6. **[CORREGIDO 24-nov-2026]** **Datos de prueba en producción.** *(Ahora `SEED_DEMO_DATA` decide; sin definir solo se siembra con `MOCK_MODE=true`; `docker-compose.prod.yml` la fija en `false`. El primer administrador sale de `ADMIN_EMAIL`/`ADMIN_PASSWORD`.)* `database.New` ejecuta `seedTestData` siempre que `users` esté vacía, sin importar `MOCK_MODE`: crea `juan/carlos/maria@example.com` con contraseña `password123` en una BD de producción nueva.

### Altos

7. Anti-fraude (misma cédula) **solo vive en `MockFullFlow`**; el flujo real (`buildAndCreateOrder`) no lo aplica.
8. **La atribución del comisionista en compra guest se pierde.** `r/[slug].tsx` envía `referral_link_id`, pero `createOrderRequest` solo entiende `freelancer_id`; el campo se descarta, la orden sale sin comisionista y `ReferralLinkID`/conversiones nunca se enlazan. Es el flujo central del negocio ("el comisionista gana por su link").
9. Operaciones de dinero sin transacciones de BD: retiro (check de saldo y descuento no atómicos ⇒ doble retiro por concurrencia), creación de orden + descuento de stock, `handleWompiApproved`, `releaseEscrow`. Webhook no idempotente.
10. Ruta Stripe divergente: `CreateOrderPayment` cobra en **USD** ×100 y su webhook deja la orden en `completed` sin escrow ni splits (se salta el modelo de dinero).
11. `JWT_SECRET` tiene default `replace-this-secret` si falta la variable; el servicio arranca igual.
12. `GET /deliveries/:id` es público (enumerable por ID).
18. **~~Registro sin teléfono roto~~ RESUELTO el 24-nov-2026 (F4.13).** Descripción original:  `users.phone` tiene índice único y el valor vacío cuenta como duplicado: solo **un** usuario sin teléfono puede registrarse; el segundo recibe `400 "email already registered or invalid data"` aunque el email sea nuevo. El formulario web marca el teléfono como opcional. *(Reproducido y confirmado contra el backend local; `select count(*) from users where phone=''` = 1.)*
19. **Las stories creadas por la API nunca se ven.** `POST /stories` no asigna `expires_at` (queda `0001-01-01`), y `/feed` y `/stories` solo devuelven las que no expiraron: solo se muestra la story del seed, y esa desaparece a las 24 h. *(FEED-03)*
20. `GET /map/nearby` no filtra por `is_approved`: expone negocios no aprobados (`/businesses` sí filtra). *(GEO-01)*
21. Las listas vacías llegan como `null` en vez de `[]` (p. ej. `/map/nearby` → `"businesses": null`). El contrato debe declararlas *nullable* y los clientes Swift/Kotlin tolerarlo. *(GEO-02)*

### Medios

13. `CourierAvailableOrders` está abierto a cualquier usuario autenticado y `CreateDelivery` solo permite al cliente de la orden o `business_owner`; el flujo "repartidor acepta pedido" del web no puede funcionar para un rol que no existe.
14. KYC a medias: `ApplyBusiness` crea la solicitud pero ningún endpoint la aprueba o convierte en `Business`; `AdminRejectBusiness` no persiste el motivo y deja el negocio igual que "pendiente".
15. `PLATFORM_COMMISSION_RATE` y `AUTO_CONFIRM_HOURS` están en compose pero hardcodeados en código.
16. `Header.tsx` lee `payload.name` del JWT, que no lo trae ⇒ siempre usa la inicial del email.
17. Sin CORS, sin rate limiting, sin límites de body, `gin.Default()` en producción (logs con modo debug según `GIN_MODE`).

**Qué sí puede mitigar un gateway** (sin tocar el backend): bloquear `/api/mock/*` y `/api/admin/*` desde Internet pública, rate limit, CORS, límites de tamaño, restringir `/webhooks/*` al método POST y tamaño pequeño, ocultar `GET /deliveries/:id`/`/r/:slug` a bots, TLS. **Qué no**: los puntos 1–10 (requieren cambio de código).

---

## 7. Arquitectura objetivo: multi-frontend + API Gateway + backend congelado

### 7.1 Modelo de ejecución: qué corre dónde (lo más importante del refactor)

**Los frontends no son servicios del servidor.** Son *clientes* que se ejecutan en el dispositivo del usuario y consumen la API por Internet. Solo el web necesita hosting, y únicamente para *entregar* sus archivos al navegador.

| Cliente | Cómo llega al usuario | Dónde se ejecuta | ¿Corre en un contenedor/servidor? |
|---|---|---|---|
| **iOS** | Se publica en App Store (TestFlight para pruebas) y el usuario la instala | En el iPhone | **No** |
| **Android** | Se publica en Google Play y el usuario la instala | En el teléfono Android | **No** |
| **Web** | El navegador descarga HTML/JS/CSS desde `mano.app` | En el navegador del usuario | Solo **hosting de archivos** (ver 7.2) |

Cualquiera de los tres, una vez cargado/instalado, hace lo mismo: **peticiones HTTPS a `api.mano.app/v1`** cuando hay conexión. Todo lo que está detrás (gateway, backend, BD, pagos) es común.

Consecuencias de diseño:

1. **Las apps instaladas no se actualizan a la fuerza.** Habrá usuarios con versiones de hace meses (revisión de la tienda + el usuario decide cuándo actualizar). El API tiene que seguir funcionando para esas versiones ⇒ **el contrato solo puede crecer de forma aditiva** y los cambios incompatibles van a `/v2` con ambas versiones vivas. Esto es la razón de fondo para congelar el contrato.
2. **Hay que poder cortar versiones viejas** (por seguridad o por un bug grave) ⇒ el cliente debe identificarse con su versión y el gateway puede responder `426 Upgrade Required` (ver 7.3).
3. **Sin conexión:** la app instalada abre pero toda operación necesita red; el diseño móvil debe contemplar caché local de lectura y reintentos. El API no cambia por esto.
4. **Secretos:** nada sensible puede ir dentro de la app o del JS (cualquiera lo extrae). Las claves de Wompi privadas/secretos de integridad viven solo en el backend; el cliente recibe la firma ya calculada.

### 7.2 Principios

1. **Un solo contrato.** Los clientes dependen de `contract/openapi.yaml`, no del backend. El backend es una caja negra detrás del gateway.
2. **Los clientes solo conocen el gateway.** Ni web, ni iOS, ni Android saben que existe Go, Postgres ni Wompi.
3. **Contrato congelado, no necesariamente código congelado.** Se permiten correcciones que no cambian el contrato (los puntos 1–10 de la sección 6 son bugs, no cambios de contrato). Cambios de contrato → solo aditivos o nueva versión (`/v2`).
4. **Todo lo nuevo que piden los móviles va en servicios laterales ("edge services"), no en el backend.**
5. **Cada cliente se construye y se publica por separado**, cada uno por su canal: web → servidor de archivos; iOS → App Store; Android → Google Play.

### 7.2.1 Diagrama

```
 DISPOSITIVOS DEL USUARIO (aquí vive el frontend; no hay servidores de frontend)
 ┌────────────────┐   ┌────────────────┐   ┌──────────────────────────┐
 │ App iOS        │   │ App Android    │   │ Navegador                │
 │ instalada desde│   │ instalada desde│   │ carga el web desde       │
 │ App Store      │   │ Google Play    │   │ mano.app (hosting)       │
 └───────┬────────┘   └───────┬────────┘   └──────┬───────────┬───────┘
         │                    │                   │ (1) HTML/ │ (2) llamadas
         │                    │                   │  JS/CSS   │     a la API
         │                    │                   ▼           │
         │                    │        ┌────────────────┐     │
         │                    │        │ Hosting del web│     │  SERVIDOR (Azure)
         │                    │        │ archivos       │     │
         │                    │        │ estáticos/CDN  │     │
         │                    │        └────────────────┘     │
         └────────────────────┴───────────────┬───────────────┘
                 HTTPS  api.mano.app/v1/*     │   headers X-Mano-Client-*
                                      ┌───────▼────────┐
                                      │  API GATEWAY   │  TLS · CORS · rate limit · versionado /v1→/api
                                      │ (Kong/Traefik) │  identifica cliente · 426 si versión vieja
                                      └───┬────────┬───┘  allow-list · bloqueo /mock y /admin público
                              /v1/* legacy│        │ /v1/uploads · devices · stream
                                  ┌───────▼───┐  ┌─▼──────────────────────────────┐
                                  │ mano-core │  │ edge services                  │
                                  │ (Go, SIN  │  │  • auth-session (refresh token)│
                                  │  CAMBIOS) │  │  • uploads (URL prefirmada R2) │
                                  └─────┬─────┘  │  • push (FCM/APNs)             │
                                        │        │  • realtime tracking (SSE/WS)  │
                                  ┌─────▼─────┐  └──────────────┬─────────────────┘
                                  │ PostgreSQL│              ┌──▼───┐
                                  └───────────┘              │Redis │
                                                             └──────┘
 Externos: Wompi (cobros y webhooks), SMTP, FCM/APNs
```

Importante: **solo el navegador usa el hosting del web**. Las apps móviles nunca lo llaman (salvo para los archivos de *deep links*, ver 7.6). El hosting del web **no está en el camino de la API**.

#### Cómo se hostea el web

El web de hoy es 100 % renderizado en el cliente (no hay `getServerSideProps`/`getStaticProps`; todas las páginas hacen `fetch` desde el navegador). Opciones:

| Opción | Qué es | Pros | Contras |
|---|---|---|---|
| A. **Export estático** (`output: 'export'`) servido por nginx/Caddy en la VM, o Azure Static Web Apps / Blob + CDN | Solo archivos | Sin proceso Node en producción, barato, escala con CDN | Las rutas dinámicas (`/businesses/[id]`, `/negocio/[slug]`, `/r/[slug]`, `/delivery/[id]`) necesitan ajuste (query params o rewrite a un `index.html` con fallback). |
| B. **Next.js `standalone`** en un contenedor (como hoy) | Servidor Node | Cero cambios de rutas | Un proceso que mantener y no aporta nada: no se usa SSR. |

Recomendación: **A**. Es consistente con "el web es solo un cliente más".

### 7.2.2 Identificación del cliente: headers

El cliente declara quién es en **cada petición**. El gateway los usa para decidir; el backend actual los ignora (no los lee), lo cual es inocuo.

| Header | Quién lo envía | Valores / formato | Uso |
|---|---|---|---|
| `X-Mano-Client` | los 3 clientes | `web` \| `ios` \| `android` | Métricas por plataforma, rate limit por plataforma, políticas distintas (CORS solo aplica a `web`). |
| `X-Mano-Client-Version` | los 3 | semver, p. ej. `1.4.2` | Gateway responde `426 Upgrade Required` si es menor a la versión mínima soportada. |
| `X-Mano-Build` | móviles | número de build | Diagnóstico de bugs por build. |
| `X-Mano-Device-Id` | móviles (UUID generado en la instalación); web: UUID en `localStorage` | UUID | Rate limit por dispositivo, detección de abuso en endpoints guest. No es identidad del usuario. |
| `X-Request-Id` | cliente genera; si falta, lo crea el gateway | UUID | Trazabilidad extremo a extremo (cliente → gateway → core → logs). |
| `Accept-Language` | los 3 | `es-CO` | Futuro: mensajes localizados. |
| `Authorization` | tras login | `Bearer <jwt>` | Sin cambios: es lo que el backend ya entiende. |
| `Origin` | solo navegador (lo pone el navegador) | `https://mano.app` | Validación CORS en el gateway. Las apps nativas no lo envían. |

Reglas importantes:

- **Los headers de cliente son declarativos y falsificables.** Sirven para enrutar, medir y gestionar versiones, **nunca para autorizar**. Un atacante puede enviar `X-Mano-Client: ios`. La autorización sigue siendo el JWT y el rol que valida el backend.
- Si se necesita *probar* que la petición viene de una app legítima (p. ej. proteger `/orders/guest` de bots), eso se hace con **Apple App Attest / DeviceCheck** y **Google Play Integrity**: la app obtiene un token del sistema operativo que el gateway (o un edge service) valida. Es una mejora opcional, no sustituye al JWT.
- **El backend "entiende" el origen solo si lo cambiamos.** Como está congelado, hoy lo entiende el gateway: lee los headers, aplica la política y reenvía `X-Request-Id` (y opcionalmente `X-Mano-Client` para que aparezca en logs si algún día se habilita). Un caso concreto donde el backend *sí* necesitaría saber la plataforma: el `redirect_url` del pago de Wompi, que hoy fija a `APP_BASE_URL/orders` ignorando el que manda el cliente. Opciones: (a) cambio aditivo mínimo en el backend para respetar `redirect_url` o `X-Mano-Client`; (b) que el gateway reescriba el parámetro `redirect-url` de `checkout_url` en la respuesta (la firma de integridad de Wompi no incluye ese campo, así que es viable, pero requiere un plugin propio en el gateway); (c) universal links/app links sobre `https://mano.app/orders` para que el sistema abra la app. La opción (c) no requiere tocar nada y es la que asumo por defecto.

### 7.3 Qué hace el gateway (y qué no)

| Responsabilidad | Detalle |
|---|---|
| Versionado | `/v1/**` → reescribe a `/api/**`. Mantiene `/api/**` como alias mientras exista el web actual. El backend sigue sirviendo `/api` sin saberlo. |
| Allow-list | Solo se publican las rutas del contrato. Todo lo demás 404. `/api/mock/*` nunca se publica. `/api/admin/*` solo en `admin.mano.app` + restricción de IP/VPN. |
| CORS | Orígenes permitidos para el web; los móviles nativos no usan CORS. (Hoy el backend no lo implementa.) |
| Identificación de cliente | Lee `X-Mano-Client`, `X-Mano-Client-Version`, `X-Mano-Device-Id` (ver 7.2.2); rechaza con `426` versiones por debajo del mínimo; genera `X-Request-Id` si falta; etiqueta métricas y límites por plataforma. Son datos declarativos: no sustituyen al JWT. |
| Rate limit | Estricto en `/auth/*`, `/orders/guest`, `/payments/*/guest`, `/r/:slug`; moderado en el resto; sin límite por usuario en webhooks pero con límite por IP/tamaño. |
| Auth | Pre-validación de JWT (firma/expiración) en rutas no públicas para descartar tráfico basura; **la autorización por rol sigue en el backend**. |
| Observabilidad | `X-Request-Id`, access log JSON, métricas (latencia por ruta). |
| Webhooks | Ruta separada sin CORS, solo `POST`, body ≤ 64 KB, sin rate limit por usuario. |
| No puede | Arreglar firmas Wompi, auto-confirm, seed, atomicidad, atribución guest (sección 6). Tampoco homogeneizar respuestas inconsistentes (ver 7.5) sin reescribir cuerpos. |

**Elección recomendada: Kong OSS en modo DB-less** (config declarativa en YAML en el repo; plugins `cors`, `rate-limiting`, `request-termination`, `ip-restriction`, `jwt`/`request-transformer`, `prometheus`). Alternativa más liviana: **Traefik** (middlewares equivalentes, menor consumo). **Mantener nginx puro** es viable para la fase 1 (solo path routing + CORS + limit_req) pero escala peor en plugins/observabilidad. La VM B2s de 4 GB soporta cualquiera de los tres. Si en el futuro se migra a gestionado, Azure API Management es la opción natural dado que ya hay Azure.

### 7.4 Ruteo propuesto

| Host | Para qué | Destino |
|---|---|---|
| `mano.app` | **Solo entrega de archivos del web** y los archivos de deep links (`apple-app-site-association`, `assetlinks.json`). Fuera del camino de la API. | hosting estático (VM/CDN) |
| `api.mano.app` | API pública para web + iOS + Android | gateway → core / edge |
| `admin.mano.app` | Panel admin (restringido) | gateway → core `/api/admin/*` + web admin |

Paths en `api.mano.app`:

| Path público | Destino | Notas |
|---|---|---|
| `/v1/auth/*` | edge `auth-session` (fase 2) o core `/api/auth/*` (fase 1) | refresh tokens para móvil |
| `/v1/**` (catálogo, órdenes, sell, dashboard, etc.) | core `/api/**` | rewrite |
| `/v1/webhooks/*` | core `/api/webhooks/*` | solo proveedor de pagos |
| `/v1/uploads/*` | edge `uploads` | nuevo |
| `/v1/devices/*` | edge `push` | registro de tokens FCM/APNs |
| `/v1/deliveries/:id/stream` | edge `realtime` | SSE; el core sigue ofreciendo el GET |
| `/v1/mock/*` | **no existe** | solo en entornos locales |

### 7.5 Contrato

- Escribir `contract/openapi.yaml` a partir de `router.go` + handlers (≈70 rutas; empezar por las ~45 que usan los clientes). Es ingeniería inversa: el backend es la fuente de verdad *hoy*; una vez publicado, **el YAML pasa a ser la fuente de verdad**.
- Tests de contrato en CI contra el backend levantado (Schemathesis o Dredd): si el backend se desvía del YAML, falla el build.
- Inconsistencias que el contrato debe documentar tal cual (no se "arreglan"): respuestas envueltas (`{businesses:[…]}`) vs. objeto directo (`POST /orders` devuelve la orden sin envolver, `GET /orders/:id` la envuelve en `{order}`); errores siempre `{error: string}`; montos en COP como `float64`; campos snake_case; fechas ISO-8601.
- **Anti-corruption layer en cada cliente**: un mapper por recurso convierte el JSON del contrato al modelo de UI. Así las rarezas del backend no se filtran a las pantallas.
- **Generación de clientes** desde el YAML con `openapi-generator`/equivalentes: TypeScript (web), Swift (iOS), Kotlin (Android). Reemplaza el `fetch` copiado en 20 páginas.

### 7.6 Lo que los móviles necesitan y el backend no tiene (⇒ edge services)

| Necesidad | Hoy | Solución sin tocar el backend |
|---|---|---|
| Sesión larga | JWT 72 h, sin refresh | `auth-session`: envuelve `/auth/signin`, guarda refresh token rotativo en Redis, entrega JWT corto al cliente. Valida contra el mismo `JWT_SECRET` o re-emite llamando al backend. |
| Fotos | solo `image_url` string | `uploads`: URL prefirmada a Cloudflare R2; el cliente sube y luego manda la URL a los endpoints existentes. |
| Push | no existe | `push`: registro de device token + envío FCM/APNs; se alimenta del webhook de pagos o de un poller/outbox. |
| Tracking en vivo | polling 15 s | `realtime`: SSE/WebSocket que consulta `GET /deliveries/:id`. |
| Deep links `/r/:slug`, retorno de pago | redirect fijo a `/orders` | `apple-app-site-association` y `assetlinks.json` en `mano.app`; la app captura `https://mano.app/r/*` y `/orders*`. |
| Auto-confirm 24 h | no existe | Job externo (cron) que llame a un endpoint existente — **hoy no hay uno no-mock**; ver decisión pendiente D2. |

### 7.7 Qué debe cambiar en el web para quedar "aislado"

1. Reemplazar los `fetch` por el cliente generado + una capa `AuthStore` (interfaz) con implementación `localStorage`/cookie en web.
2. Eliminar `rewrites` de `next.config.js` y la dependencia del mismo origen: el web llama a `https://api.mano.app/v1`.
3. Mover carrito y reglas (un solo negocio por carrito) a un módulo de dominio compartible (TS) y definir cómo se replica en móvil.
4. Eliminar dependencias muertas (`axios`, `@stripe/*`) y `strict:false`.
5. Pipeline propio: build estático y publicación a hosting de archivos, independiente del backend (deja de existir la imagen Docker `mano-frontend` y el paso de deploy que la reinicia).
6. Pantallas hechas con JPEG + botones invisibles (`index`, `signup`, `profile`): no son portables a nativo; hay que rediseñarlas como componentes reales antes o durante el port a iOS/Android.
7. Enviar en cada petición `X-Mano-Client: web`, `X-Mano-Client-Version` y `X-Mano-Device-Id` (ver 7.2.2).

### 7.8 Estructura de repo propuesta

```
mano/
  services/core/          ← el backend actual, movido tal cual (sin cambios de código)
  services/edge-*/        ← auth-session, uploads, push, realtime (fase 2+)
  contract/openapi.yaml   ← fuente de verdad + clientes generados (ts/swift/kotlin)
  gateway/                ← kong.yml / traefik, TLS, allow-list, rate limits
  apps/web/               ← Next.js actual → se publica como archivos estáticos (único cliente que se hostea)
  apps/ios/               ← nuevo → artefacto .ipa → TestFlight / App Store (no se despliega en servidores)
  apps/android/           ← nuevo → artefacto .aab → Google Play (no se despliega en servidores)
  infra/                  ← compose, scripts, IaC
  .github/workflows/      ← un workflow por componente (paths filter)
```

### 7.9 Fases

| Fase | Entregable | Riesgo | Toca backend |
|---|---|---|---|
| 0 | `openapi.yaml` + tests de contrato en CI + corregir CI (go test/vet) | bajo | No |
| 1 | Gateway delante del core con allow-list, CORS, rate limit, `/v1`→`/api`; `api.mano.app` con TLS; alias `/api` para el web actual | bajo | No |
| 2 | Web consume cliente generado contra `api.mano.app/v1`, envía headers de cliente y se publica como estático | medio | No |
| 3 | Edge services: `auth-session`, `uploads` (los móviles los necesitan primero) | medio | No |
| 4 | App iOS y Android sobre el contrato (+ `push`, deep links); publicación vía TestFlight/Play (revisión de tienda: contar días de espera) | medio-alto | No |
| 5 | `realtime`, observabilidad, endurecimiento | bajo | No |
| Transversal | Corrección de los hallazgos 1–10 de la sección 6 | **alto si no se hace** | **Sí (sin cambiar contrato)** |

---

## 8. Decisiones abiertas (necesito tu respuesta antes de implementar)

- **D1 ✅ DECIDIDA (23-nov-2026): contrato congelado, código corregible.** Original: ¿"Backend inmutable" = contrato o código? Recomiendo *contrato*. Con "código" congelado, los hallazgos 1–6 hacen que los pagos reales no funcionen o sean forjables y no hay forma de resolverlo desde fuera.
- **D2. Auto-confirm de 24 h**: ¿lo resolvemos con un cambio mínimo en el backend (worker interno) o con un job externo? Un job externo hoy no tiene endpoint no-mock al cual llamar.
- **D3. Móvil**: ¿nativo (Swift + Kotlin, clientes generados) o React Native/Expo (la doc previa lo elegía; reutiliza el cliente TS y el dominio del web)? Nativo da mejor fidelidad y más trabajo; RN reduce a un código móvil.
- **D4. Gateway**: Kong DB-less (recomendado), Traefik o nginx extendido.
- **D5. Dominios**: ¿`api.mano.app` y `admin.mano.app` son aceptables o prefieres todo bajo un host con paths?
- **D6 ✅ DECIDIDA (23-nov-2026): se programa.** Se añadieron `courier` (Domiciliario) y `service_provider` (Prestación de servicios), aditivos. Original: ¿Rol `courier`: se agrega al contrato (implica backend) o se difiere?
- **D7. Alcance del contrato v1**: ¿solo las rutas que usa el web hoy o también las que existen sin UI (stories, ads, disputas, Pro, payment-methods)?
- **D8. Hosting del web**: ¿export estático (recomendado; hay que ajustar las 4 rutas dinámicas) o Next.js `standalone` en contenedor como hoy? ¿En la VM de Azure con nginx o en Azure Static Web Apps / CDN?
- **D9. Headers de cliente**: ¿te sirven los nombres `X-Mano-Client`, `X-Mano-Client-Version`, `X-Mano-Device-Id`? ¿Con qué política de versión mínima (cuántas versiones atrás se soportan antes de responder `426`)?


## Anexo — Cambios de arquitectura del 24-nov-2026 (pagos y despliegue)

Aditivos al contrato (3 rutas nuevas: `GET /payments`, `GET /payments/{reference}`, `POST /payments/wompi/sync`; ninguna ruta ni campo existente cambió).

- **Un solo punto aplica los pagos** (`applyWompiTransaction`): lo usan el webhook, la sincronización al volver del checkout y el conciliador. Hace todo en una transacción de BD con bloqueo de fila, es idempotente, valida monto y moneda y deja una bitácora (`wompi_events`, sin datos personales).
- **Verificación servidor↔Wompi:** un APPROVED anunciado por webhook solo cuenta si la API de Wompi (llave privada, TLS) lo confirma. Si Wompi no responde, el webhook devuelve 503 y Wompi reintenta.
- **Conciliador** (goroutine, cada 2 min, solo con llave privada): revisa los pagos PENDING de las últimas 48 h. Un webhook perdido ya no deja una orden pagada como pendiente.
- **Historial de pagos** mapeado a pedidos (`/pagos` en el web): el comprador ve los suyos; el dueño de negocio ve los recibidos, sin datos del pagador.
- **Arranque seguro:** fuera de `MOCK_MODE` el backend no arranca con `JWT_SECRET` ausente, por defecto o menor de 32 caracteres.
- **Despliegue:** `deploy.yml` solo manual y con confirmación escrita; imágenes etiquetadas con el SHA del commit; respaldo de BD antes de desplegar; chequeo de salud y reversión automática; `nginx.prod.conf` es una plantilla (`${DOMAIN}`) con límite de intentos en `/api/auth/` y más cabeceras de seguridad.
- **Sigue siendo el monolito detrás de nginx.** El gateway, los servicios laterales y las apps móviles de la arquitectura objetivo (`architecture.html`) **no existen todavía**: ver `MIGRATION_PLAN.md` §"Avance real".
