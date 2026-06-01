# Tests — Sprint 1A: Negocios y Productos

Cubre creación, listado, filtros, ownership y gestión de stock.

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

## BIZ-01 — Listar negocios devuelve estructura correcta

```bash
curl -s http://localhost/api/businesses | jq
```

**Esperado:** `200` — `{ "businesses": [ {...}, {...} ] }` (no el array directo)  
**Verificar:** Cada negocio tiene `id`, `name`, `category`, `location`, `image_url`, `is_approved`.

---

## BIZ-02 — Filtrar por categoría

```bash
curl -s "http://localhost/api/businesses?category=Café" | jq '.businesses | length'
# Esperado: 1

curl -s "http://localhost/api/businesses?category=Artesanías" | jq '.businesses | length'
# Esperado: 1

curl -s "http://localhost/api/businesses?category=Farmacia" | jq '.businesses | length'
# Esperado: 0
```

---

## BIZ-03 — Filtrar por ubicación

```bash
curl -s "http://localhost/api/businesses?location=Tumaco" | jq '.businesses | length'
# Esperado: 1 (Artesanías Casa Nariño)

curl -s "http://localhost/api/businesses?location=Centro" | jq '.businesses | length'
# Esperado: 1 (Café La Esquina)
```

---

## BIZ-04 — Filtrar por categoría + ubicación combinados

```bash
curl -s "http://localhost/api/businesses?category=Artesanías&location=Tumaco" | jq '.businesses | length'
# Esperado: 1

curl -s "http://localhost/api/businesses?category=Café&location=Tumaco" | jq '.businesses | length'
# Esperado: 0 (categoría y ubicación no coinciden)
```

---

## BIZ-05 — Detalle de negocio incluye productos

```bash
curl -s http://localhost/api/businesses/1 | jq
```

**Esperado:** `200` — `{ "business": {...}, "products": [...] }`  
**Verificar:** `products` es un array, cada producto tiene `commission_rate` > 0.

---

## BIZ-06 — Negocio inexistente devuelve 404

```bash
curl -s http://localhost/api/businesses/9999 | jq
```

**Esperado:** `404` — `{ "error": "business not found" }`

---

## BIZ-07 — Crear negocio como owner

```bash
curl -s -X POST http://localhost/api/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "name": "Tienda de Prueba",
    "description": "Descripción de prueba",
    "category": "Ropa",
    "location": "Tumaco",
    "address": "Calle 10 #5-20",
    "latitude": 1.8010,
    "longitude": -78.7600,
    "default_commission_rate": 0.15
  }' | jq
```

**Esperado:** `201` — negocio creado con `owner_id` del owner autenticado.  
**Verificar:** `is_approved` es `false` (requiere aprobación manual).

---

## BIZ-08 — Customer no puede crear negocio

```bash
curl -s -X POST http://localhost/api/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"name":"X","description":"X","category":"X","location":"X"}' | jq
```

**Esperado:** `403`

---

## BIZ-09 — Crear negocio con campos faltantes

```bash
curl -s -X POST http://localhost/api/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"name":"Solo nombre"}' | jq
```

**Esperado:** `400` — error de validación.

---

## PROD-01 — Listar productos de un negocio

```bash
curl -s "http://localhost/api/products?business_id=1" | jq '.products | length'
# Esperado: 3 (los 3 cafés)

curl -s http://localhost/api/businesses/1/products | jq '.products | length'
# Esperado: 3 (misma respuesta, ruta alternativa)
```

---

## PROD-02 — Cada producto tiene commission_rate

```bash
curl -s "http://localhost/api/products?business_id=2" | jq '.products[0].commission_rate'
# Esperado: 0.20 (20% para Artesanías Casa Nariño)
```

---

## PROD-03 — Crear producto en negocio propio

```bash
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 1,
    "name": "Americano",
    "description": "Café americano suave",
    "price": 3500,
    "stock": 200,
    "commission_rate": 0.15,
    "image_url": ""
  }' | jq
```

**Esperado:** `201` — producto creado con `commission_rate: 0.15`.

---

## PROD-04 — No se puede crear producto en negocio ajeno

```bash
# Crear otro owner
TOKEN_OWNER2=$(curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Otro Owner","email":"owner2@test.com","password":"password123","role":"business_owner"}' \
  | jq -r '.token // empty')

TOKEN_OWNER2=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"owner2@test.com","password":"password123"}' | jq -r '.token')

# Intentar crear producto en negocio de juan
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER2" \
  -d '{"business_id":1,"name":"Intruso","description":"X","price":1000,"stock":1,"commission_rate":0.10}' | jq
```

**Esperado:** `403` — "you can only add products to your own business"

---

## PROD-05 — Precio negativo es rechazado

```bash
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"business_id":1,"name":"X","description":"X","price":-100,"stock":10,"commission_rate":0.10}' | jq
```

**Esperado:** `400` — error de validación `gt=0`.

---

## PROD-06 — Stock negativo es rechazado

```bash
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{"business_id":1,"name":"X","description":"X","price":1000,"stock":-5,"commission_rate":0.10}' | jq
```

**Esperado:** `400` — error de validación `gte=0`.

---

## PROD-07 — Stock se descuenta al crear orden

```bash
# Ver stock inicial del Espresso Doble (producto 1)
STOCK_ANTES=$(curl -s "http://localhost/api/products?business_id=1" | jq '.products[] | select(.id==1) | .stock')
echo "Stock antes: $STOCK_ANTES"

# Crear orden de 3 unidades
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":3}]}' | jq '.id'

# Verificar stock después
STOCK_DESPUES=$(curl -s "http://localhost/api/products?business_id=1" | jq '.products[] | select(.id==1) | .stock')
echo "Stock después: $STOCK_DESPUES"
# Esperado: STOCK_ANTES - 3
```

---

## PROD-08 — Orden con stock insuficiente es rechazada

```bash
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":9999}]}' | jq
```

**Esperado:** `400` — "insufficient stock for product: Espresso Doble"

---

## PROD-09 — Producto de otro negocio en la orden es rechazado

```bash
# Intentar mezclar producto del negocio 2 en orden del negocio 1
curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"business_id":1,"items":[{"product_id":4,"quantity":1}]}' | jq
```

**Esperado:** `400` — "product does not belong to selected business"

---

## GEO-01 — Negocios cercanos con coordenadas de Tumaco

```bash
# Coordenadas del centro de Tumaco
curl -s "http://localhost/api/map/nearby?latitude=1.7989&longitude=-78.7628&radius_km=2" | jq '.businesses | length'
# Esperado: 2 (ambos negocios están en Tumaco en el seed)
```

---

## GEO-02 — Radio muy pequeño sin resultados

```bash
curl -s "http://localhost/api/map/nearby?latitude=0&longitude=0&radius_km=0.1" | jq '.businesses | length'
# Esperado: 0
```

---

## GEO-03 — Sin coordenadas devuelve todos

```bash
curl -s "http://localhost/api/map/nearby" | jq '.businesses | length'
# Esperado: todos los negocios
```
