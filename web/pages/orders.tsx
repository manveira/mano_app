import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type OrderItem = {
  id: number
  product_id: number
  product?: { id: number; name: string; image_url: string }
  quantity: number
  unit_price: number
}

type Order = {
  id: number
  business_id: number
  customer_id: number
  total_amount: number
  commission: number
  status: string
  payment_status: string
  payment_intent_id?: string
  created_at: string
  items: OrderItem[]
  delivery?: { id: number; status: string }
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchOrders() {
      const token = localStorage.getItem('token')
      if (!token) {
        Router.push('/signin')
        return
      }

      try {
        const res = await fetch(
          (process.env.NEXT_PUBLIC_API_URL || '') + '/orders',
          {
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json',
            },
          }
        )

        if (res.ok) {
          const data = await res.json()
          setOrders(data.orders || [])
        } else {
          if (res.status === 401) Router.push('/signin')
          else setError('Error al cargar órdenes')
        }
      } catch (err) {
        setError('Error de conexión')
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [])

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending_payment: 'Pago pendiente',
      pending: 'Pendiente',
      paid: 'Pagado',
      dispatched: 'Despachado',
      in_transit: 'En camino',
      delivered: 'Entregado',
      completed: 'Completado',
      disputed: 'En disputa',
      cancelled: 'Cancelado',
      payment_failed: 'Pago fallido',
    }
    return labels[status] || status
  }

  function getStatusBadgeColor(status: string): string {
    switch (status) {
      case 'completed': case 'delivered': return 'bg-green-100 text-green-800'
      case 'paid': case 'dispatched': case 'in_transit': return 'bg-blue-100 text-blue-800'
      case 'pending_payment': case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'disputed': return 'bg-orange-100 text-orange-800'
      case 'cancelled': case 'payment_failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  function getPaymentStatusBadgeColor(status: string): string {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'failed': case 'refunded': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  function getPaymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      paid: 'Pagado', pending: 'Sin pagar', failed: 'Falló', refunded: 'Reembolsado'
    }
    return labels[status] || status
  }

  if (loading) {
    return (
      <div className="container">
        <div className="max-w-4xl mx-auto card">
          <p className="text-gray-600">Cargando órdenes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Mis Órdenes</h1>

        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>}

        {orders.length === 0 ? (
          <div className="card">
            <p className="text-gray-600 mb-4">No tienes órdenes aún.</p>
            <Link href="/businesses" className="text-blue-600 hover:text-blue-800 font-medium">
              Ir a comprar
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="card">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold">Orden #{order.id}</h3>
                    <p className="text-sm text-gray-600">
                      {new Date(order.created_at).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${order.total_amount.toFixed(2)}</p>
                    <div className="mt-2 flex gap-2 justify-end flex-wrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getPaymentStatusBadgeColor(order.payment_status)}`}>
                        {getPaymentStatusLabel(order.payment_status)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="border-t pt-3 mb-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Artículos ({order.items.length}):</p>
                  {order.items.map((item) => (
                    <div key={item.id} className="text-sm text-gray-600 ml-2 flex justify-between">
                      <span>
                        <span className="font-medium">{item.product?.name || `Producto #${item.product_id}`}</span>
                        {' '}× {item.quantity}
                      </span>
                      <span>${(item.unit_price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Comisión */}
                <div className="text-sm text-gray-600 border-t pt-2">
                  Comisión de plataforma: ${order.commission.toFixed(2)}
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-3 flex-wrap">
                  <button
                    onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    {selectedOrder?.id === order.id ? 'Ocultar detalles' : 'Ver detalles'}
                  </button>
                  {order.status === 'pending_payment' && order.payment_status === 'pending' && (
                    <Link href={`/checkout?order_id=${order.id}`} className="text-green-600 hover:text-green-800 text-sm font-medium">
                      Pagar ahora
                    </Link>
                  )}
                  {['paid', 'dispatched', 'in_transit'].includes(order.status) && order.delivery?.id && (
                    <Link href={`/delivery/${order.delivery.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                      📦 Ver seguimiento
                    </Link>
                  )}
                  {order.status === 'in_transit' && (
                    <button
                      onClick={async () => {
                        const token = localStorage.getItem('token')
                        await fetch((process.env.NEXT_PUBLIC_API_URL || '') + `/orders/${order.id}/confirm`, {
                          method: 'POST', headers: { Authorization: 'Bearer ' + token }
                        })
                        window.location.reload()
                      }}
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                    >
                      ✓ Confirmar recibido
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back Link */}
        <div className="mt-6">
          <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
