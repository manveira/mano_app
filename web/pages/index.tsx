import { useEffect } from 'react'
import Router from 'next/router'
import { Screen } from '../components/Screen'
import { INICIO } from '../lib/hotspots/inicio'
import { decodeToken, homeForRole } from '../lib/session'

/** INICIO.jpg: splash con el logo. Después de un momento entra solo: con sesión va a su inicio, sin sesión a "¿Qué mano eliges?". */
export default function Home() {
  useEffect(() => {
    // Precarga la pantalla siguiente ya: las imágenes son enormes (4500×8000) y el navegador tarda en decodificarlas,
    // así que si esperáramos al final del splash para pedir el JS de la ruta, la navegación se retrasaba ~10 s.
    Router.prefetch('/elegir-rol')
    Router.prefetch('/comisionista')
    const t = setTimeout(() => {
      const p = decodeToken()
      Router.replace(p ? homeForRole(p.role) : '/elegir-rol')
    }, INICIO.durationMs)
    return () => clearTimeout(t)
  }, [])

  return <Screen src={INICIO.src} alt={INICIO.alt} bg={INICIO.bg} />
}
