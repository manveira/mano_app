#!/usr/bin/env bash
# wompi-webhook-sim.sh — Simula eventos FIRMADOS de Wompi contra el backend local (código real, no /mock).
# Verifica: firma válida, firma inválida, sin firma, repetición (idempotencia), monto alterado y rechazo.
#
# Requisito: el backend debe arrancar con el MISMO secreto de eventos que se pasa aquí, p. ej.:
#   LOCAL_WOMPI_PUBLIC_KEY=pub_test_x LOCAL_WOMPI_INTEGRITY_SECRET=test_integrity_x \
#   LOCAL_WOMPI_EVENTS_SECRET=test_events_x docker compose -f docker-compose.local.yml up -d core
#   (o ponerlos en .env.local y correr scripts/local-up.sh)
# Uso:
#   WOMPI_EVENTS_SECRET=test_events_x bash scripts/wompi-webhook-sim.sh
# No llama a Wompi ni usa dinero. No imprime secretos.
set -u
BASE="${BASE:-http://localhost:8080/api}"
SECRET="${WOMPI_EVENTS_SECRET:-}"
[ -n "$SECRET" ] || { echo "Falta WOMPI_EVENTS_SECRET (el mismo que usa el backend)."; exit 2; }
command -v jq >/dev/null && command -v openssl >/dev/null || { echo "Se necesitan jq y openssl."; exit 2; }

PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
ko(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
api(){ curl -sS -m 20 -H 'Content-Type: application/json' "$@"; }

echo "1) Preparar orden (comprador de prueba) e iniciar pago"
TOKEN=$(api -X POST "$BASE/auth/signin" -d '{"email":"carlos@example.com","password":"password123"}' | jq -r .token)
[ -n "$TOKEN" ] && [ "$TOKEN" != null ] || { echo "No se pudo iniciar sesión"; exit 1; }
BIZ=$(api "$BASE/businesses" | jq -r '(.businesses // .)[0].id')
PROD=$(api "$BASE/products?business_id=$BIZ" | jq -r '.products[0].id')
ORDER=$(api -X POST "$BASE/orders" -H "Authorization: Bearer $TOKEN" \
  -d "{\"business_id\":$BIZ,\"items\":[{\"product_id\":$PROD,\"quantity\":1}]}")
OID=$(echo "$ORDER" | jq -r '.order.id // .id')
PAY=$(api -X POST "$BASE/payments/wompi/initiate" -H "Authorization: Bearer $TOKEN" -d "{\"order_id\":$OID}")
REF=$(echo "$PAY" | jq -r .reference); AMT=$(echo "$PAY" | jq -r .amount)
[ -n "$REF" ] && [ "$REF" != null ] && ok "orden $OID, referencia $REF, monto $AMT centavos" || { ko "initiate falló: $PAY"; exit 1; }

# event STATUS AMOUNT CHECKSUM_MODE  → imprime el JSON del evento (checksum: ok | bad | none)
event(){
  local status="$1" amount="$2" mode="$3" ts id sum
  ts=$(date +%s); id="SIM-$ts-$RANDOM"
  sum=$(printf '%s' "${id}${status}${amount}${ts}${SECRET}" | openssl dgst -sha256 | awk '{print $NF}')
  [ "$mode" = bad ] && sum="0000${sum:4}"
  local sig=""
  [ "$mode" != none ] && sig=",\"signature\":{\"properties\":[\"transaction.id\",\"transaction.status\",\"transaction.amount_in_cents\"],\"checksum\":\"$sum\"}"
  printf '{"event":"transaction.updated","data":{"transaction":{"id":"%s","status":"%s","amount_in_cents":%s,"reference":"%s","currency":"COP","payment_method_type":"CARD"}}%s,"timestamp":%s,"sent_at":"2026-01-01T00:00:00.000Z"}' \
    "$id" "$status" "$amount" "$REF" "$sig" "$ts"
}
post(){ curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/webhooks/wompi" -H 'Content-Type: application/json' -d "$1"; }
state(){ api "$BASE/orders/$OID" -H "Authorization: Bearer $TOKEN" | jq -r '.order | "\(.payment_status)/\(.escrow_status)"'; }
splits(){ api "$BASE/orders/$OID" -H "Authorization: Bearer $TOKEN" | jq -r '.order.commission_splits // .commission_splits // [] | length'; }

echo "2) Firma inválida → 401 y la orden no cambia"
c=$(post "$(event APPROVED "$AMT" bad)"); [ "$c" = 401 ] && ok "401" || ko "esperaba 401, llegó $c"
s=$(state); [ "$s" != "paid/held" ] && ok "orden sigue sin pagar ($s)" || ko "la orden quedó pagada con firma inválida"

echo "3) Sin firma → 401"
c=$(post "$(event APPROVED "$AMT" none)"); [ "$c" = 401 ] && ok "401" || ko "esperaba 401, llegó $c"

echo "4) Monto alterado (firma válida pero monto distinto al registrado) → se ignora, orden sin pagar"
c=$(post "$(event APPROVED 100 ok)"); [ "$c" = 200 ] && ok "200 (ignorado)" || ko "esperaba 200, llegó $c"
s=$(state); [ "$s" != "paid/held" ] && ok "orden sigue sin pagar ($s)" || ko "pagó con monto distinto"

echo "5) Evento APPROVED válido → orden pagada, escrow retenido"
c=$(post "$(event APPROVED "$AMT" ok)"); [ "$c" = 200 ] && ok "200" || ko "esperaba 200, llegó $c"
s=$(state); [ "$s" = "paid/held" ] && ok "payment_status/escrow = $s" || ko "estado esperado paid/held, llegó $s"
N1=$(splits)

echo "6) Repetir el mismo pago aprobado → idempotente (sin duplicar splits)"
c=$(post "$(event APPROVED "$AMT" ok)"); [ "$c" = 200 ] && ok "200" || ko "esperaba 200, llegó $c"
N2=$(splits); [ "$N1" = "$N2" ] && ok "splits sin cambios ($N2)" || ko "splits cambiaron $N1 → $N2"

echo "7) Rechazo tardío (DECLINED) sobre una orden ya pagada → no la deshace"
c=$(post "$(event DECLINED "$AMT" ok)"); [ "$c" = 200 ] && ok "200" || ko "esperaba 200, llegó $c"
s=$(state); [ "$s" = "paid/held" ] && ok "sigue $s" || ko "la orden cambió a $s"

echo; echo "Resultado: $PASS OK, $FAIL fallidos"
[ "$FAIL" -eq 0 ]
