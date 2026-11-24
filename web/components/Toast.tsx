import { useCallback, useEffect, useRef, useState } from 'react'

type Kind = 'info' | 'ok' | 'error'

/** Aviso temporal ("toast") para confirmar acciones: enlace copiado, error de red, etc. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: Kind } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((text: string, kind: Kind = 'info', ms = 3200) => {
    if (timer.current) clearTimeout(timer.current)
    setMsg({ text, kind })
    timer.current = setTimeout(() => setMsg(null), ms)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const node = msg ? (
    <div
      data-testid="toast"
      role={msg.kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 max-w-[90vw] px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold text-center"
      style={{
        background: msg.kind === 'error' ? '#b91c1c' : '#000000',
        color: msg.kind === 'error' ? '#ffffff' : '#91e631',
      }}
    >
      {msg.text}
    </div>
  ) : null

  return { toast: node, show }
}
