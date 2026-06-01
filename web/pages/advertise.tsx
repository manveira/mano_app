import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type Package = { id: number; name: string; description: string; price: number; duration_days: number }
type Business = { id: number; name: string }

export default function Advertise() {
  const [packages, setPackages] = useState<Package[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [selectedBiz, setSelectedBiz] = useState('')
  const [buying, setBuying] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  useEffect(() => {
    if (!token) { Router.push('/signin'); return }
    Promise.all([
      fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/packages').then(r => r.json()),
      fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/me/businesses', {
        headers: { Authorization: 'Bearer ' + token },
      }).then(r => r.json()),
    ]).then(([pkgs, bizs]) => {
      setPackages(pkgs.packages || [])
      const list = bizs.businesses || []
      setBusinesses(list)
      if (list.length === 1) setSelectedBiz(String(list[0].id))
      setLoading(false)
    })
  }, [])

  async function purchase(pkg: Package) {
    if (!selectedBiz) { setMsg('Selecciona un negocio primero'); return }
    setBuying(pkg.id)
    setMsg('')
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/packages/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ business_id: Number(selectedBiz), package_id: pkg.id }),
    })
    setBuying(null)
    if (res.ok) {
      setMsg(`✅ ${pkg.name} activado por ${pkg.duration_days} días. Tu negocio aparecerá destacado en el feed.`)
    } else {
      const data = await res.json().catch(() => ({}))
      setMsg('❌ ' + (data.error || 'Error al comprar paquete'))
    }
  }

  const COLORS = ['border-gray-200', 'border-blue-400', 'border-yellow-400']
  const BADGES = ['', '⭐ Popular', '🏆 Máxima visibilidad']

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando...</p></div>

  return (
    <div className="container">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Publicidad en Mano</h1>
        <p className="text-gray-600 text-sm mb-6">
          Destaca tu negocio en el feed y aparece primero para clientes y turistas.
        </p>

        {msg && <div className={`mb-6 p-3 rounded text-sm ${msg.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{msg}</div>}

        {/* Selector de negocio */}
        {businesses.length > 1 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Negocio a promocionar</label>
            <select className="border rounded px-3 py-2 w-full max-w-xs" value={selectedBiz} onChange={e => setSelectedBiz(e.target.value)}>
              <option value="">Seleccionar negocio</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {businesses.length === 0 && (
          <div className="card bg-yellow-50 mb-6">
            <p className="text-yellow-800 text-sm">No tienes negocios aprobados. <Link href="/apply" className="font-medium underline">Solicita aprobación →</Link></p>
          </div>
        )}

        {/* Paquetes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {packages.map((pkg, i) => (
            <div key={pkg.id} className={`card border-2 ${COLORS[i] || 'border-gray-200'} relative`}>
              {BADGES[i] && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                  {BADGES[i]}
                </span>
              )}
              <h3 className="font-semibold text-lg">{pkg.name}</h3>
              <p className="text-gray-500 text-sm mt-1">{pkg.description}</p>
              <p className="text-2xl font-bold mt-3">${pkg.price.toLocaleString('es-CO')}</p>
              <p className="text-xs text-gray-400">{pkg.duration_days} días de visibilidad</p>
              <ul className="mt-3 space-y-1 text-xs text-gray-600">
                <li>✓ Aparece en el feed</li>
                {i >= 1 && <li>✓ Prioridad sobre básico</li>}
                {i >= 2 && <li>✓ Primero para turistas</li>}
              </ul>
              <button
                onClick={() => purchase(pkg)}
                disabled={buying === pkg.id || !selectedBiz || businesses.length === 0}
                className={`mt-4 w-full py-2 rounded font-medium text-sm disabled:opacity-50 transition-colors ${i === 2 ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : i === 1 ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border border-gray-300 hover:bg-gray-50 text-gray-700'}`}
              >
                {buying === pkg.id ? 'Procesando...' : 'Activar ahora'}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-gray-400 text-center">
          Los pagos se procesan vía Wompi. El anuncio se activa inmediatamente.
        </p>
      </div>
    </div>
  )
}
