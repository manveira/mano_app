#!/usr/bin/env bash
# Sprint 1D — Órdenes, Feed y Dashboard (docs/tests/sprint-1d-ordenes-feed-dashboard.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 1D — Órdenes/Feed/Dashboard   BASE=$BASE"

TOKEN_OWNER="$(login_as juan@example.com)"
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

# Ids reales de los usuarios (no se asume el orden del seed)
call GET /me "" "$TOKEN_CUSTOMER";   CARLOS_ID="$(jqv '.user.id')"
call GET /me "" "$TOKEN_FREELANCER"; MARIA_ID="$(jqv '.user.id')"
# Valores actuales de los productos que usan los cálculos (con fallback a los del seed)
P1="$(pf 1 1 price)"; P1="${P1:-4500}"
P2="$(pf 1 2 price)"; P2="${P2:-5500}"
P4="$(pf 2 4 price)"; P4="${P4:-120000}"
R4="$(pf 2 4 commission_rate)"; R4="${R4:-0.2}"

# ═══ ÓRDENES ═════════════════════════════════════════════════════════════════

begin ORD-01 "Crear orden válida con múltiples items"
EXP_TOTAL="$(calc "$P1*2+$P2")"; EXP_COM="$(calc "($P1*2+$P2)*0.04")"
call POST /orders "{\"business_id\":1,\"items\":[{\"product_id\":1,\"quantity\":2},{\"product_id\":2,\"quantity\":1}]}" "$TOKEN_CUSTOMER"
expect_status 201
expect_true "total = $EXP_TOTAL" near "$(jqv '.total_amount')" "$EXP_TOTAL"
expect_true "commission (4%) = $EXP_COM" near "$(jqv '.commission')" "$EXP_COM"
expect_jq '.status' pending_payment
expect_jq '.payment_status' pending
expect_jq '.escrow_status' pending
expect_jq '.items | length' 2
expect_jq '.customer_id' "$CARLOS_ID"
note "el .md asume Espresso 4500 y Cappuccino 5500 -> total 14500 / comisión 580; aquí se calcula con los precios vigentes"
end

begin ORD-02 "Orden incluye items con nombre del producto"
NAME4="$(pf 2 4 name)"; NAME4="${NAME4:-Hamaca Artesanal}"
mk_order "$TOKEN_CUSTOMER" 2 4 1; ORDER_ID="$ORDER_NEW"
call GET "/orders/$ORDER_ID" "" "$TOKEN_CUSTOMER"
expect_status 200
expect_jq_not_empty '.order.items[0].product.name'
expect_jq '.order.items[0].product.name' "$NAME4"
end

begin ORD-03 "Listar órdenes como customer solo muestra las suyas"
call GET /orders "" "$TOKEN_CUSTOMER"
expect_status 200
expect_jq_ge '.orders | length' 1
expect_jq '[.orders[].customer_id] | unique | map(tostring) | join(",")' "$CARLOS_ID"
end

begin ORD-04 "Listar órdenes como business_owner muestra las de sus negocios"
call GET /me/businesses "" "$TOKEN_OWNER"
OWN_IDS="$(jqv '[.businesses[].id] | sort')"
OWN_IDS="${OWN_IDS//[$'\n ']/}"
call GET /orders "" "$TOKEN_OWNER"
expect_status 200
expect_jq_ge '.orders | length' 2
expect_jq "([.orders[].business_id] | unique) - ${OWN_IDS:-[1,2]} | length" 0
expect_jq "([.orders[].business_id] | unique) | contains([1,2])" true
note "ids de negocios de juan: ${OWN_IDS}"
end

begin ORD-05 "Customer no puede ver orden de otro customer (orden 1 es de carlos; María la intenta ver)"
call GET /orders/1 "" "$TOKEN_FREELANCER"
expect_status 403
expect_contains "you don't have permission to view this order"
end

begin ORD-06 "Owner puede ver órdenes de sus negocios"
call GET /orders/1 "" "$TOKEN_OWNER"
expect_status 200
expect_jq '.order.id' 1
expect_jq '.order.business_id' 1
end

begin ORD-07 "Orden sin items es rechazada"
call POST /orders '{"business_id":1,"items":[]}' "$TOKEN_CUSTOMER"
expect_status 400
end

begin ORD-08 "Orden con quantity=0 es rechazada"
call POST /orders '{"business_id":1,"items":[{"product_id":1,"quantity":0}]}' "$TOKEN_CUSTOMER"
expect_status 400
end

begin ORD-09 "Comisión del freelancer se calcula correctamente"
EXP_COM="$(calc "$P4*0.04")"; EXP_FL="$(calc "$P4*$R4")"
call POST /orders "{\"business_id\":2,\"freelancer_id\":$MARIA_ID,\"items\":[{\"product_id\":4,\"quantity\":1}]}" "$TOKEN_CUSTOMER"
expect_status 201
expect_true "total_amount = $P4" near "$(jqv '.total_amount')" "$P4"
expect_true "commission = $EXP_COM" near "$(jqv '.commission')" "$EXP_COM"
expect_true "freelancer_commission = $EXP_FL" near "$(jqv '.freelancer_commission')" "$EXP_FL"
expect_jq '.freelancer_id' "$MARIA_ID"
note "el .md asume Hamaca 120000 al 20% -> 4800 / 24000; aquí se calcula con precio ($P4) y tasa ($R4) vigentes"
note "hallazgo #7: /orders no aplica anti-fraude (misma cédula); #8: /orders/guest ignora referral_link_id (solo freelancer_id)"
end

# ═══ FEED ════════════════════════════════════════════════════════════════════

begin FEED-01 "Feed público devuelve stories y anuncios"
call GET /feed
expect_status 200
expect_jq_ge '.stories | length' 1
expect_jq_ge '.advertisements | length' 0
note "la story del seed expira 24 h después de sembrar la BD: con una BD de más de 24 h este caso (y FEED-02) falla por datos, no por código"
end

begin FEED-02 "Story del seed tiene expiración"
call GET /stories
expect_status 200
expect_jq_ge '.stories | length' 1
expect_jq '[.stories[] | (.expires_at | sub("\\.[0-9]+";"") | fromdateiso8601) > now] | all' true
expect_jq_not_empty '.stories[0].title'
end

begin FEED-03 "Crear story autenticado"
xfail "gap: CreateStory no asigna expires_at (queda 0001-01-01), debería ser +24h; además la story creada no aparece en /feed ni /stories"
call POST /stories '{"title":"Nueva colección de hamacas","content":"Llegaron 10 hamacas nuevas con diseños exclusivos del Pacífico","media_url":"https://example.com/hamaca.jpg"}' "$TOKEN_OWNER"
expect_status 201
expect_jq_not_empty '.id'
expect_jq '.title' "Nueva colección de hamacas"
expect_jq '(.expires_at | sub("\\.[0-9]+";"") | fromdateiso8601) > (now + 23*3600)' true
expect_jq '(.expires_at | sub("\\.[0-9]+";"") | fromdateiso8601) < (now + 25*3600)' true
end

begin FEED-04 "Crear story sin token"
call POST /stories '{"title":"X","content":"X"}'
expect_status 401
end

begin FEED-05 "Anuncios activos aparecen en el feed"
call POST /ads '{"business_id":1,"title":"Café especial de temporada","description":"Granos de Colombia recién llegados","package_type":"Paquete básico","active":true}' "$TOKEN_OWNER"
expect_status 201
AD_ID="$(jqv '.id')"
expect_jq_not_empty '.id'
expect_jq '.active' true
call GET /feed
expect_status 200
expect_jq_ge '.advertisements | length' 1
expect_jq "[.advertisements[].id] | any(. == ${AD_ID:-0})" true
end

begin FEED-06 "Solo business_owner puede crear anuncios"
call POST /ads '{"business_id":1,"title":"X","description":"X","package_type":"básico","active":true}' "$TOKEN_CUSTOMER"
expect_status 403
end

begin FEED-07 "Recomendaciones con ubicación"
call GET "/recommendations?latitude=1.7989&longitude=-78.7628"
expect_status 200
expect_jq_ge '.recommendations.local_businesses | length' 2
expect_jq_ge '.recommendations.advertisements | length' 1
expect_jq '.recommendations.local_businesses | map(.id) | contains([1,2])' true
end

# ═══ DASHBOARD ═══════════════════════════════════════════════════════════════

begin DASH-01 "Dashboard muestra stats correctas"
call GET /dashboard "" "$TOKEN_OWNER"
expect_status 200
expect_jq '.dashboard | map(.business_id) | contains([1,2])' true
expect_jq_not_empty '.dashboard[] | select(.business_id==1) | .name'
expect_jq_not_empty '.dashboard[] | select(.business_id==2) | .name'
expect_jq '[.dashboard[] | (.orders | type) == "number" and (.revenue | type) == "number"] | all' true
expect_jq_ge '.dashboard[] | select(.business_id==1) | .orders' 1
expect_jq_ge '.dashboard[] | select(.business_id==1) | .revenue' 1
end

begin DASH-02 "Dashboard solo para business_owner"
call GET /dashboard "" "$TOKEN_CUSTOMER";   expect_status 403
call GET /dashboard "" "$TOKEN_FREELANCER"; expect_status 403
end

begin DASH-03 "Revenue aumenta después de una venta completada"
call GET /dashboard "" "$TOKEN_OWNER"
REV_ANTES="$(jqv '.dashboard[] | select(.business_id==1) | .revenue')"
ORD_ANTES="$(jqv '.dashboard[] | select(.business_id==1) | .orders')"
call POST /mock/flow/full-sale '{"product_id":1,"quantity":2}' "$TOKEN_CUSTOMER"
expect_status 200
expect_jq '.order.status' delivered
call GET /dashboard "" "$TOKEN_OWNER"
REV_DESPUES="$(jqv '.dashboard[] | select(.business_id==1) | .revenue')"
ORD_DESPUES="$(jqv '.dashboard[] | select(.business_id==1) | .orders')"
EXP_DELTA="$(calc "$P1*2")"
expect_true "revenue sube $EXP_DELTA (antes=$REV_ANTES, después=$REV_DESPUES)" near "$(calc "$REV_DESPUES-$REV_ANTES")" "$EXP_DELTA"
expect_true "orders sube 1 (antes=$ORD_ANTES, después=$ORD_DESPUES)" near "$(calc "$ORD_DESPUES-$ORD_ANTES")" 1
note "el dashboard solo suma órdenes con status pending/completed/delivered; 'pending_payment' y 'paid' no cuentan"
end

# ═══ PAQUETES PUBLICITARIOS ══════════════════════════════════════════════════

begin PACK-01 "Listar paquetes publicitarios"
call GET /packages
expect_status 200
expect_jq_ge '.packages | length' 3
expect_jq '.packages[] | select(.name=="Paquete básico")    | .price' 29990
expect_jq '.packages[] | select(.name=="Paquete básico")    | .duration_days' 7
expect_jq '.packages[] | select(.name=="Paquete premium")   | .price' 69990
expect_jq '.packages[] | select(.name=="Paquete premium")   | .duration_days' 14
expect_jq '.packages[] | select(.name=="Paquete destacado") | .price' 129990
expect_jq '.packages[] | select(.name=="Paquete destacado") | .duration_days' 30
expect_jq '[.packages[].active] | all' true
end

begin PACK-02 "Comprar paquete como business_owner"
PK_ID="$(call GET /packages; jqv '.packages[] | select(.name=="Paquete básico") | .id')"
call POST /packages/purchase "{\"business_id\": 1, \"package_id\": ${PK_ID:-1}}" "$TOKEN_OWNER"
expect_status 201
expect_jq '.transaction.status' pending
expect_jq '.advertisement.active' true
expect_jq '.advertisement.business_id' 1
expect_jq '.advertisement.package_type' "Paquete básico"
note "hallazgo #5: el anuncio se activa con la transacción en 'pending' (sin cobrar) y ExpiresAt nunca se llena; la transacción se registra en USD aunque los precios son COP. El .md documenta este comportamiento"
end

begin PACK-03 "Customer no puede comprar paquetes"
call POST /packages/purchase '{"business_id":1,"package_id":1}' "$TOKEN_CUSTOMER"
expect_status 403
end

# ═══ DELIVERY ════════════════════════════════════════════════════════════════

begin DELIV-01 "Crear delivery para orden propia"
mk_order "$TOKEN_CUSTOMER" 1 1 1; ORDER_D="$ORDER_NEW"
call POST /deliveries "{\"order_id\": $ORDER_D, \"eta\": \"2026-06-01T15:00:00Z\", \"tracking\": \"TRK-001\"}" "$TOKEN_CUSTOMER"
expect_status 201
expect_jq '.status' scheduled
expect_jq '.order_id' "$ORDER_D"
expect_jq '.tracking' TRK-001
expect_jq '.eta' "2026-06-01T15:00:00Z"
end

begin DELIV-02 "Delivery aparece en el detalle de la orden"
call GET "/orders/$ORDER_D" "" "$TOKEN_CUSTOMER"
expect_status 200
expect_jq '.order.delivery.status' scheduled
expect_jq '.order.delivery.eta' "2026-06-01T15:00:00Z"
expect_jq '.order.delivery.tracking' TRK-001
end

suite_summary
