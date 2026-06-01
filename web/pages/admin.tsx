import { useEffect, useState } from 'react'
import Router from 'next/router'

type Business = { id: number; name: string; category: string; location: string; owner_id: number }
type Order = { id: number; total_amount: number; status: string; business_id: number; customer_id: number; created_at: string }
type Withdrawal = { id: number; freelancer_id: number; amount: number; nequi_number: string; status: string; created_at: string }
type Application = { id: number; user_id: number; business_name: string; category: string; description: string; nequi_number: string; document_image_url: string; status: string; created_at: string }

export default function Admin() {
  const [tab, setTab] = useState<'businesses' | 'applications' | 'disputes' | 'withdrawals'>('applications')
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [disputes, setDisputes] = useState<Order[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const BASE = (process.env.NEXT_PUBLIC_API_URL || '') + '/admin'

  useEffect(() => {
    if (!token) { Router.push('/signin'); return }
    // Verificar rol admin
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.role !== 'admin') { Router.push('/'); return }
    } catch { Router.push('/signin'); return }

    loadAll()
  }, [])

  async function api(path: string, method = 'GET', body?: any) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: body ? JSON.stringify(body) : undefined,
    })
    return res.json()
  }

  async function loadAll() {
    setLoading(true)
    const [b, apps, d, w] = await Promise.all([
      api('/businesses/pending'),
      api('/applications'),
      api('/disputes'),
      api('/withdrawals'),
    ])
    setBusinesses(b.businesses || [])
    setApplications(apps.applications || [])
    setDisputes(d.disputes || [])
    setWithdrawals(w.withdrawals || [])
    setLoading(false)
  }

  async function approveBusiness(id: number) {
    await api(`/businesses/approve/${id}`, 'POST')
    setMsg(`Negocio #${id} aprobado ✅`)
    setBusinesses(prev => prev.filter(b => b.id !== id))
  }

  async function rejectBusiness(id: number) {
    const reason = prompt('Razón del rechazo:')
    if (!reason) return
    await api(`/businesses/reject/${id}`, 'POST', { reason })
    setMsg(`Negocio #${id} rechazado`)
    setBusinesses(prev => prev.filter(b => b.id !== id))
  }

  async function resolveDispute(id: number, resolution: 'refund_buyer' | 'release_business') {
    const notes = prompt('Notas de resolución:') || ''
    await fetch((process.env.NEXT_PUBLIC_API_URL || '') + `/admin/disputes/resolve/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ resolution, notes }),
    })
    setMsg(`Disputa #${id} resuelta`)
    setDisputes(prev => prev.filter(d => d.id !== id))
  }

  async function processWithdrawal(id: number) {
    await api(`/withdrawals/process/${id}`, 'PATCH')
    setMsg(`Retiro #${id} procesado ✅`)
    setWithdrawals(prev => prev.filter(w => w.id !== id))
  }

  const tabs = [
    { key: 'applications', label: `KYC Solicitudes (${applications.length})` },
    { key: 'businesses', label: `Negocios pendientes (${businesses.length})` },
    { key: 'disputes', label: `Disputas (${disputes.length})` },
    { key: 'withdrawals', label: `Retiros (${withdrawals.length})` },
  ] as const

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando panel admin...</p></div>

  return (
    <div className="container">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Panel de Administración</h1>
        {msg && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm">{msg}</div>}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* KYC Solicitudes */}
        {tab === 'applications' && (
          <div className="space-y-3">
            {applications.length === 0 ? <p className="text-gray-500">No hay solicitudes pendientes.</p> : applications.map(app => (
              <div key={app.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">{app.business_name}</p>
                    <p className="text-sm text-gray-500">{app.category} — Nequi: {app.nequi_number}</p>
                    <p className="text-sm text-gray-600 mt-1">{app.description}</p>
                    {app.document_image_url && (
                      <a href={app.document_image_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                        📄 Ver documento →
                      </a>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Usuario #{app.user_id} · {new Date(app.created_at).toLocaleDateString('es-CO')}</p>
                  </div>
                  <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-medium">Pendiente</span>
                </div>
                <p className="text-xs text-gray-400">
                  Una vez aprobada la solicitud, el usuario debe crear su negocio desde la app.
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Negocios pendientes */}
        {tab === 'businesses' && (
          <div className="space-y-3">
            {businesses.length === 0 ? <p className="text-gray-500">No hay negocios pendientes.</p> : businesses.map(b => (
              <div key={b.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-sm text-gray-500">{b.category} — {b.location}</p>
                  <p className="text-xs text-gray-400">Owner ID: {b.owner_id}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveBusiness(b.id)} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">Aprobar</button>
                  <button onClick={() => rejectBusiness(b.id)} className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Disputas */}
        {tab === 'disputes' && (
          <div className="space-y-3">
            {disputes.length === 0 ? <p className="text-gray-500">No hay disputas activas.</p> : disputes.map(d => (
              <div key={d.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold">Orden #{d.id}</p>
                    <p className="text-sm text-gray-500">Total: ${d.total_amount?.toLocaleString('es-CO')} — Negocio #{d.business_id}</p>
                    <p className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString('es-CO')}</p>
                  </div>
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium">En disputa</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => resolveDispute(d.id, 'refund_buyer')} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">Reembolsar comprador</button>
                  <button onClick={() => resolveDispute(d.id, 'release_business')} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">Liberar al negocio</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Retiros */}
        {tab === 'withdrawals' && (
          <div className="space-y-3">
            {withdrawals.length === 0 ? <p className="text-gray-500">No hay retiros pendientes.</p> : withdrawals.map(w => (
              <div key={w.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-semibold">${w.amount?.toLocaleString('es-CO')} COP</p>
                  <p className="text-sm text-gray-500">Nequi: {w.nequi_number} — Freelancer #{w.freelancer_id}</p>
                  <p className="text-xs text-gray-400">{new Date(w.created_at).toLocaleDateString('es-CO')}</p>
                </div>
                <button onClick={() => processWithdrawal(w.id)} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">Marcar procesado</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
