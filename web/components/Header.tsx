import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Header() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [initial, setInitial] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      setLoggedIn(true)
      const name = payload.name || payload.email || ''
      setInitial(name[0]?.toUpperCase() || '?')
    } catch {}
  }, [])

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 bg-lime-300">
      <Link href="/" className="font-black text-2xl text-black tracking-tight">mano</Link>
      {loggedIn ? (
        <Link href="/profile"
          className="w-9 h-9 rounded-full bg-black text-lime-300 flex items-center justify-center font-bold text-sm">
          {initial}
        </Link>
      ) : (
        <Link href="/signin"
          className="bg-black text-lime-300 font-bold px-4 py-2 rounded-full text-sm">
          Entrar
        </Link>
      )}
    </header>
  )
}
