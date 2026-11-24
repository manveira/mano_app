import { useEffect, useMemo, useState } from 'react'
import Router from 'next/router'
import { Screen, Hotspot, HotspotInput } from '../components/Screen'
import { useToast } from '../components/Toast'
import { BUSCAR_NEGOCIOS } from '../lib/hotspots/buscar-negocios'
import { Chip, matchesChip } from '../lib/hotspots/types'
import { api, friendlyError } from '../lib/api'
import { homeForRole } from '../lib/session'
import { useAuthGuard } from '../lib/useAuthGuard'

type Biz = { id: number; name: string; slug: string; category: string; location: string }

/** buscar negocios.jpg: busca negocios reales; cada fila abre el negocio que ocupa esa posición en el resultado. */
export default function BuscarNegocios() {
  const { ready, role } = useAuthGuard()
  const { toast, show } = useToast()
  const [all, setAll] = useState<Biz[]>([])
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<Chip>('Todos')

  useEffect(() => {
    if (!ready) return
    api<{ businesses: Biz[] }>('/businesses', { auth: false })
      .then(d => setAll(d.businesses || []))
      .catch(e => show(friendlyError(e), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(b =>
      matchesChip(b.category, chip) &&
      (!q || b.name.toLowerCase().includes(q) || (b.category || '').toLowerCase().includes(q) || (b.location || '').toLowerCase().includes(q)))
  }, [all, chip, query])

  if (!ready) return null

  function anunciar(c: Chip, q: string) {
    const n = all.filter(b => matchesChip(b.category, c) && (!q || [b.name, b.category, b.location].join(' ').toLowerCase().includes(q.toLowerCase()))).length
    show(`${n} negocio${n === 1 ? '' : 's'} encontrado${n === 1 ? '' : 's'}${q ? ` para "${q}"` : ''}${c !== 'Todos' ? ` en ${c}` : ''}.`, 'info')
  }

  function abrir(i: number) {
    const b = visibles[i]
    if (!b) return show('No hay un negocio en esa posición con la búsqueda actual.', 'info')
    Router.push('/negocio/' + b.slug)
  }

  const S = BUSCAR_NEGOCIOS.search
  return (
    <Screen src={BUSCAR_NEGOCIOS.src} alt={BUSCAR_NEGOCIOS.alt}>
      <Hotspot rect={BUSCAR_NEGOCIOS.volver.rect} label={BUSCAR_NEGOCIOS.volver.label} onClick={() => Router.push(homeForRole(role))} />
      <HotspotInput rect={S.rect} label={S.label} value={query} onChange={setQuery} inputMode="search"
        fontCqw={S.fontCqw} paddingLeftCqw={S.paddingLeftCqw} onEnter={() => anunciar(chip, query)} />
      {BUSCAR_NEGOCIOS.chips.map(c => (
        <Hotspot key={c.chip} rect={c.rect} label={c.label} round onClick={() => { setChip(c.chip); anunciar(c.chip, query) }} />
      ))}
      {BUSCAR_NEGOCIOS.filas.map((f, i) => (
        <Hotspot key={i} rect={f.rect} label={visibles[i] ? `Abrir ${visibles[i].name}` : f.label} onClick={() => abrir(i)} />
      ))}
      {toast}
    </Screen>
  )
}
