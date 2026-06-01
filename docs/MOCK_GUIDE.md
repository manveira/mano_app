# MOCK_GUIDE.md — Guía de pruebas con mocks

Los endpoints `/api/mock/*` simulan pagos, escrow y anti-fraude sin necesitar Wompi real.
Solo funcionan cuando `MOCK_MODE=true` (activo por defecto en Docker).

---

## Activar modo mock

```bash
# Docker (ya viene activo)
docker compose up --build

# Local
export MOCK_MODE=true
go run main.go
```

Si intentas usar un endpoint mock con `MOCK_MODE=false`, recibes:
```json
{ "error": "mock endpoints are disabled in production" }
```

---

## Usuarios de prueba (seed)

| Email | Password | Rol | Cédula | Nequi |
|-------|----------|-----|--------|-------|
| `juan@example.com` | `password123` | business_owner | 12345678 | 3001234567 |
| `carlos@example.com` | `password123` | customer | 87654321 | — |
| `maria@example.com` | `password123` | freelancer | 11223344 | 3205551234 |

---

## Endpoints mock disponibles

| Método | Ruta | Qué simula |
|--------|------|-----------|
| GET | `/api/mock/status` | Estado general del sistema |
| POST | `/api/mock/wompi/approve` | Wompi aprueba el pago → escrow |
| POST | `/api/mock/wompi/decline` | Wompi rechaza el pago |
| POST | `/api/mock/escrow/release` | Comprador confirma recepción → distribuye dinero |
| POST | `/api/mock/escrow/auto-confirm` | Auto-confirm de 24h (sin esperar) |
| POST | `/api/mock/fraud/check` | Verifica si hay fraude en una orden |
| POST | `/api/mock/flow/full-sale` | Flujo completo en un request (requiere auth) |

---

## Flujos de prueba paso a paso

### Flujo 1 — Venta directa (sin comisionista)

```bash
# 1. Login como carlos (customer)
TOKEN=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' \
  | jq -r '.token')

# 2. Crear orden (Espresso Doble x2, negocio 1)
ORDER=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"business_id":1,"items":[{"product_id":1,"quantity":2}]}')
ORDER_ID=$(echo $ORDER | jq -r '.id')
echo "Orden creada: $ORDER_ID"

# 3. Simular pago aprobado por Wompi
curl -s -X POST http://localhost/api/mock/wompi/approve \
  -H "Content-Type: application/json" \
  -d "{\"order_id\":$ORDER_ID}" | jq

# 4. Simular confirmación del comprador (libera escrow)
curl -s -X POST http://localhost/api/mock/escrow/release \
  -H "Content-Type: application/json" \
  -d "{\"order_id\":$ORDER_ID}" | jq

# Resultado esperado:
# - platform: 4% del total
# - business: 96% del total
# - freelancer: $0 (no hay comisionista)
```

---

### Flujo 2 — Venta con comisionista (link de referido)

```bash
# 1. Login como maria (freelancer)
TOKEN_MARIA=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' \
  | jq -r '.token')

# 2. María se afilia a la Hamaca Artesanal (producto 4)
LINK=$(curl -s -X POST http://localhost/api/sell/affiliate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_MARIA" \
  -d '{"product_id":4}')
SLUG=$(echo $LINK | jq -r '.referral_link.slug')
echo "Link generado: http://localhost/r/$SLUG"

# 3. Simular click en el link (como si un comprador lo abriera)
curl -s http://localhost/api/r/$SLUG | jq

# 4. Login como carlos (customer) y crear orden con referral
TOKEN_CARLOS=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' \
  | jq -r '.token')

# 5. Flujo completo en un request
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_CARLOS" \
  -d "{\"product_id\":4,\"quantity\":1,\"referral_slug\":\"$SLUG\"}" | jq

# Resultado esperado (Hamaca $120.000, comisión 20%):
# - platform:   $4.800  (4%)
# - freelancer: $24.000 (20%)
# - business:   $91.200 (76%)
```

---

### Flujo 3 — Anti-fraude: comisionista intenta comprarse a sí mismo

```bash
# María intenta comprar usando su propio link
TOKEN_MARIA=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' \
  | jq -r '.token')

# Flujo completo — María compra con su propio slug
curl -s -X POST http://localhost/api/mock/flow/full-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_MARIA" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' | jq

# Resultado esperado:
# - fraud_note: "⚠️ Anti-fraude: comisión anulada (comprador = comisionista)"
# - freelancer: $0
# - business:   $115.200 (96%)
# - platform:   $4.800   (4%)
# La venta es válida pero María no gana comisión
```

---

### Flujo 4 — Pago rechazado

```bash
TOKEN=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@example.com","password":"password123"}' \
  | jq -r '.token')

ORDER=$(curl -s -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"business_id":1,"items":[{"product_id":2,"quantity":1}]}')
ORDER_ID=$(echo $ORDER | jq -r '.id')

# Simular rechazo
curl -s -X POST http://localhost/api/mock/wompi/decline \
  -H "Content-Type: application/json" \
  -d "{\"order_id\":$ORDER_ID}" | jq

# Resultado: order.status = "payment_failed", order.payment_status = "failed"
```

---

### Flujo 5 — Auto-confirm de 24h

```bash
# Crear orden y aprobar pago (queda en escrow)
# ... (pasos 1-3 del Flujo 1)

# Simular que pasaron 24h sin que el comprador confirmara
curl -s -X POST http://localhost/api/mock/escrow/auto-confirm \
  -H "Content-Type: application/json" \
  -d "{\"order_id\":$ORDER_ID}" | jq

# Sin order_id: procesa TODAS las órdenes vencidas
curl -s -X POST http://localhost/api/mock/escrow/auto-confirm \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

---

### Flujo 6 — Verificar estado del sistema

```bash
curl -s http://localhost/api/mock/status | jq

# Muestra:
# - Conteos de usuarios, negocios, productos, órdenes
# - Órdenes en escrow (dinero retenido)
# - Saldos de comisionistas
# - Splits pendientes de liberar
```

---

### Flujo 7 — Retiro de ganancias

```bash
# Primero ejecutar Flujo 2 para que María tenga saldo

TOKEN_MARIA=$(curl -s -X POST http://localhost/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@example.com","password":"password123"}' \
  | jq -r '.token')

# Ver saldo actual
curl -s http://localhost/api/sell/links \
  -H "Authorization: Bearer $TOKEN_MARIA" | jq '.earnings_balance'

# Solicitar retiro
curl -s -X POST http://localhost/api/sell/withdraw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_MARIA" \
  -d '{"amount":24000,"nequi_number":"3205551234"}' | jq
```

---

## Verificar distribución de dinero

Después de cualquier flujo, puedes ver cómo quedó distribuido el dinero:

```bash
# Ver splits de una orden específica
curl -s http://localhost/api/orders/2 \
  -H "Authorization: Bearer $TOKEN" | jq '.order.commission_splits'
```

---

## Notas importantes

- Los mocks **no llaman a Wompi**. Todo es simulado en memoria/BD.
- El flujo `/mock/flow/full-sale` ejecuta los 5 pasos en un solo request para pruebas rápidas.
- En producción (`MOCK_MODE=false`), todos los endpoints `/api/mock/*` devuelven 403.
- Los datos del seed se recrean al hacer `docker compose down -v && docker compose up --build`.
