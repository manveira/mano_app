# Tests — Sprint 3: Plan Pro del Comisionista

Por $15.000/mes el comisionista accede a productos exclusivos con mejores comisiones
y ve estadísticas detalladas de sus links.

**Base URL:** `http://localhost/api`  
**Lógica de negocio:** Plan free = productos normales. Plan pro = productos exclusivos + stats avanzadas.

---

## Setup

```bash
TOKEN_FREELANCER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')

TOKEN_OWNER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')
```

---

## PRO-01 — Comisionista free tiene plan "free" por defecto

```bash
curl -s http://localhost/api/me \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq '.user.plan'
```

**Esperado:** `"free"`

---

## PRO-02 — Producto exclusivo no es visible para comisionista free

Un negocio puede marcar un producto como exclusivo para comisionistas Pro.

```bash
# Crear producto exclusivo (requiere Sprint 3 implementado)
curl -s -X POST http://localhost/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_OWNER" \
  -d '{
    "business_id": 2,
    "name": "Hamaca Edición Limitada",
    "description": "Solo para comisionistas Pro",
    "price": 250000,
    "stock": 5,
    "commission_rate": 0.25,
    "is_exclusive": true
  }' | jq '{id, name, is_exclusive}'
```

**Esperado:** `201` — producto creado con `is_exclusive: true`.

```bash
# Comisionista free intenta afiliarse al producto exclusivo
EXCLUSIVE_ID=<id del producto creado>
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d "{\"product_id\": $EXCLUSIVE_ID}" | jq
```

**Esperado:** `403` — "this product requires a Pro plan"

---

## PRO-03 — Upgrade a plan Pro

```bash
curl -s -X POST http://localhost/api/sell/upgrade-pro \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"nequi_number": "3205551234"}' | jq '{plan, message}'
```

**Esperado:** `200` — `{ "plan": "pro", "message": "Plan Pro activado por 30 días" }`  
**Nota:** En producción esto cobra $15.000 vía Wompi. En mock, activa directamente.

---

## PRO-04 — Comisionista Pro puede afiliarse a productos exclusivos

```bash
# Después del upgrade (PRO-03)
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d "{\"product_id\": $EXCLUSIVE_ID}" | jq '{referral_link, url}'
```

**Esperado:** `201` — link generado exitosamente.

---

## PRO-05 — Stats avanzadas solo para plan Pro

El plan Pro muestra: clicks por hora del día, tasa de conversión por producto, ingresos proyectados.

```bash
curl -s http://localhost/api/sell/stats \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq
```

**Esperado (plan free):** `403` — "advanced stats require Pro plan"  
**Esperado (plan pro):** `200` — objeto con stats detalladas por link.

---

## PRO-06 — Plan Pro expira después de 30 días

```bash
# Verificar fecha de expiración del plan
curl -s http://localhost/api/me \
  -H "Authorization: Bearer $TOKEN_FREELANCER" | jq '.user | {plan, plan_expires_at}'
```

**Esperado:** `plan_expires_at` es 30 días en el futuro desde la activación.

---

## PRO-07 — Comisionista free ve solo productos normales en explorar

```bash
curl -s http://localhost/api/products | jq '.products | map(select(.is_exclusive == true)) | length'
```

**Esperado para usuario free:** `0` — los productos exclusivos no aparecen en el listado público.  
**Esperado para usuario pro:** todos los productos incluyendo exclusivos.
