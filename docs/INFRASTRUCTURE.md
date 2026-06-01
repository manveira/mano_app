# INFRASTRUCTURE.md — Opciones de Deploy y Análisis de Costos

Comparativa honesta de opciones para desplegar Mano App en producción.
Precios en USD/mes aproximados a junio 2026. Verificar siempre en el sitio oficial.

---

## Resumen ejecutivo

| Opción | Costo/mes | Dificultad | Recomendado para |
|--------|-----------|------------|-----------------|
| Railway (PaaS) | $5–20 | ⭐ Muy fácil | MVP, primeros 3 meses |
| Render (PaaS) | $7–25 | ⭐ Muy fácil | MVP, alternativa a Railway |
| EC2 t3.small (AWS) | $15–25 | ⭐⭐ Media | Producción estable |
| EC2 t3.medium (AWS) | $30–45 | ⭐⭐ Media | Producción con crecimiento |
| Azure B2s (VM) | $30–50 | ⭐⭐ Media | Si ya usas Azure |
| VPS Hetzner | $5–15 | ⭐⭐ Media | Mejor precio/rendimiento |
| DigitalOcean Droplet | $12–24 | ⭐⭐ Media | Buena documentación |

**Recomendación:** Empieza en Railway o Hetzner. Migra a EC2 cuando tengas 500+ usuarios activos.

---

## Opción 1 — Railway (PaaS) ⭐ Recomendado para arrancar

Railway despliega directamente desde GitHub. Sin configurar servidores.

### Costo
| Servicio | Costo |
|---------|-------|
| Backend (Go) | ~$5/mes (512MB RAM, 0.5 vCPU) |
| Frontend (Next.js) | ~$5/mes |
| PostgreSQL | $5/mes (1GB storage) |
| Redis | $3/mes |
| **Total** | **~$18/mes** |

### Pros
- Deploy automático en cada push a main — sin configurar CI/CD
- SSL automático incluido
- Logs y métricas en el dashboard
- Sin gestionar servidores

### Contras
- Más caro por recurso que una VM
- Menos control sobre la infraestructura
- Si la app crece mucho, los costos escalan rápido

### Cómo deployar
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login y deploy
railway login
railway init
railway up
```

---

## Opción 2 — Render (PaaS)

Similar a Railway, buena alternativa.

### Costo
| Servicio | Costo |
|---------|-------|
| Backend (Go) — Starter | $7/mes |
| Frontend (Next.js) — Starter | $7/mes |
| PostgreSQL — Starter | $7/mes (1GB) |
| Redis — Starter | $10/mes |
| **Total** | **~$31/mes** |

### Pros
- Free tier disponible (con sleep después de 15min inactivo)
- SSL automático
- Deploy desde GitHub

### Contras
- Más caro que Railway para el mismo stack
- Free tier no sirve para producción (sleep)

---

## Opción 3 — Hetzner VPS ⭐ Mejor precio/rendimiento

Proveedor europeo con los mejores precios del mercado. Datacenter en Alemania/Finlandia (latencia ~150ms desde Colombia, aceptable).

### Costo
| Servidor | RAM | CPU | Storage | Precio/mes |
|---------|-----|-----|---------|-----------|
| CX22 | 4GB | 2 vCPU | 40GB SSD | **€3.79 (~$4)** |
| CX32 | 8GB | 4 vCPU | 80GB SSD | **€5.99 (~$6.50)** |
| CX42 | 16GB | 8 vCPU | 160GB SSD | **€13.99 (~$15)** |

**Stack completo en CX32 (~$6.50/mes):**
- Backend Go + Frontend Next.js + PostgreSQL + Redis + nginx
- Todo en un solo servidor con Docker Compose
- Suficiente para los primeros 5.000 usuarios

### Pros
- Precio imbatible
- Buen rendimiento
- Snapshots automáticos disponibles

### Contras
- Datacenter en Europa (latencia desde Colombia ~150ms)
- Menos servicios managed que AWS

---

## Opción 4 — AWS EC2 ⭐ Recomendado para producción estable

### Instancias recomendadas (región sa-east-1, São Paulo)

| Instancia | RAM | vCPU | Precio On-Demand | Precio Reserved 1yr |
|-----------|-----|------|-----------------|---------------------|
| t3.micro | 1GB | 2 | $0.0116/hr (~$8.5/mes) | ~$5/mes |
| t3.small | 2GB | 2 | $0.023/hr (~$17/mes) | ~$11/mes |
| t3.medium | 4GB | 2 | $0.046/hr (~$34/mes) | ~$22/mes |
| t3.large | 8GB | 2 | $0.092/hr (~$67/mes) | ~$44/mes |

### Costo total estimado (t3.small, sa-east-1)

| Componente | Costo/mes |
|-----------|-----------|
| EC2 t3.small (On-Demand) | $17 |
| EBS 30GB gp3 (disco) | $2.40 |
| Elastic IP | $0 (gratis si está asociada) |
| Transferencia de datos (10GB) | ~$1 |
| **Total** | **~$20/mes** |

### Con Reserved Instance (compromiso 1 año)
| Componente | Costo/mes |
|-----------|-----------|
| EC2 t3.small Reserved | $11 |
| EBS 30GB | $2.40 |
| **Total** | **~$13/mes** |

### Free Tier (primeros 12 meses)
- t2.micro (1GB RAM, 1 vCPU) — **gratis** 750 horas/mes
- 30GB EBS — gratis
- 15GB transferencia — gratis

⚠️ t2.micro es muy justo para el stack completo. Funciona para pruebas, no para producción real.

### Pros
- Infraestructura más robusta del mercado
- Región São Paulo (latencia ~80ms desde Colombia)
- Snapshots, backups automáticos, CloudWatch
- Escala fácil (cambiar tipo de instancia en minutos)

### Contras
- Más caro que Hetzner
- Configuración más compleja
- Costos pueden sorprender si no se monitorean

---

## Opción 5 — Azure VM

### Instancias recomendadas (región Brazil South)

| Instancia | RAM | vCPU | Precio/mes |
|-----------|-----|------|-----------|
| B1s | 1GB | 1 | ~$7.59 |
| B2s | 4GB | 2 | ~$30.37 |
| B2ms | 8GB | 2 | ~$60.74 |

### Costo total (B2s, Brazil South)
| Componente | Costo/mes |
|-----------|-----------|
| VM B2s | $30.37 |
| Disco OS 30GB | $2.40 |
| IP pública estática | $3.65 |
| **Total** | **~$36/mes** |

### Pros
- Buena integración si ya usas servicios Microsoft
- Región Brazil South (latencia similar a AWS São Paulo)

### Contras
- Más caro que EC2 para el mismo rendimiento
- Interfaz más compleja

---

## Opción 6 — DigitalOcean Droplets

### Droplets recomendados

| Droplet | RAM | vCPU | Storage | Precio/mes |
|---------|-----|------|---------|-----------|
| Basic 1GB | 1GB | 1 | 25GB SSD | $6 |
| Basic 2GB | 2GB | 1 | 50GB SSD | $12 |
| Basic 4GB | 4GB | 2 | 80GB SSD | $24 |

### Costo total (Basic 2GB)
| Componente | Costo/mes |
|-----------|-----------|
| Droplet 2GB | $12 |
| Backups automáticos (+20%) | $2.40 |
| **Total** | **~$14/mes** |

### Pros
- Excelente documentación
- Interfaz muy amigable
- Managed PostgreSQL disponible ($15/mes adicional)
- Datacenter en NYC/Amsterdam (latencia ~120ms desde Colombia)

### Contras
- Sin región en Latinoamérica (el más cercano es NYC)

---

## Comparativa final

### Por etapa de crecimiento

**Etapa 1: MVP (0–500 usuarios) — Presupuesto mínimo**
```
Recomendación: Hetzner CX22 o Railway
Costo: $4–18/mes
Por qué: Cero usuarios reales todavía, no vale la pena pagar más
```

**Etapa 2: Tracción (500–5.000 usuarios)**
```
Recomendación: EC2 t3.small (sa-east-1) o Hetzner CX32
Costo: $13–20/mes
Por qué: Latencia desde Colombia importa, AWS São Paulo es la mejor opción
```

**Etapa 3: Crecimiento (5.000–50.000 usuarios)**
```
Recomendación: EC2 t3.medium + RDS PostgreSQL separado
Costo: $60–100/mes
Por qué: Separar la BD del servidor de app da más estabilidad y backups automáticos
```

**Etapa 4: Escala (50.000+ usuarios)**
```
Ver docs/SCALING.md — en este punto se evalúan microservicios y auto-scaling
```

---

## Costos adicionales (todos los proveedores)

| Servicio | Costo/mes | Notas |
|---------|-----------|-------|
| Dominio (.app o .co) | $1–2 | Namecheap, Google Domains |
| SSL/TLS | $0 | Let's Encrypt (gratis) |
| Email transaccional | $0–15 | SendGrid free: 100 emails/día |
| Monitoreo | $0 | Sentry free tier: 5.000 errores/mes |
| CDN imágenes | $0–5 | Cloudflare free tier |
| Backups BD | $0–5 | Incluido en managed DBs |

**Costo mínimo real para lanzar:** ~$20/mes (servidor + dominio + email)

---

## Decisión recomendada

```
Hoy (MVP):        Hetzner CX22 — $4/mes — máximo ahorro mientras validas
3 meses:          EC2 t3.small sa-east-1 — $17/mes — mejor latencia Colombia
6 meses:          EC2 t3.medium + RDS — $60/mes — si hay usuarios reales
1 año:            Evaluar según métricas reales
```

El CI/CD con GitHub Actions ya está configurado en `.github/workflows/deploy.yml` y funciona igual en cualquier proveedor que tenga Docker instalado.
