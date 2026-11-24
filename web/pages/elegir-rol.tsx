import { useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import Link from 'next/link'
import { Screen, Hotspot } from '../components/Screen'
import { ELEGIR_ROL } from '../lib/hotspots/elegir-rol'
import { BRAND_GREEN } from '../lib/hotspots/types'
import { decodeToken, homeForRole, SIGNUP_REF_KEY, SIGNUP_ROLE_KEY } from '../lib/session'

/** QUE MANO ELIGES.jpg: el usuario elige su rol y sigue al registro. */
export default function ElegirRol() {
  const { query, isReady } = useRouter()

  useEffect(() => {
    const p = decodeToken()
    if (p) { Router.replace(homeForRole(p.role)); return }
    // Enlace de invitación (?ref=CODIGO): se guarda para usarlo en el registro
    if (isReady && typeof query.ref === 'string' && query.ref) sessionStorage.setItem(SIGNUP_REF_KEY, query.ref)
  }, [isReady, query.ref])

  function pick(role: string) {
    sessionStorage.setItem(SIGNUP_ROLE_KEY, role)
    Router.push('/registro')
  }

  const h = ELEGIR_ROL.hotspots
  return (
    <Screen
      src={ELEGIR_ROL.src}
      alt={ELEGIR_ROL.alt}
      bg={BRAND_GREEN}
      footer={
        <p className="py-4 text-sm text-black/70">
          ¿Ya tienes cuenta? <Link href="/signin" className="font-bold text-black underline">Inicia sesión</Link>
        </p>
      }
    >
      {Object.values(h).map(s => (
        <Hotspot key={s.role} rect={s.rect} label={s.label} onClick={() => pick(s.role)} />
      ))}
    </Screen>
  )
}
