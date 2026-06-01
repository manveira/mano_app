import { useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

export default function SignUp() {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'customer',
    phone: '', document_id: '', nequi_number: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('Password debe tener mínimo 8 caracteres'); return }

    setLoading(true)
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      Router.push('/signin?registered=1')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al registrarse')
    }
  }

  const isFreelancer = form.role === 'freelancer'

  return (
    <div className="container">
      <div className="max-w-md mx-auto card">
        <h2 className="text-xl font-semibold">Crear cuenta</h2>
        {error && <div className="mt-2 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre completo</label>
            <input className="w-full border rounded px-2 py-1" value={form.name} onChange={set('name')} required disabled={loading} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input type="email" className="w-full border rounded px-2 py-1" value={form.email} onChange={set('email')} required disabled={loading} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Password (mínimo 8 caracteres)</label>
            <input type="password" className="w-full border rounded px-2 py-1" value={form.password} onChange={set('password')} required disabled={loading} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Tipo de cuenta</label>
            <select className="w-full border rounded px-2 py-1" value={form.role} onChange={set('role')} disabled={loading}>
              <option value="customer">Cliente</option>
              <option value="business_owner">Dueño de negocio</option>
              <option value="freelancer">Comisionista</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Número de celular</label>
            <input type="tel" placeholder="3XXXXXXXXX" className="w-full border rounded px-2 py-1" value={form.phone} onChange={set('phone')} disabled={loading} />
            <p className="text-xs text-gray-400 mt-0.5">Un celular = una cuenta (anti-fraude)</p>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Número de cédula</label>
            <input type="text" placeholder="Ej: 12345678" className="w-full border rounded px-2 py-1" value={form.document_id} onChange={set('document_id')} disabled={loading} />
          </div>
          {(isFreelancer || form.role === 'business_owner') && (
            <div>
              <label className="block text-sm text-gray-700 mb-1">Número Nequi (para recibir pagos)</label>
              <input type="tel" placeholder="3XXXXXXXXX" className="w-full border rounded px-2 py-1" value={form.nequi_number} onChange={set('nequi_number')} disabled={loading} />
            </div>
          )}
          <button className="bg-blue-600 text-white px-4 py-2 rounded w-full disabled:opacity-50 mt-2" type="submit" disabled={loading}>
            {loading ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-600">
          ¿Ya tienes cuenta? <Link className="text-blue-600 font-medium" href="/signin">Inicia sesión</Link>
        </div>
      </div>
    </div>
  )
}
