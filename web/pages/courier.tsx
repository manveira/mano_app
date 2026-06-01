import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type OrderItem = { id: number; quantity: number; unit_price: number; product?: { name: string } }
type Business = { id: number; name: string; address: string }
type Order = { id: number; total_amount: number; business_id: number; business: Business; created_at: string; items: OrderItem[] }

export default function Courier() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  useEffect(() => {
    if (!token) { Router.push('/signin'); return }
    loadOrders()
  }, [])

  async function loadOrders() {
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/orders/courier', {
      headers: { Authorization: 'Bearer ' + token },
    })
    if (res.ok) {
      const data = await res.json()
      setOrders(data.orders || [])
    }
    setLoading(false)
  }

  async function acceptOrder(orderId: number) {
    setAccepting(orderId)
    // Crear delivery asignado a este courier
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ order_id: orderId, eta: new Date(Date.now() + 45 * 60000).toISOString() }),
    })
    setAccepting(null)
    if (res.ok) {
      const data = await res.json()
      setMsg(`✅ Pedido #${orderId} aceptado`)
      setOrders(prev => prev.filter(o => o.id !== orderId))
      Router.push(`/delivery/${data.id}`)
    } else {
      setMsg('Error al aceptar el pedido')
    }
  }

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando pedidos...</p></div>

  return (
    <div className="container">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Pedidos disponibles</h1>
        <p className="text-gray-500 text-sm mb-6">Acepta un pedido para comenzar la entrega.</p>

        {msg && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm">{msg}</div>}

        {orders.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">No hay pedidos disponibles en este momento.</p>
            <button onClick={loadOrders} className="mt-3 text-blue-600 text-sm hover:underline">Actualizar</button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">Pedido #{order.id}</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      📍 {order.business?.name || `Negocio #${order.business_id}`}
                      {order.business?.address && ` — ${order.business.address}`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(order.created_at).toLocaleString('es-CO')}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-green-700">${order.total_amount?.toLocaleString('es-CO')}</p>
                </div>

                <div className="border-t pt-2 mb-3">
                  <p className="text-xs text-gray-500 mb-1">Artículos:</p>
                  {order.items?.map(item => (
                    <p key={item.id} className="text-sm text-gray-600">
                      {item.product?.name || `Producto`} × {item.quantity}
                    </p>
                  ))}
                </div>

                <button
                  onClick={() => acceptOrder(order.id)}
                  disabled={accepting === order.id}
                  className="w-full bg-green-600 text-white py-2 rounded font-medium disabled:opacity-50 hover:bg-green-700"
                >
                  {accepting === order.id ? 'Aceptando...' : '✓ Aceptar pedido'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <Link href="/profile" className="text-sm text-blue-600 hover:underline">← Mi perfil</Link>
        </div>
      </div>
    </div>
  )
}
