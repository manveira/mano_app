# GAPS.md — Gaps pendientes de implementación

Gaps identificados al comparar el documento de lógica de negocio contra el estado actual del código.
Ordenados por impacto en el modelo de negocio.

---

## GAP 1 — Comprador puede comprar sin registrarse 🔴 CRÍTICO

**Qué dice el documento:**
> "Cuando encuentra algo y compra, en ese momento sí le pide nombre, celular y Nequi o tarjeta. Nada más."
> "Cualquier persona puede entrar a mano.app sin registrarse y explorar."

**Estado actual:**
`POST /api/orders` requiere JWT. El comprador debe crear una cuenta completa antes de poder comprar. Esto rompe el flujo del turista o comprador que llega por un link de WhatsApp.

**Lo que hay que hacer:**
- Permitir crear una orden como "guest" enviando `{name, phone, nequi_number}` en el body sin JWT.
- Crear un usuario temporal o guardar los datos del comprador en la orden directamente.
- El link de pago Wompi se genera igual. Al confirmar el pago, la orden queda asociada al número de celular.
- En el frontend: cuando alguien llega por `/r/:slug`, mostrar el producto y un formulario mínimo (nombre + celular + Nequi) antes del pago, sin obligar a crear cuenta.

**Archivos a modificar:**
- `backend/internal/handlers/handlers.go` → `CreateOrder` acepta guest
- `backend/internal/models/models.go` → `Order` con campos `GuestName`, `GuestPhone`
- `web/pages/r/[slug].tsx` → nueva página de producto con compra guest

---

## GAP 2 — Bono de $5.000 por reclutar comisionistas 🟡 IMPORTANTE

**Qué dice el documento:**
> "por cada comisionista nuevo que traigan, ganan un bono de $5.000"

**Estado actual:**
No existe ningún sistema de referidos entre comisionistas. Un comisionista no puede invitar a otro y ganar un bono.

**Lo que hay que hacer:**
- Agregar campo `referred_by` (user_id) en el modelo `User`.
- Al registrarse, el comisionista puede incluir un código de referido.
- Cuando el nuevo comisionista hace su primera venta, acreditar $5.000 al que lo invitó.
- Endpoint `GET /sell/referral-code` → devuelve el código único del comisionista para compartir.
- Endpoint `POST /auth/signup` acepta `referral_code` opcional.

**Archivos a modificar:**
- `backend/internal/models/models.go` → `User` con `ReferredBy *uint`, `ReferralCode string`
- `backend/internal/handlers/handlers.go` → `SignUp` procesa `referral_code`
- `backend/internal/handlers/handlers_wompi.go` → `releaseEscrow` acredita bono al referidor
- `web/pages/sell.tsx` → mostrar código de referido y stats de referidos

---

## GAP 3 — Notificaciones al negocio cuando llega una orden 🟡 IMPORTANTE

**Qué dice el documento:**
> "MANO notifica al negocio por la app y por WhatsApp"
> "el repartidor tiene la app de MANO en modo mensajero. Cuando sale un pedido nuevo en su zona le llega una notificación"

**Estado actual:**
No hay FCM, email ni WhatsApp. El negocio y el repartidor no se enteran de nuevas órdenes a menos que entren manualmente a la app.

**Lo que hay que hacer:**
- **Fase 1 (inmediata):** Email básico con SendGrid o Resend cuando se crea una orden. Sin configuración compleja.
- **Fase 2:** Firebase Cloud Messaging (FCM) para push notifications en la app móvil.
- **Fase 3:** WhatsApp Business API (Twilio o Meta) para notificaciones por WhatsApp.

**Archivos a modificar:**
- `backend/internal/handlers/handlers.go` → `CreateOrder` dispara notificación
- `backend/pkg/notifications/` → nuevo paquete con interfaz `Notifier`
- Variables de entorno: `SENDGRID_API_KEY`, `FROM_EMAIL`

---

## GAP 4 — Tracking en tiempo real (WebSocket) 🟢 MEJORA

**Qué dice el documento:**
> "el comprador ve el estado en tiempo real"

**Estado actual:**
El comprador puede ver el estado del delivery en `/delivery/:id` pero tiene que recargar la página manualmente. No hay actualización automática.

**Lo que hay que hacer:**
- WebSocket en Go: cuando el negocio actualiza el estado del delivery, el servidor hace push al cliente.
- En el frontend: `useEffect` con `EventSource` (SSE) o WebSocket para polling automático cada 10s como mínimo viable.
- Alternativa simple sin WebSocket: polling cada 15s en `/delivery/:id` con `setInterval`.

**Archivos a modificar:**
- `web/pages/delivery/[id].tsx` → agregar polling automático cada 15s
- `backend/internal/app/router.go` → agregar `GET /deliveries/:id/stream` (SSE) cuando se necesite

---

## GAP 5 — Regla de máximo unidades/mes por negocio 🟢 MEJORA

**Qué dice el documento:**
> "El negocio también puede poner reglas: máximo 50 unidades al mes"

**Estado actual:**
Solo se valida stock disponible. No hay límite mensual configurable por negocio.

**Lo que hay que hacer:**
- Agregar campo `monthly_limit` en `Business` (0 = sin límite).
- En `CreateOrder`, verificar cuántas unidades se han vendido en el mes actual para ese negocio.
- En el frontend de `create-business.tsx`, agregar campo opcional de límite mensual.

**Archivos a modificar:**
- `backend/internal/models/models.go` → `Business` con `MonthlyLimit int`
- `backend/internal/handlers/handlers.go` → `CreateOrder` valida límite mensual
- `web/pages/create-business.tsx` → campo `monthly_limit`

---

## Orden de ataque recomendado

```
1. GAP 1 — Compra sin registro    (rompe el flujo principal del turista)
2. GAP 3 — Notificaciones email   (el negocio no sabe que tiene pedidos)
3. GAP 2 — Bono de referidos      (motor de crecimiento viral)
4. GAP 4 — Polling automático     (mejora UX del tracking, 1 hora de trabajo)
5. GAP 5 — Límite mensual         (regla de negocio, bajo impacto inicial)
```
