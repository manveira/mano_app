// Cliente de la API de Mano. Todas las páginas nuevas pasan por aquí (headers X-Mano-*, token, errores uniformes).
// Contrato: contract/openapi.yaml. Los headers de cliente sirven para medir y versionar, NUNCA para autorizar.
import { clearToken, getToken } from './session'

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
export const CLIENT_VERSION = '0.2.0'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function deviceId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let id = localStorage.getItem('mano_device_id')
  if (!id) {
    id = (window.crypto && 'randomUUID' in window.crypto)
      ? window.crypto.randomUUID()
      : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('mano_device_id', id)
  }
  return id
}

type Opts = { method?: string; body?: unknown; auth?: boolean }

export async function api<T = any>(path: string, { method = 'GET', body, auth = true }: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Mano-Client': 'web',
    'X-Mano-Client-Version': CLIENT_VERSION,
    'X-Mano-Device-Id': deviceId(),
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? getToken() : null
  if (token) headers['Authorization'] = 'Bearer ' + token

  let res: Response
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.', 0)
  }

  let data: any = null
  try { data = await res.json() } catch { /* respuesta sin cuerpo */ }

  if (!res.ok) {
    if (res.status === 401 && token) clearToken() // token vencido o inválido
    throw new ApiError((data && data.error) || `Error ${res.status}`, res.status)
  }
  return data as T
}

/** Compatibilidad con el helper anterior (no lo usa ninguna página nueva). */
export async function apiFetch(path: string, opts: any = {}) {
  return api(path, { method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined })
}

/** Traduce los errores del backend (en inglés) a mensajes para el usuario. */
export function friendlyError(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Ocurrió un error inesperado. Inténtalo de nuevo.'
  const m = e.message.toLowerCase()
  if (e.status === 0) return e.message
  if (m.includes('email already registered')) return 'Este correo ya está registrado. Prueba iniciar sesión.'
  if (m.includes('username already taken')) return 'Ese username ya está en uso. Elige otro.'
  if (m.includes('invalid username')) return 'El username debe tener 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.'
  if (m.includes('phone number already registered')) return 'Ese número de celular ya está registrado en otra cuenta.'
  if (m.includes('invalid credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('insufficient balance')) return 'No tienes saldo suficiente para ese retiro.'
  if (m.includes('minimum withdrawal')) return 'El retiro mínimo es de $5.000.'
  if (m.includes('invalid nequi')) return 'El número de Nequi debe tener 10 dígitos.'
  if (m.includes('invalid phone')) return 'El celular debe tener entre 7 y 15 dígitos.'
  if (m.includes('invalid document')) return 'La cédula debe tener entre 5 y 15 dígitos.'
  if (m.includes('name must have')) return 'El nombre debe tener entre 2 y 80 caracteres.'
  if (m.includes('this product requires a pro plan')) return 'Este producto es exclusivo del Plan Pro.'
  if (e.status === 401) return 'Tu sesión venció. Inicia sesión de nuevo.'
  if (e.status >= 500) return 'El servidor tuvo un problema. Inténtalo en unos minutos.'
  return e.message
}
