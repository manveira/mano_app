import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Product = {
  id: number
  name: string
  description: string
  price: number
  stock: number
  image_url: string
  business_id: number
}

type Business = {
  id: number
  name: string
  description: string
  category: string
  location: string
  address: string
  image_url: string
}

export default function BusinessDetail() {
  const router = useRouter()
  const { id } = router.query
  const [business, setBusiness] = useState<Business | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [added, setAdded] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/businesses/' + id)
      if (res.ok) {
        const data = await res.json()
        setBusiness(data.business)
        setProducts(data.products || [])
      }
    }
    load()
  }, [id])

  function addToCart(p: Product) {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('mano_cart') : null
    let cart: any[] = []
    if (raw) {
      try { cart = JSON.parse(raw) } catch { cart = [] }
    }
    // Check if product already in cart — increment qty
    const existing = cart.find((i: any) => i.id === p.id)
    if (existing) {
      existing.qty += 1
    } else {
      cart.push({ id: p.id, name: p.name, price: p.price, qty: 1, business_id: p.business_id })
    }
    localStorage.setItem('mano_cart', JSON.stringify(cart))
    setAdded(p.id)
    setTimeout(() => setAdded(null), 1500)
  }

  if (!business) return <div className="container"><p className="text-gray-500 mt-8">Cargando...</p></div>

  return (
    <div className="container">
      <div className="max-w-4xl mx-auto">
        <Link href="/businesses" className="text-sm text-blue-600 hover:underline">← Volver a negocios</Link>

        {/* Business header */}
        <div className="mt-4 card">
          {business.image_url && (
            <img src={business.image_url} alt={business.name} className="w-full h-52 object-cover rounded mb-4" />
          )}
          <h2 className="text-2xl font-bold">{business.name}</h2>
          <p className="text-gray-600 mt-1">{business.description}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
            {business.category && <span className="bg-gray-100 px-2 py-0.5 rounded">{business.category}</span>}
            {business.location && <span>📍 {business.location}</span>}
            {business.address && <span>🏠 {business.address}</span>}
          </div>
        </div>

        {/* Products */}
        <h3 className="mt-6 text-xl font-semibold mb-3">Productos</h3>
        {products.length === 0 ? (
          <p className="text-gray-500">Este negocio no tiene productos aún.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((p) => (
              <li key={p.id} className="border rounded overflow-hidden">
                {p.image_url && (
                  <img src={p.image_url} alt={p.name} className="w-full h-36 object-cover" />
                )}
                <div className="p-3">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-gray-600 mt-0.5">{p.description}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-blue-700">${p.price.toFixed(2)}</span>
                      <span className={`ml-2 text-xs ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {p.stock > 0 ? `${p.stock} disponibles` : 'Sin stock'}
                      </span>
                    </div>
                    <button
                      disabled={p.stock === 0}
                      onClick={() => addToCart(p)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        added === p.id
                          ? 'bg-green-500 text-white'
                          : p.stock === 0
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {added === p.id ? '✓ Añadido' : 'Añadir'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <Link href="/cart" className="text-blue-600 hover:underline text-sm">Ver carrito →</Link>
        </div>
      </div>
    </div>
  )
}
