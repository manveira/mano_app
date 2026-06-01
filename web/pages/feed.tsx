import { useEffect, useState } from 'react'
import Link from 'next/link'

type Story = { id: number; title: string; content: string; media_url: string; user_id: number }
type Ad = { id: number; title: string; description: string; image_url: string; package_type: string; business_id: number }

export default function Feed() {
  const [stories, setStories] = useState<Story[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/feed')
      .then(r => r.json())
      .then(data => {
        setStories(data.stories || [])
        setAds(data.advertisements || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando feed...</p></div>

  return (
    <div className="container">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Feed</h1>

        {/* Anuncios destacados */}
        {ads.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">✨ Destacados</h2>
            <div className="space-y-3">
              {ads.map(ad => (
                <div key={ad.id} className="border rounded overflow-hidden flex gap-3 p-3 bg-yellow-50">
                  {ad.image_url && (
                    <img src={ad.image_url} alt={ad.title} className="w-20 h-20 object-cover rounded flex-shrink-0" />
                  )}
                  <div>
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded font-medium">{ad.package_type}</span>
                    <p className="font-semibold mt-1">{ad.title}</p>
                    <p className="text-sm text-gray-600">{ad.description}</p>
                    <Link href={'/businesses/' + ad.business_id} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                      Ver negocio →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Stories */}
        <section>
          <h2 className="text-lg font-semibold mb-3">📖 Stories</h2>
          {stories.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay stories aún.</p>
          ) : (
            <div className="space-y-4">
              {stories.map(story => (
                <div key={story.id} className="card">
                  {story.media_url && (
                    <img src={story.media_url} alt={story.title} className="w-full h-48 object-cover rounded mb-3" />
                  )}
                  <h3 className="font-semibold">{story.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{story.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
