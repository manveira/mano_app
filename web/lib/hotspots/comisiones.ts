// comisiones.jpg — "Comisiones": saldo, Retirar dinero, Movimientos, ¿Cómo retirar tu dinero?
import { imageUrl, r } from './types'
export const COMISIONES = {
  src: imageUrl('comisiones.jpg'),
  alt: 'Comisiones: tus comisiones, retirar dinero y movimientos',
  hotspots: {
    volver:    { rect: r(6.5, 4.6, 24, 4.2),    label: 'Volver' },
    retirar:   { rect: r(6.8, 33.4, 84.4, 5.5), label: 'Retirar dinero' },
    verTodos:  { rect: r(76.0, 42.0, 16, 3.3),  label: 'Ver todos los movimientos' },
    verGuia:   { rect: r(29.5, 89.0, 16, 2.4),  label: 'Ver guía para retirar tu dinero' },
  },
} as const
