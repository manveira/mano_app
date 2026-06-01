# Tests — Sprint 1D: Órdenes, Feed y Dashboard

Cubre el ciclo de vida de órdenes, contenido social y métricas del negocio.

**Base URL:** `http://localhost/api`

---

## Setup

```bash
TOKEN_OWNER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')

TOKEN_CUSTOMER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')

TOKEN_FREELANCER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')
```

---

## ORD-01 — Crear orden válida con múltiples items

```bash
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "business_id": 1,
    "items": [
      {"product_id": 1, "quantity": 2},
      {"product_id": 2, "quantity": 1}
    ]
  }' | jq '{id, total_amount, commission, status, payment_status, escrow_status}'
```

**Esperado:** `201`
```json
{
  "total_amount": 14500,
  "commission": 580,
  "status": "pending_payment",
  "payment_status": "pending",
  "escrow_status": "pending"
}
```

**Verificar:** total = (4500×2) + 5500 = **14500**, commission = 14500×0.04 = **580**

---

## ORD-02 — Orden incluye items con nombre del producto

```bash
ORDER_ID=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":2,"items":[{"product_id":4,"quantity":1}]}' | jq -r '.id')

curl -s http://localhost/api/orders/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  | jq '.order.items[0].product.name'
```

**Esperado:** `"Hamaca Artesanal"` (no null, no vacío)

---

## ORD-03 — Listar órdenes como customer solo muestra las suyas

```bash
curl -s http://localhost/api/orders \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq '.orders | map(.customer_id) | unique'
```

**Esperado:** Solo el ID de carlos en el array.

---

## ORD-04 — Listar órdenes como business_owner muestra las de sus negocios

```bash
curl -s http://localhost/api/orders \
  -H "Authorization: Bearer $TOKEN_OWNER" | jq '.orders | map(.business_id) | unique'
```

**Esperado:** Solo IDs 1 y 2 (los negocios de juan).

---

## ORD-05 — Customer no puede ver orden de otro customer

```bash
# La orden 1 del seed es de carlos. María intenta verla.
curl -s http://localhost/api/orders/1 \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq
```

**Esperado:** `403` — "you don't have permission to view this order"

---

## ORD-06 — Owner puede ver órdenes de sus negocios

```bash
# La orden 1 es del negocio 1 (de juan)
curl -s http://localhost/api/orders/1 \
  -H "Authorization: Bearer $TOKEN_OWNER" | jq '.order.id'
```

**Esperado:** `200` — devuelve la orden.

---

## ORD-07 — Orden sin items es rechazada

```bash
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[]}' | jq
```

**Esperado:** `400` — error de validación.

---

## ORD-08 — Orden con quantity=0 es rechazada

```bash
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":0}]}' | jq
```

**Esperado:** `400` — error de validación `gt=0`.

---

## ORD-09 — Comisión del freelancer se calcula correctamente

```bash
# Hamaca $120.000 con 20% de comisión
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "business_id": 2,
    "freelancer_id": 3,
    "items": [{"product_id": 4, "quantity": 1}]
  }' | jq '{total_amount, commission, freelancer_commission}'
```

**Esperado:**
```json
{
  "total_amount": 120000,
  "commission": 4800,
  "freelancer_commission": 24000
}
```

---

## FEED-01 — Feed público devuelve stories y anuncios

```bash
curl -s http://localhost/api/feed | jq '{
  stories: (.stories | length),
  advertisements: (.advertisements | length)
}'
```

**Esperado:** `200` — al menos 1 story (del seed), 0 o más anuncios.

---

## FEED-02 — Story del seed tiene expiración

```bash
curl -s http://localhost/api/stories | jq '.stories[0] | {title, expires_at}'
```

**Esperado:** `expires_at` es una fecha futura (24h después de la creación).

---

## FEED-03 — Crear story autenticado

```bash
curl -s -X POST http://localhost/api/stories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "title": "Nueva colección de hamacas",
    "content": "Llegaron 10 hamacas nuevas con diseños exclusivos del Pacífico",
    "media_url": "https://example.com/hamaca.jpg"
  }' | jq '{id, title, expires_at}'
```

**Esperado:** `201` — story con `expires_at` 24h en el futuro.

---

## FEED-04 — Crear story sin token

```bash
curl -s -X POST http://localhost/api/stories \
  -H "Content-Type: application/json" \
  -d '{"title":"X","content":"X"}' | jq
```

**Esperado:** `401`

---

## FEED-05 — Anuncios activos aparecen en el feed

```bash
# Crear anuncio
curl -s -X POST http://localhost/api/ads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 1,
    "title": "Café especial de temporada",
    "description": "Granos de Colombia recién llegados",
    "package_type": "Paquete básico",
    "active": true
  }' | jq '.id'

# Verificar que aparece en el feed
curl -s http://localhost/api/feed | jq '.advertisements | length'
# Esperado: ≥ 1
```

---

## FEED-06 — Solo business_owner puede crear anuncios

```bash
curl -s -X POST http://localhost/api/ads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"title":"X","description":"X","package_type":"básico","active":true}' | jq
```

**Esperado:** `403`

---

## FEED-07 — Recomendaciones con ubicación

```bash
curl -s "http://localhost/api/recommendations?latitude=1.7989&longitude=-78.7628" | jq '{
  ads: (.recommendations.advertisements | length),
  businesses: (.recommendations.local_businesses | length)
}'
```

**Esperado:** `200` — negocios cercanos a Tumaco.

---

## DASH-01 — Dashboard muestra stats correctas

```bash
curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN_OWNER" | jq '.dashboard'
```

**Esperado:** Array con stats por negocio:
```json
[
  { "business_id": 1, "name": "Café La Esquina", "orders": N, "revenue": N },
  { "business_id": 2, "name": "Artesanías Casa Nariño", "orders": N, "revenue": N }
]
```

---

## DASH-02 — Dashboard solo para business_owner

```bash
curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq
# Esperado: 403

curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq
# Esperado: 403
```

---

## DASH-03 — Revenue aumenta después de una venta completada

```bash
# Revenue antes
REV_ANTES=$(curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  | jq '.dashboard[] | select(.business_id==1) | .revenue')
echo "Revenue antes: $REV_ANTES"

# Ejecutar venta completa en negocio 1
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id":1,"quantity":2}' > /dev/null

# Revenue después
REV_DESPUES=$(curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  | jq '.dashboard[] | select(.business_id==1) | .revenue')
echo "Revenue después: $REV_DESPUES"
# Esperado: REV_ANTES + 9000 (Espresso Doble x2)
```

---

## PACK-01 — Listar paquetes publicitarios

```bash
curl -s http://localhost/api/packages | jq '.packages'
```

**Esperado:** 3 paquetes activos:
```json
[
  { "name": "Paquete básico",    "price": 29990, "duration_days": 7  },
  { "name": "Paquete premium",   "price": 69990, "duration_days": 14 },
  { "name": "Paquete destacado", "price": 129990, "duration_days": 30 }
]
```

---

## PACK-02 — Comprar paquete como business_owner

```bash
curl -s -X POST http://localhost/api/packages/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"business_id": 1, "package_id": 1}' | jq '{transaction: .transaction.status, ad: .advertisement.active}'
```

**Esperado:** `201` — `{ "transaction": "pending", "ad": true }`

---

## PACK-03 — Customer no puede comprar paquetes

```bash
curl -s -X POST http://localhost/api/packages/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"package_id":1}' | jq
```

**Esperado:** `403`

---

## DELIV-01 — Crear delivery para orden propia

```bash
ORDER_D=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/deliveries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d "{\"order_id\": $ORDER_D, \"eta\": \"2026-06-01T15:00:00Z\", \"tracking\": \"TRK-001\"}" | jq
```

**Esperado:** `201` — delivery con `status: "scheduled"`.

---

## DELIV-02 — Delivery aparece en el detalle de la orden

```bash
curl -s http://localhost/api/orders/$ORDER_D \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  | jq '.order.delivery'
```

**Esperado:** Objeto delivery con `status`, `eta`, `tracking`.
