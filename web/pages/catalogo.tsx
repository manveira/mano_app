import { useEffect, useMemo, useState } from 'react'
import Router from 'next/router'
import { Screen, Hotspot, HotspotInput } from '../components/Screen'
import { useToast } from '../components/Toast'
import { CATALOGO } from '../lib/hotspots/catalogo'
import { Chip, matchesChip } from '../lib/hotspots/types'
import { api, friendlyError } from '../lib/api'
import { shareOrCopy, useAuthGuard } from '../lib/useAuthGuard'

type Link = { id: number; slug: string; url: string; business_id: number; product: { id: number; name: string; description: string; price: number; commission_rate: number } }
type Biz = { id: number; category: string }

/** CATALOGO.jpg: "Mi catálogo" = los productos a los que el comisionista se afilió. Compartir cada producto o todo el catálogo. */
export default function Catalogo() {
  const { ready } = useAuthGuard(['freelancer'])
  const { toast, show } = useToast()
  const [links, setLinks] = useState<Link[]>([])
  const [cats, setCats] = useState<Record<number, string>>({})
  const [username, setUsername] = useState('')
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<Chip>('Todos')

  useEffect(() => {
    if (!ready) return
    Promise.all([
      api<{ links: Link[] }>('/sell/links'),
      api<{ businesses: Biz[] }>('/businesses', { auth: false }),
      api<{ user: { username: string } }>('/me'),
    ]).then(([l, b, me]) => {
      setLinks(l.links || [])
      setCats(Object.fromEntries((b.businesses || []).map(x => [x.id, x.category])))
      setUsername(me.user?.username || '')
    }).catch(e => show(friendlyError(e), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Lo que el comisionista ve en su catálogo según búsqueda y categoría (el orden define qué tarjeta abre cada botón)
  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return links.filter(l =>
      matchesChip(cats[l.business_id], chip) &&
      (!q || l.product.name.toLowerCase().includes(q) || (l.product.description || '').toLowerCase().includes(q) || (cats[l.business_id] || '').toLowerCase().includes(q)))
  }, [links, cats, chip, query])

  if (!ready) return null

  async function compartirProducto(i: number) {
    const l = visibles[i]
    if (!l) return show('Todavía no tienes un producto en esa posición. Afíliate a productos desde "Buscar negocios".', 'info', 4500)
    const res = await shareOrCopy({ title: l.product.name, text: `Mira ${l.product.name} en Mano:`, url: l.url })
    if (res === 'copied') show('Link de ' + l.product.name + ' copiado.', 'ok')
    else if (res === 'failed') show('No se pudo copiar. Link: ' + l.url, 'error', 7000)
  }

  async function compartirCatalogo() {
    if (!username) return show('No se pudo leer tu perfil. Inténtalo de nuevo.', 'error')
    const url = `${window.location.origin}/vendedor/${username}`
    const res = await shareOrCopy({ title: 'Mi catálogo en Mano', text: 'Mira mi catálogo en Mano:', url })
    if (res === 'copied') show('Link de tu catálogo copiado.', 'ok')
    else if (res === 'failed') show('No se pudo copiar. Link: ' + url, 'error', 7000)
  }

  function anunciar(c: Chip, q: string) {
    const n = links.filter(l => matchesChip(cats[l.business_id], c) && (!q || l.product.name.toLowerCase().includes(q.toLowerCase()))).length
    show(`${c}${q ? ` · "${q}"` : ''}: ${n} producto${n === 1 ? '' : 's'} en tu catálogo.`, 'info')
  }

  const S = CATALOGO.search
  return (
    <Screen src={CATALOGO.src} alt={CATALOGO.alt}>
      <Hotspot rect={CATALOGO.volver.rect} label={CATALOGO.volver.label} onClick={() => Router.push('/comisionista')} />
      <HotspotInput rect={S.rect} label={S.label} value={query} onChange={setQuery} inputMode="search"
        fontCqw={S.fontCqw} paddingLeftCqw={S.paddingLeftCqw} onEnter={() => anunciar(chip, query)} />
      {CATALOGO.chips.map(c => (
        <Hotspot key={c.chip} rect={c.rect} label={c.label} round onClick={() => { setChip(c.chip); anunciar(c.chip, query) }} />
      ))}
      <Hotspot rect={CATALOGO.compartirCatalogo.rect} label={CATALOGO.compartirCatalogo.label} onClick={compartirCatalogo} round />
      {CATALOGO.compartirProducto.map((p, i) => (
        <Hotspot key={i} rect={p.rect} label={p.label} round onClick={() => compartirProducto(i)} />
      ))}
      {toast}
    </Screen>
  )
}
