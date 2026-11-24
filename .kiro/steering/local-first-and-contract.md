---
inclusion: always
---

# Reglas de trabajo de Mano App

## 1. Local primero, remoto después
- Todo cambio se prueba **en local** (Docker Compose en la máquina del usuario) antes de pensar en remoto.
- Nada se despliega a staging/producción hasta que el *Gate local* de su fase (en `mano_app/docs/MIGRATION_PLAN.md`) esté completo y el usuario lo confirme.
- Hasta la fase de promoción (F8) el workflow `deploy.yml` no debe ejecutarse automáticamente en push a `main`.
- No hacer `git push`, ni tocar el servidor de Azure, ni usar credenciales reales de Wompi/SMTP. En local siempre `MOCK_MODE=true` o sandbox de Wompi.

## 2. El backend es una caja negra con contrato congelado
- No se cambian rutas, campos, códigos de estado ni formas de respuesta existentes. Solo cambios **aditivos**, o `/v2` para cambios incompatibles.
- Las correcciones internas del backend (hallazgos de `docs/ARCHITECTURE_CURRENT_STATE.md` sección 6) se hacen **sin alterar el contrato** y solo cuando el usuario lo apruebe (decisión D1).
- Todo lo nuevo que necesiten los móviles (refresh token, uploads, push, realtime) va en *edge services*, no en el backend.

## 3. Los frontends son clientes, no servidores
- iOS y Android se instalan desde las tiendas; el web son archivos que ejecuta el navegador. Ninguno corre como contenedor de aplicación.
- Todo cliente habla solo con el gateway (`api.mano.app/v1`) e incluye `X-Mano-Client`, `X-Mano-Client-Version` y `X-Mano-Device-Id`.
- Los headers de cliente sirven para enrutar y medir; **nunca para autorizar**.

## 4. Verificación honesta
- Si no se pudo ejecutar una prueba (por ejemplo, en un entorno sin Go/Node/Docker), decirlo explícitamente en lugar de afirmar que pasó.
- Los comandos de verificación de cada tarea están en el plan; el usuario los corre en su máquina cuando el agente no pueda.

## 5. Imágenes
- Ver `design-assets-immutable.md`. Esta regla prevalece sobre todas las demás.

## 6. Credenciales (regla añadida el 24-nov-2026 tras un incidente)
- **Una credencial (contraseña, token, llave) vive solo como *secret* de GitHub o en un `.env` del servidor. Nunca en una *variable* (`vars.*`) de Actions**: las variables no se ocultan en los logs y los logs de este repositorio son públicos. Un workflow nunca debe leer una credencial de `vars.*`, ni como "compatibilidad".
- Una credencial pegada en el chat, en un commit o en un log se considera comprometida: se recomienda cambiarla en el sistema de origen (el agente no la repite ni la escribe en ningún archivo).
- Cuando haga falta una llave que el agente no puede crear (secrets de GitHub, contraseñas de la VM), se le pide al usuario con los pasos concretos; el agente no pide que se la pasen por el chat.
