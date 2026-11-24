# Probar pagos con Wompi sandbox (local) — procedimiento repetible

Última actualización: 25-nov-2026. Pagos de punta a punta en sandbox: Wompi aprobó un pago de prueba (orden 49) y la app lo reflejó (`paid`/`held`) mediante la sincronización con Wompi (§6b). Todavía **no se ha visto llegar el webhook directo de Wompi** (falta confirmar la URL de eventos en el panel).

> Resumen de una sesión de pruebas: `bash scripts/wompi-sandbox.sh up` → pegar la URL de eventos en Wompi (si cambió) → abrir la app por la URL del túnel → pagar con datos de prueba → `bash scripts/wompi-sandbox.sh status <orden>`.

## 1. Una sola vez: cuenta y llaves de Wompi
1. Crear el comercio en https://comercios.wompi.co (se eligió Persona Natural; la activación/verificación del comercio **no** es necesaria para el sandbox).
2. Menú izquierdo **Desarrollo → Programadores** (otras guías lo llaman "Desarrolladores"). Requiere rol SuperAdmin o permiso para ver "Desarrollo".
3. Abajo, en **Modo de pruebas**, pulsar el botón para activar el sandbox. La pantalla debe decir **"Estás en Sandbox (modo de pruebas)"** y la llave pública debe empezar por `pub_test_`. Con `pub_prod_` los pagos serían reales: no usar.
4. Revelar con el ícono de ojo y copiar: llave pública `pub_test_…`, llave privada `prv_test_…`, secreto de **Eventos** `test_events_…` y secreto de **Integridad** `test_integrity_…`.
5. Guardarlas **solo** en `mano_app/.env.local` (está en `.gitignore`; nunca en docs, chat ni commits):
```
LOCAL_WOMPI_PUBLIC_KEY=pub_test_...
LOCAL_WOMPI_PRIVATE_KEY=prv_test_...
LOCAL_WOMPI_INTEGRITY_SECRET=test_integrity_...
LOCAL_WOMPI_EVENTS_SECRET=test_events_...
```
`wompi-sandbox.sh up` valida los prefijos sin imprimir los valores. Si la contraseña/llaves se rotan en Wompi, actualizar este archivo y repetir `up`.

## 2. Una sola vez: herramientas
- App local arriba: `bash scripts/local-up.sh`.
- `cloudflared` en `~/.local/bin` (túnel gratuito, sin cuenta ni sudo). Instalar: descargar `cloudflared-linux-amd64` de https://github.com/cloudflare/cloudflared/releases/latest a `~/.local/bin/cloudflared` y `chmod +x`.

## 3. Por qué hace falta una URL https pública (hallazgo 25-nov-2026)
`checkout.wompi.co` está detrás de CloudFront/WAF y responde **403 "The request could not be satisfied"** si el parámetro `redirect-url` es `http://localhost:…`. Con una URL `https` pública responde 200. Además Wompi **no puede llamar a `localhost`** para el webhook. Solución: un túnel `https` hacia el puerto 3000 (nginx local, que sirve el web y `/api`) y `APP_BASE_URL` apuntando a él.

## 4. Cada sesión de pruebas
```bash
cd /mnt/c/Users/mdigital/Downloads/Repos/mano_app
bash scripts/wompi-sandbox.sh up        # (--new para forzar un túnel nuevo)
```
`up` hace: valida llaves → comprueba la app → abre (o reutiliza) el túnel → pone `LOCAL_APP_BASE_URL=<túnel>` en `.env.local` → recrea el backend → crea una orden de prueba → comprueba que `checkout.wompi.co` acepte la URL de pago (200) y que el túnel llegue al backend. Al final imprime las URLs exactas.

Luego, en el navegador:
1. **Solo si el túnel es nuevo** (el script lo dice: "túnel nuevo"): en Wompi (modo de pruebas) → Desarrollo → Programadores → **URL de Eventos**, pegar `https://<túnel>/api/webhooks/wompi` y **guardar**. Con el túnel reutilizado no hay que repetirlo.
2. Abrir la app **por la URL del túnel** (no por `localhost:3000`): `https://<túnel>/signin`. La sesión del navegador es por origen, y Wompi devuelve al comprador a `<túnel>/orders`.
3. Iniciar sesión con `carlos@example.com` / `password123` (comprador del seed).
4. Pagar la orden que imprimió el script (`/checkout?order_id=N`) o crear una:
   - `/businesses` → entrar a un negocio → botón azul **Añadir** (no avisa nada) → abrir `/cart` a mano (el menú no tiene enlace al carrito) → **Crear pedido y pagar**.
   - En `/checkout`: botón verde **Pagar $… COP** → luego **Ir a pagar en Wompi →** (no redirige solo aunque diga "Redirigiendo…").
5. En la pantalla de Wompi usar **solo datos de prueba** (§5).
6. Revisar el resultado: `bash scripts/wompi-sandbox.sh status N` (N = id de la orden).

Cerrar al terminar: `bash scripts/wompi-sandbox.sh down` (cierra el túnel y restaura `LOCAL_APP_BASE_URL=http://localhost:3000`). Hacerlo también **antes de correr `tests/api`**, para que las pruebas vean el entorno local normal.

## 5. Datos de prueba válidos (docs.wompi.co → "Datos de prueba en Sandbox")
| Método | Dato | Resultado |
|---|---|---|
| Tarjeta | `4242 4242 4242 4242`, fecha futura, CVC de 3 dígitos | APPROVED |
| Tarjeta | `4111 1111 1111 1111` | DECLINED |
| Tarjeta | **cualquier otra** | **ERROR** ("La tarjeta usada no es admitida para el ambiente Sandbox") |
| Nequi | `3991111111` | APPROVED |
| Nequi | `3992222222` | DECLINED |
| Nequi | **cualquier otro número** | **ERROR** ("Número no válido en Sandbox") |
| PSE | "Banco que aprueba" / "Banco que rechaza" | APPROVED / DECLINED |

Los datos del pagador (nombre, correo, teléfono) pueden ser reales o inventados: no afectan el resultado. Wompi envía un comprobante al correo indicado.
Lista completa (Daviplata, Bancolombia, Puntos Colombia, Su+ Pay, estados, endpoints, cuentas del seed y matriz de casos por ejecutar): `.kiro/skills/mano-app/references/wompi-sandbox-datos-de-prueba.md`.

## 6. Qué pasó en las primeras pruebas reales (25-nov-2026)
| Orden | Intento | Resultado en Wompi | Causa |
|---|---|---|---|
| 46 | Tarjeta | ERROR · "La tarjeta usada no es admitida para el ambiente Sandbox" | No era una tarjeta de prueba |
| 47 | Nequi `…4517` ($120.000) | ERROR · "Número no válido en Sandbox" | No era `3991111111` / `3992222222` |
| 49 | Nequi de prueba ($10.000) | **APPROVED** (confirmado con `status`) | Datos válidos. Pero la orden siguió `pending_payment`: el webhook no llegó |

Conclusión: la integración funciona hasta Wompi (firma, llave pública, URL, pantalla de pago) y Wompi ya aprobó un pago de prueba. En los tres casos el backend **no recibió el webhook** (en nginx no hay ninguna llamada de Wompi a `/api/webhooks/wompi`; un `GET` desde el navegador da 404 porque la ruta es solo POST, y eso es normal) . La API de Wompi no expone la URL de eventos, así que solo se puede revisar en el panel: probablemente no está guardada en el ambiente **sandbox**, o apunta a un túnel anterior. Para repetir el evento sin pagar de nuevo: "Reenviar evento" en Transacciones del panel (si existe).

## 6b. Qué hace la app ahora si el webhook no llega (25-nov-2026)
El pago ya no depende de un solo aviso:
- Al volver del checkout (`/orders?id=…`) la app llama a `POST /payments/wompi/sync`: el **servidor** pregunta a Wompi y aplica el resultado.
- En `/pagos` el botón **Verificar pagos pendientes** hace lo mismo.
- Cada 2 minutos un **conciliador** revisa los pagos pendientes de las últimas 48 h.
- Un APPROVED que llega por webhook solo se acepta si la API de Wompi lo confirma.
Por eso, aunque la URL de eventos no esté guardada, la orden se actualiza sola en pocos minutos. La URL de eventos sigue siendo lo recomendado (resultado inmediato).

## 7. Cómo saber qué pasó: `status`
```bash
bash scripts/wompi-sandbox.sh status 47     # de una orden
bash scripts/wompi-sandbox.sh status        # últimas 5 transacciones
```
Muestra: (a) cuántos webhooks recibió el backend y los avisos `wompi: …` del log, (b) las transacciones y el estado de la orden en la BD, (c) lo que **Wompi** tiene de cada referencia (consulta `GET /v1/transactions?reference=` con la llave privada, sin imprimirla).

Cómo leerlo:
| Wompi dice | Backend/BD dice | Significa |
|---|---|---|
| APPROVED | orden `paid/held` | Todo bien |
| APPROVED | orden `pending` | El webhook no llegó: revisar URL de eventos y túnel |
| ERROR / DECLINED | orden `payment_failed` | Webhook recibido y procesado |
| ERROR / DECLINED | orden `pending_payment` | El webhook no llegó (el estado de la orden no cambia sin él) |
| "no tiene transacción" | `pending` | El comprador no llegó a pagar |

## 8. Problemas frecuentes
| Síntoma | Causa | Qué hacer |
|---|---|---|
| Pantalla "403 ERROR … Generated by cloudfront" | `redirect-url` con `http://localhost` | Usar `up`, abrir la app por la URL del túnel |
| Wompi: "ERROR … no es admitida / Número no válido en Sandbox" | Dato que no es de prueba | Usar §5 |
| La orden no cambia tras pagar | El webhook no llega | URL de eventos guardada en Wompi **con el modo de pruebas activo**, túnel vivo, misma URL que imprimió `up`; `status` |
| `status` muestra `Webhook con firma inválida` | `LOCAL_WOMPI_EVENTS_SECRET` distinto al del panel de Wompi, o rotaron llaves | Recopiar el secreto de Eventos del sandbox y repetir `up` |
| "Orden no encontrada" en `/checkout` | Sesión de otro usuario, o abierta por otro origen | Iniciar sesión como el dueño de la orden, por la URL del túnel |
| 503 `payment gateway not configured` | Faltan llaves en el backend | Revisar `.env.local` y repetir `up` |
| 503 `webhook not configured` | Falta `LOCAL_WOMPI_EVENTS_SECRET` | Ídem |
| El túnel no responde / URL cambió | Se reinició WSL o el túnel | `up --new` y repegar la URL de eventos |
| `curl: Could not resolve host` o `HTTP 000` | El DNS de WSL falla a ratos | Reintentar (el script ya reintenta) |
| Tras reiniciar WSL no hay túnel ni `/tmp/mano/*` | `/tmp` se pierde | `up` (y recrear Playwright si se necesita, ver `tests/e2e/README.md`) |

## 9. Pruebas sin Wompi real (agente / CI)
```bash
# Firma y checksum con vectores (no necesita backend ni llaves)
cd backend && go test ./internal/handlers -run Wompi -v
# Eventos firmados contra el backend real: el backend debe arrancar con el MISMO secreto que se pasa aquí
LOCAL_WOMPI_PUBLIC_KEY=pub_test_x LOCAL_WOMPI_INTEGRITY_SECRET=test_integrity_x LOCAL_WOMPI_EVENTS_SECRET=test_events_sim \
  docker compose -f docker-compose.local.yml up -d core
WOMPI_EVENTS_SECRET=test_events_sim bash scripts/wompi-webhook-sim.sh      # 12 verificaciones
bash scripts/wompi-sandbox.sh up                                           # restaurar las llaves reales
```
El simulador cubre: firma inválida, sin firma, monto alterado, aprobado, repetido (idempotente) y rechazo tardío. No sustituye una prueba con el webhook real de Wompi.

## 10. Escenarios de la lista de Wompi y cómo se cubren
| Escenario | Cómo |
|---|---|
| Pago aprobado / rechazado / error | §5 con la UI de Wompi |
| Pendiente | PSE o Nequi sin completar |
| Usuario cancela | Cerrar el checkout; la orden queda `pending_payment` |
| Webhook de confirmación | URL de eventos + `status` |
| Firma inválida / sin firma | `wompi-webhook-sim.sh` |
| Mismo pago dos veces | `wompi-webhook-sim.sh` (y "Reenviar evento" desde el panel de Wompi) |
| Actualización del estado en el backend | `status` |

## Límites conocidos
- Fuera de `MOCK_MODE` faltan F4.3 completo (fallar al arrancar sin secretos), F4.4 (auto-confirm de 24 h) y F4.9 (seed sin `password123`).
- El `redirect_url` que manda el cliente se ignora (se usa `APP_BASE_URL/orders`).
- No se consulta `GET /transactions/{id}` a Wompi como doble verificación; la fuente es el webhook firmado.
- UX del checkout pendiente de decisión: "Añadir" sin aviso, sin enlace al carrito en el menú, "Redirigiendo a Wompi…" sin redirección automática.
- Persona Natural: para producción hay que consultar a Wompi y a un contador/abogado el modelo de cobrar en nombre de terceros (escrow y reparto).
