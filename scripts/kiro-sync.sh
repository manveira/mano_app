#!/usr/bin/env bash
# kiro-sync.sh — Sincroniza la configuración del agente (.kiro) entre la carpeta de trabajo y el repo.
#   export : <carpeta>/.kiro  →  mano_app/.kiro   (antes de hacer commit)
#   import : mano_app/.kiro   →  <carpeta>/.kiro   (en un computador nuevo, tras clonar)
# <carpeta> es la carpeta que contiene a mano_app (p. ej. ~/Repos). NUNCA copia settings/mcp.json (tiene tokens).
set -eu
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT="$(dirname "$REPO")"
OPTS=(-a --exclude='settings/mcp.json' --exclude='settings/*.bak')
case "${1:-}" in
  export) [ -d "$PARENT/.kiro" ] || { echo "No existe $PARENT/.kiro"; exit 1; }
          mkdir -p "$REPO/.kiro"; rsync "${OPTS[@]}" --delete "$PARENT/.kiro/" "$REPO/.kiro/"
          echo "✅ .kiro exportado al repo (sin mcp.json). Revisa con: git status";;
  import) [ -d "$REPO/.kiro" ] || { echo "El repo no tiene .kiro"; exit 1; }
          mkdir -p "$PARENT/.kiro"; rsync "${OPTS[@]}" "$REPO/.kiro/" "$PARENT/.kiro/"
          echo "✅ .kiro copiado a $PARENT/.kiro"
          [ -f "$PARENT/.kiro/settings/mcp.json" ] || echo "ℹ️  Crea settings/mcp.json desde mcp.json.example y pega tu token de GitHub.";;
  *) sed -n 2,6p "$0"; exit 2;;
esac
