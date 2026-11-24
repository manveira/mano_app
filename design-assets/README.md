# design-assets — Imágenes del diseñador (fuente de verdad visual)

> **Regla inviolable:** las imágenes de esta carpeta (y de `web/public/branding/`) **no se editan, no se optimizan, no se renombran, no se mueven y no se sobrescriben**. El código se ajusta a la imagen, nunca al revés.

## Qué hay aquí

- `MANIFEST.sha256` — hash SHA-256 de cada imagen entregada por el diseñador. Es la prueba de que nadie las alteró.
- Esta carpeta es la **ubicación central** destino para las entregas del diseñador (web ahora, mobile después). Hoy las imágenes web están en `web/public/branding/` (9 JPG definitivos, 23-nov-2026) y la entrega original en `Mano_images/Mano/` (mismos hashes); ambas están en el manifiesto. Las 7 JPEG anteriores se dieron de baja con `register-design-assets.sh --forget`; migrarlas aquí es la tarea F3.2 del plan (por **copia verificada por hash**, no por edición).

## Estructura prevista

```
design-assets/
  README.md
  MANIFEST.sha256
  web/       ← entregas para web (pantallas completas con botones superpuestos)
  ios/       ← entregas para iOS (@1x/@2x/@3x o PDF/SVG según indique el diseñador)
  android/   ← entregas para Android (mdpi…xxxhdpi o vector, según indique el diseñador)
```

## Flujo cuando el diseñador entrega algo nuevo

1. **Tú** (no el agente) copias los archivos tal cual los entregó el diseñador a la carpeta correspondiente.
2. Corres `scripts/register-design-assets.sh` → agrega los hashes nuevos a `MANIFEST.sha256`. No modifica imágenes.
3. Corres `scripts/verify-design-assets.sh` → debe terminar en `OK`.
4. Pides al agente que programe los botones/hotspots sobre la nueva imagen.

Si el diseñador **reemplaza** una imagen existente (misma ruta, contenido distinto), `verify` fallará a propósito: es la señal para revisar a mano y volver a registrar con `register-design-assets.sh --replace <archivo>`.

## Cómo se programan los botones sobre una imagen

- Las coordenadas viven en un archivo de hotspots tipado (por ejemplo `web/lib/hotspots/signup.ts`), en porcentajes relativos a la imagen. No se incrustan números mágicos en el JSX.
- Si la imagen cambia de proporciones, se ajusta el archivo de hotspots. La imagen no se toca.
- Las áreas táctiles deben tener `aria-label` (las imágenes por sí solas no son accesibles para lectores de pantalla).

## Protección automática

- Hook de Kiro: `.kiro/hooks/protect-design-assets.json` (bloquea escrituras sobre imágenes).
- Regla siempre activa: `.kiro/steering/design-assets-immutable.md`.
- Verificación en CI (tarea F0.5): `scripts/verify-design-assets.sh`.
