# Tests — Sprint 1B: Flujo de Ventas con Comisionistas

El flujo más crítico de Mano: afiliación → link → click → orden → comisión.

**Base URL:** `http://localhost/api`  
**Requiere:** `MOCK_MODE=true`

---

## Setup

```bash
TOKEN_FREELANCER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')

TOKEN_CUSTOMER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')
```

---

## SELL-01 — Freelancer se afilia a un producto

```bash
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 4}' | jq
```

**Esperado:** `201`
```json
{
  "referral_link": {
    "id": N,
    "freelancer_id": N,
    "product_id": 4,
    "slug": "hamaca-artesanal-N-xxxx",
    "clicks": 0,
    "conversions": 0
  },
  "url": "https://mano.app/r/hamaca-artesanal-N-xxxx"
}
```

Guardar el slug:
```bash
SLUG=$(curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 5}' | jq -r '.referral_link.slug')
echo "Slug: $SLUG"
```

---

## SELL-02 — Afiliarse dos veces al mismo producto devuelve el link existente

```bash
# Segunda afiliación al producto 4
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 4}' | jq '.message'
```

**Esperado:** `200` — `"already affiliated"` (no crea un link duplicado)

---

## SELL-03 — Customer no puede afiliarse a productos

```bash
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id": 4}' | jq
```

**Esperado:** `403` — "only freelancers can affiliate to products"

---

## SELL-04 — Afiliarse a producto inexistente

```bash
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 9999}' | jq
```

**Esperado:** `404` — "product not found"

---

## SELL-05 — Click en link registra el evento

```bash
# Usar el slug del seed (ya existe en la BD)
curl -s http://localhost/api/r/hamaca-casa-narino-maria-x7k2 | jq
```

**Esperado:** `200`
```json
{
  "product": { "id": 4, "name": "Hamaca Artesanal", "price": 120000 },
  "referral_link_id": N,
  "business_id": 2
}
```

Verificar que el contador de clicks aumentó:
```bash
curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq '.links[] | select(.slug=="hamaca-casa-narino-maria-x7k2") | .clicks'
# Esperado: 13 (era 12 en el seed + 1 nuevo click)
```

---

## SELL-06 — Link inexistente devuelve 404

```bash
curl -s http://localhost/api/r/link-que-no-existe | jq
```

**Esperado:** `404` — "link not found"

---

## SELL-07 — Ver mis links con stats

```bash
curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq
```

**Esperado:** `200`
```json
{
  "links": [
    {
      "id": N,
      "slug": "hamaca-casa-narino-maria-x7k2",
      "clicks": 12,
      "conversions": 2,
      "url": "https://mano.app/r/hamaca-casa-narino-maria-x7k2",
      "product": { "name": "Hamaca Artesanal", "price": 120000, "commission_rate": 0.20 }
    }
  ],
  "earnings_balance": 0
}
```

---

## SELL-08 — Flujo completo: venta con comisionista

```bash
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "product_id": 4,
    "quantity": 1,
    "referral_slug": "hamaca-casa-narino-maria-x7k2"
  }' | jq
```

**Esperado:** `200`
```json
{
  "message": "✅ Flujo completo simulado",
  "order": {
    "total": 120000,
    "escrow_status": "released",
    "status": "delivered"
  },
  "distribution": {
    "total": 120000,
    "platform_4pct": 4800,
    "freelancer": 24000,
    "business": 91200
  }
}
```

**Verificar matemáticas:**
- `platform_4pct` = total × 0.04 = 120000 × 0.04 = **4800** ✓
- `freelancer` = total × commission_rate = 120000 × 0.20 = **24000** ✓
- `business` = total - platform - freelancer = 120000 - 4800 - 24000 = **91200** ✓
- Suma: 4800 + 24000 + 91200 = **120000** ✓

---

## SELL-09 — Venta directa (sin comisionista): 96% al negocio

```bash
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "product_id": 1,
    "quantity": 2
  }' | jq '.distribution'
```

**Producto:** Espresso Doble × 2 = $9.000  
**Esperado:**
```json
{
  "total": 9000,
  "platform_4pct": 360,
  "freelancer": 0,
  "business": 8640
}
```

---

## SELL-10 — Saldo del comisionista se acredita después de la venta

```bash
# Ver saldo antes
SALDO_ANTES=$(curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq '.earnings_balance')
echo "Saldo antes: $SALDO_ANTES"

# Ejecutar venta con comisionista
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' > /dev/null

# Ver saldo después
SALDO_DESPUES=$(curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq '.earnings_balance')
echo "Saldo después: $SALDO_DESPUES"
# Esperado: SALDO_ANTES + 24000
```

---

## SELL-11 — Conversiones del link se incrementan

```bash
CONV_ANTES=$(curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  | jq '.links[] | select(.slug=="hamaca-casa-narino-maria-x7k2") | .conversions')

curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' > /dev/null

CONV_DESPUES=$(curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  | jq '.links[] | select(.slug=="hamaca-casa-narino-maria-x7k2") | .conversions')

echo "Conversiones: $CONV_ANTES → $CONV_DESPUES"
# Esperado: CONV_ANTES + 1
```

---

## SELL-12 — Retiro de ganancias exitoso

```bash
# Primero asegurarse de tener saldo (ejecutar SELL-10 antes)

curl -s -X POST http://localhost/api/sell/withdraw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"amount": 24000, "nequi_number": "3205551234"}' | jq
```

**Esperado:** `201`
```json
{
  "withdrawal": {
    "amount": 24000,
    "nequi_number": "3205551234",
    "status": "pending"
  },
  "remaining_balance": 0,
  "message": "Withdrawal request created. Processing in 1-2 business days."
}
```

---

## SELL-13 — Retiro con saldo insuficiente

```bash
curl -s -X POST http://localhost/api/sell/withdraw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"amount": 999999, "nequi_number": "3205551234"}' | jq
```

**Esperado:** `400` — "insufficient balance"

---

## SELL-14 — Retiro por debajo del mínimo ($5.000)

```bash
curl -s -X POST http://localhost/api/sell/withdraw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"amount": 1000, "nequi_number": "3205551234"}' | jq
```

**Esperado:** `400` — "minimum withdrawal is $5.000 COP"

---

## SELL-15 — Customer no puede retirar ganancias

```bash
curl -s -X POST http://localhost/api/sell/withdraw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"amount": 5000, "nequi_number": "3109876543"}' | jq
```

**Esperado:** `403` — "only freelancers can request withdrawals"

---

## SELL-16 — Comisionista puede afiliarse a productos de múltiples negocios sin límite

La lógica de negocio es explícita: "pueden afiliarse a todos los que quieran, sin límite".

```bash
# Afiliar a producto del negocio 1 (Café)
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 1}' | jq '.referral_link.id'

# Afiliar a producto del negocio 1 (otro producto)
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 2}' | jq '.referral_link.id'

# Afiliar a producto del negocio 2 (Artesanías)
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 6}' | jq '.referral_link.id'

# Verificar que tiene links de ambos negocios
curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  | jq '.links | map(.business_id) | unique'
# Esperado: [1, 2] — links de 2 negocios distintos, sin error
```

**Verificar:** No hay límite de afiliaciones. El sistema no rechaza la tercera, cuarta o décima afiliación.

---

## SELL-17 — Link de producto inactivo no genera comisión

Si el negocio desactiva un producto, el link existente del comisionista no debe funcionar.

```bash
# Verificar que el producto 4 está activo
curl -s "http://localhost/api/products?business_id=2" \
  | jq '.products[] | select(.id==4) | {name, is_active}'
# Esperado: is_active: true

# Intentar usar link de producto inactivo (simular desactivación)
# Nota: requiere endpoint PATCH /products/:id (Sprint 6)
# Por ahora verificar que el handler AffiliateToProduct rechaza productos inactivos:
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 4}' | jq '.message'
# Esperado: "already affiliated" (producto activo, link ya existe)
```

**Comportamiento esperado cuando el producto se desactiva:**
- `GET /api/r/:slug` → `400` "product is no longer available"
- `POST /api/sell/affiliate` con ese producto → `400` "product is not active"
- El link existente queda en `is_active: false` automáticamente
