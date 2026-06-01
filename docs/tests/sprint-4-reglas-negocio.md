# Tests — Sprint 4: Reglas de Negocio

Los negocios pueden configurar restricciones: zona de venta, límite de unidades/mes,
tipo de entrega. Estas reglas afectan qué órdenes se pueden crear.

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
```

---

## RULE-01 — commission_rate mínimo es 10%

Ningún negocio puede ofrecer menos del 10% a los comisionistas.

```bash
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 1,
    "name": "Producto con comisión baja",
    "description": "Test",
    "price": 10000,
    "stock": 10,
    "commission_rate": 0.08
  }' | jq
```

**Esperado:** `400` — "commission_rate must be between 10% and 40%"

---

## RULE-02 — commission_rate máximo es 40%

```bash
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 1,
    "name": "Producto con comisión alta",
    "description": "Test",
    "price": 10000,
    "stock": 10,
    "commission_rate": 0.45
  }' | jq
```

**Esperado:** `400` — "commission_rate must be between 10% and 40%"

---

## RULE-03 — commission_rate en el rango válido (10%–40%) es aceptado

```bash
# 10% — mínimo válido
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"business_id":1,"name":"Mínimo","description":"Test","price":10000,"stock":5,"commission_rate":0.10}' \
  | jq '.commission_rate'
# Esperado: 0.1

# 25% — rango recomendado
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"business_id":1,"name":"Recomendado","description":"Test","price":10000,"stock":5,"commission_rate":0.25}' \
  | jq '.commission_rate'
# Esperado: 0.25

# 40% — máximo válido
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"business_id":1,"name":"Máximo","description":"Test","price":10000,"stock":5,"commission_rate":0.40}' \
  | jq '.commission_rate'
# Esperado: 0.4
```

---

## RULE-04 — Negocio con zona de venta: solo acepta pedidos de esa zona

La lógica de negocio permite que un negocio diga "solo vendo en Tumaco".
Un comprador fuera de esa zona no debería poder ordenar.

```bash
# Verificar que el negocio tiene location configurada
curl -s http://localhost/api/businesses/2 | jq '.business.location'
# Esperado: "Tumaco"
```

**Nota:** La validación de zona por coordenadas del comprador es Sprint 4.  
Actualmente el campo `location` es informativo. La restricción geográfica real requiere que el comprador envíe sus coordenadas al crear la orden.

---

## RULE-05 — Límite de unidades por mes

Un negocio puede configurar "máximo 50 unidades al mes" para controlar su capacidad.

```bash
# Intentar crear orden que excede el límite mensual del negocio
# (requiere que el negocio tenga monthly_limit configurado)
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{
    "business_id": 2,
    "items": [{"product_id": 4, "quantity": 51}]
  }' | jq
```

**Esperado:** `400` — "exceeds business monthly limit"  
**Nota:** Comportamiento esperado para Sprint 4. Actualmente solo valida stock disponible.

---

## RULE-06 — Stock del producto limita la cantidad por orden

Esta regla ya está implementada. Verificar que funciona correctamente.

```bash
# Hamaca tiene stock 20 — intentar pedir 21
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":2,"items":[{"product_id":4,"quantity":21}]}' | jq
```

**Esperado:** `400` — "insufficient stock for product: Hamaca Artesanal"

---

## RULE-07 — Tipo de entrega: recoge en local

Cuando el negocio no tiene domicilio, el comprador debe ir a recoger.
El delivery se crea con `type: "business_own"`.

```bash
ORDER_ID=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":2,"items":[{"product_id":5,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/deliveries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d "{\"order_id\": $ORDER_ID, \"eta\": \"2026-06-03T14:00:00Z\"}" | jq '.type'
```

**Esperado:** `"business_own"`

---

## RULE-08 — Plataforma siempre cobra 4% fijo

Sin importar el porcentaje del comisionista, Mano siempre se lleva el 4%.

```bash
# Venta de $10.000 con comisionista al 10%
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id":1,"quantity":1}' | jq '.distribution'
# platform_4pct debe ser exactamente 4% del total

# Venta de $120.000 con comisionista al 20%
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' \
  | jq '.distribution | {total, platform: .platform_4pct, pct: (.platform_4pct / .total * 100)}'
```

**Esperado:** `pct` siempre es `4` independientemente del comisionista.

---

## RULE-09 — Suma de splits siempre es igual al total de la orden

```bash
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' \
  | jq '.commission_splits | map(.amount) | add'
```

**Esperado:** `120000` — la suma de todos los splits = total de la orden. Nunca se pierde ni se crea dinero.
