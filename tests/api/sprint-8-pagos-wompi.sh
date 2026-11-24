#!/usr/bin/env bash
# Sprint 8 — "Mis pagos": historial y detalle de pagos de Wompi mapeados a pedidos, permisos y sincronización.
# Requiere MOCK_MODE=true (crea pagos con /mock/wompi/approve). No llama a Wompi real: con llave privada configurada,
# el caso PAYH-06 acepta 200 (consulta real a Wompi, sin cambios) o 503 (sin llave privada, p. ej. en CI).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 8 — Mis pagos (Wompi)   BASE=$BASE"

T_CARLOS="$(login_as carlos@example.com)"   # comprador
T_MARIA="$(login_as maria@example.com)"     # otro usuario (comisionista)
T_JUAN="$(login_as juan@example.com)"       # dueño de negocio

# Pedido pagado (mock) de Carlos en un negocio de Juan
call GET /me/businesses "" "$T_JUAN"; BIZ="$(jqv '(.businesses // .)[0].id')"
call GET "/products?business_id=$BIZ"; PROD="$(jqv '.products[0].id')"
call POST /orders "{\"business_id\":$BIZ,\"items\":[{\"product_id\":$PROD,\"quantity\":1}]}" "$T_CARLOS"
ORDER="$(jqv '.id')"; TOTAL="$(jqv '.total_amount')"
call POST /mock/wompi/approve "{\"order_id\":$ORDER}"
# Pedido sin pagar (para probar sync sin pago)
call POST /orders "{\"business_id\":$BIZ,\"items\":[{\"product_id\":$PROD,\"quantity\":1}]}" "$T_CARLOS"
ORDER_UNPAID="$(jqv '.id')"

begin PAYH-01 "El comprador ve su pago mapeado a su pedido"
call GET /payments "" "$T_CARLOS"
expect_status 200
expect_jq "[.payments[] | select(.order_id==$ORDER)] | length" 1
expect_jq "[.payments[] | select(.order_id==$ORDER)][0].status" APPROVED
expect_jq "[.payments[] | select(.order_id==$ORDER)][0].escrow_status" held
expect_jq "[.payments[] | select(.order_id==$ORDER)][0].order_status" paid
expect_true "amount_in_cents = total*100" test "$(jqv "[.payments[] | select(.order_id==$ORDER)][0].amount_in_cents")" = "$(awk "BEGIN{printf \"%d\", $TOTAL*100}")"
REF="$(jqv "[.payments[] | select(.order_id==$ORDER)][0].reference")"
end

begin PAYH-02 "Otro usuario NO ve pagos ajenos"
call GET /payments "" "$T_MARIA"
expect_status 200
expect_jq "[.payments[] | select(.order_id==$ORDER)] | length" 0
end

begin PAYH-03 "Detalle del pago: dueño 200 con línea de tiempo"
call GET "/payments/$REF" "" "$T_CARLOS"
expect_status 200
expect_jq '.payment.reference' "$REF"
expect_jq '.payment.order_id' "$ORDER"
expect_jq '.timeline | type' array
end

begin PAYH-04 "Detalle: ajeno 404, sin sesión 401, referencia inválida 400"
call GET "/payments/$REF" "" "$T_MARIA"; expect_status 404
call GET "/payments/$REF"; expect_status 401
call GET /payments; expect_status 401
call GET "/payments/a%20b" "" "$T_CARLOS"; expect_status 400
call GET "/payments/NO-EXISTE-123" "" "$T_CARLOS"; expect_status 404
end

begin PAYH-05 "scope=received: solo business_owner, sin datos personales del pagador"
call GET "/payments?scope=received" "" "$T_CARLOS"; expect_status 403
call GET "/payments?scope=received" "" "$T_JUAN"
expect_status 200
expect_jq "[.payments[] | select(.order_id==$ORDER)] | length" 1
expect_not_contains '"user_id"'
expect_not_contains 'carlos@example.com'
call GET "/payments?scope=otro" "" "$T_CARLOS"; expect_status 403
end

begin PAYH-06 "Sincronizar con Wompi: permisos y validación"
call POST /payments/wompi/sync "{\"order_id\":$ORDER}"; expect_status 401
call POST /payments/wompi/sync '{}' "$T_CARLOS"; expect_status 400
call POST /payments/wompi/sync "{\"order_id\":$ORDER}" "$T_MARIA"; expect_status 403
call POST /payments/wompi/sync '{"order_id":99999999}' "$T_CARLOS"; expect_status 404
call POST /payments/wompi/sync "{\"order_id\":$ORDER}" "$T_CARLOS"
expect_status 200 503
if [ "$STATUS" = 200 ]; then
  expect_jq '.payment_status' paid; expect_jq '.updated' false
  note "con llave privada: verificó contra Wompi (sin cambios, la orden ya estaba pagada)"
else
  expect_contains 'payment verification not configured'
  note "sin llave privada de Wompi en el backend: 503 esperado"
fi
end

begin PAYH-07 "Sincronizar dos veces seguidas: la segunda se limita (429) o no cambia nada"
call POST /payments/wompi/sync "{\"order_id\":$ORDER_UNPAID}" "$T_CARLOS"
if [ "$STATUS" = 503 ]; then skip "sin llave privada de Wompi"; else
  expect_status 200; expect_jq '.payment_status' pending
  call POST /payments/wompi/sync "{\"order_id\":$ORDER_UNPAID}" "$T_CARLOS"; expect_status 429
fi
end

begin PAYH-08 "Paginación: limit válido, límites y valores raros"
call GET "/payments?limit=1" "" "$T_CARLOS"; expect_status 200; expect_jq '.count' 1
call GET "/payments?limit=abc" "" "$T_CARLOS"; expect_status 200
call GET "/payments?limit=100000" "" "$T_CARLOS"; expect_status 200; expect_jq_le '.count' 100
end

suite_summary
