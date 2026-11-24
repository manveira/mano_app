#!/usr/bin/env bash
# smoke.sh — 5 casos críticos (docs/tests/README.md). Funciona contra cualquier base:
#   BASE=http://localhost:8080/api bash scripts/smoke.sh        # directo al backend (F0–F1)
#   BASE=http://localhost:8000/v1  bash scripts/smoke.sh        # vía gateway (F2+)
# Requiere el seed por defecto y MOCK_MODE=true. Cada ejecución consume 1 unidad de stock de la hamaca.
set -u
BASE="${BASE:-http://localhost:8080/api}"
CLIENT_HEADERS=(-H "X-Mano-Client: web" -H "X-Mano-Client-Version: 0.0.0-smoke" -H "X-Mano-Device-Id: smoke-test")
command -v jq >/dev/null || { echo "❌ falta jq"; exit 2; }

pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
ko(){ echo "  ❌ $1"; fail=$((fail+1)); }
req(){ curl -sS -m 15 "${CLIENT_HEADERS[@]}" "$@"; }

echo "BASE = $BASE"

echo "1) Health"
v=$(req "$BASE/health" | jq -r '.status' 2>/dev/null)
[ "$v" = "ok" ] && ok "status=ok" || ko "esperado ok, obtenido '$v'"

echo "2) Login (carlos, customer)"
login=$(req -X POST "$BASE/auth/signin" -H 'Content-Type: application/json' \
  -d '{"email":"carlos@example.com","password":"password123"}')
role=$(echo "$login" | jq -r '.user.role' 2>/dev/null); TOKEN=$(echo "$login" | jq -r '.token' 2>/dev/null)
[ "$role" = "customer" ] && [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && ok "role=customer y token recibido" || ko "login falló: $login"

echo "3) Negocios del seed"
n=$(req "$BASE/businesses" | jq -r '.businesses | length' 2>/dev/null)
[ "${n:-0}" -ge 2 ] 2>/dev/null && ok "$n negocios" || ko "esperados >=2, obtenidos '$n'"

echo "4) Mock mode activo"
m=$(req "$BASE/mock/status" | jq -r '.mock_mode' 2>/dev/null)
[ "$m" = "true" ] && ok "mock_mode=true" || ko "mock_mode='$m' (¿gateway bloqueando /mock? es lo esperado desde F2)"

echo "5) Flujo completo con comisionista (3 splits que suman 120000)"
resp=$(req -X POST "$BASE/mock/flow/full-sale" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"product_id":4,"quantity":1,"referral_slug":"hamaca-casa-narino-maria-x7k2"}')
splits=$(echo "$resp" | jq -r '.commission_splits | length' 2>/dev/null)
sum=$(echo "$resp" | jq -r '.commission_splits | map(.amount) | add' 2>/dev/null)
if [ "$splits" = "3" ] && [ "$sum" = "120000" ]; then ok "3 splits, suma=$sum"; else ko "splits='$splits' suma='$sum' resp=$(echo "$resp" | head -c 200)"; fi

echo
echo "Resultado: $pass OK, $fail fallidos"
[ "$fail" -eq 0 ]
