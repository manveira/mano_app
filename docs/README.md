# Mano App

Plataforma híbrida que conecta dueños de negocio, freelancers y clientes/turistas en un marketplace local.

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- (Opcional para desarrollo local sin Docker): Go 1.21+, Node.js 18+, PostgreSQL 15

---

## 🚀 Correr todo con Docker (recomendado)

```bash
# 1. Ir al directorio del proyecto
cd /Users/manve/Documents/Repos/Mano_App

# 2. Levantar todos los servicios
docker compose up --build

# 3. Listo! Abrir en el navegador:
#    http://localhost          → Frontend (Next.js)
#    http://localhost/api/     → Backend API (Go)
```

Para detener:
```bash
docker compose down
```

Para detener y borrar la base de datos:
```bash
docker compose down -v
```

---

## 🛠 Desarrollo local (sin Docker)

### Backend (Go)

```bash
docker compose up postgres -d   # solo la DB

cd backend

export DATABASE_DSN="postgres://user:pass@localhost:5433/mano?sslmode=disable"
export JWT_SECRET="dev-secret"
export SERVER_PORT=":8080"

go run main.go
```

Backend disponible en `http://localhost:8080/api/`

### Frontend (Next.js)

```bash
cd web
npm install

export NEXT_PUBLIC_API_URL="http://localhost:8080"

npm run dev
```

Frontend disponible en `http://localhost:3000`

---

## 📁 Estructura del proyecto

```
Mano_App/
├── backend/
│   ├── main.go
│   ├── internal/
│   │   ├── app/router.go        # Rutas del API
│   │   ├── handlers/handlers.go # Lógica de todos los endpoints
│   │   ├── models/models.go     # Modelos GORM
│   │   └── database/database.go # Conexión, migraciones y seed
│   └── pkg/config/config.go     # Variables de entorno
├── web/
│   ├── pages/                   # Páginas Next.js
│   │   ├── index.tsx            # Home con feed y negocios destacados
│   │   ├── signin.tsx           # Login
│   │   ├── signup.tsx           # Registro (3 roles)
│   │   ├── profile.tsx          # Perfil del usuario autenticado
│   │   ├── feed.tsx             # Stories y anuncios
│   │   ├── businesses/
│   │   │   ├── index.tsx        # Lista de negocios con filtros
│   │   │   └── [id].tsx         # Detalle de negocio + productos
│   │   ├── create-business.tsx  # Crear negocio (business_owner)
│   │   ├── create-product.tsx   # Crear producto (business_owner)
│   │   ├── cart.tsx             # Carrito de compras
│   │   ├── checkout.tsx         # Pago con Stripe
│   │   ├── orders.tsx           # Mis órdenes
│   │   └── dashboard.tsx        # Dashboard de negocio (business_owner)
│   ├── components/Header.tsx    # Navegación global
│   ├── lib/api.ts               # Helper fetch con auth
│   └── styles/globals.css       # Tailwind CSS
├── docker-compose.yml
└── nginx.conf                   # Proxy reverso
```

---

## 🔑 Páginas disponibles

| Ruta | Descripción | Auth requerida |
|------|-------------|----------------|
| `/` | Home con negocios destacados y stories | No |
| `/feed` | Stories y anuncios activos | No |
| `/signin` | Iniciar sesión | No |
| `/signup` | Crear cuenta (cliente, dueño o freelancer) | No |
| `/profile` | Perfil del usuario, rol y acciones | Sí |
| `/businesses` | Lista de negocios con filtros de categoría/ubicación | No |
| `/businesses/[id]` | Detalle de negocio con productos, imágenes y stock | No |
| `/create-business` | Crear negocio | Sí (business_owner) |
| `/create-product` | Crear producto (select de tus negocios) | Sí (business_owner) |
| `/cart` | Carrito con controles de cantidad y validación de negocio único | No |
| `/checkout` | Resumen de orden + pago con Stripe | Sí |
| `/orders` | Mis órdenes con estado, items y nombre de producto | Sí |
| `/dashboard` | Stats de órdenes e ingresos por negocio | Sí (business_owner) |

---

## 🔌 Endpoints del API

Base: `/api`

### Públicos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/signup` | Registro — devuelve `{id, email, role}` |
| POST | `/api/auth/signin` | Login — devuelve `{token, user}` |
| GET | `/api/businesses` | Listar negocios (`?category=` `?location=`) |
| GET | `/api/businesses/:id` | Detalle de negocio con productos |
| GET | `/api/businesses/:id/products` | Productos de un negocio |
| GET | `/api/products` | Todos los productos (`?business_id=`) |
| GET | `/api/feed` | Stories + anuncios activos |
| GET | `/api/stories` | Solo stories |
| GET | `/api/ads` | Solo anuncios activos |
| GET | `/api/packages` | Paquetes publicitarios disponibles |
| GET | `/api/recommendations` | Anuncios + negocios cercanos (`?latitude=&longitude=`) |
| GET | `/api/map/nearby` | Negocios en radio (`?latitude=&longitude=&radius_km=`) |
| POST | `/api/webhooks/stripe` | Webhook de Stripe (pago confirmado/fallido) |

### Autenticados (requieren `Authorization: Bearer <token>`)

| Método | Ruta | Descripción | Rol |
|--------|------|-------------|-----|
| GET | `/api/me` | Datos del usuario autenticado | Todos |
| GET | `/api/me/businesses` | Negocios del usuario autenticado | business_owner |
| POST | `/api/businesses` | Crear negocio | business_owner |
| POST | `/api/products` | Crear producto (valida ownership) | business_owner |
| POST | `/api/orders` | Crear orden (valida stock, descuenta stock) | Todos |
| GET | `/api/orders` | Listar órdenes (filtradas por rol) | Todos |
| GET | `/api/orders/:id` | Detalle de orden | Todos |
| POST | `/api/orders/:id/pay` | Crear PaymentIntent de Stripe | Todos |
| GET | `/api/dashboard` | Stats de órdenes e ingresos | business_owner |
| POST | `/api/stories` | Crear story | Todos |
| POST | `/api/ads` | Crear anuncio | business_owner |
| POST | `/api/packages/purchase` | Comprar paquete publicitario | business_owner |
| GET | `/api/payment-methods` | Listar métodos de pago | Todos |
| POST | `/api/payment-methods` | Agregar método de pago | Todos |
| POST | `/api/deliveries` | Crear registro de entrega | Todos |

---

## 🗄 Modelos de base de datos

| Modelo | Descripción |
|--------|-------------|
| `User` | Usuarios con roles: `customer`, `business_owner`, `freelancer` |
| `Business` | Negocio con owner, categoría, ubicación, coordenadas e imagen |
| `Product` | Producto con precio, stock e imagen, asociado a un negocio |
| `Order` | Orden con estado, estado de pago, comisión (5%) y PaymentIntent |
| `OrderItem` | Ítem de orden con producto, cantidad y precio unitario |
| `Story` | Publicación de usuario con título, contenido y media |
| `Advertisement` | Anuncio de negocio con tipo de paquete |
| `AdvertisingPackage` | Paquetes: básico ($29.99/7d), premium ($69.99/14d), destacado ($129.99/30d) |
| `PaymentMethod` | Método de pago del usuario (provider, account, tipo) |
| `PaymentTransaction` | Registro de transacciones Stripe |
| `Delivery` | Entrega asociada a una orden con ETA y tracking |

---

## 🧪 Datos de prueba (seed automático)

Al iniciar por primera vez, la base de datos se puebla automáticamente con:

### Usuarios

| Email | Password | Rol |
|-------|----------|-----|
| `juan@example.com` | `password123` | business_owner |
| `carlos@example.com` | `password123` | customer |
| `maria@example.com` | `password123` | freelancer |

### Negocios

| Nombre | Categoría | Ubicación | Destacado |
|--------|-----------|-----------|-----------|
| Café La Esquina | Café | Centro Histórico | ✅ |
| Pizzería Napoli | Restaurante | Zona Comercial | ❌ |

### Productos

| Negocio | Producto | Precio | Stock |
|---------|----------|--------|-------|
| Café La Esquina | Espresso Doble | $4.50 | 100 |
| Café La Esquina | Cappuccino Clásico | $5.50 | 100 |
| Café La Esquina | Latte Macchiato | $6.00 | 80 |
| Pizzería Napoli | Pizza Margarita | $12.00 | 50 |
| Pizzería Napoli | Pizza Pepperoni | $14.00 | 50 |
| Pizzería Napoli | Pizza Vegetariana | $13.00 | 40 |

### Órdenes

| ID | Cliente | Negocio | Total | Estado |
|----|---------|---------|-------|--------|
| 1 | carlos@example.com | Café La Esquina | $15.00 | completed / paid |

### Paquetes publicitarios

| Nombre | Precio | Duración |
|--------|--------|----------|
| Paquete básico | $29.99 | 7 días |
| Paquete premium | $69.99 | 14 días |
| Paquete destacado | $129.99 | 30 días |

> Ver la matriz completa de casos de prueba en [`TEST_MATRIX.md`](./TEST_MATRIX.md)

---

## 💳 Configurar Stripe (pagos)

1. Crear cuenta en [stripe.com](https://stripe.com)
2. Obtener las claves en Dashboard → Developers → API Keys
3. Configurar las variables de entorno:

```bash
# Backend
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Frontend
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Para pruebas locales del webhook:
```bash
stripe listen --forward-to localhost/api/webhooks/stripe
```

Tarjeta de prueba Stripe: `4242 4242 4242 4242` — cualquier fecha futura — cualquier CVC.

---

## ⚙️ Variables de entorno

### Backend

| Variable | Descripción | Default |
|----------|-------------|---------|
| `SERVER_PORT` | Puerto del servidor | `:8080` |
| `DATABASE_DSN` | Connection string de PostgreSQL | — |
| `JWT_SECRET` | Secreto para firmar tokens JWT (72h) | — |
| `STRIPE_SECRET_KEY` | Stripe secret key | (vacío) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | (vacío) |

### Frontend

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | URL base del backend | (vacío = mismo host vía nginx) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | (vacío) |

---

## 🔐 Lógica de autorización

- **JWT** firmado con HS256, expira en 72 horas. El token incluye `user_id`, `role` y `email`.
- **business_owner**: puede crear negocios, productos (solo de sus negocios), anuncios y ver su dashboard.
- **customer**: puede crear órdenes, pagar y ver sus propias órdenes.
- **freelancer**: puede ser asignado a órdenes (`freelancer_id`). Mismo acceso que customer en órdenes.
- Los endpoints de listado de órdenes filtran automáticamente por rol: business_owner ve las órdenes de sus negocios, customer ve solo las suyas.

---

## 🛒 Flujo de compra

```
/businesses → /businesses/[id] → Añadir al carrito
→ /cart (validar negocio único, ajustar cantidades)
→ POST /api/orders (valida stock, descuenta stock, calcula comisión 5%)
→ /checkout (muestra resumen de orden)
→ POST /api/orders/:id/pay (crea PaymentIntent en Stripe)
→ Stripe confirmCardPayment (frontend)
→ Webhook /api/webhooks/stripe → actualiza orden a paid/completed
→ /orders (ver historial)
```

---

## 🐛 Troubleshooting

### Backend en "Restarting" o 502 Bad Gateway

El backend tiene retry automático (10 intentos, 3s entre cada uno). Si persiste:
```bash
docker compose down -v
docker compose up --build -d
```
Espera ~15 segundos y verifica:
```bash
docker compose logs backend --tail 10
# Deberías ver: database migrated successfully
```

### "insufficient arguments" en logs del backend

La base de datos tiene un esquema viejo. Solución:
```bash
docker compose down -v && docker compose up --build -d
```
> ⚠️ `-v` borra todos los datos.

### Frontend no refleja cambios

Los contenedores usan la imagen buildeada. Reconstruir:
```bash
docker compose up --build -d
```

### signup/signin devuelve 502

```bash
docker compose ps
docker compose logs backend --tail 20
curl http://localhost/api/health
```

### Puertos en uso

```bash
lsof -i :80
# O cambiar en docker-compose.yml: ports: - '8081:80'
```
