import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type CartItem = { id: number; name: string; price: number; qty: number; business_id: number }

export default function Cart() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('mano_cart') : null
    if (raw) {
      try { setCart(JSON.parse(raw)) } catch { setCart([]) }
    }
  }, [])

  function save(next: CartItem[]) {
    setCart(next)
    localStorage.setItem('mano_cart', JSON.stringify(next))
  }

  function remove(i: number) {
    const next = [...cart]
    next.splice(i, 1)
    save(next)
  }

  function changeQty(i: number, delta: number) {
    const next = [...cart]
    next[i].qty = Math.max(1, next[i].qty + delta)
    save(next)
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0)

  // Detect mixed-business cart
  const businessIds = [...new Set(cart.map(i => i.business_id))]
  const mixedBusinesses = businessIds.length > 1

  async function createOrder() {
    if (cart.length === 0) return
    if (mixedBusinesses) {
      setError('Tu carrito tiene productos de distintos negocios. Solo puedes pedir de un negocio a la vez. Elimina los productos del otro negocio.')
      return
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) { Router.push('/signin'); return }

    setLoading(true)
    setError('')
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        business_id: cart[0].business_id,
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty })),
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al crear la orden')
      return
    }
    const order = await res.json()
    localStorage.removeItem('mano_cart')
    Router.push('/checkout?order_id=' + order.id)
  }

  return (
    <div className="container">
      <div className="max-w-2xl mx-auto card">
        <h2 className="text-xl font-semibold mb-4">Carrito</h2>

        {mixedBusinesses && (
          <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded text-sm">
            ⚠️ Tienes productos de <strong>{businessIds.length} negocios distintos</strong>. Solo puedes hacer un pedido por negocio a la vez.
          </div>
        )}

        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

        {cart.length === 0 ? (
          <div>
            <p className="text-gray-600">Carrito vacío.</p>
            <Link href="/businesses" className="mt-3 inline-block text-blue-600 hover:underline text-sm">Ir a comprar →</Link>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {cart.map((p, i) => (
                <li key={i} className="flex items-center justify-between border rounded p-3">
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-gray-500">${p.price.toFixed(2)} c/u</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(i, -1)} className="w-6 h-6 border rounded text-sm">−</button>
                    <span className="w-6 text-center text-sm">{p.qty}</span>
                    <button onClick={() => changeQty(i, 1)} className="w-6 h-6 border rounded text-sm">+</button>
                    <span className="w-16 text-right text-sm font-medium">${(p.price * p.qty).toFixed(2)}</span>
                    <button onClick={() => remove(i)} className="text-red-500 text-sm ml-2">✕</button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex justify-between items-center border-t pt-4">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold">${total.toFixed(2)}</span>
            </div>

            <button
              onClick={createOrder}
              disabled={loading || mixedBusinesses}
              className="mt-4 w-full bg-blue-600 text-white py-2 rounded font-medium disabled:opacity-50 hover:bg-blue-700"
            >
              {loading ? 'Creando pedido...' : 'Crear pedido y pagar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
