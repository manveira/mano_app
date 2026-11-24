#!/usr/bin/env bash
# register-design-assets.sh — LO CORRE EL USUARIO (no el agente).
# Registra en design-assets/MANIFEST.sha256 el hash de las imágenes del diseñador.
# Solo LEE las imágenes; únicamente escribe el archivo MANIFEST.sha256.
#
# Uso:
#   bash mano_app/scripts/register-design-assets.sh              # agrega imágenes nuevas (no toca las ya registradas)
#   bash mano_app/scripts/register-design-assets.sh --replace RUTA   # el diseñador reemplazó RUTA; actualiza su hash
#
# RUTA es relativa a mano_app/, por ejemplo: web/public/branding/02-home-hero-comisionistas.jpeg

set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/design-assets/MANIFEST.sha256"
DIRS=("web/public/branding" "design-assets" "Mano_images")
IMG_REGEX='.*\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?|ico|psd|fig|sketch|xd|svg)$'

cd "$ROOT"
touch "$MANIFEST"

if [ "${1:-}" = "--replace" ]; then
  f="${2:?Indica la ruta de la imagen reemplazada}"
  [ -f "$f" ] || { echo "No existe: $f"; exit 1; }
  grep -vF "  $f" "$MANIFEST" > "$MANIFEST.tmp" || true
  mv "$MANIFEST.tmp" "$MANIFEST"
  sha256sum "$f" >> "$MANIFEST"
  sort -k2 -o "$MANIFEST" "$MANIFEST"
  echo "🔁 Actualizado: $f"
  exit 0
fi

if [ "${1:-}" = "--forget" ]; then
  # Da de baja del manifiesto una imagen que YA NO EXISTE (p. ej. el diseñador/usuario retiró la versión vieja).
  # Se niega si el archivo todavía existe: así no se puede "olvidar" una imagen para ocultar una modificación.
  f="${2:?Indica la ruta de la imagen retirada}"
  [ ! -e "$f" ] || { echo "❌ $f todavía existe. Solo se pueden olvidar imágenes que ya no están (usa --replace si cambió)."; exit 1; }
  grep -qF "  $f" "$MANIFEST" || { echo "No estaba en el manifiesto: $f"; exit 1; }
  grep -vF "  $f" "$MANIFEST" > "$MANIFEST.tmp" || true
  mv "$MANIFEST.tmp" "$MANIFEST"
  echo "🗑  Dada de baja del manifiesto: $f"
  exit 0
fi

added=0
for d in "${DIRS[@]}"; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    if ! grep -qF "  $f" "$MANIFEST"; then
      sha256sum "$f" >> "$MANIFEST"; echo "➕ Registrada: $f"; added=$((added+1))
    fi
  done < <(find "$d" -type f -regextype posix-extended -iregex "$IMG_REGEX" | sort)
done
sort -k2 -o "$MANIFEST" "$MANIFEST"
echo "Listo: $added imagen(es) nueva(s) registrada(s). Ahora corre scripts/verify-design-assets.sh"
