import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type User = { id: number; email: string; role: string; name?: string }

const ROLE_LABELS: Record<string, string> = {
  customer: 'Cliente',
  business_owner: 'Dueño de negocio',
  freelancer: 'Freelancer',
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { Router.push('/signin'); return }

    fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/me', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(r => {
        if (r.status === 401) { Router.push('/signin'); return null }
        return r.json()
      })
      .then(data => {
        if (data) setUser(data.user)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="container"><p className="text-gray-500 mt-8">Cargando...</p></div>
  if (!user) return null

  return (
    <div className="container">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4">Mi perfil</h1>

        <div className="card mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
              {(user.name || user.email)[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-lg">{user.name || '—'}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
          <div className="border-t pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">ID de usuario</span>
              <span className="font-medium">#{user.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rol</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                user.role === 'business_owner' ? 'bg-purple-100 text-purple-700' :
                user.role === 'freelancer' ? 'bg-orange-100 text-orange-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
          </div>
        </div>

        {/* Acciones según rol */}
        <div className="card space-y-2">
          <h3 className="font-semibold mb-2">Acciones</h3>
          <Link href="/orders" className="block text-blue-600 hover:underline text-sm">📦 Mis órdenes</Link>
          {user.role === 'business_owner' && (
            <>
              <Link href="/dashboard" className="block text-blue-600 hover:underline text-sm">📊 Dashboard de negocio</Link>
              <Link href="/create-business" className="block text-blue-600 hover:underline text-sm">➕ Crear negocio</Link>
              <Link href="/create-product" className="block text-blue-600 hover:underline text-sm">➕ Crear producto</Link>
              <Link href="/advertise" className="block text-blue-600 hover:underline text-sm">📣 Publicidad</Link>
            </>
          )}
          {user.role === 'freelancer' && (
            <>
              <Link href="/sell" className="block text-green-600 hover:underline text-sm font-medium">💰 Panel de ventas</Link>
              {(user as any).plan === 'pro' && (user as any).plan_expires_at && (
                <p className="text-xs text-gray-500">
                  Plan Pro activo hasta: {new Date((user as any).plan_expires_at).toLocaleDateString('es-CO')}
                </p>
              )}
              {(user as any).plan !== 'pro' && (
                <Link href="/apply" className="block text-purple-600 hover:underline text-sm">🏪 Registrar mi negocio</Link>
              )}
            </>
          )}
          {user.role === 'courier' && (
            <Link href="/courier" className="block text-blue-600 hover:underline text-sm">🛵 Ver pedidos disponibles</Link>
          )}
          <button
            onClick={() => { localStorage.removeItem('token'); Router.push('/') }}
            className="block text-red-600 hover:underline text-sm text-left"
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
