// Sesión del cliente web: token JWT en localStorage + helpers de rol.
// El rol que se lee aquí SOLO sirve para decidir a qué pantalla ir. La autorización real es del backend (JWT).

export type Role = 'business_owner' | 'freelancer' | 'courier' | 'service_provider' | 'customer' | 'admin'

const TOKEN_KEY = 'token' // misma clave que usan las páginas legacy

export type TokenPayload = { user_id: number; role: Role; email: string; exp: number }

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
}

export function decodeToken(token: string | null = getToken()): TokenPayload | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const bin = atob(b64)
    const json = decodeURIComponent(
      Array.from(bin).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    )
    const p = JSON.parse(json) as TokenPayload
    if (!p.exp || p.exp * 1000 < Date.now()) return null // expirado
    return p
  } catch {
    return null
  }
}

export function currentRole(): Role | null {
  return decodeToken()?.role ?? null
}

/** Pantalla de inicio de cada rol después de iniciar sesión. */
export function homeForRole(role: Role | string | null | undefined): string {
  switch (role) {
    case 'freelancer': return '/comisionista'
    case 'business_owner': return '/dashboard'
    case 'courier': return '/courier'
    case 'service_provider': return '/profile'
    case 'admin': return '/admin'
    case 'customer': return '/businesses'
    default: return '/elegir-rol'
  }
}

// ── Datos del flujo de registro (sobreviven a la navegación entre pantallas) ──
export const SIGNUP_ROLE_KEY = 'mano_signup_role'
export const SIGNUP_REF_KEY = 'mano_signup_ref'
