import { useEffect, useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => m.QRCodeSVG), { ssr: false })

type User = { id: number; name: string; email: string; role: string; username: string }
type View = 'menu' | 'carnet'

export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
  const [referralUrl, setReferralUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('menu')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { Router.push('/signin'); return }
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const headers = { Authorization: 'Bearer ' + token }
    Promise.all([
      fetch(base + '/me', { headers }),
      fetch(base + '/sell/referral-code', { headers }),
    ]).then(async ([meRes, refRes]) => {
      if (meRes.status === 401) { Router.push('/signin'); return }
      if (meRes.ok) { const d = await meRes.json(); setUser(d.user) }
      if (refRes.ok) { const d = await refRes.json(); setReferralUrl(d.referral_url || '') }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function logout() {
    localStorage.removeItem('token')
    Router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#bef264] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return null

  const firstName = user.name?.split(' ')[0] || user.email
  const isFreelancer = user.role === 'freelancer'
  const isBusiness = user.role === 'business_owner'

  /* ── CARNET QR: imagen 07 literal, solo botón volver ── */
  if (view === 'carnet') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="w-full max-w-sm mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/07-perfil-carnet-qr.jpeg"
            alt="Carnet"
            className="w-full block"
          />
        </div>
        <button
          onClick={() => setView('menu')}
          className="mt-4 mb-6 text-sm text-white/60 hover:text-white"
        >
          ← Volver
        </button>
      </div>
    )
  }

  /* ── MENÚ PRINCIPAL: imagen 06 con botones invisibles encima ── */
  return (
    <div className="min-h-screen bg-black flex flex-col items-center">
      <div className="w-full max-w-sm mx-auto relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/06-perfil-menu-comisionista.jpeg"
          alt="Perfil"
          className="w-full block"
        />

        {/* Cara del chico → carnet */}
        <button
          onClick={() => setView('carnet')}
          className="absolute rounded-full cursor-pointer"
          style={{ top: '2%', left: '37%', width: '26%', height: '23%', background: 'transparent' }}
          aria-label="Ver carnet"
        />

        {/* Mis Productos ~39-46% */}
        <button onClick={() => Router.push('/sell')}
          className="absolute cursor-pointer"
          style={{ top: '39%', left: '10%', width: '80%', height: '7%', background: 'transparent' }}
          aria-label="Mis Productos"
        />

        {/* Mi Dinero ~45-52% */}
        <button onClick={() => Router.push('/sell')}
          className="absolute cursor-pointer"
          style={{ top: '45%', left: '10%', width: '80%', height: '7%', background: 'transparent' }}
          aria-label="Mi Dinero"
        />

        {/* Pendientes ~50-57% */}
        <button onClick={() => Router.push('/orders')}
          className="absolute cursor-pointer"
          style={{ top: '50%', left: '10%', width: '80%', height: '7%', background: 'transparent' }}
          aria-label="Pendientes"
        />

        {/* Cerrar sesión ~74-82% */}
        <button
          onClick={logout}
          className="absolute cursor-pointer"
          style={{ top: '74%', left: '10%', width: '80%', height: '8%', background: 'transparent' }}
          aria-label="Cerrar sesión"
        />
      </div>
    </div>
  )
}
