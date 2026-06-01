import { useEffect, useState } from 'react'
import Link from 'next/link'

type Business = { id: number; name: string; description: string; category: string; location: string; image_url: string; is_featured: boolean }
type Story = { id: number; title: string; content: string; media_url: string }

export default function Home() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [stories, setStories] = useState<Story[]>([])

  useEffect(() => {
    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/businesses')
      .then(r => r.json())
      .then(data => setBusinesses(data.businesses || []))
      .catch(() => {})

    // Usar /recommendations con ubicación del usuario si está disponible
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords
          fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/recommendations?latitude=${latitude}&longitude=${longitude}`)
            .then(r => r.json())
            .then(data => setStories((data.recommendations?.advertisements || []).slice(0, 3)))
            .catch(() => loadFeed())
        },
        () => loadFeed()
      )
    } else {
      loadFeed()
    }
  }, [])

  function loadFeed() {
    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/feed')
      .then(r => r.json())
      .then(data => setStories((data.stories || []).slice(0, 3)))
      .catch(() => {})
  }

  const featured = businesses.filter(b => b.is_featured)
  const recent = businesses.slice(0, 6)

  return (
    <div className="container">
      <div className="max-w-5xl mx-auto">

        {/* Hero */}
        <div className="card bg-gradient-to-r from-blue-600 to-blue-400 text-white mb-8">
          <h1 className="text-3xl font-bold">Mano — Marketplace Local</h1>
          <p className="mt-2 opacity-90">Descubre negocios, productos y ofertas cerca de ti.</p>
          <div className="mt-4 flex gap-3">
            <Link href="/businesses" className="bg-white text-blue-600 px-4 py-2 rounded font-medium text-sm hover:bg-blue-50">
              Explorar negocios
            </Link>
            <Link href="/feed" className="border border-white text-white px-4 py-2 rounded font-medium text-sm hover:bg-blue-500">
              Ver feed
            </Link>
          </div>
        </div>

        {/* Stories recientes */}
        {stories.length > 0 && (
          <section className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-semibold">📖 Últimas stories</h2>
              <Link href="/feed" className="text-sm text-blue-600 hover:underline">Ver todas →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stories.map(s => (
                <div key={s.id} className="border rounded overflow-hidden">
                  {s.media_url && <img src={s.media_url} alt={s.title} className="w-full h-32 object-cover" />}
                  <div className="p-3">
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Negocios destacados */}
        {featured.length > 0 && (
          <section className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-semibold">⭐ Negocios destacados</h2>
              <Link href="/businesses" className="text-sm text-blue-600 hover:underline">Ver todos →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {featured.map(b => (
                <Link key={b.id} href={'/businesses/' + b.id} className="border rounded overflow-hidden hover:shadow-md transition-shadow block">
                  {b.image_url && <img src={b.image_url} alt={b.name} className="w-full h-40 object-cover" />}
                  <div className="p-3">
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{b.description}</p>
                    <div className="mt-2 flex gap-2 text-xs text-gray-400">
                      {b.category && <span>{b.category}</span>}
                      {b.location && <span>📍 {b.location}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Todos los negocios recientes */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold">🏪 Negocios</h2>
            <Link href="/businesses" className="text-sm text-blue-600 hover:underline">Ver todos →</Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay negocios aún.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {recent.map(b => (
                <Link key={b.id} href={'/businesses/' + b.id} className="border rounded p-3 hover:shadow-sm transition-shadow block">
                  <p className="font-medium text-sm">{b.name}</p>
                  {b.category && <p className="text-xs text-gray-400 mt-0.5">{b.category}</p>}
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
