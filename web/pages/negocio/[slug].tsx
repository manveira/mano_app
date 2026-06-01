import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Product = { id: number; name: string; description: string; price: number; stock: number; image_url: string; commission_rate: number; business_id: number }
type Business = { id: number; name: string; description: string; category: string; location: string; address: string; image_url: string; is_featured: boolean }
type Stats = { total_orders: number; total_revenue: number }

export default function BusinessProfile() {
  const router = useRouter()
  const { slug } = router.query
  const [business, setBusiness] = useState<Business | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [added, setAdded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/negocio/' + slug)
      .then(r => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then(data => {
        setBusiness(data.business)
        setProducts(data.products || [])
        setStats(data.stats)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

  function addToCart(p: Product) {
    const raw = localStorage.getItem('mano_cart')
    let cart: any[] = []
    try { cart = raw ? JSON.parse(raw) : [] } catch { cart = [] }
    const existing = cart.find((i: any) => i.id === p.id)
    if (existing) { existing.qty += 1 } else {
      cart.push({ id: p.id, name: p.name, price: p.price, qty: 1, business_id: p.business_id })
    }
    localStorage.setItem('mano_cart', JSON.stringify(cart))
    setAdded(p.id)
    setTimeout(() => setAdded(null), 1500)
  }

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando...</p></div>
  if (!business) return (
    <div className="container">
      <div className="max-w-lg mx-auto card text-center mt-8">
        <p className="text-gray-500">Negocio no encontrado.</p>
        <Link href="/businesses" className="mt-3 inline-block text-blue-600 hover:underline text-sm">Ver todos los negocios</Link>
      </div>
    </div>
  )

  return (
    <div className="container">
      <div className="max-w-4xl mx-auto">
        <Link href="/businesses" className="text-sm text-blue-600 hover:underline">← Todos los negocios</Link>

        {/* Header */}
        <div className="mt-4 card">
          {business.image_url && (
            <img src={business.image_url} alt={business.name} className="w-full h-52 object-cover rounded mb-4" />
          )}
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">{business.name}</h1>
              <p className="text-gray-600 mt-1">{business.description}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-500">
                {business.category && <span className="bg-gray-100 px-2 py-0.5 rounded">{business.category}</span>}
                {business.location && <span>📍 {business.location}</span>}
                {business.address && <span>🏠 {business.address}</span>}
                {business.is_featured && <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">⭐ Destacado</span>}
              </div>
            </div>
            {stats && (
              <div className="text-right text-sm text-gray-500">
                <p><span className="font-semibold text-gray-700">{stats.total_orders}</span> ventas</p>
              </div>
            )}
          </div>
        </div>

        {/* Productos */}
        <h2 className="mt-6 text-xl font-semibold mb-3">Productos ({products.length})</h2>
        {products.length === 0 ? (
          <p className="text-gray-500">Este negocio no tiene productos disponibles.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map(p => (
              <div key={p.id} className="border rounded overflow-hidden">
                {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-36 object-cover" />}
                <div className="p-3">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-blue-700">${p.price.toLocaleString('es-CO')}</span>
                      <span className={`ml-2 text-xs ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {p.stock > 0 ? `${p.stock} disponibles` : 'Sin stock'}
                      </span>
                    </div>
                    <button
                      disabled={p.stock === 0}
                      onClick={() => addToCart(p)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${added === p.id ? 'bg-green-500 text-white' : p.stock === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      {added === p.id ? '✓ Añadido' : 'Añadir'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <Link href="/cart" className="text-blue-600 hover:underline text-sm">Ver carrito →</Link>
        </div>
      </div>
    </div>
  )
}
