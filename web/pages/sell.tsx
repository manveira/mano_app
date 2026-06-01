import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type Product = { id: number; name: string; description: string; price: number; image_url: string; commission_rate: number; business_id: number }
type ReferralLink = { id: number; product: Product; slug: string; clicks: number; conversions: number; url: string }
type DayEarning = { day: string; sales: number; earnings: number }

function MiniBarChart({ data }: { data: DayEarning[] }) {
  if (!data?.length) return <p className="text-gray-400 text-xs">Sin ventas en este período.</p>
  const max = Math.max(...data.map(d => d.earnings)) || 1
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}: $${d.earnings.toLocaleString('es-CO')}`}>
          <div className="w-full bg-green-500 rounded-t" style={{ height: `${(d.earnings / max) * 56}px`, minHeight: d.earnings > 0 ? '4px' : '0' }} />
          <span className="text-xs text-gray-400 truncate w-full text-center" style={{ fontSize: '9px' }}>{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Sell() {
  const [tab, setTab] = useState<'explore' | 'links' | 'referral'>('links')
  const [products, setProducts] = useState<Product[]>([])
  const [links, setLinks] = useState<ReferralLink[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [affiliating, setAffiliating] = useState<number | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [nequi, setNequi] = useState('')
  const [withdrawMsg, setWithdrawMsg] = useState('')
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const [dashStats, setDashStats] = useState<{ earnings_by_day: DayEarning[]; period_total: number } | null>(null)
  const [referralData, setReferralData] = useState<{ referral_code: string; referral_url: string; referred_count: number } | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  useEffect(() => {
    if (!token) { Router.push('/signin'); return }
    // Verificar rol
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.role !== 'freelancer') { Router.push('/'); return }
    } catch { Router.push('/signin'); return }

    loadLinks()
    loadProducts()
  }, [])

  async function loadLinks() {
    const [linksRes, refRes] = await Promise.all([
      fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/sell/links', { headers: { Authorization: 'Bearer ' + token } }),
      fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/sell/referral-code', { headers: { Authorization: 'Bearer ' + token } }),
    ])
    if (linksRes.ok) {
      const data = await linksRes.json()
      setLinks(data.links || [])
      setBalance(data.earnings_balance || 0)
    }
    if (refRes.ok) setReferralData(await refRes.json())
    setLoading(false)
  }

  async function loadDashStats() {
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + `/dashboard/freelancer?period=${period}`, {
      headers: { Authorization: 'Bearer ' + token },
    })
    if (res.ok) setDashStats(await res.json())
  }

  useEffect(() => { loadDashStats() }, [period])

  async function loadProducts() {
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/products')
    if (res.ok) {
      const data = await res.json()
      setProducts(data.products || [])
    }
  }

  async function affiliate(productId: number) {
    setAffiliating(productId)
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/sell/affiliate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ product_id: productId }),
    })
    setAffiliating(null)
    if (res.ok) {
      await loadLinks()
      setTab('links')
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 2000)
  }

  async function requestWithdrawal(e: React.FormEvent) {
    e.preventDefault()
    setWithdrawMsg('')
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/sell/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ amount: Number(withdrawAmount), nequi_number: nequi }),
    })
    const data = await res.json()
    if (res.ok) {
      setWithdrawMsg('✅ Solicitud enviada. Se procesa en 1-2 días hábiles.')
      setWithdrawAmount('')
      setBalance(data.remaining_balance)
    } else {
      setWithdrawMsg('❌ ' + (data.error || 'Error al solicitar retiro'))
    }
  }

  // Productos que el comisionista aún no tiene link
  const affiliatedProductIds = new Set(links.map(l => l.product?.id))
  const availableProducts = products.filter(p => !affiliatedProductIds.has(p.id))

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando...</p></div>

  return (
    <div className="container">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Panel de Comisionista</h1>

        {/* Saldo + gráfica */}
        <div className="card bg-green-50 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">Saldo disponible</p>
              <p className="text-3xl font-bold text-green-700">${balance.toLocaleString('es-CO')}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">{links.length} productos activos</p>
              <p className="text-xs text-gray-400">{links.reduce((s, l) => s + l.clicks, 0)} clicks totales</p>
              <div className="flex gap-1 mt-1">
                {(['7d', '30d'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-2 py-0.5 rounded text-xs ${period === p ? 'bg-green-600 text-white' : 'border text-gray-500'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {dashStats && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Ingresos del período: <strong className="text-green-700">${dashStats.period_total?.toLocaleString('es-CO')}</strong></p>
              <MiniBarChart data={dashStats.earnings_by_day || []} />
            </div>
          )}
        </div>

        {/* Retiro */}
        {balance >= 5000 && (
          <div className="card mb-6 border-green-200">
            <h3 className="font-semibold mb-3">Retirar ganancias a Nequi</h3>
            <form onSubmit={requestWithdrawal} className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Monto (mín. $5.000)</label>
                <input
                  type="number" min="5000" max={balance} step="1000"
                  className="border rounded px-2 py-1 text-sm w-36"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Número Nequi</label>
                <input
                  type="text" placeholder="3XXXXXXXXX"
                  className="border rounded px-2 py-1 text-sm w-36"
                  value={nequi}
                  onChange={e => setNequi(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">
                Retirar
              </button>
            </form>
            {withdrawMsg && <p className="mt-2 text-sm">{withdrawMsg}</p>}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b">
          <button onClick={() => setTab('links')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'links' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            Mis links ({links.length})
          </button>
          <button onClick={() => setTab('explore')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'explore' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            Explorar ({availableProducts.length})
          </button>
          <button onClick={() => setTab('referral')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'referral' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            Referidos
          </button>
        </div>

        {/* Mis links */}
        {tab === 'links' && (
          <div>
            {links.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-gray-500 mb-3">Aún no tienes links de venta.</p>
                <button onClick={() => setTab('explore')} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">
                  Explorar productos para vender
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {links.map(link => (
                  <div key={link.id} className="card">
                    <div className="flex gap-3">
                      {link.product?.image_url && (
                        <img src={link.product.image_url} alt={link.product?.name} className="w-16 h-16 object-cover rounded flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{link.product?.name}</p>
                        <p className="text-sm text-gray-500">${link.product?.price?.toLocaleString('es-CO')} — Comisión: <span className="text-green-600 font-medium">{((link.product?.commission_rate || 0) * 100).toFixed(0)}%</span></p>
                        <p className="text-xs text-gray-400 mt-1">
                          Ganas: <strong className="text-green-700">${((link.product?.price || 0) * (link.product?.commission_rate || 0)).toLocaleString('es-CO')}</strong> por venta
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 truncate">{link.url}</code>
                      <button
                        onClick={() => copyLink(link.url)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${copied === link.url ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        {copied === link.url ? '✓ Copiado' : 'Copiar link'}
                      </button>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-gray-500">
                      <span>👁 {link.clicks} clicks</span>
                      <span>✅ {link.conversions} ventas</span>
                      {link.clicks > 0 && (
                        <span>📊 {((link.conversions / link.clicks) * 100).toFixed(1)}% conversión</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Explorar productos */}
        {tab === 'explore' && (
          <div>
            {availableProducts.length === 0 ? (
              <p className="text-gray-500 text-sm">Ya estás vendiendo todos los productos disponibles.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {availableProducts.map(p => (
                  <div key={p.id} className="border rounded overflow-hidden">
                    {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover" />}
                    <div className="p-3">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">${p.price.toLocaleString('es-CO')}</p>
                          <p className="text-xs text-green-600">
                            Ganas ${(p.price * p.commission_rate).toLocaleString('es-CO')} ({(p.commission_rate * 100).toFixed(0)}%)
                          </p>
                        </div>
                        <button
                          onClick={() => affiliate(p.id)}
                          disabled={affiliating === p.id}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50 hover:bg-blue-700"
                        >
                          {affiliating === p.id ? '...' : 'Vender esto'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab referidos */}
        {tab === 'referral' && (
          <div className="card">
            <h3 className="font-semibold mb-1">Tu código de referido</h3>
            <p className="text-xs text-gray-500 mb-3">Invita a otros comisionistas. Cuando hagan su primera venta, ganas <strong>$5.000</strong>.</p>
            {referralData ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <code className="flex-1 bg-gray-100 px-3 py-2 rounded font-mono text-lg font-bold tracking-widest">
                    {referralData.referral_code}
                  </code>
                  <button onClick={() => { navigator.clipboard.writeText(referralData.referral_url); }}
                    className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">
                    Copiar link
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-2">Link: <span className="text-blue-600">{referralData.referral_url}</span></p>
                <p className="text-sm font-medium">Comisionistas referidos: <strong>{referralData.referred_count}</strong></p>
                <p className="text-xs text-gray-400 mt-1">Ganas $5.000 cuando cada referido haga su primera venta.</p>
              </>
            ) : (
              <p className="text-gray-400 text-sm">Cargando...</p>
            )}
          </div>
        )}

        <div className="mt-6">
          <Link href="/profile" className="text-sm text-blue-600 hover:underline">← Mi perfil</Link>
        </div>
      </div>
    </div>
  )
}
