# Tests — Sprint 1C: Pagos, Escrow y Anti-fraude

El flujo de dinero: Wompi → escrow → distribución → retiro.  
Todos los casos usan mocks. Ninguno llama a Wompi real.

**Base URL:** `http://localhost/api`  
**Requiere:** `MOCK_MODE=true`

---

## Setup

```bash
TOKEN_CUSTOMER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')

TOKEN_FREELANCER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')

# Crear una orden base para los tests
ORDER_ID=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":2,"quantity":1}]}' | jq -r '.id')
echo "Orden de prueba: $ORDER_ID"
```

---

## PAY-01 — Estado inicial del sistema

```bash
curl -s http://localhost/api/mock/status | jq
```

**Verificar:**
- `counts.orders` ≥ 2 (las del seed)
- `counts.orders_held` ≥ 1 (la orden 2 del seed está en escrow)
- `counts.splits_pending` ≥ 3 (los 3 splits de la orden 2)

---

## PAY-02 — Simular pago aprobado por Wompi

```bash
curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_ID}" | jq
```

**Esperado:** `200`
```json
{
  "message": "✅ Pago simulado aprobado",
  "order_id": N,
  "escrow_status": "held",
  "wompi_tx_id": "MOCK-TX-N-...",
  "commission_splits": [
    { "recipient_type": "platform", "amount": 220, "percentage": 4, "status": "pending" },
    { "recipient_type": "business", "amount": 5280, "percentage": 96, "status": "pending" }
  ]
}
```

**Verificar matemáticas (Cappuccino $5.500):**
- platform: 5500 × 0.04 = **220** ✓
- business: 5500 × 0.96 = **5280** ✓
- Suma: 220 + 5280 = **5500** ✓

---

## PAY-03 — Orden en escrow no puede pagarse dos veces

```bash
# Intentar aprobar la misma orden de nuevo
curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_ID}" | jq
```

**Esperado:** `400` — "order already paid"

---

## PAY-04 — Simular pago rechazado

```bash
# Crear nueva orden para este test
ORDER_FAIL=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":3,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/wompi/decline \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_FAIL}" | jq
```

**Esperado:** `200`
```json
{
  "message": "❌ Pago simulado rechazado",
  "status": "payment_failed"
}
```

Verificar estado de la orden:
```bash
curl -s http://localhost/api/orders/$ORDER_FAIL \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  | jq '.order | {status, payment_status}'
# Esperado: { "status": "payment_failed", "payment_status": "failed" }
```

---

## PAY-05 — Liberar escrow (comprador confirma recepción)

```bash
# Primero aprobar el pago (PAY-02 debe haberse ejecutado)
curl -s -X POST http://localhost/api/mock/escrow/release \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_ID}" | jq
```

**Esperado:** `200`
```json
{
  "message": "✅ Escrow liberado — dinero distribuido",
  "escrow_status": "released",
  "commission_splits": [
    { "recipient_type": "platform", "status": "released" },
    { "recipient_type": "business", "status": "released" }
  ]
}
```

---

## PAY-06 — No se puede liberar escrow de orden no pagada

```bash
ORDER_UNPAID=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":2,"items":[{"product_id":6,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/escrow/release \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_UNPAID}" | jq
```

**Esperado:** `400` — "order is not in escrow"

---

## PAY-07 — Confirmar recepción vía endpoint real (no mock)

```bash
# Crear y aprobar orden
ORDER_CONFIRM=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_CONFIRM}" > /dev/null

# Confirmar recepción como el comprador (endpoint real, no mock)
curl -s -X POST http://localhost/api/orders/$ORDER_CONFIRM/confirm \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq
```

**Esperado:** `200` — "order confirmed, payment released"

---

## PAY-08 — Solo el comprador puede confirmar su orden

```bash
curl -s -X POST http://localhost/api/orders/$ORDER_CONFIRM/confirm \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq
```

**Esperado:** `403` — "not your order"

---

## PAY-09 — Auto-confirm de 24h (forzado)

```bash
# Crear y aprobar orden
ORDER_AUTO=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":2,"items":[{"product_id":5,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_AUTO}" > /dev/null

# Forzar auto-confirm (sin esperar 24h)
curl -s -X POST http://localhost/api/mock/escrow/auto-confirm \
  -H "Content-Type: application/json" \
  -d "{\"order_id\": $ORDER_AUTO}" | jq
```

**Esperado:** `200` — "1 orden(es) auto-confirmadas"

---

## PAY-10 — Auto-confirm sin order_id procesa todas las vencidas

```bash
curl -s -X POST http://localhost/api/mock/escrow/auto-confirm \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

**Esperado:** `200` — `{ "processed": N }` donde N ≥ 0

---

## PAY-11 — Distribución con comisionista: verificar splits exactos

```bash
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "product_id": 4,
    "quantity": 1,
    "referral_slug": "hamaca-casa-narino-maria-x7k2"
  }' | jq '.commission_splits'
```

**Esperado:** 3 splits con status "released":
```json
[
  { "recipient_type": "platform",   "amount": 4800,  "percentage": 4,  "status": "released" },
  { "recipient_type": "business",   "amount": 91200, "percentage": 76, "status": "released" },
  { "recipient_type": "freelancer", "amount": 24000, "percentage": 20, "status": "released" }
]
```

---

## FRAUD-01 — Comisionista intenta comprarse a sí mismo

```bash
# María usa su propio link para comprarse la hamaca
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{
    "product_id": 4,
    "quantity": 1,
    "referral_slug": "hamaca-casa-narino-maria-x7k2"
  }' | jq '{fraud_note, distribution}'
```

**Esperado:**
```json
{
  "fraud_note": "⚠️ Anti-fraude: comisión anulada (comprador = comisionista)",
  "distribution": {
    "total": 120000,
    "platform_4pct": 4800,
    "freelancer": 0,
    "business": 115200
  }
}
```

**Verificar:** La venta es válida (el negocio recibe dinero), pero María no gana comisión.

---

## FRAUD-02 — Verificar chequeo de fraude en orden existente

```bash
# Usar la orden 2 del seed (tiene freelancer_id = maría)
curl -s -X POST http://localhost/api/mock/fraud/check \
  -H "Content-Type: application/json" \
  -d '{"order_id": 2}' | jq
```

**Esperado:** `200`
```json
{
  "fraud_detected": false,
  "commission_valid": true,
  "checks": [
    "Comisionista: María García (11223344)",
    "Comprador cédula: 87654321",
    "✅ Cédulas distintas — comisión válida"
  ]
}
```

---

## FRAUD-03 — Chequeo de fraude en venta directa (sin comisionista)

```bash
curl -s -X POST http://localhost/api/mock/fraud/check \
  -H "Content-Type: application/json" \
  -d '{"order_id": 1}' | jq
```

**Esperado:**
```json
{
  "has_referral": false,
  "fraud_detected": false,
  "checks": ["ℹ️ Venta directa sin comisionista"]
}
```

---

## FRAUD-04 — Un celular no puede tener dos cuentas

```bash
# Intentar registrar con el mismo teléfono de carlos
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Clon de Carlos",
    "email": "clon@test.com",
    "password": "password123",
    "role": "customer",
    "phone": "3109876543"
  }' | jq
```

**Esperado:** `400` — error de teléfono duplicado (unique constraint en `phone`).

---

## PAY-12 — Wompi initiate payment genera URL de checkout

```bash
# Crear orden primero
ORDER_WOMPI=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":1}]}' | jq -r '.id')

# Iniciar pago Wompi
curl -s -X POST http://localhost/api/payments/wompi/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d "{\"order_id\": $ORDER_WOMPI, \"redirect_url\": \"http://localhost/orders\"}" | jq
```

**Esperado:** `200`
```json
{
  "reference": "MANO-N-...",
  "amount": 450000,
  "currency": "COP",
  "signature": "...",
  "checkout_url": "https://checkout.wompi.co/p/?..."
}
```

**Verificar:** `amount` = precio en centavos (4500 × 100 = 450000).

---

## PAY-13 — No se puede iniciar pago de orden ajena

```bash
curl -s -X POST http://localhost/api/payments/wompi/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d "{\"order_id\": $ORDER_WOMPI}" | jq
```

**Esperado:** `403` — "not your order"

---

## PAY-14 — Verificar estado final completo del sistema

```bash
curl -s http://localhost/api/mock/status | jq '{
  ordenes_totales: .counts.orders,
  en_escrow: .counts.orders_held,
  splits_pendientes: .counts.splits_pending,
  saldos_comisionistas: .freelancer_balances
}'
```

**Después de ejecutar todos los tests anteriores:**
- `en_escrow` debe ser 0 (todos liberados)
- `splits_pendientes` debe ser 0
- `saldos_comisionistas` muestra el saldo acumulado de María
