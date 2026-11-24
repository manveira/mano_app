import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, friendlyError } from '../lib/api'
import { useAuthGuard } from '../lib/useAuthGuard'

type Mov = { type: 'commission' | 'withdrawal'; title: string; amount: number; status: string; created_at: string }
const cop = (n: number) => (n < 0 ? '- ' : '+ ') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CO')
const STATUS: Record<string, string> = { released: 'Liberada', pending: 'Pendiente', processing: 'En proceso', completed: 'Completado', failed: 'Fallido' }

/** Historial completo de movimientos del comisionista (botón "Ver todos" de Comisiones). */
export default function Movimientos() {
  const { ready } = useAuthGuard(['freelancer'])
  const [items, setItems] = useState<Mov[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ready) return
    api<{ movements: Mov[] }>('/sell/movements').then(d => setItems(d.movements || [])).catch(e => setError(friendlyError(e)))
  }, [ready])

  if (!ready) return null
  return (
    <div className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-5 py-6">
        <Link href="/comisiones" className="text-sm font-semibold" aria-label="Volver a Comisiones">← Comisiones</Link>
        <h1 className="text-2xl font-black mt-3 mb-4">Movimientos</h1>
        {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
        {!items && !error && <p className="text-black/50 text-sm">Cargando…</p>}
        {items && items.length === 0 && <p className="text-black/60 text-sm">Todavía no tienes movimientos. Comparte tu catálogo y gana tu primera comisión.</p>}
        <ul className="divide-y divide-gray-200">
          {items?.map((m, i) => (
            <li key={i} className="py-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-[#91e631] flex items-center justify-center text-lg" aria-hidden>{m.type === 'commission' ? '$' : '↗'}</span>
              <div className="flex-1">
                <p className="font-bold leading-tight">{m.title}</p>
                <p className="text-xs text-black/50">{new Date(m.created_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })} · {STATUS[m.status] || m.status}</p>
              </div>
              <span className={'font-black ' + (m.amount < 0 ? 'text-red-600' : 'text-green-700')}>{cop(m.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
