# SCREENS.md — Pantallas del diseñador y la lógica de cada botón

Estado al 24-nov-2026. Las 9 imágenes definitivas están en `web/public/branding/` (copia idéntica por hash de `Mano_images/Mano/`, ambas protegidas en `design-assets/MANIFEST.sha256`). **Las imágenes no se tocan.** Los datos que traen dentro (nombres, montos, productos) son de ejemplo y se quedan así hasta que el diseñador entregue la versión dinámica.

Las coordenadas de cada botón viven en `web/lib/hotspots/<pantalla>.ts`. Añade `?debugHotspots=1` a la URL para ver los rectángulos.

Leyenda: ✅ lógica real implementada y probada · 🟡 responde con un aviso, falta backend o diseño · ⬜ sin hacer

## Flujo de entrada

| Pantalla (imagen) | Ruta | Botones y lógica |
|---|---|---|
| `INICIO.jpg` | `/` | ✅ Splash de 2 s. Con sesión válida entra al inicio de su rol; sin sesión va a "¿Qué mano eliges?". |
| `QUE MANO ELIGES.jpg` | `/elegir-rol` | ✅ 4 tarjetas: Negocio (`business_owner`), Prestación de servicios (`service_provider`), Comisionista (`freelancer`), Domiciliario (`courier`). Guarda el rol y sigue a `/registro`. Acepta `?ref=CODIGO` (invitación). Pie fuera de la imagen: "Inicia sesión" → `/signin`. |
| `registro.jpg` | `/registro` | ✅ Campos reales sobre la imagen: correo, username, contraseña, confirmar. Valida en el cliente y en el servidor, crea la cuenta (`POST /auth/signup`), inicia sesión (`POST /auth/signin`) y entra al inicio del rol. Usa el `referral_code` si vino de una invitación. ✅ "Inicia sesión" → `/signin`. 🟡 Facebook / Apple / Google: muestran un aviso; necesitan credenciales de cada proveedor (ver "Pendientes"). |
| (sin imagen) | `/signin` | ✅ Correo + contraseña; redirige según el rol. |
| (ruta histórica) | `/signup` | ✅ Redirige a `/elegir-rol` conservando `?ref=`. |

Inicio por rol (`homeForRole` en `web/lib/session.ts`): `freelancer → /comisionista`, `business_owner → /dashboard` (legacy), `courier → /courier` (legacy), `service_provider → /profile`, `customer → /businesses` (legacy), `admin → /admin` (legacy).

## Comisionista

| Pantalla (imagen) | Ruta | Botones y lógica |
|---|---|---|
| `comisionista.jpg` | `/comisionista` | ✅ Buscar negocios → `/buscar-negocios`. ✅ Mis productos → `/catalogo`. ✅ Mi perfil → `/profile`. ✅ Comisiones (tarjeta) → `/comisiones`. ✅ Comparte tu enlace → `GET /sell/referral-code` y comparte/copia `…/signup?ref=CODIGO`. ✅ Cerrar sesión. ✅ Ventas y Mis ventas → `/sell` (panel legacy con gráfica y links; pendiente de diseño). 🟡 Campana → aviso "sin notificaciones" (falta el sistema de notificaciones). |
| `buscar negocios.jpg` | `/buscar-negocios` | ✅ Volver. ✅ Búsqueda real sobre `GET /businesses` (nombre, categoría, ubicación). ✅ Chips Todos/Moda/Alimentos/Hogar (agrupan categorías, ver `CHIP_GROUPS`). ✅ Cada una de las 6 filas abre el negocio que ocupa esa posición del resultado → `/negocio/[slug]`. En esa página el comisionista ve **Vender y ganar $X** (`POST /sell/affiliate`). |
| `CATALOGO.jpg` | `/catalogo` | ✅ Volver. ✅ Búsqueda y chips sobre los links reales (`GET /sell/links`). ✅ Compartir mi catálogo → copia/comparte `/vendedor/<username>`. ✅ Compartir de cada tarjeta → link `/r/<slug>` del producto que ocupa esa posición. |
| `comisiones.jpg` | `/comisiones` | ✅ Volver. ✅ Retirar dinero → hoja con saldo real y formulario (`POST /sell/withdraw`, mínimo $5.000, Nequi de 10 dígitos). ✅ Ver todos → `/movimientos` (`GET /sell/movements`). ✅ Ver guía → hoja con la explicación. |
| (sin imagen) | `/movimientos` | ✅ Lista comisiones liberadas (+) y retiros (−). |
| `PERFIL.jpg` | `/profile` | ✅ Volver (al inicio de su rol). ✅ Ajustes → `/ajustes`. ✅ Ayuda → `/ayuda`. 🟡 Avatar → aviso (falta el servicio de subida de imágenes, F5.2). Sirve a todos los roles. |
| (sin imagen) | `/ajustes` | ✅ Edita nombre, celular, Nequi y cédula (`PATCH /me`). |
| (sin imagen) | `/ayuda` | ✅ Preguntas frecuentes. Contacto por WhatsApp/correo si se definen `NEXT_PUBLIC_SUPPORT_WHATSAPP` / `NEXT_PUBLIC_SUPPORT_EMAIL` (variables de build). |
| (sin imagen) | `/pagos` | ✅ **Mis pagos** (24-nov-2026). Lista los pagos con Wompi mapeados a tus pedidos (`GET /payments`): monto, estado (Aprobado / Pendiente / Rechazado / Con error / Anulado), método y fecha. ✅ Tocar un pago muestra referencia, id de Wompi, motivo, si el dinero está retenido (escrow) y la línea de tiempo (`GET /payments/{ref}`). ✅ **Verificar pagos pendientes**: pregunta a Wompi, vía el servidor, por los pagos pendientes (`POST /payments/wompi/sync`; máx. 1 consulta por orden cada 5 s). ✅ **Reintentar pago** (si fue rechazado/error y el pedido no está pagado) → `/checkout?order_id=N`. ✅ **Ver pedido** → `/orders`. ✅ Dueños de negocio: pestaña "Recibidos en mis negocios" (`?scope=received`, sin datos del pagador). Accesible desde el enlace "Pagos" del menú superior y desde `/orders`. |

## Comprador (público)

| Pantalla (imagen) | Ruta | Botones y lógica |
|---|---|---|
| `COMPRADOR.jpg` | `/vendedor/[username]` | ✅ Pública (sin sesión). Búsqueda y chips sobre los productos reales (`GET /vendedor/:username`). ✅ Agregar al carrito de cada tarjeta guarda el producto real en `mano_cart` (avisa si mezcla negocios). ✅ Carrito → `/cart`. ✅ Compartir la vitrina. ✅ Logo → `/`. ⬜ La atribución de la comisión al comprar desde la vitrina depende de F4.5 (el backend ignora `referral_link_id`). |

## Pantallas de compra (interfaz propia, sin imagen del diseñador)
| Ruta | Cambios del 24-nov-2026 |
|---|---|
| `/checkout` | ✅ Tras pulsar **Pagar**, el navegador va **directo al checkout de Wompi** (antes había que pulsar un segundo botón). El enlace "Ir a pagar en Wompi →" queda como respaldo. Solo acepta redirigir a `https://checkout.wompi.co/`. |
| `/orders` | ✅ Al volver de Wompi (la URL trae `?id=`), confirma los pagos pendientes con el servidor (`POST /payments/wompi/sync`) y muestra "Estamos confirmando tu pago…". ✅ Enlace "Ver mis pagos →". |
| Menú superior | ✅ Enlace **Pagos** (con sesión) → `/pagos`. No aparece en las pantallas con imagen del diseñador (no llevan menú). |

## Convenciones técnicas de las pantallas
- Los `<input>` reales (correo, búsqueda…) van sobre el recuadro de la imagen: transparentes mientras están vacíos (se ve el texto de ejemplo de la imagen) y con fondo blanco al escribir.
- La imagen se sirve con `<img>` plano (sin `next/image`) para no optimizarla.
- Aviso breve (`useToast`) para confirmar acciones; mensajes de error en español (`friendlyError`).
- Sesión: `web/lib/session.ts` (token en `localStorage`, `homeForRole`), guardia `web/lib/useAuthGuard.ts`, cliente `web/lib/api.ts` (headers `X-Mano-Client`, `X-Mano-Client-Version`, `X-Mano-Device-Id`).

## Pendientes (con su causa)
1. **Login con Facebook / Apple / Google.** Necesita crear las apps en Meta, Apple Developer y Google Cloud y entregar los IDs. Backend previsto: `POST /auth/social` (verifica el token del proveedor). Pendiente de credenciales.
2. **Notificaciones (campana).** Requiere modelo `Notification`, generarlas al crearse una orden / liberarse una comisión y un endpoint de lectura. (Push real: F5.3.)
3. **Foto de perfil y fotos de producto.** Servicio de subida (F5.2).
4. **Pantallas sin imagen** (Ajustes, Ayuda, Movimientos, Mis ventas, inicios de Negocio / Domiciliario / Prestación de servicios): funcionan con la interfaz legacy o una interfaz simple hasta que el diseñador las entregue.
5. **Datos dinámicos dentro de las imágenes** (nombre, ventas, saldo, productos, reseñas, distancias, nivel): el diseñador debe separar esos textos de la imagen.
6. **Rendimiento de las imágenes.** Miden 4500×8000 px (36 Mpx, 0,4–1,8 MB) y se muestran a ~390 px: el navegador tarda unos 4 s en decodificar cada una antes de que los botones respondan. Pedir al diseñador una exportación para pantalla (p. ej. 1125×2000 o 1350×2400, `@3x` máximo) como nuevas entregas; **no se optimizan las originales**.
7. **Chips y estados visuales** (chip seleccionado, contador del carrito, badge): no pueden cambiar porque van dentro de la imagen.
