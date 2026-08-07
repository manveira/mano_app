import { useState } from 'react'
import Router from 'next/router'
import Link from 'next/link'

type Role = 'freelancer' | 'business_owner'
type Step = 'choose' | 'form' | 'success'

export default function SignUp() {
  const [step, setStep] = useState<Step>('choose')
  const [role, setRole] = useState<Role>('freelancer')
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    phone: '', document_id: '', nequi_number: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('La contraseña debe tener mínimo 8 caracteres'); return }
    setLoading(true)
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL || '') + '/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role }),
      })
      if (res.ok) {
        setStep('success')
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Error al registrarse')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  /* ── PASO 1: imagen 03 con botones transparentes encima ── */
  if (step === 'choose') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center">
        <div className="w-full max-w-sm mx-auto relative">
          {/* Imagen oficial tal cual */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/03-signup-elegir-rol.jpeg"
            alt="¿Cómo quieres usar mano?"
            className="w-full block"
          />

          {/* Botón invisible sobre la tarjeta "Comisionista" — ~35% a 55% del alto */}
          <button
            onClick={() => { setRole('freelancer'); setStep('form') }}
            className="absolute w-[82%] left-[9%]"
            style={{ top: '32%', height: '17%' }}
            aria-label="Comisionista"
          />

          {/* Botón invisible sobre la tarjeta "Negocio" — ~57% a 77% del alto */}
          <button
            onClick={() => { setRole('business_owner'); setStep('form') }}
            className="absolute w-[82%] left-[9%]"
            style={{ top: '54%', height: '17%' }}
            aria-label="Negocio"
          />
        </div>

        <div className="w-full max-w-sm px-6 py-4 bg-white">
          <p className="text-center text-sm text-black/50">
            ¿Ya tienes cuenta?{' '}
            <Link href="/signin" className="font-bold text-black underline">Iniciar sesión</Link>
          </p>
        </div>
      </div>
    )
  }

  /* ── PASO 2: imagen 04 con inputs dentro del espacio blanco vacío de la tarjeta ── */
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-[#a8e63d] flex flex-col items-center">
        <div className="w-full max-w-sm mx-auto relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/04-signup-formulario-negocio.jpeg"
            alt="Registra tu negocio"
            className="w-full block"
          />

          {/* Campos dentro del espacio blanco vacío de la tarjeta (~42% a ~80%) */}
          <div
            className="absolute overflow-y-auto"
            style={{ top: '42%', left: '18%', width: '64%', height: '39%' }}
          >
            {error && (
              <div className="mb-1.5 px-2 py-1 bg-red-100 text-red-600 rounded text-xs leading-tight">{error}</div>
            )}
            <form id="signup-form" onSubmit={submit} className="space-y-1">
              <input
                className="w-full bg-transparent border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black placeholder:text-gray-400"
                placeholder="Nombre completo"
                value={form.name} onChange={set('name')} required disabled={loading}
              />
              <input
                type="email"
                className="w-full bg-transparent border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black placeholder:text-gray-400"
                placeholder="Email"
                value={form.email} onChange={set('email')} required disabled={loading}
              />
              <input
                type="password"
                className="w-full bg-transparent border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black placeholder:text-gray-400"
                placeholder="Contraseña (mín. 8 caracteres)"
                value={form.password} onChange={set('password')} required disabled={loading}
              />
              <input
                type="tel"
                className="w-full bg-transparent border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black placeholder:text-gray-400"
                placeholder="Celular (3XXXXXXXXX)"
                value={form.phone} onChange={set('phone')} disabled={loading}
              />
              <input
                className="w-full bg-transparent border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black placeholder:text-gray-400"
                placeholder="Número de cédula"
                value={form.document_id} onChange={set('document_id')} disabled={loading}
              />
              <input
                type="tel"
                className="w-full bg-transparent border-0 border-b border-gray-300 px-0 py-1.5 text-sm outline-none focus:border-black placeholder:text-gray-400"
                placeholder="Nequi (para recibir pagos)"
                value={form.nequi_number} onChange={set('nequi_number')} disabled={loading}
              />
            </form>
          </div>

          {/* Botón transparente exactamente sobre el botón verde "Crear cuenta" (~81% a ~88%) */}
          <button
            form="signup-form"
            type="submit"
            disabled={loading}
            className="absolute bg-transparent text-transparent left-[18%] w-[64%] cursor-pointer disabled:cursor-wait"
            style={{ top: '81%', height: '7%' }}
            aria-label={loading ? 'Creando cuenta...' : 'Crear cuenta'}
          />

          {/* Overlay de carga */}
          {loading && (
            <div className="absolute inset-0 bg-white/40 flex items-center justify-center">
              <div className="bg-white rounded-2xl px-6 py-3 shadow-xl text-sm font-black">Creando cuenta...</div>
            </div>
          )}

          {/* Link transparente sobre "Iniciar sesión" en la imagen (~89% a ~93%) */}
          <Link
            href="/signin"
            className="absolute bg-transparent left-[25%] w-[50%]"
            style={{ top: '89%', height: '4%' }}
            aria-label="Iniciar sesión"
          />
        </div>

        <button
          onClick={() => setStep('choose')}
          className="mt-3 mb-6 text-sm text-black/60 hover:text-black/80"
        >
          ← Cambiar tipo de cuenta
        </button>
      </div>
    )
  }

  /* ── PASO 3: imagen 05 con botón "Entra" interactivo encima ── */
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="w-full max-w-sm mx-auto relative">
        {/* Imagen oficial tal cual */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/05-signup-felicitaciones.jpeg"
          alt="Felicitaciones"
          className="w-full block"
        />

        {/* Botón transparente sobre "Entra" (~67% a 75% del alto) */}
        <button
          onClick={() => Router.push('/signin?registered=1')}
          className="absolute left-[15%] w-[70%] cursor-pointer"
          style={{ top: '67%', height: '8%', background: 'transparent' }}
          aria-label="Entra"
        />
      </div>
    </div>
  )
}
