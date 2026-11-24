// CATALOGO.jpg — "Mi catálogo" del comisionista (4 productos de ejemplo con botón compartir).
import { imageUrl, r } from './types'
const CHIP_TOP = 18.9, CHIP_H = 3.4
export const CATALOGO = {
  src: imageUrl('CATALOGO.jpg'),
  alt: 'Mi catálogo: busca, filtra y comparte tus productos',
  volver: { rect: r(7.0, 4.6, 36, 4.2), label: 'Volver' },
  search: { rect: r(20, 11.3, 70, 4.7), label: 'Buscar por nombre o categoría', fontCqw: 3.0, paddingLeftCqw: 1.5 },
  chips: [
    { chip: 'Todos',     rect: r(10.4, CHIP_TOP, 15.6, CHIP_H), label: 'Filtro Todos' },
    { chip: 'Moda',      rect: r(29.7, CHIP_TOP, 15.6, CHIP_H), label: 'Filtro Moda' },
    { chip: 'Alimentos', rect: r(49.1, CHIP_TOP, 21.2, CHIP_H), label: 'Filtro Alimentos' },
    { chip: 'Hogar',     rect: r(73.9, CHIP_TOP, 15.7, CHIP_H), label: 'Filtro Hogar' },
  ],
  compartirCatalogo: { rect: r(7.5, 25.1, 84.3, 5.5), label: 'Compartir mi catálogo' },
  // Botón compartir de cada una de las 4 tarjetas (izq→der, arriba→abajo)
  compartirProducto: [
    { rect: r(40.5, 48.7, 6.9, 3.9), label: 'Compartir producto 1' },
    { rect: r(83.6, 48.7, 6.9, 3.9), label: 'Compartir producto 2' },
    { rect: r(40.5, 75.4, 6.9, 3.9), label: 'Compartir producto 3' },
    { rect: r(83.6, 75.4, 6.9, 3.9), label: 'Compartir producto 4' },
  ],
} as const
