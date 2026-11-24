import { useEffect, useState } from 'react'
import Router, { useRouter } from 'next/router'
import Link from 'next/link'
import { api, friendlyError } from '../lib/api'
import { decodeToken, homeForRole, setToken, Role } from '../lib/session'

export default function SignIn() {
  const { query } = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const p = decodeToken()
    if (p) Router.replace(homeForRole(p.role))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api<{ token: string; user: { role: Role } }>('/auth/signin', {
        method: 'POST', auth: false, body: { email: email.trim().toLowerCase(), password },
      })
      setToken(data.token)
      Router.replace(homeForRole(data.user?.role))
    } catch (err) {
      setError(friendlyError(err))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#91e631] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-black text-black text-5xl text-center mb-1">mano</h1>
        <p className="text-black/60 text-center text-sm mb-8">Entra a tu cuenta</p>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && <div role="alert" className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email" autoComplete="email" aria-label="Correo electrónico"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black"
              placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading}
            />
            <input
              type="password" autoComplete="current-password" aria-label="Contraseña"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black"
              placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading}
            />
            <button type="submit" disabled={loading}
              className="w-full bg-black text-[#91e631] font-black py-4 rounded-xl text-lg disabled:opacity-50">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-center text-sm text-black/50 mt-4">
            ¿No tienes cuenta?{' '}
            <Link href={query.ref ? `/elegir-rol?ref=${encodeURIComponent(String(query.ref))}` : '/elegir-rol'} className="font-bold text-black underline">Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
