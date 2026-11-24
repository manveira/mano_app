#!/usr/bin/env bash
# verify-design-assets.sh — SOLO LECTURA.
# Verifica que las imágenes del diseñador no cambiaron respecto a design-assets/MANIFEST.sha256
# y que no hay imágenes sin registrar. No modifica ningún archivo.
#
# Uso (desde cualquier directorio):  bash mano_app/scripts/verify-design-assets.sh
# Código de salida: 0 = OK, 1 = alguna imagen cambió/falta, 2 = hay imágenes sin registrar.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/design-assets/MANIFEST.sha256"
DIRS=("web/public/branding" "design-assets" "Mano_images")
IMG_REGEX='.*\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?|ico|psd|fig|sketch|xd|svg)$'

if [ ! -f "$MANIFEST" ]; then
  echo "❌ Falta $MANIFEST (corre scripts/register-design-assets.sh)"; exit 1
fi

cd "$ROOT" || exit 1
status=0

echo "🔎 Verificando hashes contra MANIFEST.sha256 ..."
if ! sha256sum --check --quiet "$MANIFEST" 2>/tmp/verify-assets.err; then
  echo "❌ Hay imágenes modificadas o ausentes:"
  sha256sum --check "$MANIFEST" 2>/dev/null | grep -v ': OK$'
  status=1
fi

echo "🔎 Buscando imágenes sin registrar ..."
unregistered=0
for d in "${DIRS[@]}"; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    if ! grep -qF "  $f" "$MANIFEST"; then
      echo "⚠️  Sin registrar: $f"; unregistered=1
    fi
  done < <(find "$d" -type f -regextype posix-extended -iregex "$IMG_REGEX" | sort)
done
[ "$unregistered" -eq 1 ] && [ "$status" -eq 0 ] && status=2

case "$status" in
  0) echo "✅ OK — todas las imágenes del diseñador están intactas." ;;
  1) echo "🛑 FALLO — NO corrijas esto editando imágenes. Restaura el original entregado por el diseñador." ;;
  2) echo "⚠️  Hay imágenes nuevas sin registrar. El usuario debe correr scripts/register-design-assets.sh" ;;
esac
exit "$status"
