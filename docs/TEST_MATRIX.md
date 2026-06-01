# TEST_MATRIX — Mano App

Matriz completa de casos de prueba para validar la lógica de negocio del backend y el comportamiento del frontend.

---

## Datos de prueba disponibles (seed)

| Entidad | Dato |
|---------|------|
| **Usuario owner** | `juan@example.com` / `password123` / rol: `business_owner` |
| **Usuario customer** | `carlos@example.com` / `password123` / rol: `customer` |
| **Usuario freelancer** | `maria@example.com` / `password123` / rol: `freelancer` |
| **Negocio 1** | Café La Esquina — Categoría: Café — Ubicación: Centro Histórico — Destacado: sí |
| **Negocio 2** | Pizzería Napoli — Categoría: Restaurante — Ubicación: Zona Comercial — Destacado: no |
| **Producto 1** | Espresso Doble — $4.50 — Stock: 100 — Negocio: Café La Esquina |
| **Producto 2** | Cappuccino Clásico — $5.50 — Stock: 100 — Negocio: Café La Esquina |
| **Producto 3** | Latte Macchiato — $6.00 — Stock: 80 — Negocio: Café La Esquina |
| **Producto 4** | Pizza Margarita — $12.00 — Stock: 50 — Negocio: Pizzería Napoli |
| **Producto 5** | Pizza Pepperoni — $14.00 — Stock: 50 — Negocio: Pizzería Napoli |
| **Producto 6** | Pizza Vegetariana — $13.00 — Stock: 40 — Negocio: Pizzería Napoli |
| **Orden 1** | carlos → Café La Esquina — $15.00 — status: completed / paid |
| **Paquete 1** | Paquete básico — $29.99 — 7 días |
| **Paquete 2** | Paquete premium — $69.99 — 14 días |
| **Paquete 3** | Paquete destacado — $129.99 — 30 días |
| **Story 1** | "Nuevo lote de granos seleccionados" — autor: juan |

---

## 1. Autenticación

| # | Caso | Método | Endpoint | Body / Params | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| A-01 | Registro exitoso como customer | POST | `/api/auth/signup` | `{name, email, password, role: "customer"}` | 201 `{id, email, role}` | ✅ |
| A-02 | Registro exitoso como business_owner | POST | `/api/auth/signup` | `{name, email, password, role: "business_owner"}` | 201 `{id, email, role}` | ✅ |
| A-03 | Registro exitoso como freelancer | POST | `/api/auth/signup` | `{name, email, password, role: "freelancer"}` | 201 `{id, email, role}` | ✅ |
| A-04 | Registro con email duplicado | POST | `/api/auth/signup` | email ya registrado | 400 error | ✅ |
| A-05 | Registro con rol inválido | POST | `/api/auth/signup` | `role: "admin"` | 400 error | ✅ |
| A-06 | Registro con password < 8 chars | POST | `/api/auth/signup` | `password: "abc"` | 400 error | ✅ |
| A-07 | Registro con email inválido | POST | `/api/auth/signup` | `email: "notanemail"` | 400 error | ✅ |
| A-08 | Login exitoso | POST | `/api/auth/signin` | `{email: "carlos@example.com", password: "password123"}` | 200 `{token, user}` | ✅ |
| A-09 | Login con password incorrecto | POST | `/api/auth/signin` | password errado | 401 error | ✅ |
| A-10 | Login con email inexistente | POST | `/api/auth/signin` | email no registrado | 401 error | ✅ |
| A-11 | Acceso a endpoint protegido sin token | GET | `/api/me` | sin header | 401 error | ✅ |
| A-12 | Acceso con token expirado/inválido | GET | `/api/me` | `Authorization: Bearer invalid` | 401 error | ✅ |
| A-13 | Token válido devuelve datos correctos | GET | `/api/me` | token de carlos | 200 `{user: {id, email, role: "customer"}}` | ✅ |

---

## 2. Negocios

| # | Caso | Método | Endpoint | Params / Body | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| B-01 | Listar todos los negocios | GET | `/api/businesses` | — | 200 `{businesses: [...]}` con 2 negocios | ✅ |
| B-02 | Filtrar por categoría existente | GET | `/api/businesses?category=Café` | — | 200 solo Café La Esquina | ✅ |
| B-03 | Filtrar por categoría inexistente | GET | `/api/businesses?category=Farmacia` | — | 200 `{businesses: []}` | ✅ |
| B-04 | Filtrar por ubicación | GET | `/api/businesses?location=Centro` | — | 200 solo Café La Esquina | ✅ |
| B-05 | Filtrar por categoría + ubicación | GET | `/api/businesses?category=Restaurante&location=Comercial` | — | 200 solo Pizzería Napoli | ✅ |
| B-06 | Ver detalle de negocio existente | GET | `/api/businesses/1` | — | 200 `{business, products}` | ✅ |
| B-07 | Ver detalle de negocio inexistente | GET | `/api/businesses/9999` | — | 404 error | ✅ |
| B-08 | Crear negocio como business_owner | POST | `/api/businesses` | token juan + body completo | 201 negocio creado | ✅ |
| B-09 | Crear negocio como customer | POST | `/api/businesses` | token carlos + body | 403 error | ✅ |
| B-10 | Crear negocio sin token | POST | `/api/businesses` | sin auth | 401 error | ✅ |
| B-11 | Crear negocio con campos faltantes | POST | `/api/businesses` | token juan + body incompleto | 400 error | ✅ |

---

## 3. Productos

| # | Caso | Método | Endpoint | Params / Body | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| P-01 | Listar todos los productos | GET | `/api/products` | — | 200 `{products: [...]}` con 6 productos | ✅ |
| P-02 | Listar productos de un negocio | GET | `/api/products?business_id=1` | — | 200 solo productos de Café La Esquina | ✅ |
| P-03 | Listar productos vía ruta de negocio | GET | `/api/businesses/1/products` | — | 200 mismos productos | ✅ |
| P-04 | Crear producto en negocio propio | POST | `/api/products` | token juan + `{business_id: 1, ...}` | 201 producto creado | ✅ |
| P-05 | Crear producto en negocio ajeno | POST | `/api/products` | token carlos + `{business_id: 1, ...}` | 403 error | ✅ |
| P-06 | Crear producto sin token | POST | `/api/products` | sin auth | 401 error | ✅ |
| P-07 | Crear producto con precio negativo | POST | `/api/products` | token juan + `{price: -5}` | 400 error | ✅ |
| P-08 | Crear producto con stock negativo | POST | `/api/products` | token juan + `{stock: -1}` | 400 error | ✅ |
| P-09 | Crear producto en negocio inexistente | POST | `/api/products` | token juan + `{business_id: 9999}` | 404 error | ✅ |

---

## 4. Órdenes

| # | Caso | Método | Endpoint | Params / Body | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| O-01 | Crear orden válida (1 item) | POST | `/api/orders` | token carlos + `{business_id:1, items:[{product_id:1, quantity:1}]}` | 201 orden con total=$4.50, commission=$0.225 | ✅ |
| O-02 | Crear orden válida (múltiples items) | POST | `/api/orders` | token carlos + 2 items del mismo negocio | 201 orden con total correcto | ✅ |
| O-03 | Crear orden con producto de otro negocio | POST | `/api/orders` | `{business_id:1, items:[{product_id:4}]}` | 400 "product does not belong to selected business" | ✅ |
| O-04 | Crear orden con stock insuficiente | POST | `/api/orders` | `{quantity: 999}` para producto con stock 100 | 400 "insufficient stock" | ✅ |
| O-05 | Crear orden con quantity=0 | POST | `/api/orders` | `{quantity: 0}` | 400 error | ✅ |
| O-06 | Crear orden con negocio inexistente | POST | `/api/orders` | `{business_id: 9999}` | 404 error | ✅ |
| O-07 | Crear orden sin token | POST | `/api/orders` | sin auth | 401 error | ✅ |
| O-08 | Stock se descuenta al crear orden | POST | `/api/orders` | crear orden de 5 Espresso Doble | stock de producto 1 pasa de 100 a 95 | ✅ |
| O-09 | Listar órdenes como customer | GET | `/api/orders` | token carlos | 200 solo órdenes de carlos | ✅ |
| O-10 | Listar órdenes como business_owner | GET | `/api/orders` | token juan | 200 órdenes de sus negocios | ✅ |
| O-11 | Listar órdenes sin token | GET | `/api/orders` | sin auth | 401 error | ✅ |
| O-12 | Ver detalle de orden propia | GET | `/api/orders/1` | token carlos | 200 orden con items y nombre de producto | ✅ |
| O-13 | Ver detalle de orden ajena | GET | `/api/orders/1` | token maria | 403 error | ✅ |
| O-14 | Ver orden inexistente | GET | `/api/orders/9999` | token carlos | 404 error | ✅ |
| O-15 | Comisión calculada correctamente (5%) | POST | `/api/orders` | orden de $14.00 | commission = $0.70 | ✅ |

---

## 5. Pagos (Stripe)

> Requiere Stripe configurado. Usar tarjeta de prueba `4242 4242 4242 4242`.

| # | Caso | Método | Endpoint | Params / Body | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| S-01 | Crear PaymentIntent para orden pendiente | POST | `/api/orders/:id/pay` | token carlos + orden pending | 200 `{client_secret, payment_intent_id}` | ✅ |
| S-02 | Crear PaymentIntent para orden ya pagada | POST | `/api/orders/:id/pay` | token carlos + orden paid | 400 "order is already paid" | ✅ |
| S-03 | Pagar orden de otro usuario | POST | `/api/orders/:id/pay` | token maria + orden de carlos | 403 error | ✅ |
| S-04 | Pago exitoso actualiza orden | Webhook | `/api/webhooks/stripe` | evento `payment_intent.succeeded` | orden → status: completed, payment_status: paid | ✅ |
| S-05 | Pago fallido actualiza orden | Webhook | `/api/webhooks/stripe` | evento `payment_intent.payment_failed` | orden → status: payment_failed, payment_status: failed | ✅ |
| S-06 | Webhook con firma inválida | POST | `/api/webhooks/stripe` | sin header Stripe-Signature | 400 error | ✅ |
| S-07 | Monto del PaymentIntent = total de la orden | POST | `/api/orders/:id/pay` | orden de $14.00 | PaymentIntent amount = 1400 (centavos) | ✅ |

---

## 6. Dashboard

| # | Caso | Método | Endpoint | Params | Resultado esperado | Estado |
|---|------|--------|----------|--------|--------------------|--------|
| D-01 | Dashboard como business_owner | GET | `/api/dashboard` | token juan | 200 stats de sus negocios | ✅ |
| D-02 | Dashboard como customer | GET | `/api/dashboard` | token carlos | 403 error | ✅ |
| D-03 | Dashboard sin token | GET | `/api/dashboard` | sin auth | 401 error | ✅ |
| D-04 | Stats incluyen órdenes completadas | GET | `/api/dashboard` | token juan | orders > 0, revenue > 0 para Café La Esquina | ✅ |
| D-05 | Negocio sin órdenes muestra 0 | GET | `/api/dashboard` | token juan | Pizzería Napoli: orders=0, revenue=0 | ✅ |

---

## 7. Feed, Stories y Anuncios

| # | Caso | Método | Endpoint | Params / Body | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| F-01 | Obtener feed público | GET | `/api/feed` | — | 200 `{stories: [...], advertisements: [...]}` | ✅ |
| F-02 | Listar solo stories | GET | `/api/stories` | — | 200 `{stories: [...]}` con 1 story del seed | ✅ |
| F-03 | Listar solo anuncios activos | GET | `/api/ads` | — | 200 `{advertisements: [...]}` | ✅ |
| F-04 | Crear story autenticado | POST | `/api/stories` | token carlos + `{title, content}` | 201 story creada | ✅ |
| F-05 | Crear story sin token | POST | `/api/stories` | sin auth | 401 error | ✅ |
| F-06 | Crear anuncio como business_owner | POST | `/api/ads` | token juan + `{business_id:1, title, package_type}` | 201 anuncio creado | ✅ |
| F-07 | Crear anuncio como customer | POST | `/api/ads` | token carlos | 403 error | ✅ |
| F-08 | Crear anuncio en negocio ajeno | POST | `/api/ads` | token juan + `{business_id: 999}` | 404 error | ✅ |

---

## 8. Paquetes publicitarios

| # | Caso | Método | Endpoint | Params / Body | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| K-01 | Listar paquetes disponibles | GET | `/api/packages` | — | 200 3 paquetes activos | ✅ |
| K-02 | Comprar paquete como business_owner | POST | `/api/packages/purchase` | token juan + `{business_id:1, package_id:1}` | 201 `{transaction, advertisement}` | ✅ |
| K-03 | Comprar paquete como customer | POST | `/api/packages/purchase` | token carlos | 403 error | ✅ |
| K-04 | Comprar paquete para negocio ajeno | POST | `/api/packages/purchase` | token juan + negocio de otro owner | 403 error | ✅ |
| K-05 | Comprar paquete inexistente | POST | `/api/packages/purchase` | `{package_id: 9999}` | 404 error | ✅ |

---

## 9. Geolocalización

| # | Caso | Método | Endpoint | Params | Resultado esperado | Estado |
|---|------|--------|----------|--------|--------------------|--------|
| G-01 | Negocios cercanos con coordenadas válidas | GET | `/api/map/nearby` | `?latitude=40.7128&longitude=-74.0060&radius_km=1` | 200 negocios dentro del radio | ✅ |
| G-02 | Negocios cercanos sin coordenadas | GET | `/api/map/nearby` | sin params | 200 todos los negocios | ✅ |
| G-03 | Radio muy pequeño sin resultados | GET | `/api/map/nearby` | `?latitude=0&longitude=0&radius_km=0.1` | 200 `{businesses: []}` | ✅ |
| G-04 | Recomendaciones con ubicación | GET | `/api/recommendations` | `?latitude=40.7128&longitude=-74.0060` | 200 ads + negocios cercanos | ✅ |
| G-05 | Recomendaciones sin ubicación | GET | `/api/recommendations` | — | 200 ads + hasta 20 negocios | ✅ |

---

## 10. Métodos de pago y Delivery

| # | Caso | Método | Endpoint | Params / Body | Resultado esperado | Estado |
|---|------|--------|----------|---------------|--------------------|--------|
| M-01 | Agregar método de pago | POST | `/api/payment-methods` | token carlos + `{provider, account_id, display_name, type}` | 201 método creado | ✅ |
| M-02 | Listar métodos de pago propios | GET | `/api/payment-methods` | token carlos | 200 solo métodos de carlos | ✅ |
| M-03 | Agregar método sin token | POST | `/api/payment-methods` | sin auth | 401 error | ✅ |
| V-01 | Crear delivery para orden propia | POST | `/api/deliveries` | token carlos + `{order_id:1, eta:"2026-06-01"}` | 201 delivery creado | ✅ |
| V-02 | Crear delivery sin token | POST | `/api/deliveries` | sin auth | 401 error | ✅ |
| V-03 | Crear delivery para orden ajena | POST | `/api/deliveries` | token maria + order de carlos | 403 error | ✅ |

---

## 11. Flujo completo end-to-end

| # | Escenario | Pasos | Resultado esperado |
|---|-----------|-------|--------------------|
| E-01 | Compra completa con pago exitoso | 1. Login como carlos → 2. Ver Café La Esquina → 3. Añadir Espresso Doble al carrito → 4. Crear orden → 5. Pagar con tarjeta `4242...` → 6. Webhook confirma pago | Orden en estado `completed/paid`, stock decrementado |
| E-02 | Intento de compra sin stock | 1. Login como carlos → 2. Intentar crear orden con quantity > stock disponible | Error 400 "insufficient stock" |
| E-03 | Carrito con productos de 2 negocios | 1. Añadir producto de Café La Esquina → 2. Añadir producto de Pizzería Napoli → 3. Ir al carrito | Frontend muestra advertencia y bloquea el botón de pagar |
| E-04 | Business owner crea negocio y producto | 1. Login como juan → 2. POST /businesses → 3. POST /products con business_id del nuevo negocio → 4. Verificar en /businesses | Negocio y producto visibles públicamente |
| E-05 | Business owner ve sus órdenes en dashboard | 1. Login como juan → 2. GET /dashboard → 3. GET /orders | Dashboard muestra stats, órdenes filtradas por sus negocios |
| E-06 | Registro → Login → Compra | 1. POST /auth/signup (nuevo customer) → 2. POST /auth/signin → 3. Crear orden → 4. Pagar | Flujo completo sin errores |
| E-07 | Freelancer asignado a orden | 1. Login como carlos → 2. Crear orden con `freelancer_id` de maria → 3. Login como juan (owner) → 4. GET /orders | Orden visible para el owner, freelancer_id registrado |
| E-08 | Paquete publicitario activa anuncio | 1. Login como juan → 2. POST /packages/purchase → 3. GET /api/ads | Nuevo anuncio activo aparece en el feed |

---

## 12. Validaciones de frontend

| # | Caso | Pantalla | Acción | Resultado esperado |
|---|------|----------|--------|--------------------|
| UI-01 | Signup con email inválido | `/signup` | Submit con `notanemail` | Error "Email inválido" antes de llamar al API |
| UI-02 | Signup con password < 8 chars | `/signup` | Submit con `abc` | Error "mínimo 8 caracteres" |
| UI-03 | Signup exitoso redirige a login | `/signup` | Registro correcto | Redirige a `/signin` con banner de éxito |
| UI-04 | Login exitoso redirige a home | `/signin` | Credenciales correctas | Redirige a `/` |
| UI-05 | Header muestra Dashboard solo para owner | Header | Login como juan | Link "Dashboard" visible; no visible para carlos |
| UI-06 | Header muestra Perfil cuando autenticado | Header | Login como cualquier usuario | Link "Perfil" visible |
| UI-07 | Botón "Añadir" deshabilitado sin stock | `/businesses/[id]` | Producto con stock=0 | Botón gris, no clickeable |
| UI-08 | Carrito incrementa qty si producto ya existe | `/businesses/[id]` | Añadir mismo producto 2 veces | qty=2 en carrito, no 2 entradas |
| UI-09 | Carrito bloquea pedido con 2 negocios | `/cart` | Items de 2 negocios | Advertencia visible, botón deshabilitado |
| UI-10 | Checkout muestra resumen antes de pagar | `/checkout` | Llegar con order_id válido | Muestra items, total y comisión |
| UI-11 | Checkout detecta orden ya pagada | `/checkout` | order_id de orden paid | Muestra mensaje "ya fue pagada" |
| UI-12 | Orders muestra nombre del producto | `/orders` | Login como carlos | Items muestran "Espresso Doble × 2" |
| UI-13 | Create-product carga negocios del owner | `/create-product` | Login como juan | Select con "Café La Esquina" y "Pizzería Napoli" |
| UI-14 | Create-product pre-selecciona negocio | `/create-product?business_id=1` | Llegar desde dashboard | Select pre-seleccionado en Café La Esquina |
| UI-15 | Businesses filtra por categoría | `/businesses` | Escribir "Café" y filtrar | Solo muestra Café La Esquina |
| UI-16 | Feed muestra stories y anuncios | `/feed` | Visitar sin auth | Stories y anuncios del seed visibles |
| UI-17 | Home muestra negocios destacados | `/` | Visitar sin auth | Café La Esquina aparece en "Destacados" |
| UI-18 | Perfil muestra rol con badge | `/profile` | Login como juan | Badge "Dueño de negocio" visible |
| UI-19 | Logout limpia token y redirige | Header | Click en "Salir" | Token eliminado, redirige a `/` |
