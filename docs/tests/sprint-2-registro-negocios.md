# Tests — Sprint 2: Registro y Verificación de Negocios (KYC)

Un negocio llega a Mano porque quiere vendedores sin sueldo fijo.
El proceso: formulario → revisión manual → aprobación → puede subir productos.

**Base URL:** `http://localhost/api`  
**Lógica de negocio:** Un negocio NO aprobado no puede subir productos ni aparecer en el catálogo activo.

---

## Setup

```bash
TOKEN_OWNER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')

# Crear un owner nuevo sin negocios aprobados
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nuevo Negociante",
    "email": "nuevo@test.com",
    "password": "password123",
    "role": "business_owner",
    "phone": "3007778899",
    "document_id": "55667788"
  }' > /dev/null

TOKEN_NUEVO=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"nuevo@test.com","password":"password123"}' | jq -r '.token')
```

---

## KYC-01 — Negocio recién creado tiene is_approved: false

Cuando un owner crea un negocio, queda en estado pendiente hasta que Mano lo apruebe.

```bash
BIZ_ID=$(curl -s -X POST http://localhost/api/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_NUEVO" \
  -d '{
    "name": "Tienda Nueva",
    "description": "Ropa artesanal del Pacífico",
    "category": "Ropa",
    "location": "Tumaco",
    "address": "Barrio Centro 12"
  }' | jq -r '.id')

curl -s http://localhost/api/businesses/$BIZ_ID | jq '.business.is_approved'
```

**Esperado:** `false`  
**Por qué importa:** Mano verifica que el negocio es real (RUT/cédula) antes de activarlo.

---

## KYC-02 — Negocio no aprobado no aparece en búsquedas activas

```bash
# Buscar por categoría — el negocio nuevo no debe aparecer
curl -s "http://localhost/api/businesses?category=Ropa" | jq '.businesses | map(select(.is_approved == false)) | length'
```

**Esperado:** `0` — los negocios no aprobados no deben aparecer en el catálogo público.  
**Nota:** Este caso documenta el comportamiento esperado. Si el backend actual no filtra por `is_approved`, es un bug a corregir en Sprint 2.

---

## KYC-03 — Negocio no aprobado no puede subir productos

```bash
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_NUEVO" \
  -d "{
    \"business_id\": $BIZ_ID,
    \"name\": \"Camiseta\",
    \"description\": \"Camiseta artesanal\",
    \"price\": 45000,
    \"stock\": 10,
    \"commission_rate\": 0.15
  }" | jq
```

**Esperado:** `403` — "business is not approved yet"  
**Nota:** Este caso documenta el comportamiento esperado para Sprint 2.

---

## KYC-04 — Negocios del seed ya están aprobados

Los negocios del seed (Café La Esquina y Artesanías Casa Nariño) deben estar aprobados para que los tests funcionen.

```bash
curl -s http://localhost/api/businesses | jq '.businesses[] | {name, is_approved}'
```

**Esperado:**
```json
[
  { "name": "Café La Esquina",          "is_approved": true },
  { "name": "Artesanías Casa Nariño",   "is_approved": true }
]
```

---

## KYC-05 — Comisión mínima del negocio es 10%

El negocio define cuánto le paga al comisionista. El mínimo recomendado es 10%.

```bash
# Intentar crear producto con commission_rate < 10%
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 1,
    "name": "Producto Tacaño",
    "description": "Test",
    "price": 10000,
    "stock": 5,
    "commission_rate": 0.05
  }' | jq
```

**Esperado:** `400` — "commission_rate must be at least 10%"  
**Nota:** Comportamiento esperado para Sprint 2. Actualmente el backend no valida este mínimo.

---

## KYC-06 — Comisión máxima del negocio es 40%

```bash
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 1,
    "name": "Producto Generoso",
    "description": "Test",
    "price": 10000,
    "stock": 5,
    "commission_rate": 0.50
  }' | jq
```

**Esperado:** `400` — "commission_rate cannot exceed 40%"  
**Nota:** Comportamiento esperado para Sprint 2.

---

## KYC-07 — Negocio aprobado puede subir productos

```bash
# Los negocios del seed están aprobados — esto debe funcionar
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 1,
    "name": "Mocha Especial",
    "description": "Café con chocolate artesanal",
    "price": 7000,
    "stock": 50,
    "commission_rate": 0.15
  }' | jq '{id, name, commission_rate}'
```

**Esperado:** `201` — producto creado.

---

## KYC-08 — Regla: negocio puede definir zona de venta

La lógica de negocio permite que un negocio diga "solo vendo en Tumaco".  
Este test documenta que la restricción de ubicación existe en el modelo.

```bash
# Verificar que el negocio tiene location configurada
curl -s http://localhost/api/businesses/2 | jq '.business | {name, location, address}'
```

**Esperado:**
```json
{
  "name": "Artesanías Casa Nariño",
  "location": "Tumaco",
  "address": "Barrio El Morro 45"
}
```

---

## KYC-09 — Regla: pedido se recoge en el local (delivery type)

Cuando un negocio no tiene domicilio propio, el tipo de entrega es `business_own` y el comprador debe ir a recoger.

```bash
ORDER_ID=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')" \
  -d '{"business_id":2,"items":[{"product_id":4,"quantity":1}]}' | jq -r '.id')

curl -s -X POST http://localhost/api/deliveries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')" \
  -d "{\"order_id\": $ORDER_ID, \"eta\": \"2026-06-02T10:00:00Z\"}" \
  | jq '{status, type}'
```

**Esperado:** `201` — `{ "status": "scheduled", "type": "business_own" }`
