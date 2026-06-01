import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

type Delivery = {
  id: number; order_id: number; status: string; eta: string; tracking: string
  type: string; picked_up_at?: string; delivered_at?: string
}

const STATUS_STEPS = ['scheduled', 'picked_up', 'in_transit', 'delivered']
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  picked_up: 'Recogido',
  in_transit: 'En camino',
  delivered: 'Entregado',
  failed: 'Fallido',
}
const STATUS_NEXT: Record<string, string> = {
  scheduled: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
}

export default function DeliveryPage() {
  const router = useRouter()
  const { id } = router.query
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [msg, setMsg] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  useEffect(() => {
    if (!id) return
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setRole(payload.role || '')
      } catch {}
    }
    fetchDelivery()

    // Polling automático cada 15s mientras no esté entregado
    const interval = setInterval(() => {
      if (delivery?.status !== 'delivered' && delivery?.status !== 'failed') {
        fetchDelivery()
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [id])

  function fetchDelivery() {
    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/deliveries/' + id)
      .then(r => r.json())
      .then(data => { setDelivery(data.delivery); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function updateStatus(status: string) {
    if (!token) { router.push('/signin'); return }
    setUpdating(true)
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/deliveries/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status }),
    })
    setUpdating(false)
    if (res.ok) {
      const data = await res.json()
      setDelivery(data.delivery)
      setMsg(`Estado actualizado: ${STATUS_LABELS[status]}`)
    }
  }

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando...</p></div>
  if (!delivery) return <div className="container"><p className="text-red-600 mt-8">Entrega no encontrada.</p></div>

  const currentStep = STATUS_STEPS.indexOf(delivery.status)
  const nextStatus = STATUS_NEXT[delivery.status]
  const canUpdate = role === 'business_owner' && nextStatus

  return (
    <div className="container">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-4">Seguimiento de entrega</h1>

        {msg && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm">{msg}</div>}

        {/* Progreso */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            {STATUS_STEPS.map((step, i) => (
              <div key={step} className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i < currentStep ? 'bg-green-500 text-white' :
                  i === currentStep ? 'bg-blue-600 text-white' :
                  'bg-gray-200 text-gray-400'
                }`}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <p className={`text-xs mt-1 text-center ${i === currentStep ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                  {STATUS_LABELS[step]}
                </p>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`absolute h-0.5 w-full ${i < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Estado actual</span>
              <span className={`font-medium ${delivery.status === 'delivered' ? 'text-green-600' : 'text-blue-600'}`}>
                {STATUS_LABELS[delivery.status] || delivery.status}
              </span>
            </div>
            {delivery.eta && (
              <div className="flex justify-between">
                <span className="text-gray-500">ETA</span>
                <span>{new Date(delivery.eta).toLocaleString('es-CO')}</span>
              </div>
            )}
            {delivery.tracking && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tracking</span>
                <span className="font-mono text-xs">{delivery.tracking}</span>
              </div>
            )}
            {delivery.picked_up_at && (
              <div className="flex justify-between">
                <span className="text-gray-500">Recogido</span>
                <span>{new Date(delivery.picked_up_at).toLocaleString('es-CO')}</span>
              </div>
            )}
            {delivery.delivered_at && (
              <div className="flex justify-between">
                <span className="text-gray-500">Entregado</span>
                <span>{new Date(delivery.delivered_at).toLocaleString('es-CO')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Botón de actualización para el negocio */}
        {canUpdate && (
          <div className="card">
            <h3 className="font-semibold mb-3">Actualizar estado</h3>
            <button
              onClick={() => updateStatus(nextStatus)}
              disabled={updating}
              className="w-full bg-blue-600 text-white py-2 rounded font-medium disabled:opacity-50 hover:bg-blue-700"
            >
              {updating ? 'Actualizando...' : `Marcar como: ${STATUS_LABELS[nextStatus]}`}
            </button>
          </div>
        )}

        {delivery.status === 'delivered' && (
          <div className="card bg-green-50 text-center">
            <p className="text-green-700 font-semibold">✅ Entrega completada</p>
          </div>
        )}

        <div className="mt-4">
          <Link href="/orders" className="text-sm text-blue-600 hover:underline">← Mis órdenes</Link>
        </div>
      </div>
    </div>
  )
}
