import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, friendlyError } from '../lib/api'
import { useAuthGuard } from '../lib/useAuthGuard'
import { useToast } from '../components/Toast'

type Payment = {
  reference: string
  wompi_id?: string
  order_id?: number
  amount: number
  currency: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | string
  status_message?: string
  payment_method?: string
  created_at: string
  finalized_at?: string
  order_status?: string
  escrow_status?: string
}
type Timeline = { status: string; source: string; at: string }

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '')

const STATUS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'Aprobado', cls: 'bg-green-100 text-green-800' },
  PENDING: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  DECLINED: { label: 'Rechazado', cls: 'bg-red-100 text-red-800' },
  ERROR: { label: 'Con error', cls: 'bg-red-100 text-red-800' },
  VOIDED: { label: 'Anulado', cls: 'bg-gray-200 text-gray-700' },
}
const METHOD: Record<string, string> = { CARD: 'Tarjeta', NEQUI: 'Nequi', PSE: 'PSE', BANCOLOMBIA_TRANSFER: 'Bancolombia', MOCK_NEQUI: 'Simulado (pruebas)' }
const ESCROW: Record<string, string> = {
  held: 'Tu dinero está retenido hasta que confirmes la entrega.',
  released: 'Pago liberado al negocio.',
  refunded: 'Pago devuelto.',
}
const SOURCE: Record<string, string> = { webhook: 'Aviso de Wompi', sync: 'Verificación al volver del pago', reconcile: 'Revisión automática' }

/** "Mis pagos": historial de pagos con Wompi mapeados a tus pedidos. Los negocios también ven los pagos recibidos. */
export default function Pagos() {
  const { ready, role } = useAuthGuard()
  const { toast, show } = useToast()
  const [scope, setScope] = useState<'mine' | 'received'>('mine')
  const [items, setItems] = useState<Payment[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Timeline[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const d = await api<{ payments: Payment[] }>('/payments' + (scope === 'received' ? '?scope=received' : ''))
      setItems(d.payments || [])
    } catch (e) { setError(friendlyError(e)); setItems([]) }
  }, [scope])

  useEffect(() => { if (ready) load() }, [ready, load])

  async function toggle(p: Payment) {
    if (open === p.reference) { setOpen(null); return }
    setOpen(p.reference); setTimeline([])
    try {
      const d = await api<{ timeline: Timeline[] }>('/payments/' + encodeURIComponent(p.reference) + (scope === 'received' ? '?scope=received' : ''))
      setTimeline(d.timeline || [])
    } catch { /* el detalle es opcional */ }
  }

  /** Pregunta a Wompi (vía nuestro servidor) por los pagos pendientes de tus pedidos. */
  async function refresh() {
    const orders = Array.from(new Set((items || []).filter(p => p.status === 'PENDING' && p.order_id).map(p => p.order_id as number))).slice(0, 3)
    if (orders.length === 0) { show('No tienes pagos pendientes por verificar.', 'info'); return }
    setBusy(true)
    let changed = false
    for (const id of orders) {
      try {
        const r = await api<{ updated: boolean }>('/payments/wompi/sync', { method: 'POST', body: { order_id: id } })
        changed = changed || r.updated
      } catch (e: any) {
        if (e?.status === 429) show('Espera unos segundos antes de volver a verificar.', 'info')
        else if (e?.status === 503) show('No pudimos consultar a Wompi ahora. Inténtalo en un momento.', 'error')
      }
    }
    await load()
    setBusy(false)
    show(changed ? 'Actualizamos el estado de tus pagos.' : 'Wompi aún no reporta cambios.', changed ? 'ok' : 'info')
  }

  if (!ready) return null
  const hasPending = (items || []).some(p => p.status === 'PENDING')

  return (
    <div className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-5 py-6">
        <Link href="/orders" className="text-sm font-semibold" aria-label="Volver a mis pedidos">← Mis pedidos</Link>
        <h1 className="text-2xl font-black mt-3 mb-1">Mis pagos</h1>
        <p className="text-sm text-black/60 mb-4">Pagos hechos con Wompi y el pedido al que corresponde cada uno.</p>

        {role === 'business_owner' && (
          <div className="flex gap-2 mb-4" role="tablist" aria-label="Tipo de pagos">
            {(['mine', 'received'] as const).map(s => (
              <button key={s} role="tab" aria-selected={scope === s} onClick={() => { setScope(s); setItems(null); setOpen(null) }}
                className={'px-3 py-1.5 rounded-full text-sm font-bold border ' + (scope === s ? 'bg-black text-lime-300 border-black' : 'border-gray-300')}>
                {s === 'mine' ? 'Mis compras' : 'Recibidos en mis negocios'}
              </button>
            ))}
          </div>
        )}

        {scope === 'mine' && hasPending && (
          <button onClick={refresh} disabled={busy} aria-label="Verificar pagos pendientes con Wompi"
            className="mb-4 w-full border border-black rounded-xl py-2 text-sm font-bold disabled:opacity-50">
            {busy ? 'Verificando…' : 'Verificar pagos pendientes'}
          </button>
        )}

        {error && <p role="alert" className="text-red-600 text-sm mb-3">{error}</p>}
        {!items && !error && <p className="text-black/50 text-sm">Cargando…</p>}
        {items && items.length === 0 && !error && (
          <p className="text-black/60 text-sm">Todavía no tienes pagos. Cuando pagues un pedido aparecerá aquí.</p>
        )}

        <ul className="space-y-3">
          {items?.map(p => {
            const st = STATUS[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-700' }
            const expanded = open === p.reference
            const canRetry = scope === 'mine' && p.order_id && p.status !== 'APPROVED' && p.status !== 'PENDING' && p.order_status !== 'paid'
            return (
              <li key={p.reference} className="border rounded-2xl p-4">
                <button className="w-full text-left" onClick={() => toggle(p)} aria-expanded={expanded}
                  aria-label={`Pago ${p.reference}, ${st.label}, ${cop(p.amount)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-lg">{cop(p.amount)}</span>
                    <span className={'px-2 py-0.5 rounded-full text-xs font-bold ' + st.cls}>{st.label}</span>
                  </div>
                  <p className="text-xs text-black/50 mt-1">
                    {when(p.created_at)}{p.payment_method ? ' · ' + (METHOD[p.payment_method] || p.payment_method) : ''}{p.order_id ? ' · Pedido #' + p.order_id : ''}
                  </p>
                  {p.status_message && p.status !== 'APPROVED' && <p className="text-xs text-red-700 mt-1">{p.status_message}</p>}
                </button>

                {expanded && (
                  <div className="mt-3 pt-3 border-t text-sm space-y-1">
                    {p.status === 'APPROVED' && p.escrow_status && ESCROW[p.escrow_status] && <p>{ESCROW[p.escrow_status]}</p>}
                    <p className="text-black/60">Referencia: <code className="bg-gray-100 px-1 rounded break-all">{p.reference}</code></p>
                    {p.wompi_id && <p className="text-black/60">ID en Wompi: <code className="bg-gray-100 px-1 rounded break-all">{p.wompi_id}</code></p>}
                    {p.finalized_at && <p className="text-black/60">Finalizado: {when(p.finalized_at)}</p>}
                    {timeline.length > 0 && (
                      <ul className="text-xs text-black/60 mt-2 list-disc pl-4">
                        {timeline.map((t, i) => <li key={i}>{when(t.at)} · {(STATUS[t.status]?.label || t.status)} · {SOURCE[t.source] || t.source}</li>)}
                      </ul>
                    )}
                    <div className="flex gap-3 pt-2">
                      {scope === 'mine' && p.order_id && <Link href="/orders" className="text-blue-600 font-semibold" aria-label={`Ver pedido ${p.order_id}`}>Ver pedido</Link>}
                      {canRetry && <Link href={`/checkout?order_id=${p.order_id}`} className="text-green-700 font-bold" aria-label={`Reintentar el pago del pedido ${p.order_id}`}>Reintentar pago</Link>}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {toast}
    </div>
  )
}
