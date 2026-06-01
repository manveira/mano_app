import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'

type Business = {
  id: number; name: string; category: string; location: string
  latitude: number; longitude: number; image_url: string; is_featured: boolean
}

const CATEGORIES = ['Todos', 'Café', 'Restaurante', 'Artesanías', 'Hotel', 'Tienda']

export default function MapPage() {
  const mapRef = useRef<any>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [selected, setSelected] = useState<Business | null>(null)
  const [category, setCategory] = useState('Todos')
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(true)

  // Coordenadas por defecto: Tumaco, Colombia
  const DEFAULT_CENTER: [number, number] = [1.7989, -78.7628]

  useEffect(() => {
    // Obtener ubicación del usuario
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        () => setUserPos(DEFAULT_CENTER)
      )
    } else {
      setUserPos(DEFAULT_CENTER)
    }

    // Cargar negocios
    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/businesses')
      .then(r => r.json())
      .then(data => { setBusinesses(data.businesses || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!userPos || !mapContainerRef.current || mapRef.current) return

    // Cargar Leaflet dinámicamente (no SSR)
    import('leaflet').then(L => {
      // Fix icono por defecto de Leaflet en Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapContainerRef.current!).setView(userPos, 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map)

      // Marcador del usuario
      const userIcon = L.divIcon({
        html: '<div style="background:#2563eb;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.4)"></div>',
        className: '', iconAnchor: [7, 7]
      })
      L.marker(userPos, { icon: userIcon }).addTo(map).bindPopup('📍 Tu ubicación')

      mapRef.current = { map, L, markers: [] as any[] }
    })
  }, [userPos])

  // Actualizar marcadores cuando cambian negocios o categoría
  useEffect(() => {
    if (!mapRef.current) return
    const { map, L, markers } = mapRef.current

    // Limpiar marcadores anteriores
    markers.forEach((m: any) => map.removeLayer(m))
    mapRef.current.markers = []

    const filtered = businesses.filter(b =>
      b.latitude && b.longitude &&
      (category === 'Todos' || b.category === category)
    )

    filtered.forEach(b => {
      const color = b.is_featured ? '#f59e0b' : '#6b7280'
      const icon = L.divIcon({
        html: `<div style="background:${color};color:white;padding:3px 6px;border-radius:4px;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${b.is_featured ? '⭐ ' : ''}${b.name}</div>`,
        className: '', iconAnchor: [0, 0]
      })
      const marker = L.marker([b.latitude, b.longitude], { icon })
        .addTo(map)
        .on('click', () => setSelected(b))
      mapRef.current.markers.push(marker)
    })
  }, [businesses, category, mapRef.current])

  const filtered = businesses.filter(b =>
    category === 'Todos' || b.category === category
  )

  return (
    <div className="container">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Mapa de negocios</h1>

        {/* Filtros */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${category === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Mapa */}
          <div className="md:col-span-2">
            {/* CSS de Leaflet */}
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <div
              ref={mapContainerRef}
              className="rounded-lg overflow-hidden border"
              style={{ height: '450px' }}
            />
            {loading && <p className="text-gray-400 text-sm mt-2">Cargando negocios...</p>}
          </div>

          {/* Panel lateral */}
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '450px' }}>
            {selected ? (
              <div className="card border-blue-200">
                {selected.image_url && (
                  <img src={selected.image_url} alt={selected.name} className="w-full h-32 object-cover rounded mb-3" />
                )}
                <h3 className="font-semibold">{selected.name}</h3>
                <p className="text-xs text-gray-500 mt-1">{selected.category} · {selected.location}</p>
                {selected.is_featured && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded mt-1 inline-block">⭐ Destacado</span>}
                <div className="mt-3 flex gap-2">
                  <Link href={`/businesses/${selected.id}`} className="flex-1 bg-blue-600 text-white text-center py-1.5 rounded text-sm hover:bg-blue-700">
                    Ver productos
                  </Link>
                  <button onClick={() => setSelected(null)} className="px-3 py-1.5 border rounded text-sm text-gray-500">✕</button>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Haz clic en un negocio del mapa para ver detalles.</p>
            )}

            <p className="text-xs text-gray-400">{filtered.length} negocios en el mapa</p>
            {filtered.filter(b => b.latitude && b.longitude).map(b => (
              <div key={b.id} onClick={() => setSelected(b)}
                className={`p-3 border rounded cursor-pointer hover:border-blue-300 transition-colors ${selected?.id === b.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                <p className="font-medium text-sm">{b.is_featured ? '⭐ ' : ''}{b.name}</p>
                <p className="text-xs text-gray-400">{b.category}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
