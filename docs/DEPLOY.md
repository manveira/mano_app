# DEPLOY.md — Guía de deploy paso a paso

Pasos exactos para llevar Mano App de local a producción en Azure con dominio de AWS Route 53.

---

## Estado actual del repo

- Repo git inicializado localmente con commit inicial `bae1a74`
- 84 archivos, 15.462 líneas de código
- App corriendo en `http://localhost` con Docker Compose
- CI/CD configurado en `.github/workflows/deploy.yml`

---

## Paso 1 — Subir a GitHub

```bash
# Configurar identidad git (solo la primera vez)
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"

# Crear el repo en github.com:
#   → New repository → nombre: mano_app
#   → Privado ✓ → Sin README ✓ → Sin .gitignore ✓ → Create

# Conectar y subir
cd /Users/manve/Documents/Repos/Mano_App
git remote add origin https://github.com/TU_USUARIO/mano_app.git
git push -u origin main
```

---

## Paso 2 — Configurar GitHub Actions Secrets

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Valor | Cómo obtenerlo |
|--------|-------|----------------|
| `AZURE_VM_HOST` | IP pública de la VM | Azure Portal → VM → Overview |
| `AZURE_VM_USER` | `azureuser` | Por defecto en Azure Ubuntu |
| `AZURE_SSH_KEY` | Clave privada SSH | `cat ~/.ssh/id_rsa` |
| `GHCR_TOKEN` | GitHub Personal Access Token | github.com → Settings → Developer settings → Tokens → New token (permisos: `read:packages`, `write:packages`) |

Después de configurar los secrets, cada `git push main` dispara automáticamente:
```
test (Go build + TypeScript) → build (Docker → GHCR) → deploy (SSH → Azure VM)
Tiempo total: ~3-4 minutos
```

---

## Paso 3 — Crear la VM en Azure

1. Ir a **portal.azure.com → Virtual Machines → Create**
2. Configuración:
   - **Image:** Ubuntu Server 22.04 LTS
   - **Size:** B2s (4GB RAM, 2 vCPU) — ~$30/mes
   - **Authentication:** SSH public key (usar tu clave existente)
   - **Inbound ports:** HTTP (80), HTTPS (443), SSH (22)
3. Anotar la **IP pública** que asigna Azure

---

## Paso 4 — Apuntar el dominio de AWS Route 53 a Azure

En **AWS Console → Route 53 → Hosted Zones → Tu dominio**:

1. Crear registro tipo **A**:
   - **Record name:** `@` (o vacío para el dominio raíz)
   - **Value:** IP pública de la VM en Azure
   - **TTL:** 300
2. Crear registro tipo **A** para `www`:
   - **Record name:** `www`
   - **Value:** misma IP de Azure
3. Esperar propagación DNS (~5-15 minutos)

Verificar: `nslookup TU_DOMINIO.COM` debe devolver la IP de Azure.

---

## Paso 5 — Configurar el servidor Azure

```bash
# SSH a la VM
ssh azureuser@IP_AZURE

# Ejecutar el script de setup (instala Docker, Certbot, SSL, levanta la app)
bash <(curl -s https://raw.githubusercontent.com/TU_USUARIO/mano_app/main/scripts/setup-server.sh) \
  TU_DOMINIO.COM tu@email.com TU_USUARIO_GITHUB
```

El script:
1. Instala Docker y Certbot
2. Configura el firewall (22, 80, 443)
3. Clona el repo en `/opt/mano-app`
4. Te pide editar el `.env` con los valores reales
5. Obtiene el certificado SSL de Let's Encrypt
6. Levanta la app con `docker compose -f docker-compose.prod.yml up -d`

---

## Paso 6 — Editar el .env en el servidor

```bash
nano /opt/mano-app/.env
```

Valores mínimos que debes cambiar:

```bash
GITHUB_OWNER=tu-usuario-github
POSTGRES_PASSWORD=$(openssl rand -hex 16)   # genera uno seguro
REDIS_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
APP_BASE_URL=https://TU_DOMINIO.COM
WOMPI_PUBLIC_KEY=pub_prod_...
WOMPI_PRIVATE_KEY=prv_prod_...
SMTP_USER=tu@gmail.com
SMTP_PASS=tu_app_password_de_gmail
```

---

## Flujo de trabajo diario (después del setup)

```bash
# Hacer un cambio en el código
git add .
git commit -m "fix: descripción del cambio"
git push origin main

# GitHub Actions hace el resto automáticamente:
# 1. Compila Go y verifica TypeScript
# 2. Buildea las imágenes Docker y las sube a GHCR
# 3. SSH a Azure, pull de las nuevas imágenes, restart
# 4. En ~4 minutos el cambio está en producción
```

---

## Comandos útiles en el servidor

```bash
# Ver estado de los contenedores
docker compose -f /opt/mano-app/docker-compose.prod.yml ps

# Ver logs en tiempo real
docker compose -f /opt/mano-app/docker-compose.prod.yml logs -f

# Ver logs solo del backend
docker compose -f /opt/mano-app/docker-compose.prod.yml logs -f backend

# Reiniciar un servicio
docker compose -f /opt/mano-app/docker-compose.prod.yml restart backend

# Actualizar manualmente (sin esperar el CI)
cd /opt/mano-app && git pull && \
  docker compose -f docker-compose.prod.yml up -d --pull always
```

---

## Verificar que todo funciona en producción

```bash
# Health check
curl https://TU_DOMINIO.COM/api/health

# Debe devolver: {"status":"ok"}
```

---

## Archivos de infraestructura en el repo

| Archivo | Para qué sirve |
|---------|---------------|
| `docker-compose.yml` | Desarrollo local |
| `docker-compose.prod.yml` | Producción en Azure |
| `nginx.conf` | Proxy local (HTTP) |
| `nginx.prod.conf` | Proxy producción (HTTPS + Let's Encrypt) |
| `.env.example` | Plantilla de variables de entorno |
| `.github/workflows/deploy.yml` | CI/CD automático |
| `scripts/setup-server.sh` | Setup del servidor desde cero |

---

## Costos estimados (Azure + dominio AWS)

| Componente | Costo/mes |
|-----------|-----------|
| Azure VM B2s | ~$30 |
| Disco OS 30GB | ~$2.40 |
| IP pública estática | ~$3.65 |
| Dominio AWS Route 53 | ~$1 (ya lo tienes) |
| SSL Let's Encrypt | $0 |
| GitHub Actions | $0 (2.000 min/mes gratis) |
| GHCR (imágenes) | $0 (500MB gratis) |
| **Total** | **~$37/mes** |

Ver análisis completo en [`docs/INFRASTRUCTURE.md`](./INFRASTRUCTURE.md).
