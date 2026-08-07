import { useState } from 'react'
import Router, { useRouter } from 'next/router'
import Link from 'next/link'

export default function SignIn() {
  const { query } = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        const data = await res.json()
        localStorage.setItem('token', data.token)
        const role = data.user?.role || ''
        if (role === 'business_owner') Router.push('/dashboard')
        else Router.push('/profile')
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Credenciales inválidas')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-lime-300 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-black text-black text-5xl text-center mb-1">mano</h1>
        <p className="text-black/60 text-center text-sm mb-8">Entra a tu cuenta</p>

        {query.registered && (
          <div className="mb-4 p-3 bg-black text-lime-300 rounded-xl text-sm text-center font-medium">
            ¡Cuenta creada! Ya puedes entrar.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>
          )}
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <input
              type="password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-black"
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-lime-300 font-black py-4 rounded-xl text-lg disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-center text-sm text-black/50 mt-4">
            ¿No tienes cuenta?{' '}
            <Link href="/signup" className="font-bold text-black underline">Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
