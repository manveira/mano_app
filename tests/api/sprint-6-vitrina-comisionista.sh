#!/usr/bin/env bash
# Sprint 6 — Vitrina pública del comisionista (docs/tests/sprint-6-vitrina-comisionista.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 6 — Vitrina del comisionista   BASE=$BASE"
S="$(uniq_suffix)"

# ── Helpers locales (sin subshell para conservar BODY/STATUS y los errores del caso) ──
NEW_ID=""
mk_product(){ # nombre precio stock comision business_id  -> NEW_ID   (lo crea juan, dueño de ambos negocios)
  call POST /products "{\"business_id\":$5,\"name\":\"$1\",\"description\":\"Producto de prueba API\",\"price\":$2,\"stock\":$3,\"commission_rate\":$4}" "$TOKEN_OWNER"
  NEW_ID="$(jqv '.id')"
  { [ -n "$NEW_ID" ] && [ "$NEW_ID" != "null" ]; } || _err "no se pudo crear el producto '$1' (status $STATUS)"
}
new_phone(){ printf -v PHONE '3%04d%05d' $((RANDOM % 10000)) $RANDOM; }   # 3 + 9 dígitos (hallazgo #18)

# ── Setup ─────────────────────────────────────────────────────────────────────
TOKEN_OWNER="$(login_as juan@example.com)"
TOKEN_CUSTOMER="$(login_as carlos@example.com)"
call GET /me/businesses "" "$TOKEN_OWNER"
BIZ1="$(jqv '[.businesses[] | select(.name=="Café La Esquina")][0].id // empty')"; [ -n "$BIZ1" ] || BIZ1=1
BIZ2="$(jqv '[.businesses[] | select(.name=="Artesanías Casa Nariño")][0].id // empty')"; [ -n "$BIZ2" ] || BIZ2=2

# Comisionista propio (el .md usa a María, pero su vitrina acumula links de otras suites => no determinista)
FL_USER="vend$S"
new_phone
call POST /auth/signup "{\"name\":\"Vendedora Prueba $S\",\"email\":\"vend$S@test.com\",\"password\":\"password123\",\"role\":\"freelancer\",\"phone\":\"$PHONE\",\"username\":\"$FL_USER\"}"
FL_ID="$(jqv '.id')"
TOKEN_FL="$(login_as "vend$S@test.com")"

# Productos propios (uno por negocio) y afiliación del comisionista (Setup del .md)
mk_product "Hamaca Vitrina $S" 120000 200 0.20 "$BIZ2"; PROD_A="$NEW_ID"
mk_product "Cafe Vitrina $S"    10000 200 0.15 "$BIZ1"; PROD_B="$NEW_ID"
call POST /sell/affiliate "{\"product_id\": $PROD_A}" "$TOKEN_FL"; SLUG_A="$(jqv '.referral_link.slug')"
call POST /sell/affiliate "{\"product_id\": $PROD_B}" "$TOKEN_FL"; SLUG_B="$(jqv '.referral_link.slug')"
echo "  · freelancer=$FL_USER (id=$FL_ID)  prodA=$PROD_A($SLUG_A) prodB=$PROD_B($SLUG_B)  biz1=$BIZ1 biz2=$BIZ2"

begin VIT-01 "Perfil público del comisionista es accesible sin auth"
call GET /vendedor/$FL_USER
expect_status 200
expect_jq '.freelancer.username' "$FL_USER"
expect_jq '.freelancer.name' "Vendedora Prueba $S"
expect_jq '.products | length' 2
expect_jq ".products[] | select(.id==$PROD_A) | .name" "Hamaca Vitrina $S"
expect_jq ".products[] | select(.id==$PROD_A) | .price" 120000
expect_jq ".products[] | select(.id==$PROD_A) | .commission_rate" 0.2
expect_jq ".products[] | select(.id==$PROD_A) | .referral_slug" "$SLUG_A"
expect_jq ".products[] | select(.id==$PROD_B) | .referral_slug" "$SLUG_B"
call GET /vendedor/maria
expect_status 200; expect_jq '.freelancer.name' 'María García'; expect_jq '.freelancer.username' maria
expect_jq '.products | type' array
note "difiere del .md: la lista de productos se verifica con un comisionista propio; con María solo se comprueba perfil y acceso sin token"
end

begin VIT-02 "Vitrina solo muestra productos con links activos"
mk_product "Mochila Vitrina $S" 85000 200 0.20 "$BIZ2"; PROD_C="$NEW_ID"
call POST /sell/affiliate "{\"product_id\": $PROD_C}" "$TOKEN_FL"; expect_status 201
call GET /vendedor/$FL_USER
expect_status 200; expect_jq '.products | length' 3; expect_jq "[.products[] | select(.id==$PROD_C)] | length" 1
# No hay endpoint para desactivar solo el link: se desactiva el producto, que sincroniza sus links (PatchProduct)
call PATCH /products/$PROD_C '{"is_active": false}' "$TOKEN_OWNER"; expect_status 200
call GET /vendedor/$FL_USER
expect_status 200; expect_jq '.products | length' 2; expect_jq "[.products[] | select(.id==$PROD_C)] | length" 0
LEN_V="$(jqv '.products | length')"
call GET /sell/links "" "$TOKEN_FL"
expect_status 200; expect_jq '.links | length' "$LEN_V"
note "número de productos en la vitrina == número de links activos del comisionista"
end

begin VIT-03 "Compra desde la vitrina genera comisión al comisionista"
call GET /sell/links "" "$TOKEN_FL"; BAL_BEFORE="$(jqv '.earnings_balance')"
call GET /vendedor/$FL_USER
SLUG="$(jqv ".products[] | select(.id==$PROD_A) | .referral_slug")"
call POST /mock/flow/full-sale "{\"product_id\": $PROD_A, \"quantity\": 1, \"referral_slug\": \"$SLUG\"}" "$TOKEN_CUSTOMER"
expect_status 200
expect_jq_ge '.distribution.freelancer' 23999.99; expect_jq_le '.distribution.freelancer' 24000.01
expect_jq_ge '.distribution.platform_4pct' 4799.99; expect_jq_le '.distribution.platform_4pct' 4800.01
expect_jq '.order.status' delivered
call GET /sell/links "" "$TOKEN_FL"
BAL_AFTER="$(jqv '.earnings_balance')"
expect_true "saldo del comisionista +24.000 (antes=$BAL_BEFORE después=$BAL_AFTER)" \
  awk -v a="$BAL_BEFORE" -v b="$BAL_AFTER" 'BEGIN{d=b-a; exit !(d>23999.99 && d<24000.01)}'
end

begin VIT-04 "Vitrina de comisionista inexistente devuelve 404"
call GET /vendedor/usuarioquenoexiste$S
expect_status 404; expect_jq '.error' 'freelancer not found'
end

begin VIT-05 "Vitrina no muestra información sensible del comisionista"
call GET /vendedor/$FL_USER
expect_status 200
expect_jq '.freelancer | keys | join(",")' 'name,username'
for k in email document_id phone nequi_number earnings_balance password; do expect_not_contains "\"$k\""; done
end

begin VIT-06 "Comisionista puede afiliarse a productos de múltiples negocios sin límite"
call POST /sell/affiliate "{\"product_id\": $PROD_B}" "$TOKEN_FL"
expect_status 200 201; expect_jq '.referral_link.business_id' "$BIZ1"
call POST /sell/affiliate "{\"product_id\": $PROD_A}" "$TOKEN_FL"
expect_status 200 201; expect_jq '.referral_link.business_id' "$BIZ2"
call GET /sell/links "" "$TOKEN_FL"
expect_status 200; expect_jq '.links | map(.business_id) | unique | length' 2
note "el .md usa los productos 1 y 4 de María; aquí productos propios de los negocios 1 y 2 con un comisionista propio"
end

begin VIT-07 "Link de producto inactivo no genera comisión"
mk_product "Hamaca Inactiva $S" 120000 200 0.20 "$BIZ2"; PROD_D="$NEW_ID"
call POST /sell/affiliate "{\"product_id\": $PROD_D}" "$TOKEN_FL"; expect_status 201; SLUG_D="$(jqv '.referral_link.slug')"
# Desactivar el producto (dueño del negocio)
call PATCH /products/$PROD_D '{"is_active": false}' "$TOKEN_OWNER"
expect_status 200; expect_jq '.is_active' false
# El link del producto inactivo ya no resuelve
call GET /r/$SLUG_D
expect_status 400 404; expect_contains 'no longer available'
# No se puede (re)afiliar a un producto inactivo
call POST /sell/affiliate "{\"product_id\": $PROD_D}" "$TOKEN_FL"
expect_status 400; expect_jq '.error' 'product is not active'
# Comprar con el slug del link inactivo no genera comisión (el flujo ignora links inactivos)
call POST /mock/flow/full-sale "{\"product_id\": $PROD_D, \"quantity\": 1, \"referral_slug\": \"$SLUG_D\"}" "$TOKEN_CUSTOMER"
expect_status 200; expect_jq '.distribution.freelancer' 0
note "el .md desactiva el producto 4 (seed); aquí un producto propio para no afectar a otras suites"
end

begin VIT-08 "Vitrina muestra tasa de conversión del comisionista (solo para él)"
call GET /r/$SLUG_A; expect_status 200   # genera al menos 1 click en el link A
call GET /sell/links "" "$TOKEN_FL"
expect_status 200
expect_jq_ge ".links[] | select(.product_id==$PROD_A) | .clicks" 1
expect_jq_ge ".links[] | select(.product_id==$PROD_A) | .conversions" 0
RATE='.links[] | select(.product_id=='"$PROD_A"') | (if .clicks > 0 then (.conversions / .clicks * 100) else 0 end)'
expect_jq_ge "$RATE" 0; expect_jq_le "$RATE" 100
# Las stats son privadas: solo el comisionista dueño las ve; no aparecen links ajenos
expect_not_contains 'hamaca-casa-narino-maria-x7k2'
call GET /sell/links "" "$TOKEN_CUSTOMER"; expect_status 403
call GET /sell/links "" "$TOKEN_OWNER";    expect_status 403
call GET /sell/links;                      expect_status 401
end

begin VIT-09 "URL del perfil público usa username, no ID"
call GET /vendedor/maria;           expect_status 200
call GET /vendedor/$FL_USER;        expect_status 200
call GET /vendedor/$FL_ID;          expect_status 404
call GET /vendedor/3;               expect_status 404
note "el username numérico no existe: la vitrina no se resuelve por ID"
end

suite_summary
