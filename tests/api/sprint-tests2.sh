#!/usr/bin/env bash
# Sprint Tests2 — Gaps cerrados: signup con identidad, panel admin, delivery, feed, Wompi (docs/tests/sprint-tests2.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint Tests2 — Gaps cerrados   BASE=$BASE"
S="$(uniq_suffix)"

# ── Helpers locales (sin subshell para conservar BODY/STATUS y los errores del caso) ──
NEW_ID=""
mk_product(){ # nombre precio stock comision business_id  -> NEW_ID   (lo crea juan, dueño de ambos negocios)
  call POST /products "{\"business_id\":$5,\"name\":\"$1\",\"description\":\"Producto de prueba API\",\"price\":$2,\"stock\":$3,\"commission_rate\":$4}" "$TOKEN_O"
  NEW_ID="$(jqv '.id')"
  { [ -n "$NEW_ID" ] && [ "$NEW_ID" != "null" ]; } || _err "no se pudo crear el producto '$1' (status $STATUS)"
}
mk_order(){ # token business_id product_id [freelancer_id]  -> NEW_ID (orden en pending_payment)
  local fl=""; [ -n "${4:-}" ] && fl=",\"freelancer_id\":$4"
  call POST /orders "{\"business_id\":$2$fl,\"items\":[{\"product_id\":$3,\"quantity\":1}]}" "$1"
  NEW_ID="$(jqv '.id')"
  { [ -n "$NEW_ID" ] && [ "$NEW_ID" != "null" ]; } || _err "no se pudo crear la orden (status $STATUS) $BODY"
}
mk_paid_order(){ # token business_id product_id [freelancer_id]  -> NEW_ID (orden pagada, escrow held)
  mk_order "$@"
  { [ -n "$NEW_ID" ] && [ "$NEW_ID" != "null" ]; } || return 0
  call POST /mock/wompi/approve "{\"order_id\": $NEW_ID}"
  [ "$STATUS" = "200" ] || _err "wompi/approve de la orden $NEW_ID devolvió $STATUS"
}
new_phone(){ printf -v PHONE '3%04d%05d' $((RANDOM % 10000)) $RANDOM; }   # 3 + 9 dígitos (hallazgo #18)

# ── Setup global ──────────────────────────────────────────────────────────────
call POST /mock/seed-admin; ADMIN_TOKEN="$(jqv '.token')"
TOKEN_O="$(login_as juan@example.com)"
TOKEN_C="$(login_as carlos@example.com)"
TOKEN_F="$(login_as maria@example.com)"
call GET /me "" "$TOKEN_F"; MARIA_ID="$(jqv '.user.id')"
call GET /me/businesses "" "$TOKEN_O"
BIZ1="$(jqv '[.businesses[] | select(.name=="Café La Esquina")][0].id // empty')"; [ -n "$BIZ1" ] || BIZ1=1
BIZ2="$(jqv '[.businesses[] | select(.name=="Artesanías Casa Nariño")][0].id // empty')"; [ -n "$BIZ2" ] || BIZ2=2
# Productos propios (stock y estado independientes de otras suites)
mk_product "Hamaca Tests2 $S" 120000 200 0.20 "$BIZ2"; PROD_ART="$NEW_ID"
mk_product "Espresso Tests2 $S" 4500  200 0.15 "$BIZ1"; PROD_CAFE="$NEW_ID"
echo "  · admin_token=${ADMIN_TOKEN:+ok}  maria_id=$MARIA_ID  biz1=$BIZ1 biz2=$BIZ2  prodArt=$PROD_ART prodCafe=$PROD_CAFE"

# ═════════════════════════════ SIGNUP ═════════════════════════════════════════

begin SIGNUP-01 "Registro con phone, document_id y nequi_number"
new_phone; PH_DUP="$PHONE"
call POST /auth/signup "{\"name\":\"Pedro Comisionista $S\",\"email\":\"pedro$S@test.com\",\"password\":\"password123\",\"role\":\"freelancer\",\"phone\":\"$PH_DUP\",\"document_id\":\"99$S\",\"nequi_number\":\"$PH_DUP\"}"
expect_status 201; expect_jq_not_empty '.id'; expect_jq '.role' freelancer
note "el .md usa phone fijo 3001119999 (rompe al repetir la suite); aquí es aleatorio"
end

begin SIGNUP-02 "Phone duplicado es rechazado"
call POST /auth/signup "{\"name\":\"Clon $S\",\"email\":\"clon$S@test.com\",\"password\":\"password123\",\"role\":\"customer\",\"phone\":\"$PH_DUP\"}"
expect_status 400; expect_jq '.error' 'phone number already registered'
end

begin SIGNUP-03 "Username se genera automáticamente del nombre"
new_phone
call POST /auth/signup "{\"name\":\"Ana Torres $S\",\"email\":\"ana$S@test.com\",\"password\":\"password123\",\"role\":\"customer\",\"phone\":\"$PHONE\"}"
expect_status 201; expect_jq '.username' "anatorres$S"
TOKEN_ANA="$(login_as "ana$S@test.com")"
call GET /me "" "$TOKEN_ANA"
expect_status 200; expect_jq '.user.username' "anatorres$S"
note "difiere del .md: el nombre lleva sufijo único ('Ana Torres $S' => 'anatorres$S') y se envía phone (hallazgo #18); sin sufijo el username sería 'anatorres' + contador"
end

begin SIGNUP-04 "buyer_document_id se asigna automáticamente en la orden"
mk_order "$TOKEN_C" "$BIZ1" "$PROD_CAFE"; ORDER_ID="$NEW_ID"
call GET /orders/$ORDER_ID "" "$TOKEN_C"
expect_status 200; expect_jq '.order.buyer_document_id' 87654321
end

# ═════════════════════════════ ADMIN ══════════════════════════════════════════

begin ADMIN-01 "Crear admin en mock mode"
call POST /mock/seed-admin
expect_status 200 201
m="$(jqv '.message')"
{ [ "$m" = "admin created" ] || [ "$m" = "admin already exists" ]; } || _err "message='$m' (esperado 'admin created' o 'admin already exists')"
expect_jq '.email' admin@mano.app; expect_jq_not_empty '.token'
note "el .md espera 'admin created'; si el admin ya existe (otras suites lo siembran antes) el backend responde 200 'admin already exists'"
end

begin ADMIN-02 "Admin ve negocios pendientes de aprobación"
call POST /businesses "{\"name\":\"Tienda Pendiente $S\",\"description\":\"Test\",\"category\":\"Ropa$S\",\"location\":\"Tumaco\"}" "$TOKEN_O"
expect_status 201; BIZ_PEND="$(jqv '.id')"; expect_jq '.is_approved' false
call GET /admin/businesses/pending "" "$ADMIN_TOKEN"
expect_status 200; expect_jq_ge '.count' 1
expect_jq ".businesses | map(.name) | index(\"Tienda Pendiente $S\") != null" true
end

begin ADMIN-03 "Admin aprueba negocio"
call GET "/businesses?category=Ropa$S"
expect_status 200; expect_jq '.businesses | length' 0     # antes de aprobar no está en el catálogo
call POST /admin/businesses/approve/$BIZ_PEND "" "$ADMIN_TOKEN"
expect_status 200; expect_jq '.message' 'business approved'
call GET "/businesses?category=Ropa$S"
expect_status 200; expect_jq '.businesses | length' 1
expect_jq '.businesses[0].name' "Tienda Pendiente $S"
note "difiere del .md: se aprueba el negocio creado en ADMIN-02 por id (no 'pending[0]', que en BD compartida podría ser otro) y la categoría es única"
end

begin ADMIN-04 "Admin rechaza negocio"
call POST /businesses "{\"name\":\"Negocio Rechazado $S\",\"description\":\"Test\",\"category\":\"Test$S\",\"location\":\"Test\"}" "$TOKEN_O"
expect_status 201; BIZ_REJ="$(jqv '.id')"
call POST /admin/businesses/reject/$BIZ_REJ '{"reason":"Documentos incompletos"}' "$ADMIN_TOKEN"
expect_status 200; expect_jq '.message' 'business rejected'
note "hallazgo #14 (informativo): el motivo no se persiste y el negocio rechazado queda igual que uno pendiente"
end

begin ADMIN-05 "No-admin no puede acceder al panel"
call GET /admin/businesses/pending "" "$TOKEN_C"
expect_status 403; expect_jq '.error' 'admin access required'
call GET /admin/businesses/pending "" "$TOKEN_O"
expect_status 403; expect_jq '.error' 'admin access required'
end

begin ADMIN-06 "Admin ve disputas activas"
mk_paid_order "$TOKEN_C" "$BIZ2" "$PROD_ART"; ORDER_D="$NEW_ID"
call POST /orders/$ORDER_D/dispute '{"reason":"Test","reported_by":"business"}' "$TOKEN_O"
expect_status 200
call GET /admin/disputes "" "$ADMIN_TOKEN"
expect_status 200; expect_jq_ge '.count' 1
expect_jq ".disputes | map(.id) | index($ORDER_D) != null" true
note "difiere del .md: count >= 1 y se busca la orden por id (otras suites dejan disputas abiertas en la BD compartida)"
end

begin ADMIN-07 "Admin resuelve disputa a favor del comprador"
call POST /admin/disputes/resolve/$ORDER_D '{"resolution":"refund_buyer","notes":"Negocio no entregó"}' "$ADMIN_TOKEN"
expect_status 200; expect_jq '.status' cancelled; expect_jq '.escrow_status' refunded; expect_jq '.payment_status' refunded
end

begin ADMIN-08 "Admin ve retiros pendientes y los procesa"
# Comisionista propio con saldo (el .md usa a María y el slug del seed, que puede no estar activo)
new_phone
call POST /auth/signup "{\"name\":\"Retiro Prueba $S\",\"email\":\"retiro$S@test.com\",\"password\":\"password123\",\"role\":\"freelancer\",\"phone\":\"$PHONE\",\"username\":\"retiro$S\"}"
expect_status 201; WFL_ID="$(jqv '.id')"
TOKEN_W="$(login_as "retiro$S@test.com")"
call POST /sell/affiliate "{\"product_id\": $PROD_ART}" "$TOKEN_W"
expect_status 201; WSLUG="$(jqv '.referral_link.slug')"
call POST /mock/flow/full-sale "{\"product_id\":$PROD_ART,\"quantity\":1,\"referral_slug\":\"$WSLUG\"}" "$TOKEN_C"
expect_status 200; expect_jq_ge '.freelancer_balance' 23999.99
call POST /sell/withdraw '{"amount":24000,"nequi_number":"3205551234"}' "$TOKEN_W"
expect_status 201; W_ID="$(jqv '.withdrawal.id')"; expect_jq '.withdrawal.status' pending
# Admin lo ve
call GET /admin/withdrawals "" "$ADMIN_TOKEN"
expect_status 200; expect_jq_ge '.count' 1
expect_jq ".withdrawals | map(.id) | index($W_ID) != null" true
# Admin lo procesa
call PATCH /admin/withdrawals/process/$W_ID "" "$ADMIN_TOKEN"
expect_status 200; expect_jq '.message' 'withdrawal processed'
call GET /admin/withdrawals "" "$ADMIN_TOKEN"
expect_jq ".withdrawals | map(.id) | index($W_ID) == null" true
note "difiere del .md: count >= 1 (BD compartida) y el retiro se identifica por id"
end

# ═════════════════════════════ DELIVERY ═══════════════════════════════════════

begin DELIVERY-01 "Crear delivery y ver estado inicial"
mk_order "$TOKEN_C" "$BIZ1" "$PROD_CAFE"; ORDER_DEL="$NEW_ID"
call POST /deliveries "{\"order_id\":$ORDER_DEL,\"eta\":\"2026-06-02T10:00:00Z\",\"tracking\":\"TRK-001\"}" "$TOKEN_C"
expect_status 201; DEL_ID="$(jqv '.id')"; expect_jq_not_empty '.id'
call GET /deliveries/$DEL_ID
expect_status 200; expect_jq '.delivery.status' scheduled; expect_jq '.delivery.eta' '2026-06-02T10:00:00Z'; expect_jq '.delivery.tracking' TRK-001
note "GET /deliveries/:id es público (hallazgo #12) — aquí se consulta sin token a propósito"
end

begin DELIVERY-02 "Negocio actualiza estado a in_transit"
call PATCH /deliveries/$DEL_ID/status '{"status":"in_transit"}' "$TOKEN_O"
expect_status 200; expect_jq '.delivery.status' in_transit
end

begin DELIVERY-03 "Negocio marca como entregado"
call PATCH /deliveries/$DEL_ID/status '{"status":"delivered"}' "$TOKEN_O"
expect_status 200; expect_jq '.delivery.status' delivered; expect_jq '.order_status' delivered
call GET /orders/$ORDER_DEL "" "$TOKEN_C"
expect_status 200; expect_jq '.order.status' delivered
end

begin DELIVERY-04 "Estado inválido es rechazado"
call PATCH /deliveries/$DEL_ID/status '{"status":"volando"}' "$TOKEN_O"
expect_status 400; expect_jq_not_empty '.error'
end

begin DELIVERY-05 "Customer no puede actualizar estado de delivery"
call PATCH /deliveries/$DEL_ID/status '{"status":"in_transit"}' "$TOKEN_C"
expect_status 403; expect_jq '.error' 'only the business owner can update delivery status'
end

# ═════════════════════════════ FEED ═══════════════════════════════════════════

begin FEED-01 "Stories expiradas no aparecen en el feed"
call GET /feed
expect_status 200; expect_jq_ge '.stories | length' 1
# Ninguna story del feed está vencida
expect_jq '[.stories[] | select(try ((.expires_at | sub("\\.[0-9]+";"") | sub("\\+00:00$";"Z") | fromdateiso8601) <= now) catch false)] | length' 0
call GET /stories
expect_status 200; expect_jq_ge '.stories | map(select(.expires_at != null)) | length' 1
note "depende de la story del seed (expires_at = alta + 24h): si la BD tiene más de 24 h, el feed no la mostrará. POST /stories no fija expires_at (queda en 0001-01-01) y nunca aparece en el feed"
end

begin FEED-02 "Anuncios se ordenan por paquete (destacado > premium > básico)"
call POST /ads "{\"business_id\":$BIZ1,\"title\":\"Ad Básico $S\",\"description\":\"Test\",\"package_type\":\"Paquete básico\",\"active\":true}" "$TOKEN_O"
expect_status 201
call POST /ads "{\"business_id\":$BIZ2,\"title\":\"Ad Destacado $S\",\"description\":\"Test\",\"package_type\":\"Paquete destacado\",\"active\":true}" "$TOKEN_O"
expect_status 201
call GET /feed
expect_status 200
expect_jq ".advertisements | map(.title) as \$t | (\$t | index(\"Ad Destacado $S\")) as \$d | (\$t | index(\"Ad Básico $S\")) as \$b | (\$d != null and \$b != null and \$d < \$b)" true
# Todo el listado respeta la prioridad destacado(1) < premium(2) < básico(3)
expect_jq '[.advertisements[].package_type | ({"Paquete destacado":1,"Paquete premium":2,"Paquete básico":3}[.] // 99)] | . == sort' true
note "el .md espera exactamente 2 anuncios; en BD compartida hay más (seed y otras suites), se verifica el orden relativo"
end

begin FEED-03 "Feed público no requiere autenticación"
call GET /feed
expect_status 200
end

# ═════════════════════════════ WOMPI ══════════════════════════════════════════

begin WOMPI-01 "Initiate payment genera URL de checkout"
mk_order "$TOKEN_C" "$BIZ1" "$PROD_CAFE"; ORDER_W="$NEW_ID"
call POST /payments/wompi/initiate "{\"order_id\":$ORDER_W,\"redirect_url\":\"http://localhost/orders\"}" "$TOKEN_C"
expect_status 200
expect_jq ".reference | startswith(\"MANO-$ORDER_W-\")" true
expect_jq '.amount' 450000; expect_jq '.currency' COP
expect_jq '.checkout_url | length > 0' true
note "amount = precio en centavos (4500 × 100 = 450000); el producto es propio con precio 4500 como el Espresso del seed"
end

begin WOMPI-02 "Flujo completo: pago → escrow → delivery → confirmación"
# Saldo previo de María
call GET /sell/links "" "$TOKEN_F"; BAL_M0="$(jqv '.earnings_balance')"
# 1-2. Orden con comisionista + pago aprobado
mk_paid_order "$TOKEN_C" "$BIZ2" "$PROD_ART" "$MARIA_ID"; ORDER_FULL="$NEW_ID"
# 3. Crear delivery
call POST /deliveries "{\"order_id\":$ORDER_FULL,\"eta\":\"2026-06-02T15:00:00Z\"}" "$TOKEN_C"
expect_status 201; DEL_FULL="$(jqv '.id')"
# 4. Negocio despacha
call PATCH /deliveries/$DEL_FULL/status '{"status":"in_transit"}' "$TOKEN_O"
expect_status 200; expect_jq '.delivery.status' in_transit
# 5. Comprador confirma recepción
call POST /orders/$ORDER_FULL/confirm "" "$TOKEN_C"
expect_status 200; expect_jq '.message' 'order confirmed, payment released'
# 6. Verificar distribución
call GET /orders/$ORDER_FULL "" "$TOKEN_C"
expect_status 200
expect_jq '.order.status' delivered; expect_jq '.order.escrow_status' released
SPL='.order.commission_splits | map({(.recipient_type): .amount}) | add'
expect_jq '.order.commission_splits | map(.status) | unique | join(",")' released
expect_jq_ge "($SPL).platform" 4799.99;   expect_jq_le "($SPL).platform" 4800.01
expect_jq_ge "($SPL).business" 91199.99;  expect_jq_le "($SPL).business" 91200.01
expect_jq_ge "($SPL).freelancer" 23999.99; expect_jq_le "($SPL).freelancer" 24000.01
call GET /sell/links "" "$TOKEN_F"; BAL_M1="$(jqv '.earnings_balance')"
expect_true "saldo de María +24.000 (antes=$BAL_M0 después=$BAL_M1)" \
  awk -v a="$BAL_M0" -v b="$BAL_M1" 'BEGIN{d=b-a; exit !(d>23999.99 && d<24000.01)}'
end

suite_summary
