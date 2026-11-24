#!/usr/bin/env bash
# Sprint 1B — Flujo de ventas con comisionistas  (docs/tests/sprint-1b-comisionistas.md)
# Requiere MOCK_MODE=true (usa /mock/flow/full-sale).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 1B — Comisionistas   BASE=$BASE"
S="$(uniq_suffix)"

# ── helpers locales ───────────────────────────────────────────────────────────
biz_id(){ curl -sS -m 20 "$BASE/businesses" | jq -r --arg n "$1" '[.businesses[]? | select(.name==$n) | .id] | first // empty'; }
prod_id(){ curl -sS -m 20 "$BASE/products?business_id=$1" | jq -r --arg n "$2" '[.products[]? | select(.name==$n) | .id] | first // empty'; }
# Saldo / campos del comisionista leídos de GET /sell/links (se ejecutan en subshell: no tocan STATUS/BODY)
fl_balance(){ curl -sS -m 20 "$BASE/sell/links" -H "Authorization: Bearer $TOKEN_FREELANCER" | jq -r '.earnings_balance'; }
link_field(){ curl -sS -m 20 "$BASE/sell/links" -H "Authorization: Bearer $TOKEN_FREELANCER" | jq -r --arg s "$1" --arg f "$2" '[.links[]? | select(.slug==$s) | .[$f]] | first // empty'; }
num_eq(){ awk -v a="$1" -v b="$2" 'BEGIN{d=a-b; if(d<0)d=-d; exit !(a!="" && b!="" && d<0.01)}'; }
num_ge(){ awk -v a="$1" -v b="$2" 'BEGIN{exit !(a!="" && a+0>=b+0)}'; }
num_add(){ awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", a+b}'; }
num_sub(){ awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", a-b}'; }
full_sale(){ # PRODUCT_ID QTY [SLUG]  -> deja STATUS/BODY de la venta mock
  local body="{\"product_id\":$1,\"quantity\":$2"
  [ -n "${3:-}" ] && body+=",\"referral_slug\":\"$3\""
  body+="}"
  call POST /mock/flow/full-sale "$body" "$TOKEN_CUSTOMER"
}
ensure_balance(){ # MIN  -> hace ventas mock con la Hamaca hasta que el saldo de María sea >= MIN (máx. 4)
  local i
  for i in 1 2 3 4; do
    num_ge "$(fl_balance)" "$1" && return 0
    full_sale "$P_HAMACA" 1 "$SLUG_SEED"
  done
  return 0
}

# ── Setup ─────────────────────────────────────────────────────────────────────
TOKEN_FREELANCER="$(login_as maria@example.com)"
TOKEN_CUSTOMER="$(login_as carlos@example.com)"
TOKEN_OWNER="$(login_as juan@example.com)"

SLUG_SEED="hamaca-casa-narino-maria-x7k2"     # link del seed (María → Hamaca)
B1="$(biz_id 'Café La Esquina')"               # seed: id 1
B2="$(biz_id 'Artesanías Casa Nariño')"        # seed: id 2
P_ESPRESSO="$(prod_id "$B1" 'Espresso Doble')"           # seed: 1
P_CAPPUCCINO="$(prod_id "$B1" 'Cappuccino Clásico')"     # seed: 2
P_LATTE="$(prod_id "$B1" 'Latte Macchiato')"             # seed: 3
P_HAMACA="$(prod_id "$B2" 'Hamaca Artesanal')"           # seed: 4
P_MOCHILA="$(prod_id "$B2" 'Mochila Wayuu')"             # seed: 5
P_COLLAR="$(prod_id "$B2" 'Collar de Tagua')"            # seed: 6
call GET /me "" "$TOKEN_FREELANCER"; FL_ID="$(jqv '.user.id')"

# Producto propio y fresco (del negocio 2) para poder afiliar con 201 de forma determinista y
# luego desactivarlo (SELL-17) sin tocar productos del seed. Lo crea Juan (dueño del negocio 2).
call POST /products "{\"business_id\":$B2,\"name\":\"Afiliable $S\",\"description\":\"Producto de prueba SELL\",\"price\":10000,\"stock\":50,\"commission_rate\":0.20}" "$TOKEN_OWNER"
FRESH_PID="$(jqv '.id')"
SLUG_FRESH=""

begin SELL-01 "Freelancer se afilia a un producto"
note "el .md espera 201 para el producto 4, pero el seed ya trae el link de María sobre la Hamaca: responde 200 'already affiliated'. El 201 se valida con un producto nuevo"
call POST /sell/affiliate '{"product_id": '"$P_HAMACA"'}' "$TOKEN_FREELANCER"
expect_status 200 201
expect_jq '.referral_link.product_id' "$P_HAMACA"
expect_jq '.referral_link.freelancer_id' "$FL_ID"
expect_jq_not_empty '.referral_link.slug'
# Producto nuevo => se crea el link (201) con url y contadores en 0
call POST /sell/affiliate '{"product_id": '"${FRESH_PID:-0}"'}' "$TOKEN_FREELANCER"
expect_status 201
SLUG_FRESH="$(jqv '.referral_link.slug')"
expect_jq_not_empty '.referral_link.id'
expect_jq '.referral_link.product_id' "$FRESH_PID"
expect_jq '.referral_link.freelancer_id' "$FL_ID"
expect_jq_not_empty '.referral_link.slug'
expect_jq '.referral_link.clicks' 0
expect_jq '.referral_link.conversions' 0
expect_jq ".url | endswith(\"/r/${SLUG_FRESH:-sin-slug}\")" true
end

begin SELL-02 "Afiliarse dos veces al mismo producto devuelve el link existente"
call POST /sell/affiliate '{"product_id": '"$P_HAMACA"'}' "$TOKEN_FREELANCER"
expect_status 200
ID1="$(jqv '.referral_link.id')"
expect_jq '.message' 'already affiliated'
call POST /sell/affiliate '{"product_id": '"$P_HAMACA"'}' "$TOKEN_FREELANCER"
expect_status 200
expect_jq '.message' 'already affiliated'
expect_jq '.referral_link.id' "$ID1"
# No se duplicó el link
call GET /sell/links "" "$TOKEN_FREELANCER"
expect_jq "[.links[] | select(.product_id==$P_HAMACA)] | length" 1
end

begin SELL-03 "Customer no puede afiliarse a productos"
call POST /sell/affiliate '{"product_id": '"$P_HAMACA"'}' "$TOKEN_CUSTOMER"
expect_status 403
expect_jq '.error' 'only freelancers can affiliate to products'
end

begin SELL-04 "Afiliarse a producto inexistente"
call POST /sell/affiliate '{"product_id": 999999}' "$TOKEN_FREELANCER"
expect_status 404
expect_jq '.error' 'product not found'
end

begin SELL-05 "Click en link registra el evento"
CLICKS_ANTES="$(link_field "$SLUG_SEED" clicks)"
call GET "/r/$SLUG_SEED"
expect_status 200
expect_jq '.product.id' "$P_HAMACA"
expect_jq '.product.name' 'Hamaca Artesanal'
expect_jq '.product.price' 120000
expect_jq_not_empty '.referral_link_id'
expect_jq '.business_id' "$B2"
CLICKS_DESPUES="$(link_field "$SLUG_SEED" clicks)"
note "clicks: $CLICKS_ANTES -> $CLICKS_DESPUES (el .md asume 12 -> 13 del seed; aquí se compara por delta +1)"
expect_true "clicks aumentó en 1 ($CLICKS_ANTES -> $CLICKS_DESPUES)" num_eq "$CLICKS_DESPUES" "$(num_add "${CLICKS_ANTES:-x}" 1)"
end

begin SELL-06 "Link inexistente devuelve 404"
call GET /r/link-que-no-existe
expect_status 404
expect_jq '.error' 'link not found'
end

begin SELL-07 "Ver mis links con stats"
call GET /sell/links "" "$TOKEN_FREELANCER"
expect_status 200
expect_jq '.links | type' array
expect_jq '.earnings_balance | type' number
expect_jq "any(.links[]; .slug==\"$SLUG_SEED\")" true
LNK='.links[] | select(.slug=="'"$SLUG_SEED"'")'
expect_jq "$LNK | .url | endswith(\"/r/$SLUG_SEED\")" true
expect_jq_ge "$LNK | .clicks" 12
expect_jq_ge "$LNK | .conversions" 2
expect_jq "$LNK | .product.name" 'Hamaca Artesanal'
expect_jq "$LNK | .product.price" 120000
expect_jq "$LNK | .product.commission_rate" 0.2
note "el .md muestra clicks=12, conversions=2 y earnings_balance=0 (valores iniciales del seed); como el estado es compartido se exige >= en clicks/conversiones"
end

begin SELL-08 "Flujo completo: venta con comisionista"
full_sale "$P_HAMACA" 1 "$SLUG_SEED"
expect_status 200
expect_contains 'Flujo completo simulado'
expect_jq_not_empty '.order.id'
expect_jq '.order.total' 120000
expect_jq '.order.escrow_status' released
expect_jq '.order.status' delivered
expect_jq '.distribution.total' 120000
expect_jq '.distribution.platform_4pct' 4800
expect_jq '.distribution.freelancer' 24000
expect_jq '.distribution.business' 91200
expect_jq '.distribution | (.platform_4pct + .freelancer + .business) == .total' true
expect_jq '.commission_splits | length' 3
end

begin SELL-09 "Venta directa (sin comisionista): 96% al negocio"
full_sale "$P_ESPRESSO" 2
expect_status 200
expect_jq '.distribution.total' 9000
expect_jq '.distribution.platform_4pct' 360
expect_jq '.distribution.freelancer' 0
expect_jq '.distribution.business' 8640
expect_jq '.commission_splits | length' 2
expect_jq '.freelancer_balance' null
end

begin SELL-10 "Saldo del comisionista se acredita después de la venta"
SALDO_ANTES="$(fl_balance)"
full_sale "$P_HAMACA" 1 "$SLUG_SEED"
expect_status 200
SALDO_DESPUES="$(fl_balance)"
note "saldo: $SALDO_ANTES -> $SALDO_DESPUES"
expect_true "saldo después ($SALDO_DESPUES) = antes ($SALDO_ANTES) + 24000" num_eq "$SALDO_DESPUES" "$(num_add "${SALDO_ANTES:-x}" 24000)"
expect_jq '.freelancer_balance' "$SALDO_DESPUES"
end

begin SELL-11 "Conversiones del link se incrementan"
CONV_ANTES="$(link_field "$SLUG_SEED" conversions)"
full_sale "$P_HAMACA" 1 "$SLUG_SEED"
expect_status 200
CONV_DESPUES="$(link_field "$SLUG_SEED" conversions)"
note "conversiones: $CONV_ANTES -> $CONV_DESPUES"
expect_true "conversiones después ($CONV_DESPUES) = antes ($CONV_ANTES) + 1" num_eq "$CONV_DESPUES" "$(num_add "${CONV_ANTES:-x}" 1)"
end

begin SELL-12 "Retiro de ganancias exitoso"
ensure_balance 24000      # el .md pide ejecutar SELL-10 antes; aquí se garantiza el saldo
SALDO_ANTES="$(fl_balance)"
call POST /sell/withdraw '{"amount": 24000, "nequi_number": "3205551234"}' "$TOKEN_FREELANCER"
expect_status 201
expect_jq '.withdrawal.amount' 24000
expect_jq '.withdrawal.nequi_number' 3205551234
expect_jq '.withdrawal.status' pending
expect_jq '.withdrawal.freelancer_id' "$FL_ID"
expect_contains 'Withdrawal request created'
note "remaining_balance se compara contra (saldo antes - 24000); el .md asume saldo 24000 => 0"
expect_true "remaining_balance = $SALDO_ANTES - 24000" num_eq "$(jqv '.remaining_balance')" "$(num_sub "${SALDO_ANTES:-x}" 24000)"
expect_true "saldo real descontado" num_eq "$(fl_balance)" "$(num_sub "${SALDO_ANTES:-x}" 24000)"
end

begin SELL-13 "Retiro con saldo insuficiente"
SALDO_ANTES="$(fl_balance)"
call POST /sell/withdraw '{"amount": 999999, "nequi_number": "3205551234"}' "$TOKEN_FREELANCER"
expect_status 400
expect_jq '.error' 'insufficient balance'
expect_true "saldo sin cambios" num_eq "$(fl_balance)" "${SALDO_ANTES:-x}"
end

begin SELL-14 "Retiro por debajo del mínimo (\$5.000)"
# El backend valida primero el saldo y después el mínimo: se necesita saldo >= 1000 para llegar a la regla del mínimo.
ensure_balance 5000
SALDO_ANTES="$(fl_balance)"
call POST /sell/withdraw '{"amount": 1000, "nequi_number": "3205551234"}' "$TOKEN_FREELANCER"
expect_status 400
expect_contains 'minimum withdrawal'
expect_true "saldo sin cambios" num_eq "$(fl_balance)" "${SALDO_ANTES:-x}"
end

begin SELL-15 "Customer no puede retirar ganancias"
call POST /sell/withdraw '{"amount": 5000, "nequi_number": "3109876543"}' "$TOKEN_CUSTOMER"
expect_status 403
expect_jq '.error' 'only freelancers can request withdrawals'
end

begin SELL-16 "Comisionista puede afiliarse a productos de múltiples negocios sin límite"
for pid in "$P_ESPRESSO" "$P_CAPPUCCINO" "$P_COLLAR" "$P_LATTE" "$P_MOCHILA"; do
  call POST /sell/affiliate '{"product_id": '"${pid:-0}"'}' "$TOKEN_FREELANCER"
  expect_status 200 201
  expect_jq_not_empty '.referral_link.id'
  expect_jq '.referral_link.product_id' "$pid"
done
call GET /sell/links "" "$TOKEN_FREELANCER"
expect_status 200
expect_jq ".links | map(.business_id) | unique | contains([$B1, $B2])" true
expect_jq ".links | map(.product_id) | unique | contains([$P_ESPRESSO, $P_CAPPUCCINO, $P_LATTE, $P_HAMACA, $P_MOCHILA, $P_COLLAR])" true
note "se afilian 5 productos (más el de la Hamaca del seed) en 2 negocios: el sistema no impone límite"
end

begin SELL-17 "Link de producto inactivo no genera comisión"
note "el .md dice que PATCH /products/:id es del Sprint 6 y no existe; hoy sí existe (PatchProduct) y sincroniza los links. Se prueba la desactivación con un producto propio, no con la Hamaca del seed"
# 1) El producto 4 está activo y re-afiliar devuelve el link existente
call GET "/products?business_id=$B2"
expect_jq "[.products[] | select(.id==$P_HAMACA)] | first | .is_active" true
call POST /sell/affiliate '{"product_id": '"$P_HAMACA"'}' "$TOKEN_FREELANCER"
expect_status 200
expect_jq '.message' 'already affiliated'
# 2) Con el producto activo, el link responde 200
call GET "/r/${SLUG_FRESH:-sin-slug}"
expect_status 200
# 3) El dueño desactiva el producto
call PATCH "/products/${FRESH_PID:-0}" '{"is_active": false}' "$TOKEN_OWNER"
expect_status 200
expect_jq '.is_active' false
# 4) El link ya no funciona
call GET "/r/${SLUG_FRESH:-sin-slug}"
expect_status 400
expect_jq '.error' 'product is no longer available'
# 5) No se puede afiliar a un producto inactivo
call POST /sell/affiliate '{"product_id": '"${FRESH_PID:-0}"'}' "$TOKEN_FREELANCER"
expect_status 400
expect_jq '.error' 'product is not active'
# 6) El link quedó inactivo (ya no sale en /sell/links)
call GET /sell/links "" "$TOKEN_FREELANCER"
expect_jq "any(.links[]; .slug==\"${SLUG_FRESH:-sin-slug}\")" false
end

suite_summary
