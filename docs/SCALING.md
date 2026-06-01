# SCALING.md — Guía de Escalabilidad de Mano App

Documento de referencia para cuando llegue el momento de escalar.
No implementar antes de tener señales reales de carga.

---

## Principio rector

> No separes hasta que el dolor sea real y medible.
> Los microservicios prematuros son el error más caro en una startup.

---

## Estado actual (correcto para este momento)

```
mano-backend   → Go monolito (un solo binario)
mano-web       → Next.js PWA
postgres       → Una sola BD
```

El monolito actual ya está estructurado por dominio en archivos separados. Eso es suficiente hasta los primeros 10.000 usuarios activos.

---

## Paso 1 — Refactorizar el monolito por dominio (hacer cuando duela)

Costo: 2-3 días. No requiere cambiar infraestructura.

```
backend/internal/
  domain/
    orders/      handlers + service + repository
    payments/    Wompi, escrow, splits
    users/       auth, profiles, KYC
    catalog/     businesses, products
    social/      feed, stories, ads
    delivery/    estados, tracking
    referrals/   links, clicks, comisiones
```

Cada dominio expone una interfaz de servicio. Los handlers solo llaman al servicio, nunca a la BD directamente.

---

## Paso 2 — Bus de eventos interno (hacer antes de separar servicios)

Introduce un bus de eventos en memoria. Cuando se separen servicios, se reemplaza por Kafka o SQS sin cambiar el código de negocio.

```go
// Publicar evento
eventBus.Publish("order.paid", OrderPaidEvent{OrderID: order.ID, Amount: order.TotalAmount})

// Suscriptores independientes
eventBus.Subscribe("order.paid", payments.HandleOrderPaid)    // distribuye dinero
eventBus.Subscribe("order.paid", notifications.NotifyBusiness) // FCM al negocio
eventBus.Subscribe("order.paid", analytics.TrackRevenue)       // actualiza stats
```

---

## Paso 3 — Interfaz de pagos (hacer antes de agregar MercadoPago o PSE)

```go
type PaymentProvider interface {
    InitiatePayment(amount int64, reference string, redirectURL string) (*PaymentIntent, error)
    VerifyWebhook(payload []byte, signature string) (bool, error)
    Refund(transactionID string) error
}

// Implementaciones intercambiables:
// WompiProvider    → Colombia (Nequi, PSE, tarjetas)
// StripeProvider   → turistas, tarjetas internacionales
// MercadoPagoProvider → expansión LATAM
```

---

## Paso 4 — Monorepo frontend (hacer al iniciar mobile)

```
mano-frontend/
  packages/
    api/      llamadas al backend + tipos TypeScript compartidos
    utils/    formateo de precios COP, fechas, slugs
    ui/       componentes compartidos (Button, Card, etc.)
  apps/
    web/      Next.js (actual)
    mobile/   React Native + Expo
```

---

## Cuándo separar cada servicio

| Señal de alerta | Qué separar | Stack sugerido |
|-----------------|-------------|----------------|
| Pagos bloquean otras requests | `mano-payments` async | Go + Redis queues |
| Notificaciones fallan y afectan órdenes | `mano-notifications` | Go + FCM + SendGrid |
| Búsquedas lentas con 10k+ negocios | `mano-search` | Elasticsearch |
| Dashboard tarda 10s+ | `mano-analytics` | ClickHouse o BigQuery |
| 2+ equipos trabajando en paralelo | Separar por equipo | Según el equipo |

---

## Arquitectura objetivo (cuando haya tracción real)

```
                    ┌─────────────────┐
                    │   API Gateway   │  nginx / Kong
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
   ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼──────┐
   │  mano-core  │   │mano-payments │   │mano-notifs  │
   │  órdenes    │   │  Wompi       │   │  FCM        │
   │  usuarios   │   │  escrow      │   │  email      │
   │  negocios   │   │  splits      │   │  WhatsApp   │
   └──────┬──────┘   └──────────────┘   └─────────────┘
          │
   ┌──────▼──────┐   ┌──────────────┐
   │  PostgreSQL │   │  Redis       │
   │  (primaria) │   │  (cache +    │
   └─────────────┘   │   queues)    │
                     └──────────────┘

Frontend:
   mano-web (Next.js PWA)  ←→  API Gateway
   mano-mobile (RN+Expo)   ←→  API Gateway
```

---

## Infraestructura para producción (cuando haya usuarios reales)

| Componente | Opción económica | Opción robusta |
|------------|-----------------|----------------|
| Backend | Railway / Render | AWS ECS / GCP Cloud Run |
| BD | Supabase (PostgreSQL) | AWS RDS Multi-AZ |
| Cache | Upstash Redis | AWS ElastiCache |
| Storage imágenes | Cloudflare R2 | AWS S3 + CloudFront |
| Monitoreo | Sentry (gratis) | Datadog |
| Logs | Logtail | AWS CloudWatch |
| CI/CD | GitHub Actions | GitHub Actions + ArgoCD |

---

## Señales para empezar a escalar

No escalar por anticipación. Escalar cuando:

- **Latencia p99 > 500ms** en endpoints críticos (crear orden, pagar)
- **CPU del backend > 70%** de forma sostenida
- **BD con > 1M filas** en tablas de órdenes o clicks
- **2+ desarrolladores** trabajando en el mismo archivo frecuentemente
- **Downtime por deploy** afecta ventas reales

Hasta entonces, optimizar el monolito (índices en BD, caché de Redis, queries N+1) es 10x más barato que separar servicios.
