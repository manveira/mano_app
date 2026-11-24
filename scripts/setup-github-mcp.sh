#!/usr/bin/env bash
# setup-github-mcp.sh — LO CORRE EL USUARIO (el agente no tiene permiso de escribir ~/.kiro/settings/mcp.json).
# Configura el servidor MCP oficial de GitHub para Kiro, a nivel de usuario (fuera de cualquier repo).
#
# Uso:
#     bash mano_app/scripts/setup-github-mcp.sh                 # te pide el token (no se muestra al teclear)
#     GITHUB_PERSONAL_ACCESS_TOKEN=ghp_... bash mano_app/scripts/setup-github-mcp.sh
#
# Qué hace:
#   1. Crea/actualiza SOLO la entrada "github" de ~/.kiro/settings/mcp.json (conserva otros servidores; hace copia .bak).
#   2. Deja el archivo con permisos 600 (solo tu usuario).
#   3. Descarga la imagen ghcr.io/github/github-mcp-server (con reintentos: el DNS de WSL falla a ratos).
#   4. Valida el token contra la API de GitHub y muestra usuario y acceso al repo.
# El token NUNCA se escribe dentro del repo ni se imprime.
# Tras correrlo, Kiro reconecta los servidores solo al detectar el cambio; si no, reinicia la sesión.
# Para Azure se añadirá otra entrada más adelante (misma técnica).

set -euo pipefail
CFG="$HOME/.kiro/settings/mcp.json"
REPO="${MANO_GITHUB_REPO:-manveira/mano_app}"
TOOLSETS="${GITHUB_TOOLSETS:-context,repos,pull_requests,issues,actions}"   # mínimo necesario para CI/CD

command -v docker >/dev/null || { echo "❌ Falta docker (el servidor MCP corre en un contenedor)."; exit 1; }
command -v python3 >/dev/null || { echo "❌ Falta python3."; exit 1; }
command -v curl >/dev/null || { echo "❌ Falta curl."; exit 1; }

if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN:-}" ]; then
  read -r -s -p "Pega tu token de GitHub (no se muestra): " GITHUB_PERSONAL_ACCESS_TOKEN; echo
fi
[ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ] || { echo "❌ Token vacío."; exit 1; }
export GITHUB_PERSONAL_ACCESS_TOKEN TOOLSETS

mkdir -p "$(dirname "$CFG")"
if [ -f "$CFG" ]; then cp -p "$CFG" "$CFG.bak"; chmod 600 "$CFG.bak"; fi

python3 - "$CFG" <<'PY'
import json, os, pathlib, sys
p = pathlib.Path(sys.argv[1])
txt = p.read_text() if p.exists() else ""
cfg = json.loads(txt) if txt.strip() else {}
cfg.setdefault("mcpServers", {})["github"] = {
    "command": "docker",
    "args": ["run", "-i", "--rm",
             "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
             "-e", "GITHUB_TOOLSETS",
             "ghcr.io/github/github-mcp-server"],
    "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": os.environ["GITHUB_PERSONAL_ACCESS_TOKEN"],
        "GITHUB_TOOLSETS": os.environ["TOOLSETS"],
    },
    "disabled": False,
}
p.write_text(json.dumps(cfg, indent=2) + "\n")
PY
chmod 600 "$CFG"
echo "✅ $CFG actualizado (permisos 600). Servidores: $(python3 -c "import json;print(', '.join(json.load(open('$CFG'))['mcpServers']))")"

echo "▶ Validando el token contra GitHub ..."
HDR="$(mktemp)"; BODY="$(mktemp)"; trap 'rm -f "$HDR" "$BODY"' EXIT
curl -sS -m 20 -K - -D "$HDR" -o "$BODY" https://api.github.com/user <<EOF || true
header = "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN"
header = "Accept: application/vnd.github+json"
EOF
if head -1 "$HDR" | grep -q " 200"; then
  echo "   usuario: $(python3 -c "import json;print(json.load(open('$BODY')).get('login'))")"
  echo "   alcances: $(grep -i '^x-oauth-scopes' "$HDR" | cut -d: -f2- | tr -d '\r' | sed 's/^ //')"
else
  echo "⚠  GitHub respondió: $(head -1 "$HDR" | tr -d '\r'). Revisa el token."
fi
curl -sS -m 20 -K - -o "$BODY" "https://api.github.com/repos/$REPO" <<EOF || true
header = "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN"
header = "Accept: application/vnd.github+json"
EOF
python3 - "$BODY" "$REPO" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print(f"   repo {sys.argv[2]}: " + (f"acceso OK, permisos {d.get('permissions')}" if 'full_name' in d else f"sin acceso ({d.get('message')})"))
PY

echo "▶ Descargando la imagen del servidor MCP (reintenta si el DNS falla) ..."
for i in 1 2 3 4 5; do
  if docker pull ghcr.io/github/github-mcp-server >/dev/null 2>&1; then echo "✅ Imagen lista"; break; fi
  [ "$i" -eq 5 ] && echo "⚠  No se pudo descargar la imagen ahora; Docker la descargará al primer uso. Reintenta luego con: docker pull ghcr.io/github/github-mcp-server"
  sleep 5
done
echo "Listo. En Kiro, el servidor 'github' debe aparecer conectado (si no, reinicia la sesión)."
