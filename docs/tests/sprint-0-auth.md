# Tests — Sprint 0: Autenticación y Usuarios

Cubre registro, login, roles, JWT y validaciones de identidad.

**Base URL:** `http://localhost/api`  
**Mock mode:** No requerido para este sprint.

---

## Setup: obtener tokens

```bash
# Token owner
TOKEN_OWNER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')

# Token customer
TOKEN_CUSTOMER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')

# Token freelancer
TOKEN_FREELANCER=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')
```

---

## AUTH-01 — Registro exitoso como customer

```bash
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pedro Ruiz",
    "email": "pedro@test.com",
    "password": "password123",
    "role": "customer"
  }' | jq
```

**Esperado:** `201` — `{ "id": N, "email": "pedro@test.com", "role": "customer" }`  
**Verificar:** No devuelve token (el usuario debe hacer login por separado).

---

## AUTH-02 — Registro exitoso como freelancer

```bash
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ana Torres",
    "email": "ana@test.com",
    "password": "password123",
    "role": "freelancer"
  }' | jq
```

**Esperado:** `201` — `{ "role": "freelancer" }`

---

## AUTH-03 — Registro con email duplicado

```bash
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Copia",
    "email": "carlos@example.com",
    "password": "password123",
    "role": "customer"
  }' | jq
```

**Esperado:** `400` — error de email duplicado.

---

## AUTH-04 — Registro con rol inválido

```bash
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"X","email":"x@test.com","password":"password123","role":"admin"}' | jq
```

**Esperado:** `400` — error de validación de rol.

---

## AUTH-05 — Registro con password corto

```bash
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"X","email":"short@test.com","password":"abc","role":"customer"}' | jq
```

**Esperado:** `400` — error "min=8".

---

## AUTH-06 — Login exitoso

```bash
curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq
```

**Esperado:** `200` — `{ "token": "eyJ...", "user": { "id": N, "role": "customer" } }`  
**Verificar:** El token es un JWT válido con 3 partes separadas por `.`

---

## AUTH-07 — Login con password incorrecto

```bash
curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"wrong"}' | jq
```

**Esperado:** `401` — `{ "error": "invalid credentials" }`

---

## AUTH-08 — Login con email inexistente

```bash
curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"noexiste@test.com","password":"password123"}' | jq
```

**Esperado:** `401` — `{ "error": "invalid credentials" }`

---

## AUTH-09 — Acceso a endpoint protegido sin token

```bash
curl -s http://localhost/api/me | jq
```

**Esperado:** `401` — `{ "error": "authorization required" }`

---

## AUTH-10 — Acceso con token inválido

```bash
curl -s http://localhost/api/me \
  -H "Authorization: Bearer token.falso.aqui" | jq
```

**Esperado:** `401` — `{ "error": "invalid or expired token" }`

---

## AUTH-11 — /me devuelve datos correctos del token

```bash
curl -s http://localhost/api/me \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq
```

**Esperado:** `200` — `{ "user": { "id": N, "email": "carlos@example.com", "role": "customer" } }`

---

## AUTH-12 — Roles distintos tienen acceso diferente

```bash
# Customer intenta ver dashboard de negocio → debe fallar
curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq
# Esperado: 403

# Owner puede ver su dashboard
curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN_OWNER" | jq
# Esperado: 200
```

---

## AUTH-13 — Freelancer no puede crear negocio

```bash
curl -s -X POST http://localhost/api/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_FREELANCER" \
  -d '{"name":"Test","description":"Test","category":"Test","location":"Test"}' | jq
```

**Esperado:** `403` — `{ "error": "only business owners can create businesses" }`

---

## AUTH-14 — /me/businesses solo devuelve negocios del owner autenticado

```bash
curl -s http://localhost/api/me/businesses \
  -H "Authorization: Bearer $TOKEN_OWNER" | jq '.businesses | length'
# Esperado: 2 (Café La Esquina + Artesanías Casa Nariño)

curl -s http://localhost/api/me/businesses \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" | jq
# Esperado: 200 con businesses: [] (customer no tiene negocios)
```

---

## AUTH-15 — Registro con phone duplicado es rechazado

La lógica de negocio exige que un número de celular = una sola cuenta (anti-fraude de comisionistas fantasma).

```bash
# Primer registro con ese teléfono
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Usuario A",
    "email": "usuarioa@test.com",
    "password": "password123",
    "role": "freelancer",
    "phone": "3001112233"
  }' | jq '.id'

# Segundo registro con el mismo teléfono — debe fallar
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Usuario B",
    "email": "usuariob@test.com",
    "password": "password123",
    "role": "customer",
    "phone": "3001112233"
  }' | jq
```

**Esperado:** `400` — error de teléfono duplicado.  
**Por qué importa:** Evita que una persona cree múltiples cuentas de comisionista para inflar métricas o evadir el anti-fraude de cédula.

---

## AUTH-16 — Registro sin document_id ni phone

El sistema debe aceptar el registro básico pero marcar `is_verified: false` hasta que se complete el perfil.

```bash
curl -s -X POST http://localhost/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sin Datos",
    "email": "sindatos@test.com",
    "password": "password123",
    "role": "customer"
  }' | jq '{id, role}'
```

**Esperado:** `201` — registro exitoso.  
**Verificar:** El usuario puede registrarse sin cédula/teléfono, pero no podrá ser comisionista activo hasta verificarse.

---

## AUTH-17 — Token JWT contiene role correcto en el payload

El frontend decodifica el token para mostrar el menú correcto (Dashboard para owner, Vender para freelancer).

```bash
TOKEN=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')

# Decodificar el payload del JWT (parte del medio, base64)
echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '{user_id, role, email}'
```

**Esperado:**
```json
{
  "user_id": N,
  "role": "freelancer",
  "email": "maria@example.com"
}
```

**Verificar para cada rol:**
```bash
# Owner
TOKEN_O=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')
echo $TOKEN_O | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.role'
# Esperado: "business_owner"

# Customer
TOKEN_C=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')
echo $TOKEN_C | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.role'
# Esperado: "customer"
```
