# ARCHITECTURE.md — Mano App

Documento de decisiones técnicas, modelo de negocio y roadmap de construcción.
Última actualización: Mayo 2026.

---

## Qué es Mano

Mano es un marketplace local que conecta tres actores:

- **Negocios**: suben sus productos y definen cuánto le pagan a quien los venda.
- **Comisionistas (freelancers)**: se afilian a productos, generan links únicos y ganan por cada venta que traigan.
- **Compradores**: compran a través de links o del catálogo público sin necesidad de descargar nada (PWA).

Mano actúa como intermediario de confianza: retiene el dinero hasta que el comprador confirma que recibió el producto, luego distribuye automáticamente.

---

## Modelo de dinero

### Distribución por venta

Ejemplo: hamaca a $120.000, comisión del negocio al comisionista: 20%.

| Quién | Cuánto | Cómo se calcula |
|-------|--------|-----------------|
| Negocio | $91.200 | 100% - comisión_comisionista - comisión_plataforma |
| Comisionista | $24.000 | % definido por el negocio (mínimo 10%) |
| Mano (plataforma) | $4.800 | **4% fijo sobre el total de la venta** |

### Reglas fijas

- La plataforma siempre cobra **4% fijo**. No es negociable ni variable.
- El negocio define el % del comisionista al crear el producto. Rango: 10%–40%.
- Si no hay comisionista en la venta (compra directa), el 4% va a Mano y el 96% al negocio.
- El dinero **nunca toca al comisionista ni al negocio** hasta que el comprador confirma recepción.
- Si el comprador no confirma en **24 horas**, el sistema confirma automáticamente.

### Fuentes de ingreso de Mano

1. **Comisión de ventas**: 4% de cada transacción.
2. **Publicidad**: paquetes básico ($29.990/7d), premium ($69.990/14d), destacado ($129.990/30d).
3. **Plan Pro comisionista**: $15.000/mes — acceso a productos exclusivos y estadísticas avanzadas de links.
4. **Tarifa de domicilio** (fase 2): cuando Mano asigna un repartidor propio.

---

## Stack tecnológico

| Capa | Tecnología | Decisión |
|------|-----------|----------|
| Backend | Go 1.21 + Gin + GORM | Ya construido, correcto para escala |
| Base de datos | PostgreSQL 15 | Relacional, confiable, PostGIS para geo |
| Frontend / PWA | Next.js 14 | Ya construido. PWA = sin Play Store |
| App móvil (fase 3) | React Native + Expo | Comparte lógica con Next.js |
| Pagos Colombia | **Wompi** | Nequi, PSE, tarjetas. API REST simple |
| Pagos internacional | Stripe | Turistas, tarjetas internacionales |
| Tiempo real | WebSockets (Go nativo) | Tracking de domicilios |
| Mapas | Mapbox GL | Más barato que Google, mejor API custom |
| Storage imágenes | Cloudflare R2 | S3-compatible, CDN global, barato |
| Push notifications | Firebase Cloud Messaging | Fase 2 |
| Verificación KYC | Manual (fase 1) → Truora (fase 2) | Gratis para arrancar |

---

## Decisiones de diseño

### ¿Por qué Wompi y no ePayco?
Wompi tiene API REST moderna, documentación clara, soporte nativo para Nequi y PSE, y es el procesador de Bancolombia. ePayco tiene más historia pero la integración es más compleja. Para un MVP en Colombia, Wompi es la elección correcta.

### ¿Por qué 4% fijo y no variable?
Simple de comunicar a los negocios. "Mano cobra 4% de cada venta" es una frase que cualquiera entiende. Los porcentajes variables generan desconfianza y confusión en el arranque.

### ¿Comisionista y repartidor son roles separados?
Sí. Son dos roles distintos con motivaciones distintas:
- El comisionista vende desde su celular, sin moverse.
- El repartidor entrega físicamente, necesita moto y disponibilidad.
Una persona puede tener ambos roles, pero son perfiles separados en la app.

### ¿Verificación de cédula manual o automática?
Manual en fase 1. El equipo de Mano revisa el documento subido. Cuando el volumen lo justifique, se integra Truora (~$0.50/verificación) para automatizar.

### ¿Escrow propio o de Wompi?
Escrow propio en la base de datos de Mano. Wompi recibe el pago completo, lo transfiere a la cuenta de Mano, y Mano distribuye cuando se confirma la entrega. Esto da control total sobre las disputas.

---

## Modelos de base de datos

### Nuevos modelos (Sprint 1)

```
BusinessApplication   — Solicitud de registro de negocio (KYC)
ReferralLink          — Link único por comisionista × producto
ReferralClick         — Registro de cada click en un link
CommissionSplit       — Distribución de dinero por orden
WompiTransaction      — Registro de transacciones Wompi
WithdrawalRequest     — Solicitud de retiro de ganancias
```

### Cambios a modelos existentes

```
User     + document_id, phone, nequi_number, is_verified, plan (free/pro)
Product  + commission_rate (% que el negocio ofrece al comisionista)
Order    + referral_link_id, buyer_document_id, escrow_status, 
           confirmed_at, auto_confirm_at, wompi_transaction_id
Business + commission_rate_default, is_approved, application_id
```

---

## Anti-fraude

### Regla 1: comisionista no puede comprarse a sí mismo
```
Si order.buyer_document_id == referral_link.freelancer.document_id:
    → Venta válida, comisión = $0
    → Se registra el intento en fraud_flags
```

### Regla 2: un celular = una cuenta
```
En signup: validar que phone no esté registrado en otra cuenta activa
```

### Regla 3: escrow hasta confirmación
```
Dinero retenido en cuenta Mano hasta:
  - buyer_confirmed = true  (comprador confirma en app)
  - O auto_confirm_at < now (24h sin acción)
```

### Regla 4: negocio no puede reportar "no llegó" sin disputa formal
```
Si negocio reporta problema → orden entra en estado "disputed"
→ Mano retiene dinero y revisa manualmente
→ Resolución en 48h
```

---

## Flujo completo de una venta

```
1. Comisionista se afilia a producto → se genera ReferralLink
2. Comisionista comparte link
3. Comprador abre link → se registra ReferralClick
4. Comprador paga → Wompi procesa → webhook llega a Mano
5. Mano crea WompiTransaction + CommissionSplits (status: pending)
6. Orden entra en escrow_status: "held"
7. Negocio despacha → marca "en camino"
8. Comprador confirma recepción (o 24h auto-confirm)
9. Mano ejecuta distribución:
   - Transfiere al negocio vía Wompi
   - Acredita saldo al comisionista (retira cuando quiera)
   - Registra ingreso de plataforma
10. CommissionSplits → status: "released"
```

---

## Roles en la app

| Rol | Qué puede hacer |
|-----|----------------|
| `customer` | Comprar, ver sus órdenes, confirmar recepción |
| `business_owner` | Crear negocio (previa aprobación), subir productos, ver dashboard, definir % comisión |
| `freelancer` | Afiliarse a productos, generar links, ver stats, retirar ganancias |
| `courier` | Ver pedidos disponibles, aceptar, marcar estados de entrega (fase 2) |
| `admin` | Aprobar negocios, resolver disputas, ver métricas globales |

---

## Roadmap de sprints

### Sprint 1 — Base del modelo de negocio (actual)
- [ ] Wompi: initiate payment, webhook, escrow
- [ ] Distribución automática (CommissionSplits)
- [ ] Links de referido: generar, click tracking, afiliación
- [ ] Anti-fraude base (cédula, auto-confirm 24h)
- [ ] Retiro de ganancias del comisionista
- [ ] Modelos BD actualizados

### Sprint 2 — Verificación y control
- [ ] Formulario de aplicación de negocio (KYC manual)
- [ ] Panel de admin: aprobar negocios, ver disputas
- [ ] Dashboard comisionista: stats de links, ganancias
- [ ] Dashboard negocio: gráficas de ventas, ranking de comisionistas
- [ ] Plan Pro comisionista ($15.000/mes)

### Sprint 3 — Domicilios
- [ ] Flujo de estados: pending → dispatched → in_transit → delivered
- [ ] Rol courier con vista de pedidos disponibles
- [ ] Tracking en tiempo real (WebSocket)
- [ ] Confirmación del comprador + auto-confirm 24h

### Sprint 4 — Feed y mapa
- [ ] Algoritmo de ranking (recencia + boost publicidad + distancia)
- [ ] Stories con expiración 24h
- [ ] Mapa con Mapbox: negocios aliados, filtros por categoría
- [ ] Boost visual para negocios con publicidad pagada

### Sprint 5 — App móvil
- [ ] React Native + Expo
- [ ] Push notifications (FCM)
- [ ] Cámara para subir fotos de productos
- [ ] Compartir links nativamente (WhatsApp, Instagram)

### Sprint 6 — Escala
- [ ] KYC automático con Truora
- [ ] PostGIS para geolocalización real
- [ ] Stripe para turistas / tarjetas internacionales
- [ ] Analytics avanzados

---

## Variables de entorno nuevas

```bash
# Wompi
WOMPI_PUBLIC_KEY=pub_...
WOMPI_PRIVATE_KEY=prv_...
WOMPI_EVENTS_SECRET=...    # para verificar webhooks
WOMPI_INTEGRITY_SECRET=... # para firmar transacciones

# App
APP_BASE_URL=https://mano.app
PLATFORM_COMMISSION_RATE=0.04   # 4% fijo
AUTO_CONFIRM_HOURS=24
```

---

## Estructura de URLs públicas

```
mano.app/                          → Catálogo público
mano.app/r/{slug}                  → Link de referido (ej: hamaca-casa-nariño-x7k2)
mano.app/vendedor/{username}       → Vitrina pública del comisionista
mano.app/negocio/{slug}            → Perfil público del negocio
mano.app/sell                      → Panel del comisionista (auth)
mano.app/dashboard                 → Panel del negocio (auth)
mano.app/admin                     → Panel de administración (auth + role:admin)
```
