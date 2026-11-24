---
inclusion: always
---

# Flujo de trabajo de Mano App: documentar siempre y probar en local siempre

Decisión del usuario (23-nov-2026). Aplica a **toda** tarea, sin excepción.

## 1. Documentar y sincronizar (siempre, en la misma tarea)
Cada vez que se cambie algo, antes de dar la tarea por cerrada se actualiza lo que corresponda **en el mismo turno**:
- `.kiro/skills/mano-app/SKILL.md` (mapa del repo, decisiones, hallazgos, pantallas y hotspots, estado del entorno).
- `.kiro/steering/*.md` y `.kiro/hooks/*` si cambió una regla o un guardarraíl.
- `mano_app/docs/` (`MIGRATION_PLAN.md` para el estado de tareas, `ARCHITECTURE_CURRENT_STATE.md` si cambió la arquitectura o la lista de hallazgos, `docs/SCREENS.md` para las pantallas y sus botones).
- `mano_app/docs/COSTS.md` y `docs/architecture.html` § 11 (costos), ver la regla de costos más abajo.
- `mano_app/contract/` si se añadió un campo o ruta (solo aditivo) y se regenera `openapi.yaml` con `contract/build.py`.
- **Costos (decisión del usuario, 24-nov-2026: "costos siempre").** Si el cambio crea, quita o redimensiona infraestructura o un servicio de pago (VM, base de datos, APIM/gateway, Container Apps, Redis, almacenamiento, CDN, DNS, tiendas de apps, pasarela de pagos), se actualizan `mano_app/docs/COSTS.md` y la sección "11 · Costos" de `mano_app/docs/architecture.html` **en el mismo turno**: precio por mes (USD y COP), supuestos y fuente. Los precios se consultan con la herramienta de precios de Azure o la página oficial del proveedor; no se inventan, y lo no verificado se marca 🟡. También se avisa si un cambio altera el margen por pedido (tarifa de Wompi vs comisión del 4 %).
- Si hay una contradicción entre la skill y el código, se avisa y se corrige la skill tras confirmar cuál es lo correcto.
Al final de cada respuesta se lista qué documentos se actualizaron.

## 2. Probar en local siempre
- Después de cada cambio de código se **levanta la app en local** (`bash scripts/local-up.sh`, reconstruyendo lo que cambió) y se verifica de verdad: `bash scripts/smoke.sh` y `bash tests/api/run-all.sh` si se tocó el backend; `npx tsc --noEmit` y `npm run build` si se tocó el web; `bash scripts/verify-design-assets.sh` si se tocó `web/`.
- Se entrega al usuario la URL para que pruebe (`http://localhost:3000`), con los pasos concretos a probar y las cuentas de prueba. El usuario prueba, dice si es lo que quiere y pide más.
- Si algo no se pudo ejecutar, se dice explícitamente. Nunca se afirma que algo funciona sin evidencia.

## 3. Cómo se construyen las pantallas basadas en imagen
- La imagen del diseñador se muestra **tal cual** (con sus datos de ejemplo "quemados": nombres, montos, productos). No se edita ni se tapa para mostrar datos reales hasta que el diseñador entregue la versión dinámica.
- Se programa la **lógica debajo de cada botón** (navegación, llamadas al backend, compartir, cerrar sesión, etc.) con hotspots tipados en `web/lib/hotspots/*.ts` y `aria-label`.
- Los campos de texto (correo, contraseña, búsqueda) son `<input>` reales colocados sobre el recuadro de la imagen.
- Todo botón de la imagen debe hacer algo real. Si el backend aún no tiene lo necesario, **se programa el backend** (siempre con cambios aditivos al contrato o correcciones internas que no lo alteran; el usuario aprobó D1 = contrato congelado, código corregible). No se dejan botones muertos ni se posponen "por ahora".
- Toda pantalla nueva o botón nuevo se registra en `docs/SCREENS.md`.

## 4. Calidad
Es una app profesional: validación en el servidor, mensajes de error claros en español, estados de carga, accesibilidad (`aria-label`), sin secretos en el cliente.
