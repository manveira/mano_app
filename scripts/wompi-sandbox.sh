#!/usr/bin/env bash
# wompi-sandbox.sh — Prepara y revisa las pruebas de pago con el SANDBOX de Wompi en local.
# Procedimiento completo: docs/WOMPI_SANDBOX.md y .kiro/skills/mano-app/SKILL.md §14.
#
#   bash scripts/wompi-sandbox.sh up [--new]   túnel https → puerto 3000, LOCAL_APP_BASE_URL, recrea el backend, verifica
#                                              (reutiliza el túnel si sigue vivo; --new fuerza una URL nueva)
#   bash scripts/wompi-sandbox.sh status [ID]  qué ve Wompi y qué ve la BD (de la orden ID, o de las últimas 5 transacciones)
#   bash scripts/wompi-sandbox.sh down         cierra el túnel y deja LOCAL_APP_BASE_URL=http://localhost:3000
#
# Nunca imprime llaves ni secretos (solo prefijos y longitudes). Requiere .env.local con las 4 llaves LOCAL_WOMPI_*.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ENVF=.env.local
PIDF=/tmp/mano-tunnel.pid
URLF=/tmp/mano-tunnel.url
LOGF=/tmp/mano-tunnel.log
CF="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"
COMPOSE=(docker compose -f docker-compose.local.yml --env-file "$ENVF")
UA='Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36'

say(){ printf '%s\n' "$*"; }
die(){ printf '❌ %s\n' "$*" >&2; exit 1; }
getv(){ grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2-; }
setv(){ if grep -qE "^$1=" "$ENVF"; then sed -i "s#^$1=.*#$1=$2#" "$ENVF"; else printf '%s=%s\n' "$1" "$2" >> "$ENVF"; fi; }
retry_code(){ local c i; for i in 1 2 3 4 5 6; do c=$(curl -sS -m 12 -o /dev/null -w '%{http_code}' -A "$UA" "$@" 2>/dev/null) && [ "$c" != 000 ] && { echo "$c"; return; }; sleep 3; done; echo "${c:-000}"; }

check_env(){
  [ -f "$ENVF" ] || die "No existe $ENVF. Cópialo de .env.local.example y pon las llaves del sandbox (ver docs/WOMPI_SANDBOX.md §1-2)."
  local bad=0 k p
  for pair in LOCAL_WOMPI_PUBLIC_KEY:pub_test_ LOCAL_WOMPI_PRIVATE_KEY:prv_test_ LOCAL_WOMPI_INTEGRITY_SECRET:test_integrity_ LOCAL_WOMPI_EVENTS_SECRET:test_events_; do
    k=${pair%%:*}; p=${pair#*:}; v=$(getv "$k")
    case "$v" in "$p"*) say "  ✅ $k = ${p}… (${#v} caracteres)";; "") say "  ❌ $k vacío"; bad=1;; *) say "  ❌ $k no empieza por $p (¿llave de producción?)"; bad=1;; esac
  done
  [ "$bad" = 0 ] || die "Corrige $ENVF (modo de pruebas activo en Wompi → Desarrollo → Programadores)."
}

tunnel_alive(){ [ -s "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null && [ -s "$URLF" ] && [ "$(retry_code "$(cat "$URLF")/api/health")" = 200 ]; }

start_tunnel(){
  [ -x "$CF" ] || die "Falta cloudflared en $CF (ver SKILL.md §10 para instalarlo sin sudo)."
  [ -s "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null
  : > "$LOGF"
  setsid nohup "$CF" tunnel --no-autoupdate --url http://localhost:3000 > "$LOGF" 2>&1 < /dev/null &
  echo $! > "$PIDF"
  local u i
  for i in $(seq 1 30); do u=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOGF" | head -1); [ -n "$u" ] && break; sleep 2; done
  [ -n "${u:-}" ] || die "El túnel no entregó URL. Revisa $LOGF"
  echo "$u" > "$URLF"
  # el DNS de WSL falla a ratos: esperar a que la URL nueva resuelva
  [ "$(retry_code "$u/api/health")" = 200 ] || die "El túnel $u no responde todavía; reintenta 'up' en unos segundos."
}

cmd_up(){
  say "▶ 1/5 Llaves en $ENVF"; check_env
  say "▶ 2/5 App local"; [ "$(retry_code http://localhost:3000/)" = 200 ] || die "http://localhost:3000 no responde. Corre: bash scripts/local-up.sh"
  say "▶ 3/5 Túnel https"
  if [ "${1:-}" != "--new" ] && tunnel_alive; then say "  ♻️  reutilizo el túnel vivo"; else start_tunnel; say "  🆕 túnel nuevo (hay que repegar la URL de eventos en Wompi)"; fi
  U=$(cat "$URLF")
  say "▶ 4/5 LOCAL_APP_BASE_URL y backend"
  setv LOCAL_APP_BASE_URL "$U"
  "${COMPOSE[@]}" up -d core >/dev/null 2>&1 || die "No se pudo recrear el backend (docker compose)."
  for i in $(seq 1 30); do curl -fsS -m 3 localhost:8080/api/health >/dev/null 2>&1 && break; sleep 2; done
  curl -fsS -m 3 localhost:8080/api/health >/dev/null 2>&1 || die "El backend no arrancó. docker logs mano-local-core-1"
  say "▶ 5/5 Verificación"
  A=http://localhost:8080/api   # el token JWT no depende del origen: se obtiene directo del backend (no se ve afectado por el DNS de WSL)
  T=$(curl -sS -m 15 "$A/auth/signin" -H 'Content-Type: application/json' -d '{"email":"carlos@example.com","password":"password123"}' | jq -r '.token // empty')
  [ -n "$T" ] || die "No se pudo iniciar sesión con carlos@example.com (¿BD reiniciada sin seed?)."
  BIZ=$(curl -sS -m 10 "$A/businesses" | jq -r '(.businesses // .)[0].id // empty'); PROD=$(curl -sS -m 10 "$A/products?business_id=$BIZ" | jq -r '.products[0].id // empty')
  [ -n "$BIZ" ] && [ -n "$PROD" ] || die "No hay negocio/producto de prueba."
  OID=$(curl -sS -m 15 -X POST "$A/orders" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "{\"business_id\":$BIZ,\"items\":[{\"product_id\":$PROD,\"quantity\":1}]}" | jq -r '.id // empty')
  [ -n "$OID" ] || die "No se pudo crear la orden de prueba."
  R=$(curl -sS -m 15 -X POST "$A/payments/wompi/initiate" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d "{\"order_id\":$OID}")
  CU=$(echo "$R" | jq -r '.checkout_url // empty'); [ -n "$CU" ] || die "initiate falló: $(echo "$R" | jq -r '.error // .')"
  c=$(retry_code "$CU")
  [ "$c" = 200 ] && say "  ✅ checkout.wompi.co acepta la URL de pago (HTTP 200)" || say "  ❌ checkout.wompi.co respondió HTTP $c (403 = redirect-url no es https público; 000 = sin red/DNS, reintenta)"
  c=$(retry_code "$U/api/health")
  [ "$c" = 200 ] && say "  ✅ el túnel llega al backend (HTTP 200)" || say "  ⚠️  el túnel no responde (HTTP $c). Reintenta, o usa: bash scripts/wompi-sandbox.sh up --new (URL nueva => repegar en Wompi)"

  cat <<EOF

════════════════ LISTO PARA PROBAR ════════════════
1) Wompi (modo de pruebas) → Desarrollo → Programadores → URL de Eventos, pega y guarda:
     $U/api/webhooks/wompi
2) Abre la app POR ESTA URL (no por localhost) e inicia sesión con carlos@example.com / password123:
     $U/signin
3) Orden de prueba lista (sin pagar):
     $U/checkout?order_id=$OID
   (o crea otra: Negocios → producto → Añadir → /cart → Crear pedido y pagar)
4) Tarjeta aprobada: 4242 4242 4242 4242, fecha futura, CVC 3 dígitos. Rechazada: 4111 1111 1111 1111.
   Nequi: 3991111111 aprobado / 3992222222 rechazado. Cualquier otra tarjeta => ERROR.
5) Revisar el resultado:  bash scripts/wompi-sandbox.sh status $OID
════════════════════════════════════════════════════
EOF
}

cmd_status(){
  check_env >/dev/null || exit 1
  SK=$(getv LOCAL_WOMPI_PRIVATE_KEY); ID="${1:-}"
  say "▶ Webhooks recibidos por el backend desde que arrancó: $(docker logs mano-local-core-1 2>&1 | grep -c 'POST.*"/api/webhooks/wompi"')"
  docker logs mano-local-core-1 2>&1 | grep -E "wompi: " | tail -5 | cut -c1-200
  if [ -n "$ID" ]; then Q="where order_id=$ID"; else Q=""; fi
  say "▶ Transacciones en la BD"
  docker exec mano-local-postgres-1 psql -U user -d mano -At -F ' | ' -c "select reference, status, amount, coalesce(payment_method,'') from wompi_transactions $Q order by created_at desc limit 5;"
  [ -n "$ID" ] && { say "▶ Orden $ID (estado | pago | escrow)"; docker exec mano-local-postgres-1 psql -U user -d mano -At -F ' | ' -c "select status, payment_status, escrow_status from orders where id=$ID;"; }
  say "▶ Lo que Wompi ve de cada referencia"
  for ref in $(docker exec mano-local-postgres-1 psql -U user -d mano -At -c "select reference from wompi_transactions $Q order by created_at desc limit 5;"); do
    out=""; for i in 1 2 3 4; do out=$(curl -sS -m 15 -H "Authorization: Bearer $SK" "https://sandbox.wompi.co/v1/transactions?reference=$ref" 2>/dev/null) && [ -n "$out" ] && break; sleep 3; done
    printf '  %s → ' "$ref"; echo "$out" | jq -r 'if (.data|type)=="array" then (if (.data|length)==0 then "Wompi no tiene transacción (no se llegó a pagar)" else (.data[] | "\(.status) · \(.payment_method_type) · \(.status_message // "sin mensaje")") end) else (.error.reason // "respuesta inesperada") end' 2>/dev/null || echo "sin respuesta (¿DNS? reintenta)"
  done
}

cmd_down(){
  [ -s "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null; rm -f "$PIDF" "$URLF"
  setv LOCAL_APP_BASE_URL http://localhost:3000
  "${COMPOSE[@]}" up -d core >/dev/null 2>&1 && say "✅ túnel cerrado; LOCAL_APP_BASE_URL=http://localhost:3000; backend recreado"
}

case "${1:-}" in
  up) shift; cmd_up "$@";;
  status) shift; cmd_status "$@";;
  down) cmd_down;;
  *) sed -n 2,12p "$0"; exit 2;;
esac
