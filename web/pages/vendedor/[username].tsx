import { useEffect, useMemo, useState } from 'react'
import Router, { useRouter } from 'next/router'
import { Screen, Hotspot, HotspotInput } from '../../components/Screen'
import { useToast } from '../../components/Toast'
import { COMPRADOR } from '../../lib/hotspots/comprador'
import { Chip, matchesChip } from '../../lib/hotspots/types'
import { api, ApiError, friendlyError } from '../../lib/api'
import { shareOrCopy } from '../../lib/useAuthGuard'

type Prod = { id: number; business_id: number; name: string; description: string; price: number; referral_slug: string }
type Biz = { id: number; category: string }

/** COMPRADOR.jpg: vitrina pública del comisionista. Cualquiera puede verla; "Agregar al carrito" guarda el producto real. */
export default function Vitrina() {
  const { query: q, isReady } = useRouter()
  const username = typeof q.username === 'string' ? q.username : ''
  const { toast, show } = useToast()
  const [products, setProducts] = useState<Prod[]>([])
  const [cats, setCats] = useState<Record<number, string>>({})
  const [text, setText] = useState('')
  const [chip, setChip] = useState<Chip>('Todos')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!isReady || !username) return
    Promise.all([
      api<{ products: Prod[] }>('/vendedor/' + encodeURIComponent(username), { auth: false }),
      api<{ businesses: Biz[] }>('/businesses', { auth: false }),
    ]).then(([v, b]) => {
      setProducts(v.products || [])
      setCats(Object.fromEntries((b.businesses || []).map(x => [x.id, x.category])))
    }).catch(e => {
      if (e instanceof ApiError && e.status === 404) setNotFound(true)
      else show(friendlyError(e), 'error')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, username])

  const visibles = useMemo(() => {
    const t = text.trim().toLowerCase()
    return products.filter(p =>
      matchesChip(cats[p.business_id], chip) &&
      (!t || p.name.toLowerCase().includes(t) || (p.description || '').toLowerCase().includes(t) || (cats[p.business_id] || '').toLowerCase().includes(t)))
  }, [products, cats, chip, text])

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-xl font-black mb-2">No encontramos esta vitrina</p>
        <p className="text-black/60 mb-6">El comisionista “{username}” no existe o ya no tiene productos.</p>
        <button onClick={() => Router.push('/')} className="bg-[#91e631] text-black font-black px-6 py-3 rounded-full">Ir a Mano</button>
      </div>
    )
  }

  function agregar(i: number) {
    const p = visibles[i]
    if (!p) return show('Esta vitrina no tiene un producto en esa posición.', 'info')
    let cart: any[] = []
    try { cart = JSON.parse(localStorage.getItem('mano_cart') || '[]') } catch { cart = [] }
    const otroNegocio = cart.length > 0 && cart.some(c => c.business_id !== p.business_id)
    const ex = cart.find(c => c.id === p.id)
    if (ex) ex.qty += 1
    else cart.push({ id: p.id, name: p.name, price: p.price, qty: 1, business_id: p.business_id })
    localStorage.setItem('mano_cart', JSON.stringify(cart))
    show(otroNegocio
      ? `${p.name} agregado. Ojo: tu carrito tiene productos de otro negocio y solo puedes pedir de uno a la vez.`
      : `${p.name} agregado al carrito (${cart.reduce((s, c) => s + c.qty, 0)} en total).`, otroNegocio ? 'info' : 'ok', otroNegocio ? 5500 : 3000)
  }

  async function compartir() {
    const url = `${window.location.origin}/vendedor/${username}`
    const res = await shareOrCopy({ title: `Vitrina de ${username} en Mano`, text: `Mira la vitrina de ${username} en Mano:`, url })
    if (res === 'copied') show('Link de la vitrina copiado.', 'ok')
    else if (res === 'failed') show('No se pudo copiar. Link: ' + url, 'error', 7000)
  }

  function anunciar(c: Chip, t: string) {
    const n = products.filter(p => matchesChip(cats[p.business_id], c) && (!t || p.name.toLowerCase().includes(t.toLowerCase()))).length
    show(`${c}${t ? ` · "${t}"` : ''}: ${n} producto${n === 1 ? '' : 's'}.`, 'info')
  }

  const S = COMPRADOR.search
  return (
    <Screen src={COMPRADOR.src} alt={COMPRADOR.alt}>
      <Hotspot rect={COMPRADOR.logo.rect} label={COMPRADOR.logo.label} href="/" />
      <Hotspot rect={COMPRADOR.carrito.rect} label={COMPRADOR.carrito.label} href="/cart" round />
      <Hotspot rect={COMPRADOR.compartir.rect} label={COMPRADOR.compartir.label} onClick={compartir} round />
      {COMPRADOR.chips.map(c => (
        <Hotspot key={c.chip} rect={c.rect} label={c.label} round onClick={() => { setChip(c.chip); anunciar(c.chip, text) }} />
      ))}
      <HotspotInput rect={S.rect} label={S.label} value={text} onChange={setText} inputMode="search"
        fontCqw={S.fontCqw} paddingLeftCqw={S.paddingLeftCqw} onEnter={() => anunciar(chip, text)} />
      {COMPRADOR.agregar.map((a, i) => (
        <Hotspot key={i} rect={a.rect} label={visibles[i] ? `Agregar ${visibles[i].name} al carrito` : a.label} round onClick={() => agregar(i)} />
      ))}
      {toast}
    </Screen>
  )
}
