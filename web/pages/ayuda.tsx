import Link from 'next/link'
import { useAuthGuard } from '../lib/useAuthGuard'

const WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').replace(/\D/g, '')
const EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || ''

const FAQ: { q: string; a: string }[] = [
  { q: '¿Cómo gano dinero como comisionista?', a: 'Busca negocios, afíliate a sus productos y comparte tu link. Por cada venta ganas el porcentaje de comisión que fijó el negocio (entre 10 % y 40 %).' },
  { q: '¿Cuándo recibo mi comisión?', a: 'Cuando el comprador confirma que recibió su pedido, o automáticamente a las 24 horas. El dinero queda en tu saldo disponible.' },
  { q: '¿Cómo retiro mi dinero?', a: 'En Comisiones toca "Retirar dinero". El mínimo es $5.000 y se transfiere a tu Nequi en 1 a 2 días hábiles.' },
  { q: '¿Qué cobra Mano?', a: 'Mano cobra un 4 % fijo del valor de cada venta. El negocio recibe el resto menos tu comisión.' },
  { q: '¿Qué pasa si hay un problema con un pedido?', a: 'Se abre una disputa y Mano retiene el dinero hasta resolverla. Nadie cobra mientras la disputa esté abierta.' },
  { q: '¿Puedo comprarme con mi propio link?', a: 'La compra es válida, pero no genera comisión (regla anti-fraude: misma cédula de comprador y comisionista).' },
]

/** Ayuda: preguntas frecuentes y contacto. Aún sin imagen del diseñador. */
export default function Ayuda() {
  const { ready } = useAuthGuard()
  if (!ready) return null
  return (
    <div className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-5 py-6">
        <Link href="/profile" className="text-sm font-semibold">← Mi perfil</Link>
        <h1 className="text-2xl font-black mt-3 mb-4">Ayuda</h1>
        <div className="space-y-2">
          {FAQ.map(f => (
            <details key={f.q} className="border border-gray-300 rounded-2xl p-4">
              <summary className="font-bold cursor-pointer">{f.q}</summary>
              <p className="mt-2 text-sm text-black/70">{f.a}</p>
            </details>
          ))}
        </div>
        {(WHATSAPP || EMAIL) && (
          <div className="mt-6 space-y-2">
            <p className="font-bold">¿Necesitas hablar con nosotros?</p>
            {WHATSAPP && <a className="block w-full text-center bg-[#91e631] text-black font-black py-3 rounded-full" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>}
            {EMAIL && <a className="block w-full text-center border border-black font-bold py-3 rounded-full" href={`mailto:${EMAIL}`}>{EMAIL}</a>}
          </div>
        )}
      </div>
    </div>
  )
}
