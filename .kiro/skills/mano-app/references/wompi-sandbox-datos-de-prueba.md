# Wompi sandbox: datos y números de prueba (referencia rápida)

Fuente: https://docs.wompi.co/en/docs/colombia/datos-de-prueba-en-sandbox/ (leída el 25-nov-2026). Son datos públicos de prueba, **no son secretos**. Las llaves del comercio **sí** son secretas y viven solo en `mano_app/.env.local` (nunca aquí).

Regla general: en el sandbox **solo** valen los datos de esta lista. Cualquier otro dato termina en `ERROR` (ejemplos reales de hoy: tarjeta no de prueba → "La tarjeta usada no es admitida para el ambiente Sandbox"; Nequi `…4517` → "Número no válido en Sandbox"). Para que la prueba funcione hay que usar la **llave pública `pub_test_…`** (lo garantiza el modo de pruebas).

## 1. Lo que usamos en Mano App (checkout web de Wompi)

### Tarjetas (débito/crédito)
| Número | Resultado | Fecha / CVC |
|---|---|---|
| `4242 4242 4242 4242` | **APPROVED** (aprobada) | cualquier fecha futura / cualquier CVC de 3 dígitos |
| `4111 1111 1111 1111` | **DECLINED** (rechazada) | ídem |
| cualquier otra | **ERROR** | — |

### Nequi
| Número de celular | Resultado |
|---|---|
| `3991111111` | **APPROVED** |
| `3992222222` | **DECLINED** |
| cualquier otro | **ERROR** ("Número no válido en Sandbox") |

### PSE (en el checkout aparecen bancos de prueba)
| Banco | Resultado |
|---|---|
| "Banco que aprueba" | **APPROVED** |
| "Banco que rechaza" | **DECLINED** |
Si se usa la API directa: `financial_institution_code` = `"1"` aprobado, `"2"` rechazado; `user_type` 0 (persona) o 1 (empresa); `user_legal_id_type` `CC` o `NIT`; ejemplo de documento `1999888777`.

### Botón Bancolombia, Bancolombia QR, Puntos Colombia, BNPL, Su+ Pay
En el checkout de Wompi aparece una pantalla para **elegir el estado final** de la transacción (aprobada / declinada / con error). No hay número que escribir.
- Bancolombia QR por API: `sandbox_status` = `APPROVED` | `DECLINED` | `ERROR`.
- Puntos Colombia por API: `sandbox_status` = `APPROVED_ONLY_POINTS` | `APPROVED_HALF_POINTS` | `DECLINED` | `ERROR`.

### Daviplata (pago único): códigos OTP
| OTP | Resultado |
|---|---|
| `574829` | APPROVED |
| `932015` | DECLINED |
| `186743` | DECLINED (saldo insuficiente) |
| `999999` | ERROR |
| cualquier otro de 6 dígitos (ej. `123456`) | OTP inválido, queda **PENDING** y se puede reintentar hasta agotar los intentos |

### Daviplata (pago recurrente, tokens)
| Celular | Resultado |
|---|---|
| `3991111111` | token y cobros APPROVED |
| `3992222222` | DECLINED |
| `3993333333` | DECLINED (billetera inválida) |
OTP `574829` confirma el token (APPROVED); `932016` lo rechaza (suscripción existente).

## 2. Datos del pagador
Nombre, teléfono y correo del formulario de Wompi pueden ser reales o inventados: **no cambian el resultado**. Wompi envía el comprobante al correo indicado. El resultado depende solo del método y del dato de §1.

## 3. Estados de transacción de Wompi y qué hace Mano App (código en `handlers_wompi.go`)
| Estado Wompi | Qué hace el backend al recibir el webhook `transaction.updated` |
|---|---|
| `APPROVED` | Orden `paid`, escrow `held`, `auto_confirm_at` +24 h, crea los splits (plataforma 4 %, comisionista, negocio). Idempotente: un evento repetido no duplica nada. Valida monto y moneda contra lo registrado |
| `DECLINED`, `VOIDED`, `ERROR` | Orden `payment_failed` (no deshace un pago ya aprobado) |
| `PENDING` | Sin cambio; la orden sigue `pending_payment` |

## 4. Endpoints y llaves del sandbox
- API base: `https://sandbox.wompi.co/v1` (producción: `https://production.wompi.co/v1`; **no usar**).
- Checkout web: `https://checkout.wompi.co/p/?public-key=…&currency=COP&amount-in-cents=…&reference=…&signature:integrity=…&redirect-url=…` (sandbox y producción comparten URL; el ambiente lo decide la llave).
- Prefijos de las llaves de pruebas: `pub_test_`, `prv_test_`, `test_events_`, `test_integrity_`. Producción: `pub_prod_`, `prv_prod_`, `prod_events_`, `prod_integrity_`.
- Consultar lo que Wompi tiene de una referencia (lo hace `wompi-sandbox.sh status`): `GET /v1/transactions?reference=<REF>` con el header `Authorization: Bearer <llave privada>`. Sin ese header (solo con la llave en la URL) devuelve `INVALID_ACCESS_TOKEN`.
- Firma de integridad: `SHA256(referencia + monto_en_centavos + "COP" + secreto_de_integridad)`; **no** es HMAC.
- Checksum del webhook: `SHA256(valores de signature.properties en orden + timestamp + secreto_de_eventos)`; también llega en el header `X-Event-Checksum`.
- Reintentos del webhook: si no respondemos 200, Wompi reintenta a los 30 min, 3 h y 24 h (máximo 3).
- Montos: Wompi usa **centavos** (COP × 100). Una orden de $120.000 viaja como `12000000`. La referencia no se puede reutilizar: el backend crea una nueva (`MANO-<orden>-<epoch>`) en cada intento de pago.

## 5. Datos de la app para las pruebas (seed local, contraseña `password123`)
| Rol | Correo | Para qué |
|---|---|---|
| Comprador | `carlos@example.com` | Pagar órdenes (usar esta cuenta en el checkout) |
| Comisionista | `maria@example.com` | Link `hamaca-casa-narino-maria-x7k2`; recibe la comisión |
| Negocio | `juan@example.com` | Dueño de negocios del seed |
Pago desde un link de comisionista o vitrina (`/r/<slug>`, `/vendedor/<username>`): la atribución del comisionista en compra *guest* tiene un hallazgo abierto (ver `SKILL.md` §7); probar aparte.

## 6. Cómo ejecutar una prueba (resumen; pasos completos en `SKILL.md` §14)
`bash scripts/wompi-sandbox.sh up` → (si el túnel es nuevo) pegar `https://<túnel>/api/webhooks/wompi` en Wompi → abrir la app por la URL del túnel → pagar con un dato de §1 → `bash scripts/wompi-sandbox.sh status <orden>` → `bash scripts/wompi-sandbox.sh down`.

## 7. Matriz de pruebas a completar (marcar cuando se ejecute)
| # | Caso | Dato | Esperado | Estado |
|---|---|---|---|---|
| 1 | Pago aprobado con tarjeta | `4242 4242 4242 4242` | orden `paid`/`held`; 2 splits (plataforma + negocio) o 3 si hay comisionista | ⬜ pendiente |
| 2 | Pago rechazado con tarjeta | `4111 1111 1111 1111` | Wompi DECLINED, orden `payment_failed` | ⬜ pendiente |
| 3 | Pago con error | cualquier otra tarjeta | Wompi ERROR, orden `payment_failed` | ✅ orden 46 marcada `payment_failed` por el **conciliador** |
| 4 | Nequi aprobado | `3991111111` | orden `paid`/`held` | ✅ Wompi **APPROVED** (orden 49, $10.000, 25-nov-2026) y **conciliado por `sync`** → orden `paid`/`held` (el webhook directo de Wompi aún no se ha visto llegar) |
| 5 | Nequi rechazado | `3992222222` | orden `payment_failed` | ⬜ pendiente |
| 6 | Nequi con error | `…4517` (orden 47) | Wompi ERROR | ✅ orden 47 marcada `payment_failed` por el **conciliador** |
| 7 | PSE aprobado / rechazado | "Banco que aprueba / rechaza" | `paid`/`held` / `payment_failed` | ⬜ pendiente |
| 14 | Conciliación sin webhook | pagar y no tener URL de eventos | el conciliador/`sync` aplica el resultado en ≤ 2 min | ✅ probado con órdenes 46, 47 y 49 |
| 8 | Usuario cancela el checkout | cerrar la pantalla de Wompi | orden `pending_payment` | ⬜ pendiente |
| 9 | Pago pendiente | Daviplata OTP inválido / PSE sin completar | orden `pending_payment` | ⬜ pendiente |
| 10 | Webhook repetido (idempotencia) | "Reenviar evento" desde el panel de Wompi | sin splits duplicados | ✅ probado con simulador; ⬜ con Wompi real |
| 11 | Firma inválida / sin firma | simulador | 401 | ✅ probado con simulador |
| 12 | Monto alterado | simulador | 200 ignorado, orden sin pagar | ✅ probado con simulador |
| 13 | Liberar escrow tras pago | botón "Confirmar recepción" del comprador | `released`, saldo al comisionista | ⬜ pendiente (depende de #1) |
