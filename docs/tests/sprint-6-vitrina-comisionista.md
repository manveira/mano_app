# Tests — Sprint 6: Vitrina Pública del Comisionista

Cada comisionista tiene su perfil público: `mano.app/vendedor/maria`.
Quien compre desde esa vitrina genera comisión automáticamente.
Es la herramienta de marketing personal del comisionista.

**Base URL:** `http://localhost/api`

---

## Setup

```bash
TOKEN_FREELANCER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')

TOKEN_CUSTOMER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')

# Asegurarse de que María tiene links activos
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 4}' > /dev/null

curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 5}' > /dev/null
```

---

## VIT-01 — Perfil público del comisionista es accesible sin auth

```bash
curl -s http://localhost/api/vendedor/maria | jq
```

**Esperado:** `200`
```json
{
  "freelancer": {
    "name": "María García",
    "username": "maria"
  },
  "products": [
    {
      "id": 4,
      "name": "Hamaca Artesanal",
      "price": 120000,
      "commission_rate": 0.20,
      "referral_slug": "hamaca-artesanal-3-xxxx"
    },
    {
      "id": 5,
      "name": "Mochila Wayuu",
      "price": 85000,
      "commission_rate": 0.20,
      "referral_slug": "mochila-wayuu-3-xxxx"
    }
  ]
}
```

**Por qué importa:** María comparte `mano.app/vendedor/maria` en Instagram. Cualquier compra desde ahí le genera comisión.

---

## VIT-02 — Vitrina solo muestra productos con links activos

Si María desactiva un link, ese producto no aparece en su vitrina.

```bash
# Ver cuántos productos tiene María en su vitrina
curl -s http://localhost/api/vendedor/maria | jq '.products | length'
# Esperado: número de links activos de María
```

---

## VIT-03 — Compra desde la vitrina genera comisión al comisionista

```bash
# Obtener el slug del producto en la vitrina de María
SLUG=$(curl -s http://localhost/api/vendedor/maria \
  | jq -r '.products[] | select(.id==4) | .referral_slug')

# Comprar usando ese slug
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d "{\"product_id\": 4, \"quantity\": 1, \"referral_slug\": \"$SLUG\"}" \
  | jq '.distribution.freelancer'
```

**Esperado:** `24000` — María gana su comisión del 20%.

---

## VIT-04 — Vitrina de comisionista inexistente devuelve 404

```bash
curl -s http://localhost/api/vendedor/usuarioquenoeexiste | jq
```

**Esperado:** `404` — "freelancer not found"

---

## VIT-05 — Vitrina no muestra información sensible del comisionista

```bash
curl -s http://localhost/api/vendedor/maria | jq '.freelancer | keys'
```

**Esperado:** Solo campos públicos: `name`, `username`.  
**No debe aparecer:** `email`, `document_id`, `phone`, `nequi_number`, `earnings_balance`.

---

## VIT-06 — Comisionista puede afiliarse a productos de múltiples negocios sin límite

La lógica de negocio dice: "pueden afiliarse a todos los que quieran, sin límite".

```bash
# Afiliar a productos de ambos negocios
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 1}' | jq '.referral_link.business_id'
# Esperado: 1 (Café La Esquina)

curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 4}' | jq '.referral_link.business_id'
# Esperado: 2 (Artesanías Casa Nariño)

# Ver todos los links — deben ser de negocios distintos
curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  | jq '.links | map(.business_id) | unique | length'
# Esperado: 2 (tiene links de 2 negocios distintos)
```

---

## VIT-07 — Link de producto inactivo no genera comisión

Si el negocio desactiva un producto, los links existentes no deben generar comisión.

```bash
# Desactivar producto (requiere Sprint 6 implementado)
curl -s -X PATCH http://localhost/api/products/4 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')" \
  -d '{"is_active": false}' | jq '.is_active'
# Esperado: false

# Intentar usar el link del producto inactivo
curl -s http://localhost/api/r/hamaca-casa-narino-maria-x7k2 | jq
# Esperado: 404 o 400 — "product is no longer available"

# Intentar afiliarse al producto inactivo
curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"product_id": 4}' | jq
# Esperado: 400 — "product is not active"
```

---

## VIT-08 — Vitrina muestra tasa de conversión del comisionista (solo para él)

El comisionista puede ver sus propias stats en su panel, pero no las de otros.

```bash
# María ve sus propias stats
curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  | jq '.links[0] | {clicks, conversions, conversion_rate: (if .clicks > 0 then (.conversions / .clicks * 100) else 0 end)}'
```

**Esperado:** objeto con clicks, conversiones y tasa calculada.

---

## VIT-09 — URL del perfil público usa username, no ID

```bash
# Acceder por username (no por ID numérico)
curl -s http://localhost/api/vendedor/maria -o /dev/null -w "%{http_code}"
# Esperado: 200

# Acceder por ID numérico no debe funcionar como vitrina
curl -s http://localhost/api/vendedor/3 -o /dev/null -w "%{http_code}"
# Esperado: 404 (el username "3" no existe)
```
