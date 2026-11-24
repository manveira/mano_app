import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, friendlyError } from '../lib/api'
import { useAuthGuard } from '../lib/useAuthGuard'

type Me = { name: string; email: string; username: string; phone: string; nequi_number: string; document_id: string; role: string }

/** Ajustes: edita tus datos (nombre, celular, Nequi, cédula). Aún sin imagen del diseñador. */
export default function Ajustes() {
  const { ready } = useAuthGuard()
  const [me, setMe] = useState<Me | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', nequi_number: '', document_id: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ready) return
    api<{ user: Me }>('/me').then(d => {
      setMe(d.user)
      setForm({ name: d.user.name || '', phone: d.user.phone || '', nequi_number: d.user.nequi_number || '', document_id: d.user.document_id || '' })
    }).catch(e => setMsg({ ok: false, text: friendlyError(e) }))
  }, [ready])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null); setSaving(true)
    try {
      const d = await api<{ user: Me }>('/me', { method: 'PATCH', body: form })
      setMe(d.user)
      setMsg({ ok: true, text: 'Cambios guardados.' })
    } catch (err) { setMsg({ ok: false, text: friendlyError(err) }) } finally { setSaving(false) }
  }

  if (!ready) return null
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const field = 'mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 text-base outline-none focus:border-black'

  return (
    <div className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-5 py-6">
        <Link href="/profile" className="text-sm font-semibold">← Mi perfil</Link>
        <h1 className="text-2xl font-black mt-3 mb-1">Ajustes</h1>
        {me && <p className="text-sm text-black/60 mb-4">@{me.username} · {me.email}</p>}
        {msg && <div role={msg.ok ? 'status' : 'alert'} className={'mb-4 p-3 rounded-xl text-sm ' + (msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{msg.text}</div>}
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm font-semibold">Nombre
            <input className={field} value={form.name} onChange={set('name')} required minLength={2} maxLength={80} /></label>
          <label className="block text-sm font-semibold">Celular
            <input className={field} type="tel" inputMode="numeric" value={form.phone} onChange={set('phone')} placeholder="3XXXXXXXXX" /></label>
          <label className="block text-sm font-semibold">Nequi (para recibir tus comisiones)
            <input className={field} type="tel" inputMode="numeric" value={form.nequi_number} onChange={set('nequi_number')} placeholder="3XXXXXXXXX" /></label>
          <label className="block text-sm font-semibold">Cédula
            <input className={field} inputMode="numeric" value={form.document_id} onChange={set('document_id')} placeholder="Solo números" /></label>
          <p className="text-xs text-black/50">La cédula se usa para verificar tu cuenta y evitar fraudes (un comisionista no puede ganar comisión comprándose a sí mismo).</p>
          <button type="submit" disabled={saving} className="w-full bg-[#91e631] text-black font-black py-4 rounded-full text-lg disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  )
}
