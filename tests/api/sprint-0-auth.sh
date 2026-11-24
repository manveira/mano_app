#!/usr/bin/env bash
# Sprint 0 — Autenticación y usuarios (docs/tests/sprint-0-auth.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 0 — Auth   BASE=$BASE"
S="$(uniq_suffix)"

TOKEN_OWNER="$(login_as juan@example.com)"
TOKEN_CUSTOMER="$(login_as carlos@example.com)"
TOKEN_FREELANCER="$(login_as maria@example.com)"

begin AUTH-01 "Registro exitoso como customer"
call POST /auth/signup "{\"name\":\"Pedro Ruiz\",\"email\":\"pedro$S@test.com\",\"password\":\"password123\",\"role\":\"customer\"}"
expect_status 201; expect_jq '.role' customer; expect_jq '.email' "pedro$S@test.com"; expect_not_contains '"token"'
end

begin AUTH-02 "Registro exitoso como freelancer (sin phone)"
call POST /auth/signup "{\"name\":\"Ana Torres\",\"email\":\"ana$S@test.com\",\"password\":\"password123\",\"role\":\"freelancer\"}"
expect_status 201; expect_jq '.role' freelancer
end

begin AUTH-03 "Registro con email duplicado"
call POST /auth/signup '{"name":"Copia","email":"carlos@example.com","password":"password123","role":"customer"}'
expect_status 400
end

begin AUTH-04 "Registro con rol inválido (admin)"
call POST /auth/signup "{\"name\":\"Hack\",\"email\":\"hack$S@test.com\",\"password\":\"password123\",\"role\":\"admin\"}"
expect_status 400
end

begin AUTH-05 "Registro con password corto"
call POST /auth/signup "{\"name\":\"Corto\",\"email\":\"corto$S@test.com\",\"password\":\"abc\",\"role\":\"customer\"}"
expect_status 400
end

begin AUTH-06 "Login exitoso"
call POST /auth/signin '{"email":"carlos@example.com","password":"password123"}'
expect_status 200; expect_jq_not_empty '.token'; expect_jq '.user.role' customer
end

begin AUTH-07 "Login con password incorrecto"
call POST /auth/signin '{"email":"carlos@example.com","password":"incorrecto"}'
expect_status 401
end

begin AUTH-08 "Login con email inexistente"
call POST /auth/signin '{"email":"noexiste@test.com","password":"password123"}'
expect_status 401
end

begin AUTH-09 "Endpoint protegido sin token"
call GET /me
expect_status 401
end

begin AUTH-10 "Endpoint protegido con token inválido"
call GET /me "" "token.invalido.xxx"
expect_status 401
end

begin AUTH-11 "/me devuelve los datos del token"
call GET /me "" "$TOKEN_CUSTOMER"
expect_status 200; expect_jq '.user.email' carlos@example.com; expect_jq '.user.role' customer
end

begin AUTH-12 "Roles distintos, acceso distinto al dashboard"
call GET /dashboard "" "$TOKEN_CUSTOMER"; expect_status 403
call GET /dashboard "" "$TOKEN_OWNER";    expect_status 200
end

begin AUTH-13 "Freelancer no puede crear negocio"
call POST /businesses '{"name":"Test","description":"Test","category":"Test","location":"Test"}' "$TOKEN_FREELANCER"
expect_status 403; expect_contains 'only business owners'
end

begin AUTH-14 "/me/businesses solo devuelve los del owner autenticado"
call GET /me/businesses "" "$TOKEN_OWNER";    expect_status 200; expect_jq_ge '.businesses | length' 2
call GET /me/businesses "" "$TOKEN_CUSTOMER"; expect_status 200; expect_jq '.businesses | length' 0
end

begin AUTH-15 "Registro con phone duplicado es rechazado"
PH="3$(( (RANDOM % 900000000) + 100000000 ))"
call POST /auth/signup "{\"name\":\"Usuario A\",\"email\":\"usuarioa$S@test.com\",\"password\":\"password123\",\"role\":\"freelancer\",\"phone\":\"$PH\"}"
expect_status 201
call POST /auth/signup "{\"name\":\"Usuario B\",\"email\":\"usuariob$S@test.com\",\"password\":\"password123\",\"role\":\"customer\",\"phone\":\"$PH\"}"
expect_status 400; expect_contains 'phone'
end

begin AUTH-16 "Registro sin document_id ni phone"
call POST /auth/signup "{\"name\":\"Sin Datos\",\"email\":\"sindatos$S@test.com\",\"password\":\"password123\",\"role\":\"customer\"}"
expect_status 201
end

begin AUTH-17 "El JWT contiene role, user_id y email correctos"
for pair in "maria@example.com:freelancer" "juan@example.com:business_owner" "carlos@example.com:customer"; do
  em="${pair%%:*}"; rl="${pair##*:}"
  tk="$(login_as "$em")"
  payload="$(printf '%s' "$tk" | cut -d. -f2 | tr '_-' '/+' | awk '{while(length($0)%4)$0=$0"=";print}' | base64 -d 2>/dev/null)"
  got_role="$(printf '%s' "$payload" | jq -r '.role' 2>/dev/null)"; got_email="$(printf '%s' "$payload" | jq -r '.email' 2>/dev/null)"
  [ "$got_role" = "$rl" ] || _err "$em: role='$got_role' (esperado $rl)"
  [ "$got_email" = "$em" ] || _err "$em: email='$got_email'"
  [ "$(printf '%s' "$payload" | jq -r '.user_id' 2>/dev/null)" != "null" ] || _err "$em: falta user_id"
done
end

suite_summary
