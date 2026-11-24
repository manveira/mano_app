#!/usr/bin/env bash
# grant-docker-access.sh — Da a TU usuario acceso inmediato al socket de Docker mediante una ACL,
# sin necesidad de reiniciar sesión ni de pertenecer al grupo "docker" en la sesión actual.
# Así el agente (que corre como tu usuario) puede usar `docker` y `docker compose`.
#
# Uso (una sola vez):
#     sudo bash mano_app/scripts/grant-docker-access.sh
# Para quitar el permiso:
#     sudo bash mano_app/scripts/grant-docker-access.sh --revoke
#
# Qué hace:
#   1. Instala el paquete "acl" si falta (setfacl).
#   2. Da lectura/escritura sobre /run/docker.sock SOLO a tu usuario (setfacl u:USUARIO:rw).
#   3. Crea un drop-in de systemd (/etc/systemd/system/docker.socket.d/10-acl-USUARIO.conf)
#      para que el permiso se reaplique cada vez que arranque docker.socket (reinicios de WSL).
#
# ⚠ Aviso de seguridad: quien puede hablar con el socket de Docker equivale a root en esa máquina
#   (puede montar cualquier carpeta en un contenedor). Es lo mismo que pertenecer al grupo "docker".
#   Está bien en tu equipo de desarrollo local; no lo hagas en servidores compartidos.

set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Corre con sudo:  sudo bash $0 [--revoke]"; exit 1; }
U="${SUDO_USER:-}"
{ [ -n "$U" ] && [ "$U" != "root" ]; } || { echo "No pude determinar tu usuario (SUDO_USER vacío)."; exit 1; }

DROPIN_DIR=/etc/systemd/system/docker.socket.d
DROPIN="$DROPIN_DIR/10-acl-$U.conf"

if [ "${1:-}" = "--revoke" ]; then
  command -v setfacl >/dev/null 2>&1 && setfacl -x "u:$U" /run/docker.sock 2>/dev/null || true
  rm -f "$DROPIN"; rmdir "$DROPIN_DIR" 2>/dev/null || true
  systemctl daemon-reload
  echo "✅ Permiso retirado para $U (el acceso por grupo 'docker' sigue igual)."
  exit 0
fi

command -v systemctl >/dev/null 2>&1 || { echo "Se requiere systemd (WSL2 con systemd activo)."; exit 1; }

if ! command -v setfacl >/dev/null 2>&1; then
  echo "▶ Instalando paquete acl"
  apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=3 install -y acl \
    || { apt-get -o Acquire::ForceIPv4=true update -y || true; apt-get -o Acquire::ForceIPv4=true install -y acl; }
fi
SETFACL="$(command -v setfacl)"

systemctl is-active --quiet docker.socket || systemctl start docker.socket
[ -S /run/docker.sock ] || { echo "No existe /run/docker.sock; ¿está Docker instalado y activo?"; exit 1; }

echo "▶ ACL inmediata sobre /run/docker.sock para $U"
"$SETFACL" -m "u:$U:rw" /run/docker.sock

echo "▶ Persistencia (drop-in de systemd)"
mkdir -p "$DROPIN_DIR"
cat > "$DROPIN" <<EOF
# Generado por mano_app/scripts/grant-docker-access.sh — da acceso a $U al socket de Docker
[Socket]
ExecStartPost=$SETFACL -m u:$U:rw /run/docker.sock
EOF
systemctl daemon-reload

echo "▶ Verificación"
getfacl -p /run/docker.sock 2>/dev/null | grep -E "^(# file|user:$U)" || true
sudo -u "$U" env -i PATH=/usr/bin:/bin docker ps >/dev/null 2>&1 && echo "docker ps como $U: OK" || echo "(aviso: docker ps como $U no respondió; revisa con 'docker ps')"

echo "✅ Listo. $U ya puede usar docker en cualquier proceso, sin reiniciar la sesión."
