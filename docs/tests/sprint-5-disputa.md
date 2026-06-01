# Tests — Sprint 5: Disputas y Protección del Comprador

Cuando el negocio reporta que el producto no llegó, o el comprador dice que no recibió,
Mano retiene el dinero y resuelve manualmente.

**Base URL:** `http://localhost/api`  
**Lógica de negocio:** El dinero NUNCA se libera sobre promesas. Solo sobre confirmación real o resolución de disputa.

---

## Setup

```bash
TOKEN_CUSTOMER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')

TOKEN_OWNER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')

# Crear orden en escrow para los tests de disputa
ORDER_ID=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":2,"items":[{"product_id":4,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_ID}" > /dev/null

echo "Orden en escrow: $ORDER_ID"
```

---

## DISP-01 — Negocio reporta que el producto no llegó al comprador

```bash
curl -s -X POST http://localhost/api/orders/$ORDER_ID/dispute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "reason": "El comprador no estaba en la dirección indicada",
    "reported_by": "business"
  }' | jq '{status, escrow_status}'
```

**Esperado:** `200`
```json
{
  "status": "disputed",
  "escrow_status": "held"
}
```

**Por qué importa:** El dinero permanece retenido. El negocio no puede reportar "no llegó" para quedarse con el producto Y el dinero.

---

## DISP-02 — Orden en disputa no puede confirmarse por el comprador

```bash
curl -s -X POST http://localhost/api/orders/$ORDER_ID/confirm \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq
```

**Esperado:** `400` — "order is under dispute, cannot confirm"

---

## DISP-03 — Orden en disputa no puede liberarse del escrow

```bash
curl -s -X POST http://localhost/api/mock/escrow/release \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_ID}" | jq
```

**Esperado:** `400` — "order is under dispute"

---

## DISP-04 — Admin resuelve disputa a favor del comprador (reembolso)

```bash
# Requiere token de admin (Sprint 5)
TOKEN_ADMIN="<token de admin>"

curl -s -X POST http://localhost/api/admin/disputes/$ORDER_ID/resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_ADMIN" \
  -d '{
    "resolution": "refund_buyer",
    "notes": "El negocio no pudo demostrar que el producto fue enviado"
  }' | jq '{status, escrow_status, payment_status}'
```

**Esperado:**
```json
{
  "status": "cancelled",
  "escrow_status": "refunded",
  "payment_status": "refunded"
}
```

---

## DISP-05 — Admin resuelve disputa a favor del negocio (libera pago)

```bash
# Nueva orden en disputa para este test
ORDER_D2=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_D2}" > /dev/null

curl -s -X POST http://localhost/api/orders/$ORDER_D2/dispute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"reason":"Comprador no recogió","reported_by":"business"}' > /dev/null

curl -s -X POST http://localhost/api/admin/disputes/$ORDER_D2/resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_ADMIN" \
  -d '{
    "resolution": "release_business",
    "notes": "El negocio tiene evidencia de que el producto estaba listo"
  }' | jq '{status, escrow_status}'
```

**Esperado:**
```json
{
  "status": "delivered",
  "escrow_status": "released"
}
```

---

## DISP-06 — Comprador puede reportar que no recibió el producto

```bash
ORDER_D3=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":2,"items":[{"product_id":5,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_D3}" > /dev/null

curl -s -X POST http://localhost/api/orders/$ORDER_D3/dispute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "reason": "Pagué pero nunca recibí el producto",
    "reported_by": "buyer"
  }' | jq '{status, escrow_status}'
```

**Esperado:** `200` — `{ "status": "disputed", "escrow_status": "held" }`

---

## DISP-07 — Auto-confirm NO aplica a órdenes en disputa

Las órdenes en disputa no deben auto-confirmarse aunque pasen 24h.

```bash
# Verificar que la orden en disputa no se procesa en el auto-confirm
curl -s -X POST http://localhost/api/mock/escrow/auto-confirm \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.processed'

# Verificar que la orden sigue en disputa
curl -s http://localhost/api/orders/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq '.order.status'
# Esperado: "disputed" (no "delivered")
```

---

## DISP-08 — Comisionista no pierde comisión por disputa hasta resolución

Si hay un comisionista en la orden disputada, su comisión permanece en `pending` hasta que el admin resuelva.

```bash
# Crear orden con comisionista y poner en disputa
ORDER_FRAUD=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "business_id": 2,
    "freelancer_id": 3,
    "items": [{"product_id": 4, "quantity": 1}]
  }' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_FRAUD}" > /dev/null

curl -s -X POST http://localhost/api/orders/$ORDER_FRAUD/dispute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"reason":"Test","reported_by":"business"}' > /dev/null

# Verificar que los splits del comisionista siguen en pending
curl -s http://localhost/api/orders/$ORDER_FRAUD \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  | jq '.order.commission_splits[] | select(.recipient_type=="freelancer") | .status'
# Esperado: "pending" (no "released")
```
