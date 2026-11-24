import { useState } from 'react'
import Router from 'next/router'
import { Screen, Hotspot } from '../components/Screen'
import { useToast } from '../components/Toast'
import { COMISIONES } from '../lib/hotspots/comisiones'
import { api, friendlyError } from '../lib/api'
import { useAuthGuard } from '../lib/useAuthGuard'

const cop = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none px-2">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** comisiones.jpg: saldo, retirar dinero (real), movimientos y guía. */
export default function Comisiones() {
  const { ready } = useAuthGuard(['freelancer'])
  const { toast, show } = useToast()
  const [sheet, setSheet] = useState<null | 'retiro' | 'guia'>(null)
  const [balance, setBalance] = useState(0)
  const [amount, setAmount] = useState('')
  const [nequi, setNequi] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!ready) return null
  const h = COMISIONES.hotspots

  async function abrirRetiro() {
    setErr(''); setAmount('')
    try {
      const [links, me] = await Promise.all([
        api<{ earnings_balance: number }>('/sell/links'),
        api<{ user: { nequi_number: string } }>('/me'),
      ])
      setBalance(links.earnings_balance || 0)
      setNequi(me.user?.nequi_number || '')
      setSheet('retiro')
    } catch (e) { show(friendlyError(e), 'error') }
  }

  async function retirar(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 5000) return setErr('El retiro mínimo es de $5.000.')
    if (value > balance) return setErr(`Tu saldo disponible es ${cop(balance)}.`)
    if (!/^\d{10}$/.test(nequi.replace(/\s/g, ''))) return setErr('Escribe un número de Nequi de 10 dígitos.')
    setBusy(true)
    try {
      const d = await api<{ remaining_balance: number }>('/sell/withdraw', {
        method: 'POST', body: { amount: value, nequi_number: nequi.replace(/\s/g, '') },
      })
      setSheet(null)
      show(`Solicitud enviada. Te quedan ${cop(d.remaining_balance)} disponibles. Se procesa en 1-2 días hábiles.`, 'ok', 6000)
    } catch (e2) { setErr(friendlyError(e2)) } finally { setBusy(false) }
  }

  return (
    <Screen src={COMISIONES.src} alt={COMISIONES.alt}>
      <Hotspot rect={h.volver.rect} label={h.volver.label} onClick={() => Router.push('/comisionista')} />
      <Hotspot rect={h.retirar.rect} label={h.retirar.label} onClick={abrirRetiro} round />
      <Hotspot rect={h.verTodos.rect} label={h.verTodos.label} href="/movimientos" />
      <Hotspot rect={h.verGuia.rect} label={h.verGuia.label} onClick={() => setSheet('guia')} />

      {sheet === 'retiro' && (
        <Sheet title="Retirar dinero" onClose={() => setSheet(null)}>
          <p className="text-sm text-black/60">Saldo disponible</p>
          <p className="text-3xl font-black mb-4">{cop(balance)}</p>
          {balance < 5000 ? (
            <p className="text-sm text-black/70">Necesitas al menos $5.000 para retirar. Sigue vendiendo: las comisiones se liberan cuando el comprador confirma su pedido (o a las 24 h).</p>
          ) : (
            <form onSubmit={retirar} className="space-y-3">
              {err && <div role="alert" className="p-3 bg-red-50 text-red-600 rounded-xl text-sm">{err}</div>}
              <label className="block text-sm font-semibold">Monto a retirar (mín. $5.000)
                <input type="number" inputMode="numeric" min={5000} max={balance} step={1000} required value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 text-base outline-none focus:border-black" />
              </label>
              <label className="block text-sm font-semibold">Número de Nequi
                <input type="tel" inputMode="numeric" required value={nequi} placeholder="3XXXXXXXXX"
                  onChange={e => setNequi(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 text-base outline-none focus:border-black" />
              </label>
              <button type="submit" disabled={busy}
                className="w-full bg-[#91e631] text-black font-black py-4 rounded-full text-lg disabled:opacity-50">
                {busy ? 'Enviando…' : 'Solicitar retiro'}
              </button>
            </form>
          )}
          {balance < 5000 && err && <p role="alert" className="mt-3 text-sm text-red-600">{err}</p>}
        </Sheet>
      )}

      {sheet === 'guia' && (
        <Sheet title="¿Cómo retirar tu dinero?" onClose={() => setSheet(null)}>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-black/80">
            <li>Tu comisión se libera cuando el comprador confirma que recibió su pedido, o automáticamente a las 24 horas si no responde.</li>
            <li>Cuando tengas <strong>$5.000 o más</strong> disponibles, toca <strong>Retirar dinero</strong>.</li>
            <li>Escribe cuánto quieres retirar y tu número de <strong>Nequi</strong>.</li>
            <li>Mano procesa tu solicitud en <strong>1 a 2 días hábiles</strong> y te transfiere el dinero.</li>
            <li>Mira todo lo que entra y sale en <strong>Movimientos → Ver todos</strong>.</li>
          </ol>
          <p className="mt-4 text-xs text-black/50">Si hay una disputa en un pedido, el dinero se retiene hasta que Mano la resuelva.</p>
        </Sheet>
      )}
      {toast}
    </Screen>
  )
}
