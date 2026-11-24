#!/usr/bin/env bash
# Sprint 2 — Registro y verificación de negocios (KYC)  (docs/tests/sprint-2-registro-negocios.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 2 — Registro de negocios (KYC)   BASE=$BASE"
S="$(uniq_suffix)"

# ── helpers locales ───────────────────────────────────────────────────────────
new_phone(){ printf '3%09d' $(( ($(date +%s%N) / 1000 + RANDOM * 31337) % 1000000000 )); }   # defecto #18: todo usuario lleva phone único
new_doc(){   printf '9%08d' $(( ($(date +%s%N) / 1000 + RANDOM) % 100000000 )); }
# biz_id NOMBRE -> id del negocio aprobado con ese nombre (GET público)
biz_id(){ curl -sS -m 20 "$BASE/businesses" | jq -r --arg n "$1" '[.businesses[]? | select(.name==$n) | .id] | first // empty'; }
# mk_user ROLE TAG NOMBRE -> deja U_ID, U_EMAIL, U_TOKEN
mk_user(){
  local role="$1" tag="$2" name="$3"
  U_EMAIL="${tag}${S}@test.com"
  call POST /auth/signup "{\"name\":\"$name\",\"email\":\"$U_EMAIL\",\"password\":\"password123\",\"role\":\"$role\",\"phone\":\"$(new_phone)\",\"document_id\":\"$(new_doc)\",\"username\":\"${tag}${S}\"}"
  U_ID="$(jqv '.id')"
  U_TOKEN="$(login_as "$U_EMAIL")"
}

# ── Setup (equivale al "Setup" del .md) ───────────────────────────────────────
TOKEN_OWNER="$(login_as juan@example.com)"
TOKEN_CUSTOMER="$(login_as carlos@example.com)"
mk_user business_owner nuevo "Nuevo Negociante"
TOKEN_NUEVO="$U_TOKEN"

BIZ1="$(biz_id 'Café La Esquina')"            # seed: id 1
BIZ2="$(biz_id 'Artesanías Casa Nariño')"     # seed: id 2

# Producto propio en el negocio 2 con stock alto para KYC-09 (el stock de los productos del seed lo consumen otras suites)
call POST /products "{\"business_id\":$BIZ2,\"name\":\"Hamaca KYC $S\",\"description\":\"Fixture sprint 2\",\"price\":120000,\"stock\":100,\"commission_rate\":0.20}" "$TOKEN_OWNER"
KYC_PROD="$(jqv '.id')"

BIZ_ID=""

begin KYC-01 "Negocio recién creado tiene is_approved: false"
call POST /businesses "{\"name\":\"Tienda Nueva $S\",\"description\":\"Ropa artesanal del Pacífico\",\"category\":\"Ropa\",\"location\":\"Tumaco\",\"address\":\"Barrio Centro 12\"}" "$TOKEN_NUEVO"
expect_status 201; expect_jq '.is_approved' false
BIZ_ID="$(jqv '.id')"
call GET "/businesses/$BIZ_ID"
expect_status 200; expect_jq '.business.is_approved' false
end

begin KYC-02 "Negocio no aprobado no aparece en búsquedas activas"
call GET "/businesses?category=Ropa"
expect_status 200
expect_jq '.businesses | map(select(.is_approved == false)) | length' 0
expect_not_contains "Tienda Nueva $S"
end

begin KYC-03 "Negocio no aprobado no puede subir productos"
call POST /products "{\"business_id\":$BIZ_ID,\"name\":\"Camiseta\",\"description\":\"Camiseta artesanal\",\"price\":45000,\"stock\":10,\"commission_rate\":0.15}" "$TOKEN_NUEVO"
expect_status 403; expect_jq '.error' 'business is not approved yet'
end

begin KYC-04 "Negocios del seed ya están aprobados"
call GET /businesses
expect_status 200
expect_jq '[.businesses[] | select(.name=="Café La Esquina") | .is_approved] | first' true
expect_jq '[.businesses[] | select(.name=="Artesanías Casa Nariño") | .is_approved] | first' true
end

begin KYC-05 "Comisión mínima del negocio es 10%"
call POST /products "{\"business_id\":$BIZ1,\"name\":\"Producto Tacaño $S\",\"description\":\"Test\",\"price\":10000,\"stock\":5,\"commission_rate\":0.05}" "$TOKEN_OWNER"
expect_status 400; expect_contains 'commission_rate must be between 10% and 40%'
note "difiere del .md: el backend SÍ valida el mínimo; mensaje real 'commission_rate must be between 10% and 40%' (el .md decía 'must be at least 10%' y 'no valida')"
end

begin KYC-06 "Comisión máxima del negocio es 40%"
call POST /products "{\"business_id\":$BIZ1,\"name\":\"Producto Generoso $S\",\"description\":\"Test\",\"price\":10000,\"stock\":5,\"commission_rate\":0.50}" "$TOKEN_OWNER"
expect_status 400; expect_contains 'commission_rate must be between 10% and 40%'
note "difiere del .md: mensaje real 'commission_rate must be between 10% and 40%' (el .md decía 'cannot exceed 40%')"
end

begin KYC-07 "Negocio aprobado puede subir productos"
call POST /products "{\"business_id\":$BIZ1,\"name\":\"Mocha Especial $S\",\"description\":\"Café con chocolate artesanal\",\"price\":7000,\"stock\":50,\"commission_rate\":0.15}" "$TOKEN_OWNER"
expect_status 201; expect_jq_not_empty '.id'; expect_jq '.name' "Mocha Especial $S"; expect_jq '.commission_rate' 0.15
end

begin KYC-08 "Regla: negocio puede definir zona de venta"
call GET "/businesses/$BIZ2"
expect_status 200
expect_jq '.business.name' 'Artesanías Casa Nariño'
expect_jq '.business.location' 'Tumaco'
expect_jq '.business.address' 'Barrio El Morro 45'
end

begin KYC-09 "Regla: pedido se recoge en el local (delivery type)"
call POST /orders "{\"business_id\":$BIZ2,\"items\":[{\"product_id\":$KYC_PROD,\"quantity\":1}]}" "$TOKEN_CUSTOMER"
expect_status 201
ORDER_ID="$(jqv '.id')"
call POST /deliveries "{\"order_id\":$ORDER_ID,\"eta\":\"2026-06-02T10:00:00Z\"}" "$TOKEN_CUSTOMER"
expect_status 201; expect_jq '.status' scheduled; expect_jq '.type' business_own
note "usa un producto fixture propio del negocio 2 (el stock de 'Hamaca Artesanal' del seed puede estar agotado por otras suites)"
end

suite_summary
