import { useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

export default function Apply() {
  const [form, setForm] = useState({
    business_name: '', category: '', description: '',
    nequi_number: '', document_image_url: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const token = localStorage.getItem('token')
    if (!token) { Router.push('/signin'); return }

    setLoading(true)
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/businesses/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      setSuccess(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al enviar la solicitud')
    }
  }

  if (success) {
    return (
      <div className="container">
        <div className="max-w-md mx-auto card text-center mt-8">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-xl font-semibold">¡Solicitud enviada!</h2>
          <p className="text-gray-600 mt-2">Revisaremos tu información en 24–48 horas. Te notificaremos cuando tu negocio esté aprobado.</p>
          <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline text-sm">Volver al inicio</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-2">Registra tu negocio en Mano</h1>
        <p className="text-gray-600 mb-6 text-sm">
          Conecta tu negocio con comisionistas que venden por ti. Solo pagas cuando alguien vende.
        </p>

        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del negocio *</label>
            <input className="w-full border rounded px-3 py-2" value={form.business_name} onChange={set('business_name')} required disabled={loading} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
            <select className="w-full border rounded px-3 py-2" value={form.category} onChange={set('category')} required disabled={loading}>
              <option value="">Selecciona una categoría</option>
              {['Café', 'Restaurante', 'Artesanías', 'Ropa', 'Hotel', 'Turismo', 'Servicios', 'Otro'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
            <textarea
              className="w-full border rounded px-3 py-2 resize-none"
              rows={3}
              placeholder="¿Qué vendes? ¿Qué te hace especial?"
              value={form.description}
              onChange={set('description')}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número Nequi para recibir pagos *</label>
            <input type="tel" placeholder="3XXXXXXXXX" className="w-full border rounded px-3 py-2" value={form.nequi_number} onChange={set('nequi_number')} required disabled={loading} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL de foto del RUT o cédula</label>
            <input type="url" placeholder="https://..." className="w-full border rounded px-3 py-2" value={form.document_image_url} onChange={set('document_image_url')} disabled={loading} />
            <p className="text-xs text-gray-400 mt-1">Sube la foto a Google Drive, Dropbox o similar y pega el link aquí.</p>
          </div>

          <div className="bg-blue-50 rounded p-3 text-sm text-blue-700">
            <strong>¿Cómo funciona?</strong>
            <ul className="mt-1 space-y-1 list-disc list-inside text-xs">
              <li>Revisamos tu solicitud en 24–48 horas</li>
              <li>Una vez aprobado, subes tus productos</li>
              <li>Los comisionistas los venden por ti</li>
              <li>Mano cobra solo el 4% de cada venta</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded font-medium disabled:opacity-50 hover:bg-blue-700"
          >
            {loading ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta? <Link href="/signin" className="text-blue-600 hover:underline">Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}
