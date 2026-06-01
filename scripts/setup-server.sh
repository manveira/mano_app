#!/bin/bash
# scripts/setup-server.sh
# Configura una Azure VM (Ubuntu 22.04) desde cero para Mano App
#
# Uso:
#   bash setup-server.sh TU_DOMINIO.COM tu@email.com tu-usuario-github
#
# Prerequisitos:
#   1. Azure VM Ubuntu 22.04 LTS creada
#   2. Puertos 22, 80, 443 abiertos en el Network Security Group de Azure
#   3. El dominio en AWS Route 53 apunta a la IP pública de la VM
#      (Registro A: TU_DOMINIO.COM → IP_PUBLICA_AZURE)
#   4. DNS propagado (verificar con: nslookup TU_DOMINIO.COM)

set -e

DOMAIN=${1:-""}
EMAIL=${2:-""}
GITHUB_USER=${3:-""}
APP_DIR="/opt/mano-app"
GITHUB_REPO="https://github.com/${GITHUB_USER}/mano_app.git"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ] || [ -z "$GITHUB_USER" ]; then
  echo "Uso: bash setup-server.sh TU_DOMINIO.COM tu@email.com tu-usuario-github"
  exit 1
fi

echo ""
echo "🚀 Configurando Mano App en Azure VM"
echo "   Dominio: $DOMAIN"
echo "   Email:   $EMAIL"
echo "   GitHub:  $GITHUB_USER"
echo ""

# ── 1. Actualizar sistema ──────────────────────────────────────────────────────
echo "📦 Actualizando sistema..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw wget

# ── 2. Instalar Docker ─────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "🐳 Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker $USER
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker instalado"
else
  echo "✅ Docker ya instalado"
fi

# ── 3. Instalar Certbot ────────────────────────────────────────────────────────
if ! command -v certbot &> /dev/null; then
  echo "🔒 Instalando Certbot..."
  apt-get install -y certbot
  echo "✅ Certbot instalado"
fi

# ── 4. Firewall (UFW) ──────────────────────────────────────────────────────────
# Nota: Azure también tiene Network Security Groups — ambos deben permitir los puertos
echo "🔥 Configurando firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "✅ Firewall configurado (22, 80, 443)"

# ── 5. Clonar repositorio ─────────────────────────────────────────────────────
echo "📂 Configurando directorio de la app..."
mkdir -p $APP_DIR

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Clonando repositorio..."
  git clone $GITHUB_REPO $APP_DIR
  echo "✅ Repositorio clonado en $APP_DIR"
else
  echo "✅ Repositorio ya existe, actualizando..."
  cd $APP_DIR && git pull origin main
fi

# ── 6. Configurar .env ────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  cp $APP_DIR/.env.example $APP_DIR/.env
  echo ""
  echo "⚠️  ACCIÓN REQUERIDA: Edita el archivo .env con tus valores reales:"
  echo ""
  echo "   nano $APP_DIR/.env"
  echo ""
  echo "Valores mínimos que DEBES cambiar:"
  echo "   GITHUB_OWNER=$GITHUB_USER"
  echo "   POSTGRES_PASSWORD=\$(openssl rand -hex 16)"
  echo "   REDIS_PASSWORD=\$(openssl rand -hex 16)"
  echo "   JWT_SECRET=\$(openssl rand -hex 32)"
  echo "   APP_BASE_URL=https://$DOMAIN"
  echo "   WOMPI_PUBLIC_KEY=pub_prod_..."
  echo "   WOMPI_PRIVATE_KEY=prv_prod_..."
  echo "   SMTP_USER=tu@gmail.com"
  echo "   SMTP_PASS=tu_app_password"
  echo ""
  echo "Después de editar el .env, vuelve a ejecutar este script."
  exit 0
fi

# ── 7. Configurar nginx con el dominio ────────────────────────────────────────
echo "🌐 Configurando nginx para $DOMAIN..."
sed -i "s/TU_DOMINIO.COM/$DOMAIN/g" $APP_DIR/nginx.prod.conf
echo "✅ nginx.prod.conf configurado"

# ── 8. Obtener certificado SSL ────────────────────────────────────────────────
mkdir -p /var/www/certbot

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "🔒 Obteniendo certificado SSL para $DOMAIN..."
  echo "   (Asegúrate de que el DNS ya apunta a esta IP)"
  echo ""

  # Levantar nginx temporal solo en HTTP para el challenge de Certbot
  docker run -d --name certbot-nginx -p 80:80 \
    -v /var/www/certbot:/var/www/certbot \
    nginx:stable-alpine 2>/dev/null || true
  sleep 3

  certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN \
    -d www.$DOMAIN

  docker stop certbot-nginx && docker rm certbot-nginx 2>/dev/null || true
  echo "✅ Certificado SSL obtenido"
else
  echo "✅ Certificado SSL ya existe"
fi

# ── 9. Renovación automática SSL ──────────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $APP_DIR/docker-compose.prod.yml restart proxy") | crontab -
echo "✅ Renovación automática de SSL configurada (cron diario 3am)"

# ── 10. Login a GHCR y levantar la app ───────────────────────────────────────
echo "🚀 Levantando Mano App..."
cd $APP_DIR
source .env

# Login a GitHub Container Registry
echo "Ingresa tu GitHub Personal Access Token (con permiso read:packages):"
read -s GHCR_TOKEN
echo $GHCR_TOKEN | docker login ghcr.io -u $GITHUB_USER --password-stdin

# Pull y levantar
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "✅ ¡Mano App está corriendo!"
echo ""
echo "🌐 URL: https://$DOMAIN"
echo ""
echo "📋 Comandos útiles:"
echo "   Ver logs:     docker compose -f $APP_DIR/docker-compose.prod.yml logs -f"
echo "   Estado:       docker compose -f $APP_DIR/docker-compose.prod.yml ps"
echo "   Reiniciar:    docker compose -f $APP_DIR/docker-compose.prod.yml restart"
echo "   Actualizar:   cd $APP_DIR && git pull && docker compose -f docker-compose.prod.yml up -d --pull always"
