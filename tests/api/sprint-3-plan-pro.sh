#!/usr/bin/env bash
# Sprint 3 — Plan Pro del comisionista  (docs/tests/sprint-3-plan-pro.md)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "▶ Sprint 3 — Plan Pro   BASE=$BASE"
S="$(uniq_suffix)"

# ── helpers locales ───────────────────────────────────────────────────────────
new_phone(){ printf '3%09d' $(( ($(date +%s%N) / 1000 + RANDOM * 31337) % 1000000000 )); }   # defecto #18: todo usuario lleva phone único
new_doc(){   printf '9%08d' $(( ($(date +%s%N) / 1000 + RANDOM) % 100000000 )); }
biz_id(){ curl -sS -m 20 "$BASE/businesses" | jq -r --arg n "$1" '[.businesses[]? | select(.name==$n) | .id] | first // empty'; }
mk_user(){ # ROLE TAG NOMBRE -> U_ID, U_EMAIL, U_TOKEN
  local role="$1" tag="$2" name="$3"
  U_EMAIL="${tag}${S}@test.com"
  call POST /auth/signup "{\"name\":\"$name\",\"email\":\"$U_EMAIL\",\"password\":\"password123\",\"role\":\"$role\",\"phone\":\"$(new_phone)\",\"document_id\":\"$(new_doc)\",\"username\":\"${tag}${S}\"}"
  U_ID="$(jqv '.id')"
  U_TOKEN="$(login_as "$U_EMAIL")"
}

# ── Setup ─────────────────────────────────────────────────────────────────────
# El .md usa a maria (seed), pero su plan es estado compartido con otras suites:
# se crean comisionistas propios (FL arranca free y sube a Pro; FL2 se queda free).
TOKEN_OWNER="$(login_as juan@example.com)"
mk_user freelancer prof "Pro Freelancer"; TOKEN_FREELANCER="$U_TOKEN"
mk_user freelancer freef "Free Freelancer"; TOKEN_FREE2="$U_TOKEN"
BIZ2="$(biz_id 'Artesanías Casa Nariño')"   # seed: id 2

EXCLUSIVE_ID=""

begin PRO-01 "Comisionista free tiene plan 'free' por defecto"
call GET /me "" "$TOKEN_FREELANCER"
expect_status 200; expect_jq '.user.plan' free
end

begin PRO-02 "Producto exclusivo no es visible para comisionista free"
call POST /products "{\"business_id\":$BIZ2,\"name\":\"Hamaca Edición Limitada $S\",\"description\":\"Solo para comisionistas Pro\",\"price\":250000,\"stock\":5,\"commission_rate\":0.25,\"is_exclusive\":true}" "$TOKEN_OWNER"
expect_status 201; expect_jq '.is_exclusive' true; expect_jq '.name' "Hamaca Edición Limitada $S"
EXCLUSIVE_ID="$(jqv '.id')"
call POST /sell/affiliate "{\"product_id\":$EXCLUSIVE_ID}" "$TOKEN_FREELANCER"
expect_status 403; expect_jq '.error' 'this product requires a Pro plan'
end

begin PRO-03 "Upgrade a plan Pro"
call POST /sell/upgrade-pro '{"nequi_number":"3205551234"}' "$TOKEN_FREELANCER"
expect_status 200; expect_jq '.plan' pro; expect_jq '.message' 'Plan Pro activado por 30 días'
note "hallazgo #5: UpgradePro activa Pro sin cobrar los \$15.000 (el .md ya lo anticipa: 'en mock activa directamente'); el test solo valida la activación"
end

begin PRO-04 "Comisionista Pro puede afiliarse a productos exclusivos"
call POST /sell/affiliate "{\"product_id\":$EXCLUSIVE_ID}" "$TOKEN_FREELANCER"
expect_status 201; expect_jq_not_empty '.referral_link.slug'; expect_jq_not_empty '.url'
expect_jq '.referral_link.product_id' "$EXCLUSIVE_ID"
end

begin PRO-05 "Stats avanzadas solo para plan Pro"
call GET /sell/stats "" "$TOKEN_FREE2"
expect_status 403; expect_jq '.error' 'advanced stats require Pro plan'
call GET /sell/stats "" "$TOKEN_FREELANCER"
expect_status 200; expect_jq '.links | type' array; expect_jq_ge '.links | length' 1
expect_jq_not_empty '.links[0].slug'; expect_jq_not_empty '.links[0].conversion_rate_pct'; expect_jq_not_empty '.total_balance'
note "el plan free se prueba con un 2º comisionista (el 1º ya es Pro). Gap menor vs .md: stats reales = clicks, conversiones, conversion_rate_pct y earned_total por link; no hay clicks por hora ni ingresos proyectados"
end

begin PRO-06 "Plan Pro expira después de 30 días"
call GET /me "" "$TOKEN_FREELANCER"
expect_status 200; expect_jq '.user.plan' pro
EXP="$(jqv '.user.plan_expires_at')"
EXP_S="$(date -d "$EXP" +%s 2>/dev/null)"; NOW_S="$(date +%s)"
DIFF=0; [ -n "$EXP_S" ] && DIFF=$(( EXP_S - NOW_S ))
expect_true "plan_expires_at es parseable (valor: '$EXP')" test -n "$EXP_S"
expect_true "expira >= 29 días en el futuro (diff=${DIFF}s)" test "$DIFF" -ge $((29*86400))
expect_true "expira <= 30 días (+5 min) en el futuro (diff=${DIFF}s)" test "$DIFF" -le $((30*86400+300))
call GET /me "" "$TOKEN_FREE2"
expect_status 200; expect_jq '.user.plan' free; expect_jq '.user.plan_expires_at' null
end

begin PRO-07 "Comisionista free ve solo productos normales en explorar"
call GET /products
expect_status 200; expect_jq '[.products[] | select(.is_exclusive == true)] | length' 0
call GET /products "" "$TOKEN_FREE2"
expect_status 200; expect_jq '[.products[] | select(.is_exclusive == true)] | length' 0
call GET /products "" "$TOKEN_FREELANCER"
expect_status 200; expect_jq "[.products[] | select(.id == $EXCLUSIVE_ID)] | length" 1
note "el .md solo verifica el caso free; se añade el lado Pro (ve el exclusivo creado en PRO-02)"
end

suite_summary
