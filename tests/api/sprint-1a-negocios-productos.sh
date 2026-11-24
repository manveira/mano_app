#!/usr/bin/env bash
# Sprint 1A — Negocios y productos  (docs/tests/sprint-1a-negocios-productos.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 1A — Negocios y Productos   BASE=$BASE"
S="$(uniq_suffix)"

# ── helpers locales ───────────────────────────────────────────────────────────
new_phone(){ printf '3%09d' $(( ($(date +%s%N) / 1000 + RANDOM * 31337) % 1000000000 )); }   # hallazgo #18: todo usuario nuevo lleva phone único
biz_id(){ curl -sS -m 20 "$BASE/businesses" | jq -r --arg n "$1" '[.businesses[]? | select(.name==$n) | .id] | first // empty'; }
prod_id(){ curl -sS -m 20 "$BASE/products?business_id=$1" | jq -r --arg n "$2" '[.products[]? | select(.name==$n) | .id] | first // empty'; }
stock_of(){ curl -sS -m 20 "$BASE/products?business_id=$1" | jq -r --argjson p "$2" '[.products[]? | select(.id==$p) | .stock] | first // empty'; }

# ── Setup ─────────────────────────────────────────────────────────────────────
TOKEN_OWNER="$(login_as juan@example.com)"
TOKEN_CUSTOMER="$(login_as carlos@example.com)"

# Los ids del seed se buscan por nombre (no se asume id 1/2 ni producto 1/4).
B1="$(biz_id 'Café La Esquina')"            # seed: id 1
B2="$(biz_id 'Artesanías Casa Nariño')"     # seed: id 2
P_ESPRESSO="$(prod_id "$B1" 'Espresso Doble')"   # seed: producto 1
P_HAMACA="$(prod_id "$B2" 'Hamaca Artesanal')"   # seed: producto 4
call GET /me "" "$TOKEN_OWNER"; OWNER_ID="$(jqv '.user.id')"

begin BIZ-01 "Listar negocios devuelve estructura correcta"
call GET /businesses
expect_status 200
expect_jq 'type' object
expect_jq '.businesses | type' array
expect_jq_ge '.businesses | length' 2
expect_jq '.businesses | all(.[]; has("id") and has("name") and has("category") and has("location") and has("image_url") and has("is_approved"))' true
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' true
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' true
note "el listado solo devuelve negocios aprobados (is_approved=true)"
end

begin BIZ-02 "Filtrar por categoría"
note "el .md espera exactamente 1 por categoría; otras suites pueden aprobar más negocios, por eso se compara por contenido"
call GET "/businesses?category=Caf%C3%A9"
expect_status 200
expect_jq_ge '.businesses | length' 1
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' true
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' false
call GET "/businesses?category=Artesan%C3%ADas"
expect_status 200
expect_jq_ge '.businesses | length' 1
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' true
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' false
call GET "/businesses?category=Farmacia"
expect_status 200
expect_jq '.businesses | length' 0
end

begin BIZ-03 "Filtrar por ubicación"
call GET "/businesses?location=Tumaco"
expect_status 200
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' true
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' false
call GET "/businesses?location=Centro"
expect_status 200
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' true
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' false
end

begin BIZ-04 "Filtrar por categoría + ubicación combinados"
call GET "/businesses?category=Artesan%C3%ADas&location=Tumaco"
expect_status 200
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' true
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' false
call GET "/businesses?category=Caf%C3%A9&location=Tumaco"
expect_status 200
# El .md espera 0; se verifica que el seed no aparezca y que todo resultado cumpla ambos filtros.
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' false
expect_jq 'all(.businesses[]; (.category|test("caf";"i")) and (.location|test("tumaco";"i")))' true
end

begin BIZ-05 "Detalle de negocio incluye productos"
call GET "/businesses/$B1"
expect_status 200
expect_jq '.business.id' "$B1"
expect_jq '.business.name' 'Café La Esquina'
expect_jq '.products | type' array
expect_jq_ge '.products | length' 3
expect_jq '.products | all(.[]; .commission_rate > 0)' true
end

begin BIZ-06 "Negocio inexistente devuelve 404"
call GET /businesses/999999
expect_status 404
expect_jq '.error' 'business not found'
end

begin BIZ-07 "Crear negocio como owner"
call POST /businesses '{"name":"Tienda de Prueba","description":"Descripción de prueba","category":"Ropa","location":"Tumaco","address":"Calle 10 #5-20","latitude":1.8010,"longitude":-78.7600,"default_commission_rate":0.15}' "$TOKEN_OWNER"
expect_status 201
NEW_BIZ_ID="$(jqv '.id')"
expect_jq_not_empty '.id'
expect_jq '.name' 'Tienda de Prueba'
expect_jq '.owner_id' "$OWNER_ID"
expect_jq '.is_approved' false
expect_jq '.default_commission_rate' 0.15
expect_jq_not_empty '.slug'
# Mientras no se apruebe, no aparece en el listado público.
call GET /businesses
expect_jq "any(.businesses[]; .id==${NEW_BIZ_ID:-0})" false
end

begin BIZ-08 "Customer no puede crear negocio"
call POST /businesses '{"name":"X","description":"X","category":"X","location":"X"}' "$TOKEN_CUSTOMER"
expect_status 403
end

begin BIZ-09 "Crear negocio con campos faltantes"
call POST /businesses '{"name":"Solo nombre"}' "$TOKEN_OWNER"
expect_status 400
end

begin PROD-01 "Listar productos de un negocio"
note "el .md espera exactamente 3 cafés; PROD-03 (y reejecuciones) añaden productos, por eso se espera >= 3 y los 3 del seed"
call GET "/products?business_id=$B1"
expect_status 200
expect_jq_ge '.products | length' 3
N1="$(jqv '.products | length')"
expect_jq '.products | all(.[]; .business_id == '"$B1"')' true
for n in 'Espresso Doble' 'Cappuccino Clásico' 'Latte Macchiato'; do
  expect_jq "any(.products[]; .name==\"$n\")" true
done
call GET "/businesses/$B1/products"
expect_status 200
expect_jq '.products | length' "$N1"
end

begin PROD-02 "Cada producto tiene commission_rate"
call GET "/products?business_id=$B2"
expect_status 200
expect_jq '[.products[] | select(.name | IN("Hamaca Artesanal","Mochila Wayuu","Collar de Tagua"))] | (length == 3 and all(.[]; .commission_rate == 0.2))' true
expect_jq '.products | all(.[]; .commission_rate > 0)' true
end

begin PROD-03 "Crear producto en negocio propio"
call POST /products "{\"business_id\":$B1,\"name\":\"Americano\",\"description\":\"Café americano suave\",\"price\":3500,\"stock\":200,\"commission_rate\":0.15,\"image_url\":\"\"}" "$TOKEN_OWNER"
expect_status 201
expect_jq_not_empty '.id'
expect_jq '.name' Americano
expect_jq '.business_id' "$B1"
expect_jq '.price' 3500
expect_jq '.stock' 200
expect_jq '.commission_rate' 0.15
expect_jq '.is_active' true
end

begin PROD-04 "No se puede crear producto en negocio ajeno"
OWNER2_EMAIL="owner2$S@test.com"
call POST /auth/signup "{\"name\":\"Otro Owner\",\"email\":\"$OWNER2_EMAIL\",\"password\":\"password123\",\"role\":\"business_owner\",\"phone\":\"$(new_phone)\"}"
expect_status 201
TOKEN_OWNER2="$(login_as "$OWNER2_EMAIL")"
expect_true "owner2 obtuvo token" test -n "$TOKEN_OWNER2"
call POST /products "{\"business_id\":$B1,\"name\":\"Intruso\",\"description\":\"X\",\"price\":1000,\"stock\":1,\"commission_rate\":0.10}" "$TOKEN_OWNER2"
expect_status 403
expect_jq '.error' 'you can only add products to your own business'
end

begin PROD-05 "Precio negativo es rechazado"
call POST /products "{\"business_id\":$B1,\"name\":\"X\",\"description\":\"X\",\"price\":-100,\"stock\":10,\"commission_rate\":0.10}" "$TOKEN_OWNER"
expect_status 400
end

begin PROD-06 "Stock negativo es rechazado"
call POST /products "{\"business_id\":$B1,\"name\":\"X\",\"description\":\"X\",\"price\":1000,\"stock\":-5,\"commission_rate\":0.10}" "$TOKEN_OWNER"
expect_status 400
end

begin PROD-07 "Stock se descuenta al crear orden"
STOCK_ANTES="$(stock_of "$B1" "$P_ESPRESSO")"
note "'Espresso Doble' se busca por nombre y el stock se compara por delta (antes - 3), no por valor absoluto"
call POST /orders "{\"business_id\":$B1,\"items\":[{\"product_id\":$P_ESPRESSO,\"quantity\":3}]}" "$TOKEN_CUSTOMER"
expect_status 201
expect_jq_not_empty '.id'
expect_jq '.items | length' 1
expect_jq '.items[0].quantity' 3
expect_jq '.status' pending_payment
STOCK_DESPUES="$(stock_of "$B1" "$P_ESPRESSO")"
expect_true "stock antes ($STOCK_ANTES) - 3 == stock después ($STOCK_DESPUES)" test "$STOCK_ANTES" -ge 3 -a "$((STOCK_ANTES - 3))" = "$STOCK_DESPUES"
end

begin PROD-08 "Orden con stock insuficiente es rechazada"
STOCK_ANTES="$(stock_of "$B1" "$P_ESPRESSO")"
call POST /orders "{\"business_id\":$B1,\"items\":[{\"product_id\":$P_ESPRESSO,\"quantity\":9999}]}" "$TOKEN_CUSTOMER"
expect_status 400
expect_jq '.error' 'insufficient stock for product: Espresso Doble'
expect_true "el stock no cambió" test "$(stock_of "$B1" "$P_ESPRESSO")" = "$STOCK_ANTES"
end

begin PROD-09 "Producto de otro negocio en la orden es rechazado"
call POST /orders "{\"business_id\":$B1,\"items\":[{\"product_id\":$P_HAMACA,\"quantity\":1}]}" "$TOKEN_CUSTOMER"
expect_status 400
expect_jq '.error' 'product does not belong to selected business'
end

begin GEO-01 "Negocios cercanos con coordenadas de Tumaco"
note "/map/nearby no filtra por is_approved (a diferencia de /businesses): puede incluir negocios sin aprobar de otras suites, por eso >= 2"
call GET "/map/nearby?latitude=1.7989&longitude=-78.7628&radius_km=2"
expect_status 200
expect_jq_ge '.businesses | length' 2
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' true
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' true
end

begin GEO-02 "Radio muy pequeño sin resultados"
call GET "/map/nearby?latitude=0&longitude=0&radius_km=0.1"
expect_status 200
# Sin coincidencias el backend devuelve {"businesses":null}; null | length == 0
expect_jq '(.businesses // []) | length' 0
note "sin resultados el backend responde 'businesses': null (no [])"
end

begin GEO-03 "Sin coordenadas devuelve todos"
call GET /businesses
N_APROBADOS="$(jqv '.businesses | length')"
call GET /map/nearby
expect_status 200
expect_jq_ge '.businesses | length' "${N_APROBADOS:-2}"
expect_jq 'any(.businesses[]; .name=="Café La Esquina")' true
expect_jq 'any(.businesses[]; .name=="Artesanías Casa Nariño")' true
end

suite_summary
