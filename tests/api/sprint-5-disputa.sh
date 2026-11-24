#!/usr/bin/env bash
# Sprint 5 — Disputas y protección del comprador (docs/tests/sprint-5-disputa.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 5 — Disputas   BASE=$BASE"
S="$(uniq_suffix)"

# ── Helpers locales (sin subshell para conservar BODY/STATUS y los errores del caso) ──
NEW_ID=""
mk_product(){ # nombre precio stock comision business_id  -> NEW_ID   (lo crea juan, dueño de ambos negocios)
  call POST /products "{\"business_id\":$5,\"name\":\"$1\",\"description\":\"Producto de prueba API\",\"price\":$2,\"stock\":$3,\"commission_rate\":$4}" "$TOKEN_OWNER"
  NEW_ID="$(jqv '.id')"
  { [ -n "$NEW_ID" ] && [ "$NEW_ID" != "null" ]; } || _err "no se pudo crear el producto '$1' (status $STATUS)"
}
mk_paid_order(){ # token business_id product_id [freelancer_id]  -> NEW_ID (orden pagada, escrow held)
  local fl=""; [ -n "${4:-}" ] && fl=",\"freelancer_id\":$4"
  call POST /orders "{\"business_id\":$2$fl,\"items\":[{\"product_id\":$3,\"quantity\":1}]}" "$1"
  NEW_ID="$(jqv '.id')"
  { [ -n "$NEW_ID" ] && [ "$NEW_ID" != "null" ]; } || { _err "no se pudo crear la orden (status $STATUS) $BODY"; return 0; }
  call POST /mock/wompi/approve "{\"order_id\": $NEW_ID}"
  [ "$STATUS" = "200" ] || _err "wompi/approve de la orden $NEW_ID devolvió $STATUS"
}

# ── Setup ─────────────────────────────────────────────────────────────────────
TOKEN_CUSTOMER="$(login_as carlos@example.com)"
TOKEN_OWNER="$(login_as juan@example.com)"
TOKEN_MARIA="$(login_as maria@example.com)"
call POST /mock/seed-admin; TOKEN_ADMIN="$(jqv '.token')"
call GET /me "" "$TOKEN_MARIA"; MARIA_ID="$(jqv '.user.id')"
call GET /me/businesses "" "$TOKEN_OWNER"
BIZ1="$(jqv '[.businesses[] | select(.name=="Café La Esquina")][0].id // empty')"; [ -n "$BIZ1" ] || BIZ1=1
BIZ2="$(jqv '[.businesses[] | select(.name=="Artesanías Casa Nariño")][0].id // empty')"; [ -n "$BIZ2" ] || BIZ2=2

# Productos propios (evita depender del stock/estado de los productos del seed, compartido con otras suites)
mk_product "Hamaca Disputa $S" 120000 100 0.20 "$BIZ2"; P_ART="$NEW_ID"
mk_product "Cafe Disputa $S"    10000 100 0.15 "$BIZ1"; P_CAFE="$NEW_ID"

# Orden en escrow para los tests de disputa (Setup del .md)
mk_paid_order "$TOKEN_CUSTOMER" "$BIZ2" "$P_ART"; ORDER_ID="$NEW_ID"
echo "  · Orden en escrow: $ORDER_ID  (admin_token=${TOKEN_ADMIN:+ok}  maria_id=$MARIA_ID  biz1=$BIZ1 biz2=$BIZ2)"

begin DISP-01 "Negocio reporta que el producto no llegó al comprador"
call POST /orders/$ORDER_ID/dispute '{"reason":"El comprador no estaba en la dirección indicada","reported_by":"business"}' "$TOKEN_OWNER"
expect_status 200; expect_jq '.status' disputed; expect_jq '.escrow_status' held
end

begin DISP-02 "Orden en disputa no puede confirmarse por el comprador"
call POST /orders/$ORDER_ID/confirm "" "$TOKEN_CUSTOMER"
expect_status 400; expect_jq '.error' 'order is under dispute, cannot confirm'
end

begin DISP-03 "Orden en disputa no puede liberarse del escrow"
call POST /mock/escrow/release "{\"order_id\": $ORDER_ID}"
expect_status 400; expect_jq '.error' 'order is under dispute'
end

begin DISP-04 "Admin resuelve disputa a favor del comprador (reembolso)"
call POST /admin/disputes/$ORDER_ID/resolve '{"resolution":"refund_buyer","notes":"El negocio no pudo demostrar que el producto fue enviado"}' "$TOKEN_ADMIN"
expect_status 200; expect_jq '.status' cancelled; expect_jq '.escrow_status' refunded; expect_jq '.payment_status' refunded
call GET /orders/$ORDER_ID "" "$TOKEN_CUSTOMER"
expect_status 200; expect_jq '.order.status' cancelled; expect_jq '.order.escrow_status' refunded
expect_jq '.order.commission_splits | map(.status) | unique | join(",")' failed
note "extra: la orden queda persistida como cancelled/refunded y sus splits en failed"
end

begin DISP-05 "Admin resuelve disputa a favor del negocio (libera pago)"
mk_paid_order "$TOKEN_CUSTOMER" "$BIZ1" "$P_CAFE"; ORDER_D2="$NEW_ID"
call POST /orders/$ORDER_D2/dispute '{"reason":"Comprador no recogió","reported_by":"business"}' "$TOKEN_OWNER"
expect_status 200; expect_jq '.status' disputed
call POST /admin/disputes/$ORDER_D2/resolve '{"resolution":"release_business","notes":"El negocio tiene evidencia de que el producto estaba listo"}' "$TOKEN_ADMIN"
expect_status 200; expect_jq '.status' delivered; expect_jq '.escrow_status' released
call GET /orders/$ORDER_D2 "" "$TOKEN_CUSTOMER"
expect_jq '.order.commission_splits | map(.status) | unique | join(",")' released
note "el .md usa product 1 / business 1; aquí se usa un producto propio del negocio 'Café La Esquina' (mismo flujo)"
end

begin DISP-06 "Comprador puede reportar que no recibió el producto"
mk_paid_order "$TOKEN_CUSTOMER" "$BIZ2" "$P_ART"; ORDER_D3="$NEW_ID"
call POST /orders/$ORDER_D3/dispute '{"reason":"Pagué pero nunca recibí el producto","reported_by":"buyer"}' "$TOKEN_CUSTOMER"
expect_status 200; expect_jq '.status' disputed; expect_jq '.escrow_status' held
note "el .md usa product 5 (Mochila); aquí un producto propio del negocio 2 (mismo flujo)"
end

begin DISP-07 "Auto-confirm NO aplica a órdenes en disputa"
# El .md usa \$ORDER_ID (que en DISP-04 ya quedó cancelled) y llama con {} (liberaría otras órdenes vencidas del
# entorno compartido). Aquí se apunta a la orden que sigue en disputa (DISP-06) con order_id explícito.
call POST /mock/escrow/auto-confirm "{\"order_id\": $ORDER_D3}"
expect_status 200; expect_jq '.processed' 0
call GET /orders/$ORDER_D3 "" "$TOKEN_CUSTOMER"
expect_status 200; expect_jq '.order.status' disputed; expect_jq '.order.escrow_status' held
note "difiere del .md: se usa la orden de DISP-06 (disputada) y auto-confirm con order_id, no con {}"
end

begin DISP-08 "Comisionista no pierde comisión por disputa hasta resolución"
mk_paid_order "$TOKEN_CUSTOMER" "$BIZ2" "$P_ART" "$MARIA_ID"; ORDER_FRAUD="$NEW_ID"
call POST /orders/$ORDER_FRAUD/dispute '{"reason":"Test","reported_by":"business"}' "$TOKEN_OWNER"
expect_status 200; expect_jq '.status' disputed
call GET /orders/$ORDER_FRAUD "" "$TOKEN_CUSTOMER"
expect_status 200
expect_jq '.order.commission_splits[] | select(.recipient_type=="freelancer") | .status' pending
expect_jq '.order.commission_splits | map(.status) | unique | join(",")' pending
end

suite_summary
