#!/usr/bin/env bash
# Sprint 7 — Registro del diseño nuevo (correo + username + contraseña), roles Domiciliario y
# Prestación de servicios, PATCH /me (Ajustes) y permisos del domiciliario en entregas.
# Corrige el hallazgo #18 (solo un usuario podía registrarse sin teléfono). Ver docs/SCREENS.md.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 7 — Registro, roles y domiciliario   BASE=$BASE"
S="$(uniq_suffix)"
new_phone(){ printf '3%09d' $(( ($(date +%s%N) / 1000 + RANDOM * 31337) % 1000000000 )); }

signup(){ # signup EMAIL ROLE [USERNAME] [EXTRA_JSON_FIELDS]
  local em="$1" role="$2" un="${3:-}" extra="${4:-}"
  local uname=""; [ -n "$un" ] && uname=",\"username\":\"$un\""
  call POST /auth/signup "{\"name\":\"${un:-Usuario}\",\"email\":\"$em\",\"password\":\"password123\",\"role\":\"$role\"$uname$extra}"
}

TOKEN_MARIA="$(login_as maria@example.com)"

begin REG-01 "Dos usuarios SIN teléfono pueden registrarse (hallazgo #18 corregido)"
signup "sinphone1_$S@test.com" customer
expect_status 201
signup "sinphone2_$S@test.com" freelancer
expect_status 201
end

begin REG-02 "Registro con username: se normaliza a minúsculas y sin espacios laterales"
signup "reg02_$S@test.com" freelancer "  RegUno$S  "
expect_status 201; expect_jq '.username' "reguno$S"; expect_jq '.role' freelancer
end

begin REG-03 "Username inválido (espacios / muy corto) es rechazado"
signup "reg03a_$S@test.com" customer "a b"
expect_status 400; expect_contains 'invalid username'
signup "reg03b_$S@test.com" customer "ab"
expect_status 400; expect_contains 'invalid username'
end

begin REG-04 "Username duplicado da un mensaje claro"
signup "reg04_$S@test.com" customer "reguno$S"
expect_status 400; expect_jq '.error' 'username already taken'
end

begin REG-05 "Roles nuevos: courier (Domiciliario) y service_provider (Prestación de servicios)"
signup "courier5_$S@test.com" courier "domi$S"
expect_status 201; expect_jq '.role' courier
signup "serv5_$S@test.com" service_provider "serv$S"
expect_status 201; expect_jq '.role' service_provider
call POST /auth/signin "{\"email\":\"courier5_$S@test.com\",\"password\":\"password123\"}"
expect_status 200; expect_jq '.user.role' courier
end

begin REG-06 "El rol admin sigue sin poder crearse por signup"
signup "adm6_$S@test.com" admin
expect_status 400
end

begin REG-07 "Registro con referral_code enlaza al referidor (sube referred_count)"
call GET /sell/referral-code "" "$TOKEN_MARIA"; CODE="$(jqv '.referral_code')"; BEFORE="$(jqv '.referred_count')"
signup "ref7_$S@test.com" freelancer "refuno$S" ",\"referral_code\":\"$CODE\""
expect_status 201
call GET /sell/referral-code "" "$TOKEN_MARIA"
expect_jq '.referred_count' "$((BEFORE+1))"
end

begin REG-08 "GET /me devuelve los datos propios (phone, document_id, nequi_number, referral_code)"
PH="$(new_phone)"
signup "me8_$S@test.com" freelancer "meocho$S" ",\"phone\":\"$PH\",\"document_id\":\"99$S\",\"nequi_number\":\"$PH\""
expect_status 201
T8="$(login_as "me8_$S@test.com")"
call GET /me "" "$T8"
expect_status 200; expect_jq '.user.phone' "$PH"; expect_jq '.user.nequi_number' "$PH"; expect_jq_not_empty '.user.referral_code'; expect_jq_not_empty '.user.document_id'
end

begin REG-09 "PATCH /me: actualiza nombre y Nequi; valida formato; teléfono ajeno es rechazado"
call PATCH /me '{"name":"Nombre Nuevo","nequi_number":"3001112222"}' "$T8"
expect_status 200; expect_jq '.user.name' "Nombre Nuevo"; expect_jq '.user.nequi_number' 3001112222
call PATCH /me '{"nequi_number":"123"}' "$T8"
expect_status 400
call PATCH /me '{"name":"x"}' "$T8"
expect_status 400
call PATCH /me '{"phone":"3109876543"}' "$T8"        # teléfono de Carlos (seed)
expect_status 400; expect_jq '.error' 'phone number already registered'
call PATCH /me '{"phone":""}' "$T8"                  # borrar el propio teléfono es válido
expect_status 200; expect_jq '.user.phone' ""
call PATCH /me '{"name":"Sin sesión"}'
expect_status 401
end

# ── Domiciliario ────────────────────────────────────────────────────────────────
begin COUR-01 "El domiciliario toma un pedido pagado: queda asignado (courier_id, type=mano_courier)"
TC="$(login_as "courier5_$S@test.com")"
call GET /me "" "$TC"; COURIER_ID="$(jqv '.user.id')"
call POST /orders/guest "{\"business_id\":2,\"items\":[{\"product_id\":6,\"quantity\":1}],\"guest_name\":\"Cliente Prueba\",\"guest_phone\":\"3000000000\"}"
expect_status 201; ORDER_ID="$(jqv '.id')"
# sin pagar → no disponible
call POST /deliveries "{\"order_id\":$ORDER_ID,\"eta\":\"2026-12-01T10:00:00Z\"}" "$TC"
expect_status 400; expect_jq '.error' 'order is not available for delivery'
# pagada (mock) → disponible
call POST /mock/wompi/approve "{\"order_id\":$ORDER_ID}"
expect_status 200
call POST /deliveries "{\"order_id\":$ORDER_ID,\"eta\":\"2026-12-01T10:00:00Z\"}" "$TC"
expect_status 201; expect_jq '.courier_id' "$COURIER_ID"; expect_jq '.type' mano_courier; expect_jq '.status' scheduled
DEL_ID="$(jqv '.id')"
end

begin COUR-02 "Un segundo domiciliario no puede tomar el mismo pedido"
signup "courier6_$S@test.com" courier "domidos$S"; expect_status 201
TC2="$(login_as "courier6_$S@test.com")"
call POST /deliveries "{\"order_id\":$ORDER_ID,\"eta\":\"2026-12-01T10:00:00Z\"}" "$TC2"
expect_status 400; expect_jq '.error' 'order already has a delivery'
end

begin COUR-03 "Solo el domiciliario asignado actualiza el estado de su entrega"
call PATCH /deliveries/$DEL_ID/status '{"status":"in_transit"}' "$TC"
expect_status 200; expect_jq '.delivery.status' in_transit
call PATCH /deliveries/$DEL_ID/status '{"status":"delivered"}' "$TC2"
expect_status 403
call PATCH /deliveries/$DEL_ID/status '{"status":"delivered"}' "$TC"
expect_status 200; expect_jq '.delivery.status' delivered
end

# ── Movimientos del comisionista (pantalla Comisiones → "Ver todos") ──────────────
begin MOV-01 "GET /sell/movements: comisión liberada (+) y retiro (−) del comisionista"
TOKEN_CARLOS="$(login_as carlos@example.com)"
call POST /mock/flow/full-sale '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}' "$TOKEN_CARLOS"
expect_status 200
call POST /sell/withdraw '{"amount":5000,"nequi_number":"3205551234"}' "$TOKEN_MARIA"
expect_status 201
call GET /sell/movements "" "$TOKEN_MARIA"
expect_status 200
expect_jq_ge '.movements | length' 2
expect_jq '[.movements[] | select(.type=="withdrawal")][0].amount' -5000
expect_jq '[.movements[] | select(.type=="commission")][0].amount' 24000
expect_jq '.movements[0].type' withdrawal      # el más reciente primero
end

begin MOV-02 "GET /sell/movements solo para comisionistas"
call GET /sell/movements "" "$TOKEN_CARLOS"
expect_status 403
call GET /sell/movements
expect_status 401
end

suite_summary
