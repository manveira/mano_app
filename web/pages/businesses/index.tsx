import { useEffect, useState } from 'react'
import Link from 'next/link'

type Biz = {
  id: number
  name: string
  description: string
  category: string
  location: string
  address: string
  image_url: string
}

export default function Businesses() {
  const [list, setList] = useState<Biz[]>([])
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(true)

  async function load(cat = category, loc = location) {
    setLoading(true)
    const params = new URLSearchParams()
    if (cat) params.set('category', cat)
    if (loc) params.set('location', loc)
    const qs = params.toString() ? '?' + params.toString() : ''
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/businesses' + qs)
    if (res.ok) {
      const data = await res.json()
      setList(data.businesses || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleFilter(e: React.FormEvent) {
    e.preventDefault()
    load(category, location)
  }

  function clearFilters() {
    setCategory('')
    setLocation('')
    load('', '')
  }

  return (
    <div className="container">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">Negocios</h2>

        {/* Filtros */}
        <form onSubmit={handleFilter} className="card mb-6 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Categoría</label>
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="ej: Café, Restaurante"
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Ubicación</label>
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="ej: Centro Histórico"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Filtrar</button>
          {(category || location) && (
            <button type="button" onClick={clearFilters} className="text-sm text-gray-500 underline">Limpiar</button>
          )}
        </form>

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : list.length === 0 ? (
          <div className="card text-gray-600">No se encontraron negocios.</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {list.map(b => (
              <li key={b.id} className="border rounded overflow-hidden hover:shadow-md transition-shadow">
                {b.image_url && (
                  <img src={b.image_url} alt={b.name} className="w-full h-40 object-cover" />
                )}
                <div className="p-3">
                  <Link className="font-semibold text-lg text-blue-700 hover:underline" href={'/businesses/' + b.id}>
                    {b.name}
                  </Link>
                  <p className="text-sm text-gray-600 mt-1">{b.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    {b.category && <span className="bg-gray-100 px-2 py-0.5 rounded">{b.category}</span>}
                    {b.location && <span>📍 {b.location}</span>}
                    {b.address && <span>{b.address}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
