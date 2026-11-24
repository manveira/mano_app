// PERFIL.jpg — "Mi perfil" (avatar, nivel, Ajustes, Ayuda).
import { imageUrl, r } from './types'
export const PERFIL = {
  src: imageUrl('PERFIL.jpg'),
  alt: 'Mi perfil: nivel actual, ajustes y ayuda',
  hotspots: {
    volver:  { rect: r(8.5, 4.6, 26, 4.2),    label: 'Volver' },
    avatar:  { rect: r(33.3, 11.3, 32.3, 18.2), label: 'Cambiar foto de perfil' },
    ajustes: { rect: r(9.9, 72.4, 84.0, 7.6), label: 'Ajustes' },
    ayuda:   { rect: r(9.9, 80.8, 84.0, 7.6), label: 'Ayuda' },
  },
} as const
