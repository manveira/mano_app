import Router from 'next/router'
import { Screen, Hotspot } from '../components/Screen'
import { useToast } from '../components/Toast'
import { COMISIONISTA } from '../lib/hotspots/comisionista'
import { api, friendlyError } from '../lib/api'
import { clearToken } from '../lib/session'
import { shareOrCopy, useAuthGuard } from '../lib/useAuthGuard'

/** comisionista.jpg: inicio del comisionista. Cada tarjeta navega a su pantalla o ejecuta su acción real. */
export default function Comisionista() {
  const { ready } = useAuthGuard(['freelancer'])
  const { toast, show } = useToast()
  if (!ready) return null
  const h = COMISIONISTA.hotspots

  async function compartirEnlace() {
    try {
      const d = await api<{ referral_url: string }>('/sell/referral-code')
      const res = await shareOrCopy({
        title: 'Únete a Mano',
        text: 'Vende productos locales y gana comisiones con Mano. Regístrate con mi enlace:',
        url: d.referral_url,
      })
      if (res === 'copied') show('Enlace copiado. Pégalo en WhatsApp, Instagram o donde quieras.', 'ok')
      else if (res === 'failed') show('No se pudo copiar. Tu enlace: ' + d.referral_url, 'error', 7000)
    } catch (e) { show(friendlyError(e), 'error') }
  }

  function cerrarSesion() {
    clearToken()
    Router.replace('/elegir-rol')
  }

  return (
    <Screen src={COMISIONISTA.src} alt={COMISIONISTA.alt}>
      <Hotspot rect={h.notificaciones.rect} label={h.notificaciones.label} round
        onClick={() => show('No tienes notificaciones nuevas.', 'info')} />
      <Hotspot rect={h.ventas.rect} label={h.ventas.label} href="/sell" />
      <Hotspot rect={h.comisiones.rect} label={h.comisiones.label} href="/comisiones" />
      <Hotspot rect={h.buscar.rect} label={h.buscar.label} href="/buscar-negocios" />
      <Hotspot rect={h.misVentas.rect} label={h.misVentas.label} href="/sell" />
      <Hotspot rect={h.misProductos.rect} label={h.misProductos.label} href="/catalogo" />
      <Hotspot rect={h.miPerfil.rect} label={h.miPerfil.label} href="/profile" />
      <Hotspot rect={h.compartir.rect} label={h.compartir.label} onClick={compartirEnlace} />
      <Hotspot rect={h.cerrarSesion.rect} label={h.cerrarSesion.label} onClick={cerrarSesion} round />
      {toast}
    </Screen>
  )
}
