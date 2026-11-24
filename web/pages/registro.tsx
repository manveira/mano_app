import { useEffect, useState } from 'react'
import Router from 'next/router'
import { Screen, Hotspot, HotspotInput, OverlayMessage } from '../components/Screen'
import { useToast } from '../components/Toast'
import { REGISTRO } from '../lib/hotspots/registro'
import { api, friendlyError } from '../lib/api'
import { decodeToken, homeForRole, setToken, SIGNUP_REF_KEY, SIGNUP_ROLE_KEY, Role } from '../lib/session'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/

/** registro.jpg: correo, username, contraseña y confirmación. Crea la cuenta, inicia sesión y entra al inicio de su rol. */
export default function Registro() {
  const [role, setRole] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => {
    const p = decodeToken()
    if (p) { Router.replace(homeForRole(p.role)); return }
    const r = sessionStorage.getItem(SIGNUP_ROLE_KEY)
    if (!r) { Router.replace('/elegir-rol'); return }   // sin rol elegido no hay registro
    setRole(r)
  }, [])

  async function submit() {
    if (loading) return
    setError('')
    const em = email.trim().toLowerCase()
    const un = username.trim().toLowerCase()
    if (!EMAIL_RE.test(em)) return setError('Escribe un correo válido.')
    if (!USERNAME_RE.test(un)) return setError('El username debe tener 3 a 30 caracteres: minúsculas, números, punto, guion o guion bajo.')
    if (password.length < 8) return setError('La contraseña debe tener mínimo 8 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    if (!role) return Router.replace('/elegir-rol')

    setLoading(true)
    try {
      const ref = sessionStorage.getItem(SIGNUP_REF_KEY)
      await api('/auth/signup', {
        method: 'POST', auth: false,
        body: { name: un, username: un, email: em, password, role, ...(ref ? { referral_code: ref } : {}) },
      })
      const login = await api<{ token: string; user: { role: Role } }>('/auth/signin', {
        method: 'POST', auth: false, body: { email: em, password },
      })
      setToken(login.token)
      sessionStorage.removeItem(SIGNUP_ROLE_KEY)
      sessionStorage.removeItem(SIGNUP_REF_KEY)
      Router.replace(homeForRole(login.user.role))
    } catch (e) {
      setError(friendlyError(e))
      setLoading(false)
    }
  }

  function social(nombre: string) {
    show(`El acceso con ${nombre} necesita las credenciales de ${nombre} (aún no configuradas). Por ahora regístrate con tu correo.`, 'info', 5000)
  }

  const I = REGISTRO.inputs
  const common = { fontCqw: REGISTRO.inputFontCqw, paddingLeftCqw: REGISTRO.inputPaddingLeftCqw, disabled: loading, onEnter: submit }
  if (!role) return null

  return (
    <Screen src={REGISTRO.src} alt={REGISTRO.alt}>
      {error && <OverlayMessage rect={REGISTRO.messageArea}>{error}</OverlayMessage>}

      <HotspotInput {...common} rect={I.email.rect} label={I.email.label} type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} />
      <HotspotInput {...common} rect={I.username.rect} label={I.username.label} autoComplete="username" value={username} onChange={setUsername} maxLength={30} />
      <HotspotInput {...common} rect={I.password.rect} label={I.password.label} type="password" autoComplete="new-password" value={password} onChange={setPassword} />
      <HotspotInput {...common} rect={I.confirm.rect} label={I.confirm.label} type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />

      <Hotspot rect={REGISTRO.submit.rect} label={loading ? 'Creando cuenta…' : REGISTRO.submit.label} onClick={submit} disabled={loading} round />
      {loading && (
        <div aria-hidden style={{
          position: 'absolute', left: `${REGISTRO.submit.rect.left}%`, top: `${REGISTRO.submit.rect.top}%`,
          width: `${REGISTRO.submit.rect.width}%`, height: `${REGISTRO.submit.rect.height}%`,
          background: '#91e631', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '4cqw', color: '#000', pointerEvents: 'none',
        }}>Creando cuenta…</div>
      )}

      <Hotspot rect={REGISTRO.facebook.rect} label={REGISTRO.facebook.label} onClick={() => social('Facebook')} round />
      <Hotspot rect={REGISTRO.apple.rect} label={REGISTRO.apple.label} onClick={() => social('Apple')} round />
      <Hotspot rect={REGISTRO.google.rect} label={REGISTRO.google.label} onClick={() => social('Google')} round />
      <Hotspot rect={REGISTRO.login.rect} label={REGISTRO.login.label} href="/signin" />
      {toast}
    </Screen>
  )
}
