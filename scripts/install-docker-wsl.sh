#!/usr/bin/env bash
# install-docker-wsl.sh — Instala Docker Engine + Compose en Ubuntu (WSL2) desde el repositorio apt OFICIAL de Docker.
#
# Requiere root, por eso lo corres TÚ:
#     sudo bash mano_app/scripts/install-docker-wsl.sh
#
# Qué hace (y nada más):
#   1. Instala dependencias: ca-certificates, curl, make, uidmap
#   2. Agrega la llave GPG y el repo apt de Docker (https://download.docker.com/linux/ubuntu)
#   3. Instala docker-ce, docker-ce-cli, containerd.io, docker-buildx-plugin, docker-compose-plugin
#   4. Habilita e inicia el servicio (WSL2 con systemd)
#   5. Agrega tu usuario al grupo "docker" (debes abrir una terminal nueva para que aplique)
#   6. Prueba con hello-world
#
# Alternativa sin este script: instalar Docker Desktop en Windows y activar
# Settings > Resources > WSL integration > tu distro Ubuntu.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Corre con sudo:  sudo bash $0"; exit 1
fi

TARGET_USER="${SUDO_USER:-}"
if [ -z "$TARGET_USER" ] || [ "$TARGET_USER" = "root" ]; then
  echo "No pude determinar tu usuario (SUDO_USER vacío). Usa: sudo bash $0"; exit 1
fi

. /etc/os-release
CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
[ "${ID:-}" = "ubuntu" ] || { echo "Este script es para Ubuntu (detectado: ${ID:-?})"; exit 1; }

echo "▶ Ubuntu $VERSION_ID ($CODENAME) — usuario: $TARGET_USER"

# WSL a veces no tiene ruta IPv6 y apt se queda colgado/falla ("Network is unreachable").
# Forzamos IPv4 solo para ESTAS ejecuciones de apt (no cambia la configuración del sistema).
APT="apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=3"

# curl con reintentos: el DNS de WSL falla de forma intermitente ("Could not resolve host").
CURL="curl -4 --retry 8 --retry-all-errors --retry-delay 2 --connect-timeout 10"

# Pre-chequeo informativo (NO aborta): la validación definitiva es apt-cache más abajo.
CODE="$($CURL -s -o /dev/null -w '%{http_code}' -I "https://download.docker.com/linux/ubuntu/dists/$CODENAME/Release" || true)"
case "$CODE" in
  200) echo "ℹ Repo de Docker para '$CODENAME': disponible (HTTP 200)" ;;
  404) echo "❌ Docker no publica repo para '$CODENAME' (HTTP 404). Revisa https://docs.docker.com/engine/install/ubuntu/"; exit 1 ;;
  *)   echo "⚠ No pude confirmar el repo de Docker (HTTP '${CODE:-sin respuesta}', probablemente DNS intermitente). Continúo; se valida más adelante." ;;
esac

if systemctl is-active --quiet docker 2>/dev/null; then
  echo "ℹ Docker ya está activo; se actualizará/verificará la instalación."
fi

echo "▶ [1/6] Dependencias"
# Si algún repo secundario falla (p. ej. security.ubuntu.com), seguimos: lo que importa
# es poder instalar estos paquetes; se comprueba más abajo.
$APT update -y || echo "⚠ apt update tuvo errores en algún repositorio; continúo e intento instalar igualmente."
$APT install -y ca-certificates curl make uidmap

echo "▶ [2/6] Llave y repositorio oficial de Docker"
install -m 0755 -d /etc/apt/keyrings
$CURL -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
$APT update -y || echo "⚠ apt update tuvo errores en algún repositorio; verifico que Docker esté disponible."
CAND="$(LC_ALL=C apt-cache policy docker-ce | awk '/Candidate:/ {print $2}')"
if [ -z "$CAND" ] || [ "$CAND" = "(none)" ]; then
  echo "❌ El repositorio de Docker no quedó disponible (docker-ce sin candidato). Revisa tu conexión y vuelve a correr el script."; exit 1
fi
echo "ℹ docker-ce disponible: $CAND"

echo "▶ [3/6] Instalando Docker Engine y Compose"
$APT install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "▶ [4/6] Servicio"
if [ -d /run/systemd/system ]; then
  systemctl enable --now docker
else
  echo "⚠ systemd no está activo en esta distro WSL. Inicia el demonio con:  sudo service docker start"
  service docker start || true
fi

echo "▶ [5/6] Grupo docker para $TARGET_USER"
usermod -aG docker "$TARGET_USER"

echo "▶ [6/6] Prueba"
docker --version
docker compose version
docker run --rm hello-world | head -5

cat <<EOF

✅ Listo. Cierra y abre la terminal (o ejecuta:  newgrp docker ) para usar docker sin sudo.
   Luego verifica:  docker ps
EOF
