#!/usr/bin/env bash
# guard-design-assets.sh — hook PreToolUse de Kiro.
# Bloquea (exit 2) cualquier intento de MODIFICAR imágenes del diseñador.
# Lee el JSON del evento por stdin. Solo lectura sobre imágenes está permitido.
#
# Heurística para comandos de shell: se bloquea si el comando contiene un verbo
# que modifica archivos Y referencia una imagen o una carpeta protegida.
# Es una red de seguridad, no un sandbox: la regla real está en
# .kiro/steering/design-assets-immutable.md

set -u
INPUT="$(cat)"

if command -v python3 >/dev/null 2>&1; then
  RESULT="$(printf '%s' "$INPUT" | python3 -c '
import json, re, sys, shlex

IMG = r"\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?|ico|psd|fig|sketch|xd)$"
PROTECTED_DIRS = ("web/public/branding", "design-assets", "Mano_images")
MUTATORS = re.compile(
    r"(^|[\s;&|(])(rm|mv|cp|rsync|install|truncate|dd|tee|chmod|chown|touch|"
    r"convert|mogrify|magick|cwebp|dwebp|optipng|jpegoptim|pngquant|exiftool|ffmpeg|"
    r"sed\s+-i|perl\s+-i|git\s+(checkout|restore|clean|rm|mv|stash)|find\b.*-delete)(\s|$)"
)

try:
    data = json.load(sys.stdin)
except Exception:
    print("OK"); sys.exit(0)

paths, commands = [], []
def walk(o, key=""):
    if isinstance(o, dict):
        for k, v in o.items(): walk(v, k)
    elif isinstance(o, list):
        for v in o: walk(v, key)
    elif isinstance(o, str):
        if key in ("path", "file_path", "targetFile", "filePath", "target_file", "new_path", "old_path", "destination"):
            paths.append(o)
        if key in ("command", "cmd", "script"):
            commands.append(o)
walk(data)

def is_protected_path(p):
    n = p.replace("\\", "/")
    in_dir = any(("/" + d + "/") in ("/" + n) or n.endswith("/" + d) for d in PROTECTED_DIRS)
    is_img = re.search(IMG, n, re.I) is not None
    # imágenes en cualquier lugar, o cualquier archivo binario/SVG bajo carpeta protegida
    if is_img: return True
    if in_dir and re.search(r"\.(svg)$", n, re.I): return True
    return False

for p in paths:
    if is_protected_path(p):
        print("BLOCK:" + p); sys.exit(0)

for c in commands:
    if not MUTATORS.search(c) and ">" not in c:
        continue
    try: toks = shlex.split(c, posix=True)
    except Exception: toks = c.split()
    for t in toks:
        t2 = t.replace("\\", "/")
        if re.search(IMG, t2, re.I) or any(d in t2 for d in PROTECTED_DIRS):
            print("BLOCK:" + c[:200]); sys.exit(0)
    # redirecciones sin espacios o comodines hacia carpetas protegidas
    if any(d in c for d in PROTECTED_DIRS) or re.search(r"\.(jpe?g|png|webp|gif|heic|avif)\b", c, re.I):
        print("BLOCK:" + c[:200]); sys.exit(0)

print("OK")
' 2>/dev/null)"
else
  # Sin python3: fallback conservador por patrón sobre las claves de ruta
  if printf '%s' "$INPUT" | grep -Eiq '"(path|file_path|targetFile)"[[:space:]]*:[[:space:]]*"[^"]*\.(jpe?g|png|webp|gif|heic|avif|bmp|ico|psd|fig)"'; then
    RESULT="BLOCK:(ruta de imagen)"
  else
    RESULT="OK"
  fi
fi

case "$RESULT" in
  BLOCK:*)
    echo "🛑 BLOQUEADO: las imágenes del diseñador son intocables (${RESULT#BLOCK:})." >&2
    echo "   Ajusta el código (botones/hotspots), nunca la imagen. Si crees que la imagen debe cambiar, avisa al usuario." >&2
    echo "   Regla: .kiro/steering/design-assets-immutable.md" >&2
    exit 2
    ;;
esac
exit 0
