// Tipos y utilidades para pantallas hechas con imagen del diseñador + áreas táctiles (hotspots).
// REGLA: las coordenadas viven aquí (porcentajes de ancho/alto de la imagen), nunca como números mágicos en el JSX.
// Si el diseñador entrega una imagen nueva, solo se ajusta el archivo de la pantalla. La imagen NO se toca.
// Para ver los rectángulos sobre la pantalla: añade ?debugHotspots=1 a la URL.

/** Rectángulo en % del ancho (left, width) y del alto (top, height) de la imagen. */
export type Rect = { left: number; top: number; width: number; height: number }

export const r = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height })

/** Las imágenes viven en public/branding/ y algunas tienen espacios en el nombre ("QUE MANO ELIGES.jpg"). */
export const imageUrl = (file: string) => '/branding/' + encodeURIComponent(file)

/** Verde de marca (muestreado de la imagen INICIO.jpg). */
export const BRAND_GREEN = '#91e631'

/** Categorías del diseño (chips). Cada una agrupa las categorías libres de los negocios. */
export const CHIPS = ['Todos', 'Moda', 'Alimentos', 'Hogar'] as const
export type Chip = (typeof CHIPS)[number]
export const CHIP_GROUPS: Record<Exclude<Chip, 'Todos'>, string[]> = {
  Moda: ['moda', 'ropa', 'accesorios', 'calzado'],
  Alimentos: ['alimentos', 'café', 'cafe', 'restaurante', 'panadería', 'panaderia', 'comida'],
  Hogar: ['hogar', 'artesanías', 'artesanias', 'decoración', 'decoracion', 'muebles'],
}
export function matchesChip(category: string | undefined, chip: Chip): boolean {
  if (chip === 'Todos') return true
  const c = (category || '').toLowerCase().trim()
  return CHIP_GROUPS[chip].some(k => c.includes(k))
}
