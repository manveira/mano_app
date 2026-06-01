import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Header(){
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [role, setRole] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      setIsAuthenticated(true)
      // Try to decode role from token (basic JWT parsing)
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const decoded = JSON.parse(atob(parts[1]))
          setRole(decoded.role || '')
        }
      } catch (e) {
        // ignore parse errors
      }
    }
  }, [])

  function handleLogout() {
    localStorage.removeItem('token')
    setIsAuthenticated(false)
    window.location.href = '/'
  }

  return (
    <header className="bg-white border-b">
      <div className="container flex items-center justify-between py-4">
        <nav className="flex items-center gap-4">
          <Link className="font-semibold text-lg" href="/">Mano</Link>
          <Link className="text-sm text-gray-600" href="/businesses">Negocios</Link>
          <Link className="text-sm text-gray-600" href="/feed">Feed</Link>
          <Link className="text-sm text-gray-600" href="/map">🗺 Mapa</Link>
        </nav>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Link className="text-sm text-gray-600" href="/cart">Carrito</Link>
              <Link className="text-sm text-gray-600" href="/orders">Mis Órdenes</Link>
              {role === 'business_owner' && (
                <Link className="text-sm text-gray-600" href="/dashboard">Dashboard</Link>
              )}
              {role === 'business_owner' && (
                <Link className="text-sm text-gray-600" href="/advertise">📣 Publicidad</Link>
              )}
              {role === 'freelancer' && (
                <Link className="text-sm font-medium text-green-600" href="/sell">💰 Vender</Link>
              )}
              {role === 'courier' && (
                <Link className="text-sm font-medium text-orange-600" href="/courier">🛵 Pedidos</Link>
              )}
              {role === 'admin' && (
                <Link className="text-sm font-medium text-purple-600" href="/admin">⚙️ Admin</Link>
              )}
              <Link className="text-sm text-gray-600" href="/profile">Perfil</Link>
              <button 
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-800 font-medium border border-red-600 px-3 py-1 rounded"
              >
                Salir
              </button>
            </>
          ) : (
            <>
              <Link className="text-sm text-gray-600" href="/cart">Carrito</Link>
              <Link className="text-sm bg-blue-600 text-white px-3 py-1 rounded" href="/signup">Registrarse</Link>
              <Link className="text-sm text-blue-600 font-medium border border-blue-600 px-3 py-1 rounded" href="/signin">Entrar</Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
