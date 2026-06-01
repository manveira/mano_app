import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type DaySale = { day: string; orders: number; revenue: number }
type TopProduct = { product_id: number; product_name: string; quantity_sold: number; revenue: number }
type TopFreelancer = { freelancer_id: number; freelancer_name: string; sales: number; commission_earned: number }
type BizStat = { business_id: number; name: string; orders: number; revenue: number }

function BarChart({ data, valueKey, labelKey, color = '#2563eb' }: {
  data: any[]; valueKey: string; labelKey: string; color?: string
}) {
  if (!data?.length) return <p className="text-gray-400 text-sm">Sin datos en este período.</p>
  const max = Math.max(...data.map(d => d[valueKey] || 0)) || 1
  return (
    <div className="space-y-1">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-24 text-gray-500 truncate">{d[labelKey]}</span>
          <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{ width: `${(d[valueKey] / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-16 text-right font-medium">{typeof d[valueKey] === 'number' && d[valueKey] > 100 ? `$${d[valueKey].toLocaleString('es-CO')}` : d[valueKey]}</span>
        </div>
      ))}
    </div>
  )
}

function EditBizForm({ bizId, token, onSaved }: { bizId: number; token: string; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', image_url: '', default_commission_rate: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body: any = {}
    if (form.name) body.name = form.name
    if (form.description) body.description = form.description
    if (form.image_url) body.image_url = form.image_url
    if (form.default_commission_rate) body.default_commission_rate = parseFloat(form.default_commission_rate)
    await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/businesses/' + bizId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <form onSubmit={save} className="mt-3 p-3 bg-gray-50 rounded space-y-2 text-sm">
      <input className="w-full border rounded px-2 py-1" placeholder="Nuevo nombre" value={form.name} onChange={set('name')} />
      <textarea className="w-full border rounded px-2 py-1 resize-none" rows={2} placeholder="Nueva descripción" value={form.description} onChange={set('description')} />
      <input className="w-full border rounded px-2 py-1" placeholder="URL imagen" value={form.image_url} onChange={set('image_url')} />
      <input type="number" min="0.10" max="0.40" step="0.01" className="w-full border rounded px-2 py-1" placeholder="Comisión (0.10–0.40)" value={form.default_commission_rate} onChange={set('default_commission_rate')} />
      <button type="submit" disabled={saving} className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-50">
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  )
}

export default function Dashboard() {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const [stats, setStats] = useState<{ sales_by_day: DaySale[]; top_products: TopProduct[]; top_freelancers: TopFreelancer[] } | null>(null)
  const [summary, setSummary] = useState<BizStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingBiz, setEditingBiz] = useState<number | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  useEffect(() => {
    if (!token) { Router.push('/signin'); return }
    loadData()
  }, [period])

  async function loadData() {
    setLoading(true)
    const headers = { Authorization: 'Bearer ' + token }
    const BASE = process.env.NEXT_PUBLIC_API_URL || ''
    try {
      const [statsRes, summaryRes] = await Promise.all([
        fetch(`${BASE}/dashboard/business/stats?period=${period}`, { headers }),
        fetch(`${BASE}/dashboard`, { headers }),
      ])
      if (statsRes.status === 401 || summaryRes.status === 401) { Router.push('/signin'); return }
      if (statsRes.ok) setStats(await statsRes.json())
      if (summaryRes.ok) { const d = await summaryRes.json(); setSummary(d.dashboard || []) }
    } catch { setError('Error de conexión') }
    setLoading(false)
  }

  const totalOrders = summary.reduce((s, b) => s + b.orders, 0)
  const totalRevenue = summary.reduce((s, b) => s + b.revenue, 0)

  return (
    <div className="container">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dashboard de Negocio</h1>
          <div className="flex gap-2">
            {(['7d', '30d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-sm font-medium ${period === p ? 'bg-blue-600 text-white' : 'border text-gray-600 hover:bg-gray-50'}`}>
                {p === '7d' ? 'Últimos 7 días' : 'Últimos 30 días'}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="card bg-blue-50">
            <p className="text-gray-500 text-sm">Órdenes totales</p>
            <p className="text-3xl font-bold text-blue-600">{totalOrders}</p>
          </div>
          <div className="card bg-green-50">
            <p className="text-gray-500 text-sm">Ingresos totales</p>
            <p className="text-3xl font-bold text-green-600">${totalRevenue.toLocaleString('es-CO')}</p>
          </div>
        </div>

        {loading ? <p className="text-gray-400">Cargando estadísticas...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Ventas por día */}
            <div className="card">
              <h3 className="font-semibold mb-3">Ventas por día</h3>
              <BarChart data={stats?.sales_by_day || []} valueKey="revenue" labelKey="day" color="#2563eb" />
            </div>

            {/* Top productos */}
            <div className="card">
              <h3 className="font-semibold mb-3">Productos más vendidos</h3>
              <BarChart data={stats?.top_products || []} valueKey="quantity_sold" labelKey="product_name" color="#16a34a" />
            </div>

            {/* Top comisionistas */}
            <div className="card">
              <h3 className="font-semibold mb-3">Top comisionistas</h3>
              <BarChart data={stats?.top_freelancers || []} valueKey="sales" labelKey="freelancer_name" color="#9333ea" />
            </div>

            {/* Mis negocios */}
            <div className="card">
              <h3 className="font-semibold mb-3">Mis negocios</h3>
              {summary.length === 0 ? (
                <p className="text-gray-500 text-sm">No tienes negocios. <Link href="/create-business" className="text-blue-600">Crear uno</Link></p>
              ) : summary.map(b => (
                <div key={b.business_id} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                  <span className="font-medium">{b.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">{b.orders} órdenes · ${b.revenue.toLocaleString('es-CO')}</span>
                    <button
                      onClick={() => setEditingBiz(editingBiz === b.business_id ? null : b.business_id)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
              {editingBiz && <EditBizForm bizId={editingBiz} token={token!} onSaved={() => { setEditingBiz(null); loadData() }} />}
            </div>
          </div>
        )}

        <div className="mt-6 card bg-gray-50">
          <h3 className="font-semibold mb-3">Acciones rápidas</h3>
          <div className="flex flex-wrap gap-3">
            <Link href="/create-business" className="text-blue-600 text-sm hover:underline">Crear negocio</Link>
            <Link href="/create-product" className="text-blue-600 text-sm hover:underline">Crear producto</Link>
            <Link href="/orders" className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">📦 Ver órdenes</Link>
            <Link href="/profile" className="text-blue-600 text-sm hover:underline">Mi perfil</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
