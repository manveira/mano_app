#!/usr/bin/env bash
# github-sync.sh — Versiona el trabajo en GitHub (rama + commit + push) con comprobaciones de seguridad.
#
#   bash scripts/github-sync.sh "mensaje del commit" [rama]      (rama por defecto: refactor/multifront)
#
# Por qué existe: la carpeta de trabajo no es un repo git (vive en /mnt/c). Este script mantiene un clon en
# ~/mano-push, copia ahí el trabajo (sin secretos), revisa que no se cuele ninguna llave, hace el commit y lo sube.
# NUNCA empuja a main: para main se usa un Pull Request. Un push a una rama no despliega nada (deploy.yml es manual).
#
# Seguridad:
#   · Excluye .env, .env.local, .env.production, .kiro/settings/mcp.json, node_modules, .next, resultados de pruebas.
#   · Escanea lo que se va a subir: ningún valor de .env.local ni el token de GitHub puede aparecer. Si aparece, aborta.
#   · El token (de .kiro/settings/mcp.json) se pasa solo en un encabezado de ESA orden de git; no se imprime ni se guarda.
set -euo pipefail
MSG="${1:-}"; BRANCH="${2:-refactor/multifront}"
[ -n "$MSG" ] || { sed -n 2,5p "$0"; exit 2; }
case "$BRANCH" in main|master) echo "❌ No se empuja a $BRANCH desde aquí: usa una rama y un Pull Request."; exit 1;; esac

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP="$(dirname "$SRC")/.kiro/settings/mcp.json"
CLONE="${MANO_PUSH_DIR:-$HOME/mano-push}"
REMOTE=https://github.com/manveira/mano_app.git

echo "▶ 1/6 Clon de trabajo en $CLONE"
if [ ! -d "$CLONE/.git" ]; then git clone --quiet "$REMOTE" "$CLONE"; fi
cd "$CLONE"
git fetch --quiet origin
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then git checkout -q -B "$BRANCH" "origin/$BRANCH"; else git checkout -q -B "$BRANCH" origin/main; fi

echo "▶ 2/6 Copiando el trabajo (sin secretos)"
bash "$SRC/scripts/kiro-sync.sh" export >/dev/null   # .kiro de la carpeta de trabajo → mano_app/.kiro (sin mcp.json)
rsync -a --delete --chmod=D755,F644 \
  --exclude='.git' --exclude='.env' --exclude='.env.local' --exclude='.env.production' --exclude='node_modules' --exclude='.next' \
  --exclude='tests/api/results' --exclude='*.log' --exclude='tsconfig.tsbuildinfo' --exclude='backend/mano-app' --exclude='.DS_Store' \
  --exclude='.kiro/settings/mcp.json' --exclude='.kiro/settings/*.bak' "$SRC"/ ./
find . -path ./.git -prune -o -type f -name '*.sh' -print0 | xargs -0 chmod 755
git add -A

echo "▶ 3/6 Escaneo de secretos (no se imprimen valores)"
if git diff --cached --name-only | grep -qE '(^|/)(\.env|\.env\.local|\.env\.production|mcp\.json)$'; then
  echo "❌ Hay un archivo de secretos en el índice"; git diff --cached --name-only | grep -E 'mcp\.json$|\.env' ; exit 1; fi
hits=0
scan(){ if git grep --cached -qF -- "$2"; then echo "❌ El valor de $1 aparece en lo que se va a subir"; hits=$((hits+1)); fi; }
if [ -f "$SRC/.env.local" ]; then
  while IFS='=' read -r k v; do v=$(printf '%s' "$v" | tr -d '\r'); [ ${#v} -ge 8 ] || continue; case "$k" in \#*|"") continue;; esac; scan "$k (.env.local)" "$v"; done < "$SRC/.env.local"
fi
TOKEN=""; [ -f "$MCP" ] && TOKEN=$(jq -r '.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN // empty' "$MCP")
[ -n "$TOKEN" ] && scan "TOKEN de GitHub" "$TOKEN"
if git grep --cached -qIE '(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----' ; then echo "❌ Hay algo con forma de token o llave privada"; hits=$((hits+1)); fi
[ "$hits" = 0 ] || { echo "Abortado: nada se subió."; exit 1; }
echo "  ✅ sin secretos"

echo "▶ 4/6 Resumen"
git status --short | awk '{print $1}' | sort | uniq -c | sed 's/^/  /'
if git diff --cached --quiet; then echo "  (sin cambios nuevos: nada que subir)"; exit 0; fi
git diff --cached --shortstat | sed 's/^/  /'

echo "▶ 5/6 Commit"
git -c user.name="manveira" -c user.email="100451657+manveira@users.noreply.github.com" commit -q -m "$MSG"
git log --oneline -1 | sed 's/^/  /'

echo "▶ 6/6 Push a $BRANCH"
[ -n "$TOKEN" ] || { echo "❌ No encuentro el token en $MCP (se necesita para subir)"; exit 1; }
HDR="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"
GIT_TERMINAL_PROMPT=0 git -c "http.extraheader=$HDR" push -u origin "$BRANCH" 2>&1 | sed -E 's#(https://)[^@/ ]+@#\1***@#' | tail -4
unset TOKEN HDR
echo "✅ Subido: https://github.com/manveira/mano_app/tree/$BRANCH"
