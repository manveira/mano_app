# DEPLOY.md — Despliegue en Azure (procedimiento)

Última actualización: 24-nov-2026. Reemplaza la guía anterior (que desplegaba con cada `push` a `main`; eso ya no existe).

**Resumen:** el código vive en GitHub; el despliegue se lanza **a mano** desde GitHub Actions; construye las imágenes, las sube a GHCR, entra por SSH a la VM de Azure, hace un respaldo de la base de datos, levanta la versión nueva y comprueba que esté sana (si no, vuelve a la anterior). Un `push` o un merge **nunca** despliegan solos.

```
GitHub (Actions → Deploy Mano App → Run workflow, escribir DEPLOY)
   ├─ test    : go vet/build/test · tsc · imágenes del diseñador intactas
   ├─ build   : imágenes mano-backend y mano-frontend en GHCR (tag = SHA del commit)
   └─ deploy  : SSH → /opt/mano-app → respaldo BD → docker compose up → chequeo de salud → (reversión si falla)
```

## 1. Cuando Azure active la suscripción (checklist, en este orden)

Estado conocido al 24-nov-2026: la suscripción `manve-subs` figura **Disabled** (el pago aún no estaba procesado) y no se pudo leer el estado de la VM `mano-app-vm`.

1. **Azure Portal → Suscripciones**: confirma que `manve-subs` esté **Activa**.
2. **Portal → Máquinas virtuales → `mano-app-vm` → Iniciar** (Start).
3. **IP pública** (`mano-app-vm-ip`): mira si la asignación es **Estática**. Si es dinámica, la IP pudo cambiar al reiniciar: actualiza la variable `AZURE_VM_HOST` en GitHub y el registro **A** del dominio (Route 53). Recomendado: ponerla Estática (Portal → IP pública → Configuración).
4. **Una sola vez para esta versión, por SSH a la VM** (`ssh <usuario>@<IP>`), edita `/opt/mano-app/.env` (ver §3). El workflow se detiene con un mensaje claro si falta algo.
5. **GitHub → Actions → Deploy Mano App → Run workflow**: rama `main`, escribe `DEPLOY` en `confirm`.
6. **Wompi**: pega `https://TU_DOMINIO/api/webhooks/wompi` en *Desarrollo → Programadores → URL de Eventos* (con el modo de pruebas activo si usas llaves de prueba).
7. **Verifica** (§5).

## 2. Configuración en GitHub (una sola vez)

*Settings → Secrets and variables → Actions*.

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `GHCR_TOKEN` | Token personal (classic) con permiso `read:packages`, para que la VM descargue las imágenes |
| Secret | `AZURE_SSH_KEY` | Llave privada SSH con acceso a la VM (recomendado) |
| Secret | `AZURE_VM_PASSWORD` | Solo si aún no usas llave SSH. Lo correcto es **secret**; por compatibilidad el workflow también acepta la **variable** `AZURE_VM_PASSWORD` (las variables se ven en repos públicos: pásala a secret) |
| Secret (opcional) | `AZURE_VM_FINGERPRINT` | Huella SHA256 del host SSH, para no confiar a ciegas en el servidor |
| Variable | `AZURE_VM_HOST` | IP pública o dominio de la VM |
| Variable | `AZURE_VM_USER` | Usuario SSH (p. ej. `azureuser`) |
| Variable (opcional) | `APP_URL` | `https://TU_DOMINIO`: al terminar, el workflow comprueba `…/api/health` desde fuera |

> Pendiente conocido: la contraseña SSH está guardada como **variable** (`AZURE_VM_PASSWORD`). Desde el 24-nov-2026 el workflow la acepta así, pero conviene crearla en *Secrets* (o usar llave SSH) y borrar la variable.
> Opcional: *Settings → Environments → production → Required reviewers* para exigir aprobación manual antes del paso de deploy.

Crear la llave SSH (en tu máquina): `ssh-keygen -t ed25519 -f ~/.ssh/mano_deploy -N ""`; la pública (`.pub`) se agrega a `~/.ssh/authorized_keys` de la VM y la privada completa va al secret `AZURE_SSH_KEY`.

## 3. El `.env` del servidor (`/opt/mano-app/.env`)

Plantilla: `.env.example`. **Nunca** se sube a git. Valores:

| Variable | Notas |
|---|---|
| `GITHUB_OWNER` | `manveira` (en minúsculas) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | La contraseña: `openssl rand -hex 16` |
| `REDIS_PASSWORD` | `openssl rand -hex 16` |
| `JWT_SECRET` | `openssl rand -hex 32` (mínimo 32 caracteres; si no, el backend **no arranca**) |
| `APP_BASE_URL` | `https://TU_DOMINIO` (https obligatorio para el regreso desde Wompi) |
| `DOMAIN` | `TU_DOMINIO` sin `https://` ni `www` (nginx lo usa; **nueva**, falta en los `.env` antiguos) |
| `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` | **Primer despliegue: llaves de PRUEBAS** (`pub_test_…`, `prv_test_…`, `test_integrity_…`, `test_events_…`). El backend elige sandbox o producción por el prefijo de la llave pública |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Primer administrador (solo se crea si no hay ninguno). Contraseña de 12+ caracteres; quita `ADMIN_PASSWORD` del archivo tras el primer arranque |
| `SMTP_*`, `FROM_EMAIL` | Correo de notificaciones |

`MOCK_MODE=false` y `SEED_DEMO_DATA=false` los fija el compose de producción: no se configuran.

**Cuentas de demostración en una base ya usada:** si el despliegue anterior sembró usuarios `@example.com` con la contraseña `password123`, deshabilítalos (la base conserva sus pedidos):
```bash
cd /opt/mano-app
docker compose -f docker-compose.prod.yml exec postgres psql -U "$(grep ^POSTGRES_USER .env | cut -d= -f2)" -d mano \
  -c "SELECT id,email,role FROM users WHERE email LIKE '%@example.com';" \
  -c "UPDATE users SET password='!deshabilitado' WHERE email LIKE '%@example.com';"
```

## 4. Primera vez en una VM nueva (solo si no existe `/opt/mano-app`)
Ver `scripts/setup-server.sh` (instala Docker y Certbot, firewall 22/80/443, clona el repo, pide editar el `.env`, obtiene el certificado SSL y levanta la app). Antes: puertos 22/80/443 abiertos en el Network Security Group de Azure y el dominio apuntando a la IP de la VM.

## 5. Verificar después de cada despliegue
```bash
curl -fsS https://TU_DOMINIO/api/health            # {"status":"ok"}
curl -sS -o /dev/null -w '%{http_code}\n' https://TU_DOMINIO/api/mock/status   # 403: /mock está apagado
ssh <usuario>@<IP> 'cd /opt/mano-app && docker compose -f docker-compose.prod.yml ps && docker compose -f docker-compose.prod.yml logs --tail 30 backend'
```
En los logs del backend debe verse `wompi: conciliador activo` (con llaves de Wompi) y no debe aparecer `seed de demostración` activado. Luego prueba un pago con datos de prueba (`.kiro/skills/mano-app/references/wompi-sandbox-datos-de-prueba.md` o `docs/WOMPI_SANDBOX.md`) y mira **Mis pagos** en la app (`/pagos`).

## 6. Reversión y respaldos
- El workflow guarda el SHA del último despliegue sano en `/opt/mano-app/.last_good_tag`. Si el backend no queda sano tras desplegar, **vuelve solo** a esa versión.
- Reversión manual a una versión anterior: relanza el workflow desde ese commit, o en la VM: `cd /opt/mano-app && IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml up -d backend frontend`.
- Respaldos de la base de datos: antes de cada despliegue en `/opt/mano-backups/*.sql.gz` (se conservan los 14 últimos). Restaurar: `gunzip -c ARCHIVO.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U USUARIO -d mano`.

## 7. Antes de cobrar dinero real
No cambies a llaves `pub_prod_…` hasta cerrar (ver `docs/MIGRATION_PLAN.md` F4): liberar el escrow automáticamente a las 24 h (F4.4, hoy no existe fuera del modo mock), atribución del comisionista en compras sin cuenta (F4.5), anti-fraude en el flujo real (F4.6) y atomicidad de retiros y liberaciones (F4.7). Consultar a Wompi y a un contador/abogado el modelo de cobrar en nombre de terceros (escrow y reparto).

## 8. Problemas frecuentes
| Síntoma | Causa | Qué hacer |
|---|---|---|
| El workflow falla en "Falta DOMAIN en .env" | `.env` antiguo | Añade `DOMAIN=TU_DOMINIO` (§3) |
| `configuración insegura: JWT_SECRET…` en el log del backend | Secreto corto o por defecto | `openssl rand -hex 32` en `.env` |
| `Permission denied (publickey)` | Llave SSH mal copiada | Revisa `AZURE_SSH_KEY` (completa, con `BEGIN/END`) y `authorized_keys` |
| `denied` al hacer `docker pull` | `GHCR_TOKEN` sin `read:packages` o vencido | Genera otro token y actualiza el secret |
| El backend queda `unhealthy` y revierte | Error de configuración o de BD | `docker compose logs backend` en la VM |
| Wompi: pago aprobado pero la orden sigue pendiente | URL de eventos sin guardar o con otro dominio | Corrige la URL; el conciliador la actualiza solo en ≤ 2 min, o usa "Verificar pagos pendientes" en `/pagos` |
| `The subscription is disabled` | Azure no ha activado la suscripción | Esperar/contactar soporte de Azure; sin eso no hay VM |
