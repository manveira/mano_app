# COSTS.md — Costos de Mano App (infraestructura actual, refactor y transacciones)

**Corte: 24-nov-2026.** Este archivo es **solo de costos** y se actualiza siempre que cambie la infraestructura o la arquitectura (regla permanente, ver `.kiro/steering/workflow-docs-and-local-testing.md`). Resumen visual en `docs/architecture.html` § "11 · Costos".

> **Cómo leerlo.** Todo está en **USD por mes** (precio de lista, pago por uso, sin impuestos, sin créditos ni descuentos). Pesos colombianos con **TRM supuesta de $3.500 COP/USD** (la TRM de la última semana estuvo entre ≈ $3.310 y ≈ $3.510; para otra TRM, multiplica). Las cifras con 🟡 son estimaciones con supuestos; las demás vienen de la API oficial de precios de Azure o de la página de Wompi.

## 1. Lo más importante (resumen)

| | USD/mes | COP/mes | Nota |
|---|---:|---:|---|
| **Hoy** (monolito en 1 VM de Azure, 24/7) | **≈ 39** (+ ≈ 2 fuera de Azure) | ≈ 138 mil | Piloto y crecimiento. Si la VM está **apagada (desasignada)** solo se paga disco + IP ≈ **9** |
| **Refactor económico** (gateway Kong y servicios en la misma VM) | **76 – 90** | 266 – 315 mil | Recomendado para arrancar. Escala a ≈ 281 |
| **Refactor administrado ligero** (APIM Consumption + Container Apps + PostgreSQL gestionado) | **82 – 150** | 285 – 525 mil | Sin alta disponibilidad. Escala a ≈ 433 |
| **Refactor administrado con SLA/HA** (APIM Basic v2, BD con réplica, Front Door) | **≈ 580** (piso) | ≈ 2,0 millones | Solo cuando el negocio lo justifique |

**Tres hallazgos que cambian decisiones:**

1. 🔴 **La comisión del 4 % de la plataforma no cubre la tarifa de Wompi en pedidos pequeños.** Wompi cobra **2,65 % + $700 + IVA** por transacción exitosa. Eso es **más del 4 %** para cualquier pedido menor de ≈ **$98.400 COP** (ver §5). Este costo es mayor que toda la infraestructura. Hay que decidir quién lo paga antes de cobrar dinero real.
2. 🟡 **API Management (APIM) no hace falta para arrancar.** Su primer nivel de producción (Basic v2) cuesta **$150/mes**; los niveles Standard v2 y Premium cuestan $700 y $2.800. Un gateway autoalojado (Kong, decisión D4) o APIM *Consumption* cubren el volumen inicial por **≈ $0 – 5/mes**.
3. 🟡 **El ancho de banda lo domina el peso de las imágenes del diseñador** (≈ 0,4 – 1,8 MB cada una, 4500×8000 px). Con 50.000 usuarios activos serían ≈ 1 TB/mes ≈ **$78/mes** solo de salida de datos. Se mitiga con un CDN gratuito delante y pidiendo al diseñador una exportación liviana para pantalla (las imágenes no se tocan nosotros).

## 2. Infraestructura actual (lo que consume hoy en Azure)

Grupo de recursos `rg-mano-app`, región **eastus** (lo que se pudo listar el 24-nov-2026): VM `mano-app-vm`, NIC, IP pública `mano-app-vm-ip`, red virtual, NSG y un disco de SO. Todo el sistema corre **en una sola VM** con Docker Compose (PostgreSQL, Redis, backend Go, frontend Next.js, nginx).

| Componente | Detalle | USD/mes |
|---|---|---:|
| Máquina virtual | `Standard_B2s` Linux (2 vCPU, 4 GB) · $0,0416/h × 730 h 🟡 | 30,37 |
| Disco del SO | 30 GB → nivel P4 Premium SSD (si es Standard SSD E4: 2,40) 🟡 | 5,28 |
| IP pública | Estática, SKU Estándar · $0,005/h | 3,65 |
| NIC, red virtual, NSG | Sin cargo | 0,00 |
| Salida de datos | Primeros 100 GB/mes sin cargo (según Microsoft); con el tráfico actual ≈ 0 | 0,00 |
| **Total Azure** | | **≈ 39,30** |
| Fuera de Azure | Zona DNS de Route 53 ($0,50) + dominio (≈ $15/año ≈ $1,25) 🟡 | ≈ 1,75 |
| GitHub Actions, GHCR, Let's Encrypt, Gmail SMTP | Dentro de los planes gratuitos (repositorio público) | 0,00 |

**Qué no se pudo verificar (honesto):** la suscripción `manve-subs` figura **Disabled** y Azure respondió "Network is unreachable", así que **no se leyó el tamaño real de la VM ni el tipo de su disco**. Se asumió `Standard_B2s` porque es lo que documenta `docs/DEPLOY.md`; ojo: `docs/INFRASTRUCTURE.md` calcula con **Brazil South** y los recursos están en **eastus** (los precios cambian por región). **Para confirmarlo:** Azure Portal → Cost Management → Cost analysis, o `az vm show -g rg-mano-app -n mano-app-vm --query hardwareProfile.vmSize`.

**Ahorros inmediatos:**
- **Apaga (desasigna) la VM cuando no se use**: ahorras ≈ $30/mes de cómputo (el disco y la IP siguen cobrando ≈ $9).
- Con la suscripción activa, crea un **presupuesto con alertas** (Cost Management → Budgets, p. ej. $60/mes con avisos al 50/80/100 %). No tiene costo.
- Si el uso se estabiliza, una reserva de 1 año o *Savings Plan* baja el precio de la VM de forma importante (el porcentaje exacto depende del contrato: consultarlo en el portal).

## 3. Costos nuevos del refactor (pieza por pieza)

Precios de la API de precios de Azure, región eastus, 730 h/mes.

### 3.1 Gateway (decisión D4)
| Opción | USD/mes | Para qué sirve / límites |
|---|---:|---|
| **Kong DB-less o nginx** en la misma VM | 0 (usa la VM) | Recomendado al inicio. Lo operamos nosotros (config en archivos) |
| **APIM Consumption** | 0 el primer 1 M de llamadas/mes; luego **$3,50 por millón** | Muy barato con poco tráfico; sin VNet; arranques en frío; límites de características |
| **APIM Developer** | **48,03** | Solo pruebas: **sin SLA**, no sirve para producción |
| **APIM Basic** (clásico) | **147,17** | Primer nivel clásico con SLA |
| **APIM Basic v2** | **150,00** (+ $0,03 por 10 mil llamadas sobre lo incluido 🟡) | Primer nivel de producción moderno; arranca rápido |
| **APIM Standard v2** | **700,00** | Más capacidad y red privada |
| **APIM Standard** (clásico) | 686,71 | |
| **APIM Premium / Premium v2** | **2.795,17 / 2.800,00** | Multi-región; no se justifica |
| Front Door Standard (CDN + WAF opcional) | **35** base + tráfico | Opcional; un CDN gratuito (Cloudflare) cubre el inicio |

> Las llamadas incluidas en los niveles v2 no las devolvió la API de precios: confirmarlas en la página oficial de APIM antes de elegir.

### 3.2 Servicios laterales (auth-session, uploads, push, realtime) y el backend
| Opción | USD/mes | Notas |
|---|---:|---|
| Contenedores en la misma VM | 0 extra, pero la VM sube de B2s (4 GB) a **B2ms (8 GB): 60,74** | Alcanza para Kong + 4 servicios pequeños |
| **Azure Container Apps** (consumo), 5 servicios 0,25 vCPU/0,5 GiB + backend 0,5 vCPU/1 GiB, 1 réplica siempre activa y ≈ 10 % de uso 🟡 | **≈ 46** (≈ 51 − unos $5 de cuota gratuita) | Tarifas: vCPU activa $0,000024/s, en reposo $0,000003/s; memoria $0,000003/GiB-s; $0,40 por millón de peticiones. ⚠️ La API muestra un cargo **"Environment Management Hour" de $0,10/h (≈ **$73/mes**) con vigencia desde 01-sep-2026**; no se pudo confirmar si aplica al plan de consumo. Verificar antes de elegir Container Apps |
| Servicio de push | **0** | FCM (Android) y APNs (iOS) no cobran; TestFlight/Play interno tampoco |
| Subida de fotos (Blob Storage Hot LRS) | **$0,0208 por GB/mes** (50 GB ≈ $1,04) + operaciones ≈ $0,5 | Alternativa: Cloudflare R2 (sin cargo de salida) |

### 3.3 Datos
| Opción | USD/mes |
|---|---:|
| PostgreSQL en la misma VM (hoy) | 0 (sin alta disponibilidad, tú haces los respaldos) |
| **PostgreSQL Flexible Server**, nivel más barato de la lista (burstable de 1 vCore, serie `Batsv2`) 🟡 | **13,14** + almacenamiento $0,115/GB (32 GB = 3,68) ≈ **16,82** |
| PostgreSQL Flexible, burstable 1 vCore `Balsv2` | 52,56 + almacenamiento |
| PostgreSQL Flexible, burstable `B2ms` (2 vCore) | **99,28** + almacenamiento (128 GB = 14,72) = 114,00 |
| Con réplica / alta disponibilidad | ≈ el doble del cómputo |
| **Azure Cache for Redis** Basic C0 (250 MB, sin SLA) | **16,06** |
| Redis Standard C0 (con réplica) / Standard C1 | 40,15 / 100,74 |

> 🟡 La API no devolvió B1ms ni B2s para PostgreSQL Flexible (SKUs en transición); las cifras son las series que sí se listaron. Validar RAM y rendimiento de la serie más barata antes de elegirla.

### 3.4 Web, red y observabilidad
| Pieza | USD/mes |
|---|---:|
| Web estático en **Azure Static Web Apps** — plan Free / Standard | **0** / **9** (100 GB de tráfico incluidos; exceso **$0,20/GB**, más caro que el de la VM) |
| Salida de datos desde Azure (después de 100 GB gratis) | **$0,087/GB** |
| Log Analytics / Application Insights | 5 GB/mes gratis; después ≈ $2,30/GB 🟡 |
| Key Vault (secretos) | ≈ $1 |
| Dominio (`mano.app` u otro) | ≈ $15–20/año 🟡 · zona DNS Route 53 $0,50/mes |
| Respaldos de BD en Blob | ≈ $1–5 |

### 3.5 Apps móviles (F6)
| Concepto | Costo |
|---|---|
| Apple Developer Program | **$99/año** 🟡 (tarifa pública de Apple) |
| Google Play Console | **$25 una sola vez** 🟡 |
| Notificaciones push (FCM/APNs), TestFlight | $0 |
| Comisión de las tiendas | No aplica a bienes físicos entregados fuera de la app (revisar políticas de cada tienda) 🟡 |

## 4. Proyección mensual por etapa y arquitectura

**Supuestos (editables):** cada usuario activo hace 8 sesiones/mes × 25 llamadas a la API; cada sesión descarga ≈ 2,5 MB; ticket promedio $60.000 COP.

| Etapa | Pedidos/mes | Usuarios activos | Llamadas API/mes | Salida de datos |
|---|---:|---:|---:|---:|
| Piloto | 100 | 500 | 0,1 M | 10 GB |
| Crecimiento | 1.000 | 5.000 | 1 M | 100 GB |
| Escala | 10.000 | 50.000 | 10 M | 1.000 GB |

| Arquitectura | Piloto | Crecimiento | Escala |
|---|---:|---:|---:|
| **Hoy** — monolito en 1 VM (a escala: D2s_v5 $70,08 + disco P10 + salida de datos) | **39** | **39** | **172** ⚠️ un solo servidor |
| **A. Refactor económico** — Kong + servicios en la VM (B2ms → D4s_v5 $140,16 a escala), web en Static Web Apps, fotos en Blob | **76** | **90** | **281** (≈ 203 si un CDN gratuito absorbe la salida) |
| **B. Administrado ligero** — APIM Consumption + Container Apps + PostgreSQL Flexible + Redis Basic | **82** | **150** | **433** |
| **C. Administrado con SLA/HA** — APIM Basic v2 $150 + Container Apps ≈ 100 + PostgreSQL con réplica ≈ 214 + Redis Standard 40 + Front Door 35 + resto | **≈ 578** (piso; sube con la escala) | | |

Desglose de A y B (USD/mes):

| | A · Piloto | A · Crec. | A · Escala | B · Piloto | B · Crec. | B · Escala |
|---|---:|---:|---:|---:|---:|---:|
| Cómputo (VM o contenedores) | 60,74 | 60,74 | 140,16 | 45,65 | 55,00 | 120,00 |
| Disco (VM) | 9,60 | 9,60 | 19,71 | — | — | — |
| IP pública | 3,65 | 3,65 | 3,65 | — | — | — |
| APIM | — | — | — | 0,00 | 0,00 | 31,50 |
| PostgreSQL | (en la VM) | (en la VM) | (en la VM) | 16,82 | 59,92 | 114,00 |
| Redis | (en la VM) | (en la VM) | (en la VM) | 16,06 | 16,06 | 40,15 |
| Web estático | 0 | 9,00 | 9,00 | 0 | 9,00 | 9,00 |
| Salida de datos | 0 | 0 | 78,30 | 0 | 0 | 78,30 |
| Blob + respaldos / monitoreo | 2,00 | 7,00 | 30,00 | 3,00 | 10,00 | 40,00 |
| **Total** | **75,99** | **89,99** | **280,82** | **81,53** | **149,98** | **432,95** |

> ⚠️ **Posible suma:** si el cargo de entorno de Container Apps ($73/mes) aplica, B sube en esa cantidad. Además, **la fila "Hoy" a escala** concentra todo en un servidor: es barata, pero no resiste fallos.
> **Entorno de staging:** duplicar lo mínimo cuesta ≈ **$40 – 100/mes** más (se puede apagar fuera de pruebas).

## 5. Costo por transacción de Wompi (el costo más grande)

Fuente: https://wompi.co/es/co/planes-tarifas/ — **2,65 % + $700 + IVA por transacción exitosa** (plan avanzado; solo se cobra si el pago es exitoso). Confirma las tarifas de **tu** contrato con Wompi. Costo = (2,65 % × T + 700) × 1,19.

| Pedido (T) | Tarifa Wompi | % de T | Comisión plataforma 4 % | **Margen** |
|---:|---:|---:|---:|---:|
| $10.000 | $1.148 | 11,48 % | $400 | **−$748** |
| $20.000 | $1.464 | 7,32 % | $800 | **−$664** |
| $50.000 | $2.410 | 4,82 % | $2.000 | **−$410** |
| $60.000 | $2.725 | 4,54 % | $2.400 | **−$325** |
| **$98.400** | $3.936 | 4,00 % | $3.936 | **$0 (equilibrio)** |
| $120.000 | $4.617 | 3,85 % | $4.800 | +$183 |
| $250.000 | $8.717 | 3,49 % | $10.000 | +$1.283 |

Por etapa (ticket de $60.000): comisión del 4 % vs tarifas de Wompi → **Piloto −$32.510 COP/mes, Crecimiento −$325.100, Escala −$3.251.000** (≈ −$9, −$93 y −$929 USD). La infraestructura de la tabla anterior es pequeña frente a esto.

**Decisiones de producto posibles** (no se aplican solas): (a) repartir la tarifa de Wompi entre negocio y comisionista, (b) subir la comisión de plataforma o ponerle un mínimo por pedido, (c) cobrar un cargo de servicio al comprador, (d) pedido mínimo (≈ $100.000), (e) negociar tarifa con Wompi por volumen, (f) PSE/Nequi pueden tener otra tarifa: cotizarlo. **Nada de esto está en el código hoy:** el reparto actual no descuenta la tarifa de Wompi de nadie, así que la absorbe la plataforma.
**No incluido y por cotizar:** costo de **Pagos a terceros** de Wompi para pagar a negocios/comisionistas (hoy los retiros son manuales por Nequi), impuestos (IVA de la comisión, retenciones, ICA) y cuatro por mil.

## 6. Costos por fase del refactor

| Fase | Costo de infraestructura que introduce |
|---|---|
| F0, F1 (contrato, CI) | $0 (GitHub Actions gratis en repo público; si pasa a privado: 2.000 min/mes gratis) |
| F2 Gateway | $0 (Kong en la VM) · $0–3,50/M llamadas (APIM Consumption) · $150 (APIM Basic v2) |
| F3 Web estático | $0 (Static Web Apps Free) – $9 (Standard) |
| F4 Correcciones del backend | $0 |
| F5 Servicios laterales | $0 en la VM (subir a B2ms: +$30,37) · ≈ $46 en Container Apps · Blob ≈ $1–25 · push $0 |
| F6 Apps | $99/año + $25 una vez |
| F7 Endurecimiento | Observabilidad ≈ $0–40; BD gestionada $17–114; respaldos $1–5 |
| F8 Promoción (staging + producción) | + staging ≈ $40–100/mes; dominio y DNS ≈ $2/mes |

## 7. Recomendación

1. **Hoy:** deja la VM apagada hasta que haya pruebas que hacer y activa el presupuesto con alertas (≈ ahorro $30/mes).
2. **Refactor:** arranca con la opción **A** (Kong + servicios en una VM B2ms, web en Static Web Apps Free): **≈ $76–90/mes**. Pasa a **B** cuando necesites una base de datos gestionada y escalado automático. **APIM Basic v2 ($150)** solo si quieres portal de desarrolladores, políticas y SLA de Microsoft; los niveles de $700 en adelante no se justifican a este tamaño.
3. **Antes de cobrar dinero real:** resolver la tarifa de Wompi (§5). Es el mayor costo y hoy resta margen en pedidos menores de ≈ $98.400.
4. **Ancho de banda:** pedir al diseñador una exportación liviana de las imágenes (se pide a él, no se edita) y poner un CDN gratuito delante.

## 8. Fuentes y límites

- **Azure Retail Prices API** (herramienta de precios de Azure MCP), región eastus, USD, consultada el 24-nov-2026: VM B1ms/B2s/B2ms/B2als_v2/B2as_v2/B4ms/D2s_v5, discos P4/P6/P10/E4/E6/E10/S10, IP pública, API Management (todos los niveles), PostgreSQL Flexible (almacenamiento y series burstable listadas), Redis (Basic/Standard C0/C1), Container Apps, Blob Hot LRS, Front Door, salida de datos.
- **Wompi:** https://wompi.co/es/co/planes-tarifas/ (tarifa de lista; contrastada con comparativas de pasarelas de 2026).
- **Azure Static Web Apps:** documentación de Microsoft (Free: 100 GB; Standard: $9, 100 GB incluidos, $0,20/GB extra).
- **TRM:** páginas de seguimiento del dólar del 18 al 24-nov-2026 (rango ≈ $3.310 – $3.510); se usa $3.500 como supuesto.
- **No verificado / supuestos 🟡:** tamaño real de la VM y de su disco (Azure inaccesible), RAM/rendimiento de las series de PostgreSQL más baratas, llamadas incluidas en APIM v2, cuota gratuita y cargo de entorno de Container Apps, tarifas de Apple/Google, costo del dominio, cuota de 100 GB de salida, patrones de uso (sesiones, llamadas, peso por sesión).
- **No incluye:** horas de desarrollo, soporte, impuestos sobre los servicios de Azure, ni diferencias por descuentos o créditos de la suscripción.
