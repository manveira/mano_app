import { useEffect, useState } from 'react'
import Link from 'next/link'

type Screen = 'splash' | 'hero'

export default function Home() {
  const [screen, setScreen] = useState<Screen>('splash')

  useEffect(() => {
    const timer = setTimeout(() => setScreen('hero'), 2500)
    return () => clearTimeout(timer)
  }, [])

  /* ── 01: Splash logo — auto-avanza a los 2.5s ── */
  if (screen === 'splash') {
    return (
      <div className="min-h-screen flex flex-col items-center bg-white">
        <div className="w-full max-w-sm mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/01-splash-logo.jpeg"
            alt="mano"
            className="w-full block"
          />
        </div>
      </div>
    )
  }

  /* ── 02: Hero "Somos una red de comisionistas" ── */
  return (
    <div className="min-h-screen flex flex-col items-center bg-[#bef264]">
      <div className="w-full max-w-sm mx-auto relative">
        {/* Imagen oficial tal cual */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/02-home-hero-comisionistas.jpeg"
          alt="Somos una red de comisionistas"
          className="w-full block"
        />

        {/* Botón debajo de la imagen para ir al signup */}
        <div className="px-6 pt-4 pb-8 bg-[#bef264] space-y-3">
          <Link
            href="/signup"
            className="block w-full bg-black text-[#bef264] text-center font-black py-4 rounded-2xl text-lg tracking-wide"
          >
            Empezar ahora
          </Link>
          <Link
            href="/signin"
            className="block w-full text-center font-semibold text-black/50 py-2 text-sm"
          >
            ¿Ya tienes cuenta? <span className="underline text-black/70">Entra aquí</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
