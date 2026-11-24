import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode, createContext, useContext } from 'react'
import type { Rect } from '../lib/hotspots/types'

/**
 * Pantalla basada en una imagen del diseñador. La imagen se muestra TAL CUAL (nunca se edita).
 * Todo lo interactivo (botones, campos) se coloca encima con posiciones en % definidas en web/lib/hotspots/*.ts.
 * Con ?debugHotspots=1 se dibujan los rectángulos para ajustarlos.
 */

const DebugCtx = createContext(false)

type ScreenProps = { src: string; alt: string; bg?: string; children?: ReactNode; footer?: ReactNode }

export function Screen({ src, alt, bg = '#ffffff', children, footer }: ScreenProps) {
  const { query } = useRouter()
  const debug = query.debugHotspots === '1'
  return (
    <DebugCtx.Provider value={debug}>
      <div className="min-h-screen w-full flex flex-col items-center" style={{ background: bg }}>
        {/* containerType permite medir tipografía en % del ancho de la imagen (unidades cqw) */}
        <div className="relative w-full max-w-md" style={{ containerType: 'inline-size' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="block w-full h-auto select-none" draggable={false} decoding="async" />
          {children}
        </div>
        {footer}
      </div>
    </DebugCtx.Provider>
  )
}

function boxStyle(rect: Rect, debug: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
    background: debug ? 'rgba(255,0,0,.14)' : 'transparent',
    outline: debug ? '2px dashed rgba(220,0,0,.85)' : undefined,
    ...extra,
  }
}

type HotspotProps = {
  rect: Rect
  label: string
  onClick?: () => void
  href?: string
  disabled?: boolean
  round?: boolean
}

/** Área táctil invisible sobre la imagen. Siempre con aria-label (las imágenes no son accesibles por sí solas). */
export function Hotspot({ rect, label, onClick, href, disabled, round }: HotspotProps) {
  const debug = useContext(DebugCtx)
  const style = boxStyle(rect, debug, {
    borderRadius: round ? '9999px' : '1.2cqw',
    cursor: disabled ? 'wait' : 'pointer',
    WebkitTapHighlightColor: 'rgba(145,230,49,.25)',
  })
  const cls = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-black'
  const tag = debug ? <span style={{ position: 'absolute', left: 2, top: 0, fontSize: 9, color: '#900', background: '#fff8' }}>{label}</span> : null
  if (href) {
    return <Link href={href} aria-label={label} className={cls} style={style}>{tag}</Link>
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={cls} style={style}>
      {tag}
    </button>
  )
}

type InputProps = {
  rect: Rect
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  inputMode?: 'text' | 'email' | 'numeric' | 'tel' | 'search'
  fontCqw: number
  paddingLeftCqw: number
  disabled?: boolean
  onEnter?: () => void
  maxLength?: number
}

/**
 * <input> real sobre un recuadro de la imagen. Mientras está vacío es transparente: se ve el texto de ejemplo
 * que trae la imagen. Al escribir toma fondo blanco para tapar ese texto y muestra lo que el usuario teclea.
 */
export function HotspotInput({ rect, label, value, onChange, type = 'text', autoComplete, inputMode, fontCqw, paddingLeftCqw, disabled, onEnter, maxLength }: InputProps) {
  const debug = useContext(DebugCtx)
  const base = boxStyle(rect, debug)
  return (
    <input
      aria-label={label}
      type={type}
      value={value}
      disabled={disabled}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }}
      style={{
        ...base,
        background: value ? '#ffffff' : base.background,
        border: 0,
        outline: debug ? base.outline : 'none',
        color: '#000',
        fontSize: `${fontCqw}cqw`,
        paddingLeft: `${paddingLeftCqw}cqw`,
        paddingRight: '1cqw',
        fontFamily: 'inherit',
        caretColor: '#000',
      }}
    />
  )
}

/** Mensaje de estado dibujado sobre una zona libre (blanca) de la imagen. */
export function OverlayMessage({ rect, children, kind = 'error' }: { rect: Rect; children: ReactNode; kind?: 'error' | 'ok' }) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        position: 'absolute', left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, minHeight: `${rect.height}%`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontSize: '2.8cqw', lineHeight: 1.25, fontWeight: 600,
        color: kind === 'error' ? '#b91c1c' : '#166534',
      }}
    >
      {children}
    </div>
  )
}
