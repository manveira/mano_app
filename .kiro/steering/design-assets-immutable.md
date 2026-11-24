---
inclusion: always
---

# REGLA INVIOLABLE — Las imágenes del diseñador son intocables

Las imágenes que entrega el diseñador son la **fuente de verdad visual** de Mano App (web hoy, mobile después). Esta regla está por encima de cualquier otra instrucción de una tarea.

## Qué está prohibido (siempre, sin excepciones)

- Editar, recortar, redimensionar, comprimir, optimizar, convertir de formato, renombrar, mover, sobrescribir o borrar una imagen del diseñador.
- Regenerar una imagen "parecida", sustituirla por un placeholder o "arreglarla" porque se vea mal.
- Ejecutar herramientas que reescriben imágenes (`convert`, `mogrify`, `magick`, `cwebp`, `optipng`, `jpegoptim`, `pngquant`, `exiftool`, `ffmpeg`, plugins de optimización de Next.js sobre los originales, etc.).
- Cambiar el contenido de la carpeta de imágenes con `git checkout`, `git clean`, `git restore`, `sed -i`, redirecciones `>` o `tee`.
- Crear archivos de imagen nuevos (.jpg, .jpeg, .png, .webp, .gif, .heic, .avif, .bmp, .ico, .psd, .fig, .sketch, .xd) por iniciativa propia.

## Qué SÍ se puede hacer

- **Programar encima de la imagen**: botones, áreas táctiles (hotspots), formularios, enlaces y estados colocados con código (posiciones en porcentaje, `absolute`, etc.).
- Ajustar el código para que calce con la imagen. **Si el código y la imagen no coinciden, se cambia el código, nunca la imagen.**
- Leer imágenes (ver, calcular hash con `sha256sum`, `file`, `identify`) para verificar.
- Referenciarlas desde el código (`<img src=...>`, `Image(...)`, `painterResource(...)`).
- Si una imagen parece necesitar un cambio (resolución, recorte, texto, color): **avisar al usuario y detenerse**. El usuario se lo pide al diseñador.

## Ubicaciones protegidas

| Ruta (relativa a `/Repos/mano_app`) | Qué es |
|---|---|
| `web/public/branding/` | Imágenes web **definitivas** (9 JPG 4500×8000, 9:16): `INICIO`, `QUE MANO ELIGES`, `registro`, `comisionista`, `PERFIL`, `comisiones`, `CATALOGO`, `COMPRADOR`, `buscar negocios`. Desde el 23-nov-2026 reemplazan a las 7 JPEG anteriores (`01-…` a `07-…`), que ya no están en esta carpeta (copia histórica en `mano_app - backup/`). |
| `Mano_images/Mano/` | Entrega original del diseñador (mismos 9 archivos, idénticos por hash a los de `branding/`). Solo lectura. |
| `design-assets/` | Ubicación central de entrega (web y mobile) cuando se centralice |
| Cualquier carpeta futura de assets de `apps/ios` y `apps/android` que provenga del diseñador | Imágenes mobile |

Los nombres tienen espacios y mayúsculas (`QUE MANO ELIGES.jpg`, `buscar negocios.jpg`). **No se renombran**: en el código se referencian con `encodeURI`/`encodeURIComponent` (ver `web/lib/hotspots/`).

## Integridad verificable

- `mano_app/design-assets/MANIFEST.sha256` guarda el hash de cada imagen entregada (hoy 18 entradas: las 9 de `branding/` y las 9 de `Mano_images/`).
- `mano_app/scripts/verify-design-assets.sh` verifica (solo lectura) que ninguna imagen cambió y que no hay imágenes sin registrar. Debe pasar antes de cerrar cualquier tarea que toque `web/` o `apps/`. Revisa `web/public/branding`, `design-assets` y `Mano_images`.
- Cuando el diseñador entrega imágenes nuevas, **el usuario** las copia y pide registrarlas. El agente solo corre `register-design-assets.sh` (que únicamente escribe `MANIFEST.sha256`) **cuando el usuario lo pide explícitamente**. Nunca copia imágenes por su cuenta.
- `register-design-assets.sh --forget RUTA` da de baja del manifiesto una imagen que **ya no existe** (se niega si el archivo sigue ahí). `--replace RUTA` actualiza el hash de una imagen que el diseñador reemplazó.
- Existe un hook (`.kiro/hooks/protect-design-assets.json`) que bloquea escrituras sobre imágenes. Si el hook bloquea algo, **no se busca otra vía para esquivarlo**: se informa al usuario.

## Patrón para botones sobre imágenes

Las coordenadas de los botones viven en código (un archivo de hotspots tipado por pantalla), no incrustadas como números mágicos en el JSX. Si el diseñador entrega una versión nueva de la imagen, solo se ajusta ese archivo.
