#!/usr/bin/env bash
# tests/api/lib.sh — Mini-framework para los casos de prueba de la API (convierte docs/tests/*.md en scripts).
# Se usa con `source`. No ejecuta nada por sí solo.
#
# Variables de entorno:
#   BASE        URL base de la API  (default http://localhost:8080/api ; con gateway: http://localhost:8000/v1)
#   RESULTS     archivo TSV donde se anotan los resultados (default tests/api/results/latest.tsv)
#   CLIENT      valor de X-Mano-Client  (default web)
#
# API de un caso:
#   begin  ID "título"                  inicia un caso
#   call   METHOD PATH [BODY] [TOKEN]   hace la petición -> $STATUS (HTTP) y $BODY (JSON/text)
#   expect_status N [N2 ...]            el status debe ser alguno de los indicados
#   expect_jq   FILTRO ESPERADO         `jq -r FILTRO` sobre $BODY debe ser exactamente ESPERADO
#   expect_jq_ge FILTRO N               valor numérico >= N
#   expect_jq_le FILTRO N               valor numérico <= N
#   expect_jq_not_empty FILTRO          valor no vacío ni "null"
#   expect_contains TEXTO               $BODY contiene TEXTO (grep -F)
#   expect_not_contains TEXTO           $BODY NO contiene TEXTO
#   expect_true  "descripción" CMD...   evalúa un comando; debe devolver 0
#   xfail  "hallazgo #N: motivo"        el caso FALLA hoy por un hallazgo conocido (sección 6). Si falla => XFAIL; si pasa => XPASS
#   skip   "motivo"                     no se ejecuta (SKIP)
#   note   "texto"                      comentario libre que queda en el detalle
#   end                                 cierra el caso y registra el resultado
#
# Helpers:
#   login_as EMAIL [PASSWORD]           imprime el token JWT
#   jqv FILTRO                          imprime `jq -r FILTRO` de $BODY
#   uniq_suffix                         sufijo único para emails/teléfonos de prueba

BASE="${BASE:-http://localhost:8080/api}"
CLIENT="${CLIENT:-web}"
_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="${RESULTS:-$_LIB_DIR/results/latest.tsv}"
mkdir -p "$(dirname "$RESULTS")"
SUITE="${SUITE:-$(basename "${0:-suite}" .sh)}"

command -v jq >/dev/null 2>&1 || { echo "❌ falta jq"; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "❌ falta curl"; exit 2; }

_C_ID=""; _C_TITLE=""; _C_ERRS=(); _C_NOTES=(); _C_XFAIL=""; _C_SKIP=""
STATUS=""; BODY=""
_N_PASS=0; _N_FAIL=0; _N_XFAIL=0; _N_XPASS=0; _N_SKIP=0

uniq_suffix(){ echo "$(date +%s)$RANDOM"; }

begin(){ _C_ID="$1"; _C_TITLE="${2:-}"; _C_ERRS=(); _C_NOTES=(); _C_XFAIL=""; _C_SKIP=""; STATUS=""; BODY=""; }

call(){
  local method="$1" path="$2" data="${3:-}" token="${4:-}"
  local args=(-sS -m 20 -o /tmp/.mano_body.$$ -w '%{http_code}' -X "$method"
              -H "X-Mano-Client: $CLIENT" -H "X-Mano-Client-Version: 0.0.0-tests" -H "X-Mano-Device-Id: api-tests")
  [ -n "$data" ]  && args+=(-H 'Content-Type: application/json' -d "$data")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  STATUS="$(curl "${args[@]}" "$BASE$path" 2>/tmp/.mano_err.$$)" || STATUS="000"
  BODY="$(cat /tmp/.mano_body.$$ 2>/dev/null)"
  rm -f /tmp/.mano_body.$$
  [ "$STATUS" = "000" ] && _C_ERRS+=("sin respuesta de $method $path: $(cat /tmp/.mano_err.$$ 2>/dev/null | head -c 120)")
  rm -f /tmp/.mano_err.$$
  return 0
}

jqv(){ printf '%s' "$BODY" | jq -r "$1" 2>/dev/null; }
login_as(){
  local r; r="$(curl -sS -m 20 -X POST "$BASE/auth/signin" -H 'Content-Type: application/json' \
    -H "X-Mano-Client: $CLIENT" -H "X-Mano-Client-Version: 0.0.0-tests" -H "X-Mano-Device-Id: api-tests" \
    -d "{\"email\":\"$1\",\"password\":\"${2:-password123}\"}")"
  printf '%s' "$r" | jq -r '.token // empty'
}

_err(){ _C_ERRS+=("$1"); }
expect_status(){
  local got="$STATUS" want
  for want in "$@"; do [ "$got" = "$want" ] && return 0; done
  _err "status $got (esperado: $*) body=$(printf '%s' "$BODY" | head -c 160)"
}
expect_jq(){
  local got; got="$(jqv "$1")"
  [ "$got" = "$2" ] || _err "jq '$1' = '$got' (esperado '$2')"
}
expect_jq_ge(){
  local got; got="$(jqv "$1")"
  awk -v a="$got" -v b="$2" 'BEGIN{exit !(a!="" && a!="null" && a+0>=b+0)}' || _err "jq '$1' = '$got' (esperado >= $2)"
}
expect_jq_le(){
  local got; got="$(jqv "$1")"
  awk -v a="$got" -v b="$2" 'BEGIN{exit !(a!="" && a!="null" && a+0<=b+0)}' || _err "jq '$1' = '$got' (esperado <= $2)"
}
expect_jq_not_empty(){
  local got; got="$(jqv "$1")"
  { [ -n "$got" ] && [ "$got" != "null" ]; } || _err "jq '$1' vacío/null"
}
expect_contains(){ printf '%s' "$BODY" | grep -qF -- "$1" || _err "body no contiene '$1'"; }
expect_not_contains(){ printf '%s' "$BODY" | grep -qF -- "$1" && _err "body NO debía contener '$1'"; return 0; }
expect_true(){ local d="$1"; shift; "$@" >/dev/null 2>&1 || _err "falló: $d"; }
xfail(){ _C_XFAIL="$1"; }
skip(){ _C_SKIP="$1"; }
note(){ _C_NOTES+=("$1"); }

_emit(){ # estado detalle
  local st="$1" detail="${2//$'\t'/ }"; detail="${detail//$'\n'/ }"
  printf '%s\t%s\t%s\t%s\t%s\n' "$SUITE" "$_C_ID" "$st" "${_C_TITLE//$'\t'/ }" "$detail" >> "$RESULTS"
  case "$st" in
    PASS)  _N_PASS=$((_N_PASS+1));   printf '  ✅ %-10s %s\n' "$_C_ID" "$_C_TITLE" ;;
    FAIL)  _N_FAIL=$((_N_FAIL+1));   printf '  ❌ %-10s %s\n       ↳ %s\n' "$_C_ID" "$_C_TITLE" "$detail" ;;
    XFAIL) _N_XFAIL=$((_N_XFAIL+1)); printf '  🟡 %-10s %s  (conocido)\n' "$_C_ID" "$_C_TITLE" ;;
    XPASS) _N_XPASS=$((_N_XPASS+1)); printf '  🟢 %-10s %s  (¡pasa aunque se esperaba fallo!)\n' "$_C_ID" "$_C_TITLE" ;;
    SKIP)  _N_SKIP=$((_N_SKIP+1));   printf '  ⏭  %-10s %s  (%s)\n' "$_C_ID" "$_C_TITLE" "$detail" ;;
  esac
}

end(){
  if [ -n "$_C_SKIP" ]; then _emit SKIP "$_C_SKIP"; return 0; fi
  local detail="${_C_ERRS[*]:-}"
  if [ ${#_C_ERRS[@]} -eq 0 ]; then
    if [ -n "$_C_XFAIL" ]; then _emit XPASS "$_C_XFAIL"; else _emit PASS "${_C_NOTES[*]:-}"; fi
  else
    local joined; joined="$(printf '%s | ' "${_C_ERRS[@]}")"; joined="${joined% | }"
    if [ -n "$_C_XFAIL" ]; then _emit XFAIL "$_C_XFAIL :: $joined"; else _emit FAIL "$joined ${_C_NOTES[*]:-}"; fi
  fi
}

suite_summary(){
  echo "── $SUITE: ✅ $_N_PASS  ❌ $_N_FAIL  🟡 $_N_XFAIL  🟢 $_N_XPASS  ⏭ $_N_SKIP"
  [ "$_N_FAIL" -eq 0 ]
}
