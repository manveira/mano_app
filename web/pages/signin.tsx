import { useState } from 'react'
import Router from 'next/router'
import { useRouter } from 'next/router'
import Link from 'next/link'

export default function SignIn() {
  const { query } = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function validateEmail(email: string) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  async function submit(e:any) {
    e.preventDefault()
    setError('')

    // Client-side validation
    if (!email.trim()) {
      setError('Email es requerido')
      return
    }
    if (!validateEmail(email)) {
      setError('Email inválido')
      return
    }
    if (!password) {
      setError('Password es requerido')
      return
    }

    setLoading(true)
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/auth/signin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password })
      })
      if (res.ok) {
        const data = await res.json()
        // store token minimally
        localStorage.setItem('token', data.token)
        Router.push('/')
      } else {
        const txt = await res.text()
        try {
          const errorData = JSON.parse(txt)
          setError(errorData.error || 'Error al iniciar sesión')
        } catch {
          setError('Credenciales inválidas')
        }
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="max-w-md mx-auto card">
        <h2 className="text-xl font-semibold">Iniciar sesión</h2>
        {query.registered && (
          <div className="mt-2 p-3 bg-green-100 text-green-700 rounded text-sm">
            ¡Cuenta creada! Inicia sesión para continuar.
          </div>
        )}
        {error && <div className="mt-2 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
        <form className="mt-4" onSubmit={submit}>
          <div className="mb-3">
            <label className="block text-sm text-gray-700">Email</label>
            <input className="w-full border rounded px-2 py-1" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
          </div>
          <div className="mb-3">
            <label className="block text-sm text-gray-700">Password</label>
            <input className="w-full border rounded px-2 py-1" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded w-full disabled:opacity-50" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-600">
          ¿No tienes cuenta? <Link className="text-blue-600 font-medium" href="/signup">Regístrate aquí</Link>
        </div>
      </div>
    </div>
  )
}
