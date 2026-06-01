import { useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

export default function CreateBusiness() {
  const [form, setForm] = useState({
    name: '', description: '', category: '', location: '',
    address: '', latitude: '', longitude: '', image_url: '',
    default_commission_rate: '0.15', monthly_limit: '0',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const token = localStorage.getItem('token')
    if (!token) { Router.push('/signin'); return }

    const rate = parseFloat(form.default_commission_rate)
    if (rate < 0.10 || rate > 0.40) {
      setError('La comisión debe estar entre 10% y 40%')
      return
    }

    setLoading(true)
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        category: form.category,
        location: form.location,
        address: form.address,
        latitude: parseFloat(form.latitude) || 0,
        longitude: parseFloat(form.longitude) || 0,
        image_url: form.image_url,
        default_commission_rate: rate,
        monthly_limit: parseInt(form.monthly_limit) || 0,
      }),
    })
    setLoading(false)
    if (res.ok) {
      Router.push('/dashboard')
    } else {
      const data = await res.json().catch(() => ({}))
      // Si el negocio no está aprobado, redirigir a /apply
      if (data.error?.includes('not approved')) {
        Router.push('/apply')
        return
      }
      setError(data.error || 'Error al crear negocio')
    }
  }

  return (
    <div className="container">
      <div className="max-w-lg mx-auto card">
        <h2 className="text-xl font-semibold mb-1">Crear negocio</h2>
        <p className="text-sm text-gray-500 mb-4">
          ¿Primera vez? <Link href="/apply" className="text-blue-600 hover:underline">Solicita aprobación primero →</Link>
        </p>

        {error && <div className="mb-3 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre del negocio *</label>
            <input className="w-full border rounded px-2 py-1.5" value={form.name} onChange={set('name')} required disabled={loading} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Descripción *</label>
            <textarea className="w-full border rounded px-2 py-1.5 resize-none" rows={2} value={form.description} onChange={set('description')} required disabled={loading} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Categoría *</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.category} onChange={set('category')} required disabled={loading}>
                <option value="">Seleccionar</option>
                {['Café', 'Restaurante', 'Artesanías', 'Ropa', 'Hotel', 'Turismo', 'Servicios', 'Otro'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Ciudad/Barrio *</label>
              <input className="w-full border rounded px-2 py-1.5" placeholder="ej: Tumaco" value={form.location} onChange={set('location')} required disabled={loading} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Dirección</label>
            <input className="w-full border rounded px-2 py-1.5" placeholder="ej: Calle 10 #5-20" value={form.address} onChange={set('address')} disabled={loading} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Latitud</label>
              <input type="number" step="any" className="w-full border rounded px-2 py-1.5" placeholder="1.7989" value={form.latitude} onChange={set('latitude')} disabled={loading} />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Longitud</label>
              <input type="number" step="any" className="w-full border rounded px-2 py-1.5" placeholder="-78.7628" value={form.longitude} onChange={set('longitude')} disabled={loading} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">URL de imagen</label>
            <input type="url" className="w-full border rounded px-2 py-1.5" placeholder="https://..." value={form.image_url} onChange={set('image_url')} disabled={loading} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Comisión para comisionistas: <strong>{(parseFloat(form.default_commission_rate || '0') * 100).toFixed(0)}%</strong>
            </label>
            <input type="range" min="0.10" max="0.40" step="0.01" className="w-full"
              value={form.default_commission_rate} onChange={set('default_commission_rate')} disabled={loading} />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>10% (mínimo)</span><span>25% (recomendado)</span><span>40% (máximo)</span>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Límite mensual de unidades <span className="text-gray-400">(0 = sin límite)</span></label>
            <input type="number" min="0" className="w-full border rounded px-2 py-1.5"
              placeholder="ej: 50" value={form.monthly_limit} onChange={set('monthly_limit')} disabled={loading} />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded font-medium disabled:opacity-50 hover:bg-blue-700 mt-2">
            {loading ? 'Creando...' : 'Crear negocio'}
          </button>
        </form>
      </div>
    </div>
  )
}
