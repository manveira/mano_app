# Tests — Sprint Tests2: Gaps cerrados

Cubre: signup con datos de identidad, panel admin, delivery estados, feed filtrado, boost publicidad.

**Base URL:** `http://localhost/api`  
**Requiere:** `MOCK_MODE=true`

---

## Setup global

```bash
BASE=http://localhost/api

# Crear admin (solo mock mode)
ADMIN_TOKEN=$(curl -s -X POST $BASE/mock/seed-admin | jq -r '.token')

TOKEN_O=$(curl -s -X POST $BASE/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')

TOKEN_C=$(curl -s -X POST $BASE/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')

TOKEN_F=$(curl -s -X POST $BASE/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')
```

---

## SIGNUP-01 — Registro con phone, document_id y nequi_number

```bash
curl -s -X POST $BASE/auth/signup -H "Content-Type: application/json" -d '{
  "name": "Pedro Comisionista",
  "email": "pedro@test.com",
  "password": "password123",
  "role": "freelancer",
  "phone": "3001119999",
  "document_id": "99887766",
  "nequi_number": "3001119999"
}' | jq '{id, role}'
```

**Esperado:** `201` — `{id: N, role: "freelancer"}`

---

## SIGNUP-02 — Phone duplicado es rechazado

```bash
# Segundo registro con el mismo teléfono
curl -s -X POST $BASE/auth/signup -H "Content-Type: application/json" -d '{
  "name": "Clon",
  "email": "clon@test.com",
  "password": "password123",
  "role": "customer",
  "phone": "3001119999"
}' | jq '.error'
```

**Esperado:** `"phone number already registered"`

---

## SIGNUP-03 — Username se genera automáticamente del nombre

```bash
curl -s -X POST $BASE/auth/signup -H "Content-Type: application/json" -d '{
  "name": "Ana Torres",
  "email": "ana@test.com",
  "password": "password123",
  "role": "customer"
}' > /dev/null

TOKEN_ANA=$(curl -s -X POST $BASE/auth/signin -H "Content-Type: application/json" \
  -d '{"email":"ana@test.com","password":"password123"}' | jq -r '.token')

curl -s $BASE/me -H "Authorization: Bearer $TOKEN_ANA" | jq '.user.username'
```

**Esperado:** `"anatorres"` (nombre en minúsculas sin espacios)

---

## SIGNUP-04 — buyer_document_id se asigna automáticamente en la orden

```bash
# Carlos tiene document_id "87654321" del seed
ORDER_ID=$(curl -s -X POST $BASE/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":1}]}' | jq -r '.id')

curl -s $BASE/orders/$ORDER_ID -H "Authorization: Bearer $TOKEN_C" \
  | jq '.order.buyer_document_id'
```

**Esperado:** `"87654321"` — se tomó automáticamente del perfil del usuario.

---

## ADMIN-01 — Crear admin en mock mode

```bash
curl -s -X POST $BASE/mock/seed-admin | jq '{message, email}'
```

**Esperado:** `{message: "admin created", email: "admin@mano.app"}`

---

## ADMIN-02 — Admin ve negocios pendientes de aprobación

```bash
# Crear negocio (queda is_approved: false)
curl -s -X POST $BASE/businesses -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_O" \
  -d '{"name":"Tienda Pendiente","description":"Test","category":"Ropa","location":"Tumaco"}' > /dev/null

curl -s $BASE/admin/businesses/pending -H "Authorization: Bearer $ADMIN_TOKEN" \
  | jq '{count, nombres: [.businesses[].name]}'
```

**Esperado:** `count >= 1`, `nombres` incluye "Tienda Pendiente"

---

## ADMIN-03 — Admin aprueba negocio

```bash
BIZ_ID=$(curl -s $BASE/admin/businesses/pending -H "Authorization: Bearer $ADMIN_TOKEN" \
  | jq -r '.businesses[0].id')

curl -s -X POST $BASE/admin/businesses/approve/$BIZ_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.message'

# Verificar que ahora aparece en el catálogo público
curl -s "$BASE/businesses?category=Ropa" | jq '.businesses | length'
```

**Esperado:** `"business approved"` y el negocio aparece en el catálogo.

---

## ADMIN-04 — Admin rechaza negocio

```bash
# Crear otro negocio
curl -s -X POST $BASE/businesses -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_O" \
  -d '{"name":"Negocio Rechazado","description":"Test","category":"Test","location":"Test"}' > /dev/null

BIZ_ID2=$(curl -s $BASE/admin/businesses/pending -H "Authorization: Bearer $ADMIN_TOKEN" \
  | jq -r '.businesses[0].id')

curl -s -X POST $BASE/admin/businesses/reject/$BIZ_ID2 \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason":"Documentos incompletos"}' | jq '.message'
```

**Esperado:** `"business rejected"`

---

## ADMIN-05 — No-admin no puede acceder al panel

```bash
curl -s $BASE/admin/businesses/pending -H "Authorization: Bearer $TOKEN_C" | jq '.error'
curl -s $BASE/admin/businesses/pending -H "Authorization: Bearer $TOKEN_O" | jq '.error'
```

**Esperado:** `"admin access required"` en ambos casos.

---

## ADMIN-06 — Admin ve disputas activas

```bash
# Crear orden en disputa
ORDER_D=$(curl -s -X POST $BASE/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d '{"business_id":2,"items":[{"product_id":4,"quantity":1}]}' | jq -r '.id')
curl -s -X POST $BASE/mock/wompi/approve -H "Content-Type: application/json" \
  -d "{\"order_id\":$ORDER_D}" > /dev/null
curl -s -X POST $BASE/orders/$ORDER_D/dispute -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_O" \
  -d '{"reason":"Test","reported_by":"business"}' > /dev/null

curl -s $BASE/admin/disputes -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.count'
```

**Esperado:** `1` (la disputa recién creada)

---

## ADMIN-07 — Admin resuelve disputa a favor del comprador

```bash
curl -s -X POST $BASE/admin/disputes/resolve/$ORDER_D \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"resolution":"refund_buyer","notes":"Negocio no entregó"}' \
  | jq '{status, escrow_status, payment_status}'
```

**Esperado:** `{status: "cancelled", escrow_status: "refunded", payment_status: "refunded"}`

---

## ADMIN-08 — Admin ve retiros pendientes y los procesa

```bash
# Crear saldo para María y solicitar retiro
curl -s -X POST $BASE/mock/flow/full-sale -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' > /dev/null

curl -s -X POST $BASE/sell/withdraw -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_F" \
  -d '{"amount":24000,"nequi_number":"3205551234"}' > /dev/null

# Admin ve el retiro
curl -s $BASE/admin/withdrawals -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.count'

# Admin lo procesa
W_ID=$(curl -s $BASE/admin/withdrawals -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.withdrawals[0].id')
curl -s -X PATCH $BASE/admin/withdrawals/process/$W_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.message'
```

**Esperado:** `count: 1` y `"withdrawal processed"`

---

## DELIVERY-01 — Crear delivery y ver estado inicial

```bash
ORDER_ID=$(curl -s -X POST $BASE/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d '{"business_id":1,"items":[{"product_id":2,"quantity":1}]}' | jq -r '.id')

DEL_ID=$(curl -s -X POST $BASE/deliveries -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d "{\"order_id\":$ORDER_ID,\"eta\":\"2026-06-02T10:00:00Z\",\"tracking\":\"TRK-001\"}" | jq -r '.id')

curl -s $BASE/deliveries/$DEL_ID | jq '.delivery | {status, eta, tracking}'
```

**Esperado:** `{status: "scheduled", eta: "...", tracking: "TRK-001"}`

---

## DELIVERY-02 — Negocio actualiza estado a in_transit

```bash
curl -s -X PATCH $BASE/deliveries/$DEL_ID/status \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_O" \
  -d '{"status":"in_transit"}' | jq '.delivery.status'
```

**Esperado:** `"in_transit"`

---

## DELIVERY-03 — Negocio marca como entregado

```bash
curl -s -X PATCH $BASE/deliveries/$DEL_ID/status \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_O" \
  -d '{"status":"delivered"}' | jq '{delivery_status: .delivery.status, order_status: .order_status}'
```

**Esperado:** `{delivery_status: "delivered", order_status: "delivered"}`

---

## DELIVERY-04 — Estado inválido es rechazado

```bash
curl -s -X PATCH $BASE/deliveries/$DEL_ID/status \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_O" \
  -d '{"status":"volando"}' | jq '.error'
```

**Esperado:** error de validación

---

## DELIVERY-05 — Customer no puede actualizar estado de delivery

```bash
curl -s -X PATCH $BASE/deliveries/$DEL_ID/status \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_C" \
  -d '{"status":"in_transit"}' | jq '.error'
```

**Esperado:** `"only the business owner can update delivery status"`

---

## FEED-01 — Stories expiradas no aparecen en el feed

```bash
# El seed crea una story con expires_at = ahora + 24h, debe aparecer
curl -s $BASE/feed | jq '.stories | length'
# Esperado: >= 1

# Las stories sin expires_at también aparecen
curl -s $BASE/stories | jq '.stories | map(select(.expires_at != null)) | length'
# Esperado: >= 1 (la del seed tiene expires_at)
```

---

## FEED-02 — Anuncios se ordenan por paquete (destacado > premium > básico)

```bash
# Crear anuncios de distintos paquetes
curl -s -X POST $BASE/ads -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_O" \
  -d '{"business_id":1,"title":"Ad Básico","description":"Test","package_type":"Paquete básico","active":true}' > /dev/null

curl -s -X POST $BASE/ads -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_O" \
  -d '{"business_id":2,"title":"Ad Destacado","description":"Test","package_type":"Paquete destacado","active":true}' > /dev/null

curl -s $BASE/feed | jq '.advertisements | map(.package_type)'
```

**Esperado:** `["Paquete destacado", "Paquete básico"]` — destacado primero.

---

## FEED-03 — Feed público no requiere autenticación

```bash
curl -s $BASE/feed -o /dev/null -w "%{http_code}"
```

**Esperado:** `200`

---

## WOMPI-01 — Initiate payment genera URL de checkout

```bash
ORDER_W=$(curl -s -X POST $BASE/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":1}]}' | jq -r '.id')

curl -s -X POST $BASE/payments/wompi/initiate \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_C" \
  -d "{\"order_id\":$ORDER_W,\"redirect_url\":\"http://localhost/orders\"}" \
  | jq '{reference, amount, currency, has_url: (.checkout_url | length > 0)}'
```

**Esperado:** `{reference: "MANO-N-...", amount: 450000, currency: "COP", has_url: true}`  
**Verificar:** `amount` = precio en centavos (4500 × 100 = 450000)

---

## WOMPI-02 — Flujo completo: pago → escrow → delivery → confirmación

```bash
# 1. Crear orden con comisionista
ORDER_FULL=$(curl -s -X POST $BASE/orders -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d '{"business_id":2,"freelancer_id":3,"items":[{"product_id":4,"quantity":1}]}' | jq -r '.id')

# 2. Pago aprobado
curl -s -X POST $BASE/mock/wompi/approve -H "Content-Type: application/json" \
  -d "{\"order_id\":$ORDER_FULL}" > /dev/null

# 3. Crear delivery
DEL_FULL=$(curl -s -X POST $BASE/deliveries -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_C" \
  -d "{\"order_id\":$ORDER_FULL,\"eta\":\"2026-06-02T15:00:00Z\"}" | jq -r '.id')

# 4. Negocio despacha
curl -s -X PATCH $BASE/deliveries/$DEL_FULL/status -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_O" -d '{"status":"in_transit"}' > /dev/null

# 5. Comprador confirma recepción
curl -s -X POST $BASE/orders/$ORDER_FULL/confirm \
  -H "Authorization: Bearer $TOKEN_C" | jq '.message'

# 6. Verificar distribución
curl -s $BASE/orders/$ORDER_FULL -H "Authorization: Bearer $TOKEN_C" \
  | jq '.order | {status, escrow_status, splits: (.commission_splits | map({type: .recipient_type, amount, status: .status}))}'
```

**Esperado final:**
```json
{
  "status": "delivered",
  "escrow_status": "released",
  "splits": [
    {"type": "platform",   "amount": 4800,  "status": "released"},
    {"type": "business",   "amount": 91200, "status": "released"},
    {"type": "freelancer", "amount": 24000, "status": "released"}
  ]
}
```
