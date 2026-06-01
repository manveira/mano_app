import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

type OrderItem = { id: number; product_id: number; quantity: number; unit_price: number; product?: { name: string } }
type Order = { id: number; total_amount: number; commission: number; status: string; payment_status: string; items: OrderItem[] }

export default function Checkout() {
  const router = useRouter()
  const { order_id } = router.query
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [wompiData, setWompiData] = useState<any>(null)
  const [initiating, setInitiating] = useState(false)

  useEffect(() => {
    if (!order_id) return
    const token = localStorage.getItem('token')
    if (!token) { router.push('/signin'); return }

    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/orders/' + order_id, {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(r => r.json())
      .then(data => { setOrder(data.order); setLoading(false) })
      .catch(() => { setError('No se pudo cargar la orden'); setLoading(false) })
  }, [order_id])

  async function initiateWompi() {
    setInitiating(true)
    setError('')
    const token = localStorage.getItem('token')
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/payments/wompi/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ order_id: Number(order_id), redirect_url: window.location.origin + '/orders' }),
    })
    setInitiating(false)
    if (res.ok) {
      const data = await res.json()
      setWompiData(data)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Error al iniciar pago')
    }
  }

  if (!order_id) return <div className="container"><p className="text-gray-500 mt-8">Pedido no especificado.</p></div>
  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando orden...</p></div>
  if (!order) return <div className="container"><p className="text-red-600 mt-8">{error || 'Orden no encontrada'}</p></div>

  if (order.payment_status === 'paid') {
    return (
      <div className="container">
        <div className="max-w-md mx-auto card text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="font-semibold">Esta orden ya fue pagada.</p>
          <Link href="/orders" className="mt-3 inline-block text-blue-600 hover:underline text-sm">Ver mis órdenes</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-4">Checkout</h2>

        {/* Resumen */}
        <div className="card mb-4">
          <h3 className="font-semibold mb-3">Orden #{order.id}</h3>
          <ul className="space-y-1 text-sm text-gray-700">
            {order.items?.map(item => (
              <li key={item.id} className="flex justify-between">
                <span>{item.product?.name || `Producto #${item.product_id}`} × {item.quantity}</span>
                <span>${(item.unit_price * item.quantity).toLocaleString('es-CO')}</span>
              </li>
            ))}
          </ul>
          <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
            <span>Total</span>
            <span>${order.total_amount.toLocaleString('es-CO')}</span>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

        {/* Wompi */}
        {!wompiData ? (
          <div className="card">
            <h3 className="font-semibold mb-3">Pagar con Wompi</h3>
            <p className="text-sm text-gray-500 mb-4">Acepta Nequi, PSE, tarjetas débito y crédito.</p>
            <button
              onClick={initiateWompi}
              disabled={initiating}
              className="w-full bg-green-600 text-white py-3 rounded font-medium disabled:opacity-50 hover:bg-green-700"
            >
              {initiating ? 'Preparando pago...' : `Pagar $${order.total_amount.toLocaleString('es-CO')} COP`}
            </button>
          </div>
        ) : (
          <div className="card">
            <h3 className="font-semibold mb-3">Redirigiendo a Wompi...</h3>
            <p className="text-sm text-gray-500 mb-4">
              Referencia: <code className="bg-gray-100 px-1 rounded">{wompiData.reference}</code>
            </p>
            <a
              href={wompiData.checkout_url}
              className="block w-full bg-green-600 text-white py-3 rounded font-medium text-center hover:bg-green-700"
            >
              Ir a pagar en Wompi →
            </a>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Serás redirigido al portal seguro de Wompi
            </p>
          </div>
        )}

        <div className="mt-4">
          <Link href="/orders" className="text-sm text-blue-600 hover:underline">← Volver a mis órdenes</Link>
        </div>
      </div>
    </div>
  )
}
