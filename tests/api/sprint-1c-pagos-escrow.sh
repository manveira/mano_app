#!/usr/bin/env bash
# Sprint 1C — Pagos, Escrow y Anti-fraude (docs/tests/sprint-1c-pagos-escrow.md)
# Requiere MOCK_MODE=true (usa /mock/*). Ninguna prueba llama a Wompi real.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 1C — Pagos/Escrow/Anti-fraude   BASE=$BASE"
S="$(uniq_suffix)"

TOKEN_CUSTOMER="$(login_as carlos@example.com)"
TOKEN_FREELANCER="$(login_as maria@example.com)"

# ── Helpers locales ───────────────────────────────────────────────────────────
# near A B -> 0 si |A-B| < 0.01 (los montos son float64)
near(){ awk -v a="$1" -v b="$2" 'BEGIN{d=a-b; if(d<0)d=-d; exit !(a!="" && a!="null" && b!="" && d<0.01)}'; }
calc(){ awk "BEGIN{printf \"%.4f\", $*}"; }
# pf BUSINESS PRODUCT CAMPO -> valor actual del producto (el seed puede haber sido modificado por la suite 1a)
pf(){ call GET "/products?business_id=$1"; jqv ".products[] | select(.id==$2) | .$3"; }
# mk_order TOKEN BUSINESS PRODUCT [QTY] -> crea una orden con /orders y deja el id en $ORDER_NEW
mk_order(){
  local token="$1" biz="$2" prod="$3" qty="${4:-1}"
  call POST /orders "{\"business_id\":$biz,\"items\":[{\"product_id\":$prod,\"quantity\":$qty}]}" "$token"
  ORDER_NEW="$(jqv '.id')"
  { [ "$STATUS" = "201" ] && [ -n "$ORDER_NEW" ] && [ "$ORDER_NEW" != "null" ]; } || _err "no se pudo crear la orden base (status $STATUS)"
}
# sp TIPO CAMPO -> campo del split de recipient_type TIPO dentro de $BODY.commission_splits
sp(){ jqv "[.commission_splits[] | select(.recipient_type==\"$1\")] | .[0].$2"; }
mock_approve(){ call POST /mock/wompi/approve "{\"order_id\": $1}"; }

# Valores actuales de los productos que usan los cálculos (con fallback a los del seed)
P1="$(pf 1 1 price)"; P1="${P1:-4500}"
P2="$(pf 1 2 price)"; P2="${P2:-5500}"
P4="$(pf 2 4 price)"; P4="${P4:-120000}"
R4="$(pf 2 4 commission_rate)"; R4="${R4:-0.2}"

begin PAY-01 "Estado inicial del sistema"
call GET /mock/status
expect_status 200
expect_jq '.mock_mode' true
expect_jq_ge '.counts.orders' 2
expect_jq_ge '.counts.orders_held' 1
expect_jq_ge '.counts.splits_pending' 3
HELD0="$(jqv '.counts.orders_held')"; PEND0="$(jqv '.counts.splits_pending')"
note "línea base para PAY-14: orders_held=$HELD0 splits_pending=$PEND0"
end

begin PAY-02 "Simular pago aprobado por Wompi"
mk_order "$TOKEN_CUSTOMER" 1 2 1; ORDER_ID="$ORDER_NEW"; ORDER_TOTAL="$(jqv '.total_amount')"
mock_approve "$ORDER_ID"
expect_status 200
expect_contains 'Pago simulado aprobado'
expect_jq '.order_id' "$ORDER_ID"
expect_jq '.escrow_status' held
expect_jq '.wompi_tx_id | startswith("MOCK-TX-")' true
expect_jq '.commission_splits | length' 2
expect_jq '[.commission_splits[].status] | unique | join(",")' pending
EXP_PLAT="$(calc "$ORDER_TOTAL*0.04")"; EXP_BIZ="$(calc "$ORDER_TOTAL-$EXP_PLAT")"
expect_true "platform = 4% del total ($EXP_PLAT)" near "$(sp platform amount)" "$EXP_PLAT"
expect_true "platform percentage = 4" near "$(sp platform percentage)" 4
expect_true "business = 96% del total ($EXP_BIZ)" near "$(sp business amount)" "$EXP_BIZ"
expect_true "business percentage = 96" near "$(sp business percentage)" 96
expect_true "suma de splits = total" near "$(jqv '[.commission_splits[].amount] | add')" "$ORDER_TOTAL"
note "orden base $ORDER_ID total=$ORDER_TOTAL (el .md asume Cappuccino 5500 -> 220/5280)"
end

begin PAY-03 "Orden en escrow no puede pagarse dos veces"
mock_approve "$ORDER_ID"
expect_status 400
expect_contains 'order already paid'
end

begin PAY-04 "Simular pago rechazado"
mk_order "$TOKEN_CUSTOMER" 1 3 1; ORDER_FAIL="$ORDER_NEW"
call POST /mock/wompi/decline "{\"order_id\": $ORDER_FAIL}"
expect_status 200
expect_contains 'Pago simulado rechazado'
expect_jq '.status' payment_failed
call GET "/orders/$ORDER_FAIL" "" "$TOKEN_CUSTOMER"
expect_status 200
expect_jq '.order.status' payment_failed
expect_jq '.order.payment_status' failed
end

begin PAY-05 "Liberar escrow (comprador confirma recepción)"
call POST /mock/escrow/release "{\"order_id\": $ORDER_ID}"
expect_status 200
expect_contains 'Escrow liberado'
expect_jq '.escrow_status' released
expect_jq '[.commission_splits[].status] | unique | join(",")' released
expect_jq '.commission_splits | length' 2
expect_jq '.freelancer_balance' null
call GET "/orders/$ORDER_ID" "" "$TOKEN_CUSTOMER"
expect_jq '.order.status' delivered
expect_jq '.order.escrow_status' released
end

begin PAY-06 "No se puede liberar escrow de orden no pagada"
mk_order "$TOKEN_CUSTOMER" 2 6 1; ORDER_UNPAID="$ORDER_NEW"
call POST /mock/escrow/release "{\"order_id\": $ORDER_UNPAID}"
expect_status 400
expect_contains 'order is not in escrow'
end

begin PAY-07 "Confirmar recepción vía endpoint real (no mock)"
mk_order "$TOKEN_CUSTOMER" 1 1 1; ORDER_CONFIRM="$ORDER_NEW"
mock_approve "$ORDER_CONFIRM"; expect_status 200
call POST "/orders/$ORDER_CONFIRM/confirm" "" "$TOKEN_CUSTOMER"
expect_status 200
expect_contains 'order confirmed, payment released'
call GET "/orders/$ORDER_CONFIRM" "" "$TOKEN_CUSTOMER"
expect_jq '.order.escrow_status' released
expect_jq '[.order.commission_splits[].status] | unique | join(",")' released
end

begin PAY-08 "Solo el comprador puede confirmar su orden"
call POST "/orders/$ORDER_CONFIRM/confirm" "" "$TOKEN_FREELANCER"
expect_status 403
expect_contains 'not your order'
end

begin PAY-09 "Auto-confirm de 24h (forzado)"
mk_order "$TOKEN_CUSTOMER" 2 5 1; ORDER_AUTO="$ORDER_NEW"
mock_approve "$ORDER_AUTO"; expect_status 200
call POST /mock/escrow/auto-confirm "{\"order_id\": $ORDER_AUTO}"
expect_status 200
expect_contains 'auto-confirmadas'
expect_jq '.processed' 1
call GET "/orders/$ORDER_AUTO" "" "$TOKEN_CUSTOMER"
expect_jq '.order.escrow_status' released
note "hallazgo #4: el auto-confirm real no existe fuera del mock; aquí solo se prueba el endpoint /mock"
end

begin PAY-10 "Auto-confirm sin order_id procesa todas las vencidas"
call POST /mock/escrow/auto-confirm '{}'
expect_status 200
expect_jq_ge '.processed' 0
end

begin PAY-11 "Distribución con comisionista: verificar splits exactos"
call GET /sell/links "" "$TOKEN_FREELANCER"; BAL_ANTES="$(jqv '.earnings_balance')"
call POST /mock/flow/full-sale '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' "$TOKEN_CUSTOMER"
expect_status 200
EXP_PLAT="$(calc "$P4*0.04")"; EXP_FL="$(calc "$P4*$R4")"; EXP_BIZ="$(calc "$P4-$EXP_PLAT-$EXP_FL")"
expect_jq '.commission_splits | length' 3
expect_jq '[.commission_splits[].status] | unique | join(",")' released
expect_true "platform = $EXP_PLAT" near "$(sp platform amount)" "$EXP_PLAT"
expect_true "business = $EXP_BIZ" near "$(sp business amount)" "$EXP_BIZ"
expect_true "freelancer = $EXP_FL" near "$(sp freelancer amount)" "$EXP_FL"
expect_true "platform 4%" near "$(sp platform percentage)" 4
expect_true "freelancer % = tasa del producto" near "$(sp freelancer percentage)" "$(calc "$R4*100")"
expect_true "distribution.freelancer" near "$(jqv '.distribution.freelancer')" "$EXP_FL"
expect_jq '.fraud_note' ''
call GET /sell/links "" "$TOKEN_FREELANCER"; BAL_DESPUES="$(jqv '.earnings_balance')"
expect_true "saldo de María sube $EXP_FL" near "$(calc "$BAL_DESPUES-$BAL_ANTES")" "$EXP_FL"
note "el .md asume Hamaca 120000/20% -> 4800/91200/24000; aquí se calcula con el precio/tasa vigentes (P=$P4, tasa=$R4)"
end

begin FRAUD-01 "Comisionista intenta comprarse a sí mismo"
call POST /mock/flow/full-sale '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' "$TOKEN_FREELANCER"
expect_status 200
EXP_PLAT="$(calc "$P4*0.04")"; EXP_BIZ="$(calc "$P4-$EXP_PLAT")"
expect_jq '.fraud_note | contains("Anti-fraude: comisión anulada")' true
expect_true "distribution.total" near "$(jqv '.distribution.total')" "$P4"
expect_true "distribution.platform_4pct" near "$(jqv '.distribution.platform_4pct')" "$EXP_PLAT"
expect_true "distribution.freelancer = 0" near "$(jqv '.distribution.freelancer')" 0
expect_true "distribution.business = total - 4%" near "$(jqv '.distribution.business')" "$EXP_BIZ"
expect_jq '.commission_splits | length' 2
expect_jq '[.commission_splits[].recipient_type] | sort | join(",")' business,platform
expect_jq '.freelancer_balance' null
note "hallazgo #7: este anti-fraude solo existe en /mock/flow/full-sale; el flujo real (/orders) no lo aplica"
end

begin FRAUD-02 "Verificar chequeo de fraude en orden existente (orden 2 del seed)"
call POST /mock/fraud/check '{"order_id": 2}'
expect_status 200
expect_jq '.fraud_detected' false
expect_jq '.commission_valid' true
expect_jq '.has_referral' true
expect_jq '.checks | map(select(contains("11223344"))) | length' 1
expect_jq '.checks | map(select(contains("87654321"))) | length' 1
expect_jq '.checks | map(select(contains("Cédulas distintas"))) | length' 1
end

begin FRAUD-03 "Chequeo de fraude en venta directa (orden 1, sin comisionista)"
call POST /mock/fraud/check '{"order_id": 1}'
expect_status 200
expect_jq '.has_referral' false
expect_jq '.fraud_detected' false
expect_jq '.checks | map(select(contains("Venta directa sin comisionista"))) | length' 1
end

begin FRAUD-04 "Un celular no puede tener dos cuentas"
call POST /auth/signup "{\"name\":\"Clon de Carlos\",\"email\":\"clon$S@test.com\",\"password\":\"password123\",\"role\":\"customer\",\"phone\":\"3109876543\"}"
expect_status 400
expect_contains 'phone'
call POST /auth/signin "{\"email\":\"clon$S@test.com\",\"password\":\"password123\"}"
expect_status 401
note "el .md habla de unique constraint; el backend lo valida en SignUp ('phone number already registered') antes del índice único"
end

begin PAY-12 "Wompi initiate payment genera URL de checkout"
mk_order "$TOKEN_CUSTOMER" 1 1 1; ORDER_WOMPI="$ORDER_NEW"; WTOTAL="$(jqv '.total_amount')"
call POST /payments/wompi/initiate "{\"order_id\": $ORDER_WOMPI, \"redirect_url\": \"http://localhost/orders\"}" "$TOKEN_CUSTOMER"
expect_status 200
expect_jq '.reference | startswith("MANO-'"$ORDER_WOMPI"'-")' true
expect_true "amount = total*100 centavos" near "$(jqv '.amount')" "$(calc "$WTOTAL*100")"
expect_jq '.currency' COP
expect_jq_not_empty '.signature'
expect_jq '.checkout_url | startswith("https://checkout.wompi.co/p/?")' true
note "amount esperado = ${WTOTAL}x100 (el .md asume 450000 con Espresso 4500); el redirect_url del request se ignora (usa APP_BASE_URL/orders)"
note "hallazgo #1 CORREGIDO (24-nov-2026): la firma es SHA256 simple (ref+monto+COP+secreto); se verifica con el vector oficial en go test ./internal/handlers -run Wompi"
end

begin PAY-13 "No se puede iniciar pago de orden ajena"
call POST /payments/wompi/initiate "{\"order_id\": $ORDER_WOMPI}" "$TOKEN_FREELANCER"
expect_status 403
expect_contains 'not your order'
end

begin PAY-14 "Verificar estado final completo del sistema"
call GET /mock/status
expect_status 200
expect_jq_le '.counts.orders_held' "${HELD0:-0}"
expect_jq_le '.counts.splits_pending' "${PEND0:-0}"
expect_jq '.freelancer_balances | map(select(.email=="maria@example.com")) | length' 1
expect_jq_ge '.freelancer_balances | map(select(.email=="maria@example.com")) | .[0].earnings_balance' 1
note "difiere del .md: no se espera 0 en escrow/splits pendientes porque la orden 2 del seed sigue 'held' (auto_confirm_at +24h); se compara contra la línea base de PAY-01 (held<=$HELD0, pending<=$PEND0)"
end

suite_summary
