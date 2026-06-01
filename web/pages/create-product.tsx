import { useState, useEffect } from 'react'
import Router, { useRouter } from 'next/router'

type Business = { id: number; name: string }

export default function CreateProduct() {
  const { query } = useRouter()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [businessId, setBusinessId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) { Router.push('/signin'); return }

    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/me/businesses', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(r => r.json())
      .then(data => {
        const list: Business[] = data.businesses || []
        setBusinesses(list)
        // Pre-select if coming from dashboard link
        if (query.business_id) {
          setBusinessId(String(query.business_id))
        } else if (list.length === 1) {
          setBusinessId(String(list[0].id))
        }
      })
      .catch(() => setError('No se pudieron cargar tus negocios'))
  }, [query.business_id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!businessId) { setError('Selecciona un negocio'); return }
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    setLoading(true)
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        business_id: Number(businessId),
        name,
        description,
        price: Number(price),
        stock: Number(stock),
        image_url: imageUrl,
      }),
    })
    setLoading(false)
    if (res.ok) {
      Router.push('/businesses/' + businessId)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al crear producto')
    }
  }

  return (
    <div className="container">
      <div className="max-w-lg mx-auto card">
        <h2 className="text-xl font-semibold">Crear producto</h2>
        {error && <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
        <form className="mt-4" onSubmit={submit}>
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">Negocio</label>
            {businesses.length === 0 ? (
              <p className="text-sm text-gray-500">No tienes negocios. <a href="/create-business" className="text-blue-600">Crea uno primero.</a></p>
            ) : (
              <select
                className="w-full border rounded px-2 py-1"
                value={businessId}
                onChange={e => setBusinessId(e.target.value)}
                required
              >
                <option value="">Selecciona un negocio</option>
                {businesses.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input className="w-full border rounded px-2 py-1" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="mb-3">
            <label className="block text-sm text-gray-700 mb-1">Descripción</label>
            <textarea className="w-full border rounded px-2 py-1" value={description} onChange={e => setDescription(e.target.value)} required />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Precio ($)</label>
              <input type="number" min="0.01" step="0.01" className="w-full border rounded px-2 py-1" value={price} onChange={e => setPrice(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Stock</label>
              <input type="number" min="0" className="w-full border rounded px-2 py-1" value={stock} onChange={e => setStock(e.target.value)} required />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">URL de imagen (opcional)</label>
            <input className="w-full border rounded px-2 py-1" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded w-full disabled:opacity-50"
            type="submit"
            disabled={loading || businesses.length === 0}
          >
            {loading ? 'Creando...' : 'Crear producto'}
          </button>
        </form>
      </div>
    </div>
  )
}
