import Router from 'next/router'
import { useEffect, useState } from 'react'
import { decodeToken, homeForRole, Role } from './session'

/**
 * Protege una pantalla: sin sesión válida manda a /signin; con un rol no permitido manda al inicio de su rol.
 * `ready` es true cuando ya se verificó (evita parpadeos). Es solo UX: la seguridad real la aplica el backend.
 */
export function useAuthGuard(allowed?: Role[]) {
  const [state, setState] = useState<{ ready: boolean; role: Role | null }>({ ready: false, role: null })

  useEffect(() => {
    const p = decodeToken()
    if (!p) { Router.replace('/signin'); return }
    if (allowed && !allowed.includes(p.role)) { Router.replace(homeForRole(p.role)); return }
    setState({ ready: true, role: p.role })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}

/** Comparte un enlace con la hoja nativa (móvil) o lo copia al portapapeles. Devuelve qué hizo. */
export async function shareOrCopy(data: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share(data)
      return 'shared'
    }
  } catch (e: any) {
    if (e && e.name === 'AbortError') return 'shared' // el usuario cerró la hoja de compartir
  }
  try {
    await navigator.clipboard.writeText(data.url)
    return 'copied'
  } catch {
    // Fallback para contextos sin Clipboard API
    try {
      const ta = document.createElement('textarea')
      ta.value = data.url
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok ? 'copied' : 'failed'
    } catch { return 'failed' }
  }
}
