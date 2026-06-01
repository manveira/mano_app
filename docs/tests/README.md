# Tests — Índice

Casos de prueba organizados por sprint y workflow.  
Todos usan `curl` + `jq`. Requieren el servidor corriendo en `http://localhost`.

---

## Cómo ejecutar

```bash
# Levantar el entorno
docker compose up --build -d

# Esperar ~15 segundos y verificar
curl -s http://localhost/api/health | jq
# Esperado: { "status": "ok" }
```

`MOCK_MODE=true` viene activo por defecto en Docker.  
Para resetear la BD y el seed: `docker compose down -v && docker compose up --build -d`

---

## Archivos de tests

| Archivo | Sprint | Qué cubre | Casos | Estado |
|---------|--------|-----------|-------|--------|
| [sprint-0-auth.md](./sprint-0-auth.md) | Sprint 0 | Registro, login, JWT, roles, phone único | 17 | ✅ Implementado |
| [sprint-1a-negocios-productos.md](./sprint-1a-negocios-productos.md) | Sprint 1A | Negocios, productos, stock, geolocalización | 18 | ✅ Implementado |
| [sprint-1b-comisionistas.md](./sprint-1b-comisionistas.md) | Sprint 1B | Afiliación, links, clicks, retiros, múltiples negocios | 17 | ✅ Implementado |
| [sprint-1c-pagos-escrow.md](./sprint-1c-pagos-escrow.md) | Sprint 1C | Wompi, escrow, distribución, anti-fraude | 14 | ✅ Implementado |
| [sprint-1d-ordenes-feed-dashboard.md](./sprint-1d-ordenes-feed-dashboard.md) | Sprint 1D | Órdenes, feed, stories, dashboard, delivery | 20 | ✅ Implementado |
| [sprint-2-registro-negocios.md](./sprint-2-registro-negocios.md) | Sprint 2 | KYC negocios, aprobación, comisión mínima/máxima | 9 | 🔲 Sprint 2 |
| [sprint-3-plan-pro.md](./sprint-3-plan-pro.md) | Sprint 3 | Plan Pro, productos exclusivos, stats avanzadas | 7 | 🔲 Sprint 3 |
| [sprint-4-reglas-negocio.md](./sprint-4-reglas-negocio.md) | Sprint 4 | Reglas de negocio, límites, suma de splits | 9 | 🔲 Sprint 4 |
| [sprint-5-disputa.md](./sprint-5-disputa.md) | Sprint 5 | Disputas, retención de dinero, resolución admin | 8 | 🔲 Sprint 5 |
| [sprint-6-vitrina-comisionista.md](./sprint-6-vitrina-comisionista.md) | Sprint 6 | Vitrina pública, perfil, privacidad, producto inactivo | 9 | 🔲 Sprint 6 |

**Total: 128 casos de prueba**

---

## Leyenda de estado

- ✅ **Implementado** — el backend ya tiene la lógica. Los tests deben pasar hoy.
- 🔲 **Sprint N** — documenta el comportamiento esperado. Algunos tests fallarán hasta que se implemente el sprint correspondiente.

---

## Orden de ejecución recomendado

```
Sprint 0 (Auth)          → obtener tokens
Sprint 1A (Negocios)     → verificar datos del seed
Sprint 1B (Comisionistas) → generar links
Sprint 1C (Pagos)        → probar flujos de dinero
Sprint 1D (Órdenes)      → verificar ciclo completo
Sprint 2 (KYC)           → después de implementar aprobación de negocios
Sprint 3 (Plan Pro)      → después de implementar plan pro
Sprint 4 (Reglas)        → después de implementar validaciones de comisión
Sprint 5 (Disputas)      → después de implementar flujo de disputas
Sprint 6 (Vitrina)       → después de implementar perfil público
```

---

## Variables de entorno para los tests

```bash
export BASE=http://localhost/api

export TOKEN_OWNER=$(curl -s -X POST $BASE/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}' | jq -r '.token')

export TOKEN_CUSTOMER=$(curl -s -X POST $BASE/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token')

export TOKEN_FREELANCER=$(curl -s -X POST $BASE/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' | jq -r '.token')

echo "Tokens listos ✓"
```

---

## Smoke test rápido (5 casos críticos)

```bash
echo "=== 1. Health check ==="
curl -s $BASE/health | jq '.status'

echo "=== 2. Login funciona ==="
curl -s -X POST $BASE/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' | jq '.user.role'

echo "=== 3. Negocios cargados ==="
curl -s $BASE/businesses | jq '.businesses | length'

echo "=== 4. Mock mode activo ==="
curl -s $BASE/mock/status | jq '.mock_mode'

echo "=== 5. Flujo completo de venta con comisionista ==="
curl -s -X POST $BASE/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CUSTOMER" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' \
  | jq '{message: .message, splits: (.commission_splits | length), suma: (.commission_splits | map(.amount) | add)}'
```

**Todos deben responder sin errores. El smoke test 5 debe mostrar 3 splits que suman 120000.**
