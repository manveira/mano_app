import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Product = { id: number; name: string; description: string; price: number; image_url: string; commission_rate: number; business_id: number }

export default function ReferralPage() {
  const router = useRouter()
  const { slug } = router.query
  const [product, setProduct] = useState<Product | null>(null)
  const [referralLinkId, setReferralLinkId] = useState<number | null>(null)
  const [step, setStep] = useState<'product' | 'form' | 'paying'>('product')
  const [form, setForm] = useState({ name: '', phone: '', nequi: '' })
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const BASE = process.env.NEXT_PUBLIC_API_URL || ''

  useEffect(() => {
    if (!slug) return
    fetch(`${BASE}/r/${slug}`)
      .then(r => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then(data => {
        setProduct(data.product)
        setReferralLinkId(data.referral_link_id)
        setLoading(false)
      })
      .catch(() => { setError('Link no válido o producto no disponible.'); setLoading(false) })
  }, [slug])

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault()
    if (!product) return
    setStep('paying')
    setError('')

    try {
      // 1. Crear orden como guest
      const orderRes = await fetch(`${BASE}/orders/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: product.business_id,
          items: [{ product_id: product.id, quantity: qty }],
          guest_name: form.name,
          guest_phone: form.phone,
          referral_link_id: referralLinkId,
        }),
      })
      if (!orderRes.ok) {
        const d = await orderRes.json().catch(() => ({}))
        setError(d.error || 'Error al crear el pedido')
        setStep('form')
        return
      }
      const order = await orderRes.json()

      // 2. Iniciar pago Wompi (guest)
      const payRes = await fetch(`${BASE}/payments/wompi/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id }),
      })
      if (!payRes.ok) {
        const d = await payRes.json().catch(() => ({}))
        setError(d.error || 'Error al iniciar el pago')
        setStep('form')
        return
      }
      const pay = await payRes.json()

      // 3. Redirigir a Wompi
      if (pay.checkout_url) {
        window.location.href = pay.checkout_url
      } else {
        setError('No se pudo generar el link de pago')
        setStep('form')
      }
    } catch {
      setError('Error de conexión')
      setStep('form')
    }
  }

  if (loading) return <div className="container"><p className="text-gray-500 mt-8 text-center">Cargando producto...</p></div>

  if (error && !product) return (
    <div className="container">
      <div className="max-w-md mx-auto card text-center mt-8">
        <p className="text-red-600">{error}</p>
        <Link href="/" className="mt-3 inline-block text-blue-600 text-sm hover:underline">Ir al catálogo →</Link>
      </div>
    </div>
  )

  if (!product) return null

  const total = product.price * qty

  return (
    <div className="container">
      <div className="max-w-md mx-auto">

        {/* Producto */}
        <div className="card mb-4">
          {product.image_url && (
            <img src={product.image_url} alt={product.name} className="w-full h-52 object-cover rounded mb-4" />
          )}
          <h1 className="text-xl font-bold">{product.name}</h1>
          <p className="text-gray-600 text-sm mt-1">{product.description}</p>
          <p className="text-2xl font-bold text-blue-700 mt-3">${product.price.toLocaleString('es-CO')}</p>

          {/* Cantidad */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-sm text-gray-600">Cantidad:</span>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 border rounded text-lg">−</button>
            <span className="w-8 text-center font-semibold">{qty}</span>
            <button onClick={() => setQty(q => q + 1)} className="w-8 h-8 border rounded text-lg">+</button>
            <span className="ml-auto font-bold text-lg">${total.toLocaleString('es-CO')}</span>
          </div>
        </div>

        {step === 'product' && (
          <button
            onClick={() => setStep('form')}
            className="w-full bg-green-600 text-white py-3 rounded font-semibold text-lg hover:bg-green-700"
          >
            Comprar ahora — ${total.toLocaleString('es-CO')}
          </button>
        )}

        {(step === 'form' || step === 'paying') && (
          <form onSubmit={handleBuy} className="card space-y-3">
            <h2 className="font-semibold text-lg">Tus datos para el pedido</h2>
            <p className="text-xs text-gray-500">No necesitas crear una cuenta. Solo nombre y celular.</p>

            {error && <div className="p-2 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

            <div>
              <label className="block text-sm text-gray-700 mb-1">Nombre completo *</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required disabled={step === 'paying'}
                placeholder="Tu nombre"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Celular *</label>
              <input
                type="tel"
                className="w-full border rounded px-3 py-2"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                required disabled={step === 'paying'}
                placeholder="3XXXXXXXXX"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Nequi (opcional)</label>
              <input
                type="tel"
                className="w-full border rounded px-3 py-2"
                value={form.nequi}
                onChange={e => setForm(f => ({ ...f, nequi: e.target.value }))}
                disabled={step === 'paying'}
                placeholder="3XXXXXXXXX"
              />
              <p className="text-xs text-gray-400 mt-0.5">También puedes pagar con tarjeta o PSE en el siguiente paso.</p>
            </div>

            <button
              type="submit"
              disabled={step === 'paying'}
              className="w-full bg-green-600 text-white py-3 rounded font-semibold disabled:opacity-50 hover:bg-green-700"
            >
              {step === 'paying' ? 'Preparando pago...' : `Pagar $${total.toLocaleString('es-CO')} →`}
            </button>

            <button type="button" onClick={() => setStep('product')} className="w-full text-gray-500 text-sm hover:underline">
              ← Volver
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">
          Pago seguro procesado por Wompi · Acepta Nequi, PSE y tarjetas
        </p>
      </div>
    </div>
  )
}
