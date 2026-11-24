#!/usr/bin/env node
/**
 * Prueba de interfaz (Playwright + Chromium) del flujo del comisionista, contra el entorno local.
 *   Requisitos: app local arriba (bash scripts/local-up.sh) y Playwright instalado (ver tests/e2e/README.md).
 *   Uso:  NODE_PATH=<ruta a node_modules con playwright> node tests/e2e/ui-smoke.js
 *   Variables: WEB=http://localhost:3000   SHOTS=<carpeta para capturas de depuración, opcional>
 *
 * Qué verifica: splash → elegir rol → registro (validaciones + éxito) → inicio del comisionista → cada botón de
 * cada pantalla → cierre de sesión. También la vitrina pública y el inicio de sesión.
 * Las capturas con ?debugHotspots=1 se guardan en SHOTS fuera del repo (no son imágenes del diseñador).
 */
const { chromium } = require('playwright')
const WEB = process.env.WEB || 'http://localhost:3000'
const SHOTS = process.env.SHOTS || ''
const S = Date.now().toString(36)

let pass = 0, fail = 0
const ok = (n) => { pass++; console.log('  ✅', n) }
const ko = (n, e) => { fail++; console.log('  ❌', n, '\n       ↳', String(e).split('\n')[0]) }
async function step(name, fn) { try { await fn(); ok(name) } catch (e) { ko(name, e) } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()) })

  const click = (label) => page.getByRole('button', { name: label, exact: true }).or(page.getByRole('link', { name: label, exact: true })).first().click()
  const waitUrl = (re, t = 8000) => page.waitForURL(re, { timeout: t })
  const toastText = async () => (await page.getByTestId('toast').last().innerText({ timeout: 4000 }))
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }

  console.log('▶ Flujo de entrada')
  await step('INICIO (splash) avanza solo a "¿Qué mano eliges?"', async () => {
    await page.goto(WEB + '/')
    await waitUrl(/\/elegir-rol$/, 20000)
  })
  await step('Las 4 tarjetas de rol existen con aria-label', async () => {
    for (const n of ['Negocio', 'Prestación de servicios', 'Comisionista', 'Domiciliario'])
      await page.getByRole('button', { name: n, exact: true }).waitFor({ timeout: 20000 })
  })
  await step('Elegir "Comisionista" lleva al registro', async () => { await click('Comisionista'); await waitUrl(/\/registro$/) })

  console.log('▶ Registro')
  const email = `ui_${S}@test.com`, username = `ui${S}`
  const fill = (label, v) => page.getByLabel(label, { exact: true }).fill(v)
  await step('Rechaza correo inválido', async () => {
    await fill('Correo electrónico', 'no-es-correo'); await fill('Username', username); await fill('Contraseña', 'password123'); await fill('Confirmar contraseña', 'password123')
    await click('Registrarse'); await page.getByRole('alert').getByText('correo válido').waitFor({ timeout: 3000 })
  })
  await step('Rechaza contraseñas distintas', async () => {
    await fill('Correo electrónico', email); await fill('Confirmar contraseña', 'otra-cosa-123')
    await click('Registrarse'); await page.getByRole('alert').getByText('no coinciden').waitFor({ timeout: 3000 })
  })
  await step('Rechaza username inválido', async () => {
    await fill('Confirmar contraseña', 'password123'); await fill('Username', 'a b')
    await click('Registrarse'); await page.getByRole('alert').getByText('username debe tener').waitFor({ timeout: 3000 })
  })
  await step('Rechaza username ya usado (maria) con mensaje claro', async () => {
    await fill('Username', 'maria'); await click('Registrarse')
    await page.getByRole('alert').getByText('ya está en uso').waitFor({ timeout: 5000 })
  })
  await step('Redes sociales muestran aviso (sin credenciales)', async () => {
    await click('Continuar con Google'); const t = await toastText(); if (!/Google/.test(t)) throw new Error(t)
  })
  await step('Registro correcto crea la cuenta, inicia sesión y entra al inicio del comisionista', async () => {
    await fill('Username', username); await click('Registrarse'); await waitUrl(/\/comisionista$/, 10000)
    const tok = await page.evaluate(() => localStorage.getItem('token')); if (!tok) throw new Error('sin token')
  })

  console.log('▶ Inicio del comisionista')
  await shot('comisionista')
  await step('Comparte tu enlace copia el link de invitación', async () => {
    await click('Comparte tu enlace'); const t = await toastText(); if (!/copiado/i.test(t)) throw new Error(t)
    const clip = await page.evaluate(() => navigator.clipboard.readText()); if (!/\/signup\?ref=/.test(clip)) throw new Error(clip)
  })
  await step('Notificaciones responde', async () => { await click('Notificaciones'); await toastText() })

  console.log('▶ Perfil y ajustes')
  await step('Mi perfil → PERFIL', async () => { await click('Mi perfil'); await waitUrl(/\/profile$/) })
  await step('Cambiar foto responde', async () => { await click('Cambiar foto de perfil'); await toastText() })
  await step('Ajustes guarda nequi y valida formato', async () => {
    await click('Ajustes'); await waitUrl(/\/ajustes$/)
    await page.getByLabel(/Nequi/).fill('123'); await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByRole('alert').getByText('10 dígitos').waitFor({ timeout: 15000 })
    await page.getByLabel(/Nequi/).fill('3001234567'); await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByText('Cambios guardados.').waitFor({ timeout: 15000 })
  })
  await step('Ayuda abre las preguntas frecuentes', async () => {
    await page.goto(WEB + '/ayuda'); await page.getByText('¿Cómo gano dinero como comisionista?').waitFor({ timeout: 4000 })
  })
  await step('Volver desde PERFIL regresa al inicio del comisionista', async () => {
    await page.goto(WEB + '/profile'); await click('Volver'); await waitUrl(/\/comisionista$/)
  })

  console.log('▶ Comisiones')
  await step('Comisiones → Retirar dinero muestra saldo y regla de mínimo', async () => {
    await click('Comisiones'); await waitUrl(/\/comisiones$/); await shot('comisiones')
    await click('Retirar dinero'); await page.getByRole('dialog').getByText('Saldo disponible').waitFor({ timeout: 4000 })
    await page.getByRole('dialog').getByText('al menos $5.000').waitFor({ timeout: 2000 })
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  })
  await step('Ver guía abre la explicación', async () => {
    await click('Ver guía para retirar tu dinero'); await page.getByRole('dialog').getByText('1 a 2 días hábiles').waitFor({ timeout: 3000 })
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  })
  await step('Ver todos → Movimientos (vacío para cuenta nueva)', async () => {
    await click('Ver todos los movimientos'); await waitUrl(/\/movimientos$/)
    await page.getByText('Todavía no tienes movimientos').waitFor({ timeout: 4000 })
  })

  console.log('▶ Buscar negocios → afiliarse → catálogo')
  await step('Buscar negocios: la búsqueda real filtra y la fila abre el negocio', async () => {
    await page.goto(WEB + '/buscar-negocios'); await shot('buscar-negocios')
    await page.getByLabel('Buscar por nombre o categoría').fill('caf')
    await page.getByLabel('Buscar por nombre o categoría').press('Enter'); const t = await toastText(); if (!/1 negocio/.test(t)) throw new Error(t)
    await click('Abrir Café La Esquina'); await waitUrl(/\/negocio\/cafe-la-esquina$/)
  })
  await step('El comisionista se afilia con "Vender y ganar"', async () => {
    await page.getByRole('button', { name: /Vender y ganar/ }).first().click()
    await page.getByRole('status').getByText(/ya está en tu catálogo/).waitFor({ timeout: 4000 })
  })
  await step('Mi catálogo: compartir el producto copia su link /r/…', async () => {
    await page.goto(WEB + '/catalogo'); await shot('catalogo'); await sleep(800)
    await click('Compartir producto 1'); const t = await toastText(); if (!/copiado/i.test(t)) throw new Error(t)
    const clip = await page.evaluate(() => navigator.clipboard.readText()); if (!/\/r\//.test(clip)) throw new Error(clip)
  })
  await step('Mi catálogo: compartir el catálogo copia /vendedor/<username>', async () => {
    await click('Compartir mi catálogo'); await toastText()
    const clip = await page.evaluate(() => navigator.clipboard.readText()); if (!clip.endsWith('/vendedor/' + username)) throw new Error(clip)
  })
  await step('Mi catálogo: tarjeta vacía avisa qué hacer', async () => {
    await click('Compartir producto 4'); const t = await toastText(); if (!/Buscar negocios/.test(t)) throw new Error(t)
  })

  console.log('▶ Cerrar sesión y vitrina pública')
  await step('Cerrar sesión borra el token y vuelve a elegir rol', async () => {
    await page.goto(WEB + '/comisionista'); await click('Cerrar sesión'); await waitUrl(/\/elegir-rol$/)
    const tok = await page.evaluate(() => localStorage.getItem('token')); if (tok) throw new Error('token sigue guardado')
  })
  await step('Sin sesión, /comisionista redirige a iniciar sesión', async () => {
    await page.goto(WEB + '/comisionista'); await waitUrl(/\/signin$/)
  })
  await step('Vitrina pública /vendedor/maria: agregar al carrito guarda el producto', async () => {
    await page.goto(WEB + '/vendedor/maria?debugHotspots=0'); await shot('comprador')
    await page.evaluate(() => localStorage.removeItem('mano_cart'))
    await click('Agregar Hamaca Artesanal al carrito').catch(async () => { await page.getByRole('button', { name: /Agregar .* al carrito/ }).first().click() })
    await toastText()
    const cart = JSON.parse(await page.evaluate(() => localStorage.getItem('mano_cart') || '[]')); if (!cart.length || !cart[0].business_id) throw new Error(JSON.stringify(cart))
  })
  await step('Vitrina inexistente muestra mensaje claro', async () => {
    await page.goto(WEB + '/vendedor/no-existe-zzz'); await page.getByText('No encontramos esta vitrina').waitFor({ timeout: 5000 })
  })
  await step('Inicio de sesión (maria) lleva al inicio del comisionista', async () => {
    await page.goto(WEB + '/signin'); await page.getByLabel('Correo electrónico').fill('maria@example.com'); await page.getByLabel('Contraseña').fill('password123')
    await page.getByRole('button', { name: 'Entrar' }).click(); await waitUrl(/\/comisionista$/, 8000)
  })
  await step('Contraseña incorrecta muestra el error en español', async () => {
    await page.evaluate(() => localStorage.removeItem('token')); await page.goto(WEB + '/signin')
    await page.getByLabel('Correo electrónico').fill('maria@example.com'); await page.getByLabel('Contraseña').fill('mala-clave')
    await page.getByRole('button', { name: 'Entrar' }).click(); await page.getByRole('alert').getByText('incorrectos').waitFor({ timeout: 4000 })
  })

  if (SHOTS) {
    // Capturas con los rectángulos de los hotspots para revisar la alineación
    for (const p of ['elegir-rol', 'vendedor/maria']) { await page.goto(`${WEB}/${p}?debugHotspots=1`); await sleep(800); await shot('debug-' + p.replace('/', '-')) }
  }

  await step('Sin errores de JavaScript en consola', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')) })

  await browser.close()
  console.log(`\nResultado UI: ${pass} OK, ${fail} fallidos`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('Error fatal:', e); process.exit(2) })
