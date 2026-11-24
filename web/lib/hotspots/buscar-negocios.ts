// buscar negocios.jpg — Buscar negocios (búsqueda, chips y 6 filas de ejemplo).
import { imageUrl, r } from './types'
const CHIP_TOP = 18.9, CHIP_H = 3.4
export const BUSCAR_NEGOCIOS = {
  src: imageUrl('buscar negocios.jpg'),
  alt: 'Buscar negocios por nombre o categoría',
  volver: { rect: r(8.0, 4.6, 36, 4.2), label: 'Volver' },
  search: { rect: r(20, 11.3, 70, 4.7), label: 'Buscar por nombre o categoría', fontCqw: 3.0, paddingLeftCqw: 1.5 },
  chips: [
    { chip: 'Todos',     rect: r(10.4, CHIP_TOP, 15.6, CHIP_H), label: 'Filtro Todos' },
    { chip: 'Moda',      rect: r(29.7, CHIP_TOP, 15.6, CHIP_H), label: 'Filtro Moda' },
    { chip: 'Alimentos', rect: r(49.1, CHIP_TOP, 21.2, CHIP_H), label: 'Filtro Alimentos' },
    { chip: 'Hogar',     rect: r(73.9, CHIP_TOP, 15.7, CHIP_H), label: 'Filtro Hogar' },
  ],
  // Las 6 filas de la lista (cada una abre el negocio que ocupa esa posición en el resultado real)
  filas: [
    { rect: r(7.8, 24.0, 84.4, 10.4), label: 'Negocio 1' },
    { rect: r(7.8, 34.6, 84.4, 9.8),  label: 'Negocio 2' },
    { rect: r(7.8, 44.6, 84.4, 10.2), label: 'Negocio 3' },
    { rect: r(7.8, 55.0, 84.4, 9.8),  label: 'Negocio 4' },
    { rect: r(7.8, 65.0, 84.4, 9.8),  label: 'Negocio 5' },
    { rect: r(7.8, 75.0, 84.4, 10.3), label: 'Negocio 6' },
  ],
} as const
