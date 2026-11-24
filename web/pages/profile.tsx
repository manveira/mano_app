import Router from 'next/router'
import { Screen, Hotspot } from '../components/Screen'
import { useToast } from '../components/Toast'
import { PERFIL } from '../lib/hotspots/perfil'
import { homeForRole } from '../lib/session'
import { useAuthGuard } from '../lib/useAuthGuard'

/** PERFIL.jpg: "Mi perfil" (sirve a todos los roles). */
export default function Profile() {
  const { ready, role } = useAuthGuard()
  const { toast, show } = useToast()
  if (!ready) return null
  const h = PERFIL.hotspots
  return (
    <Screen src={PERFIL.src} alt={PERFIL.alt}>
      <Hotspot rect={h.volver.rect} label={h.volver.label} onClick={() => Router.push(homeForRole(role))} />
      <Hotspot rect={h.avatar.rect} label={h.avatar.label} round
        onClick={() => show('Subir tu foto de perfil estará disponible cuando se active el servicio de imágenes.', 'info', 4500)} />
      <Hotspot rect={h.ajustes.rect} label={h.ajustes.label} href="/ajustes" />
      <Hotspot rect={h.ayuda.rect} label={h.ayuda.label} href="/ayuda" />
      {toast}
    </Screen>
  )
}
