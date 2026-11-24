// COMPRADOR.jpg — Vitrina pública del comisionista (/vendedor/[username]) con botón "Agregar al carrito".
import { imageUrl, r } from './types'
const CHIP_TOP = 26.7, CHIP_H = 3.4
export const COMPRADOR = {
  src: imageUrl('COMPRADOR.jpg'),
  alt: 'Vitrina del comisionista: productos para comprar',
  logo:     { rect: r(7.6, 3.8, 7.6, 4.4),   label: 'Ir al inicio de Mano' },
  carrito:  { rect: r(82.0, 3.8, 10.2, 4.5), label: 'Ver carrito' },
  compartir:{ rect: r(77.5, 16.5, 7, 3.9),   label: 'Compartir esta vitrina' },
  chips: [
    { chip: 'Todos',     rect: r(10.4, CHIP_TOP, 15.6, CHIP_H), label: 'Filtro Todos' },
    { chip: 'Moda',      rect: r(29.7, CHIP_TOP, 15.6, CHIP_H), label: 'Filtro Moda' },
    { chip: 'Alimentos', rect: r(49.1, CHIP_TOP, 21.2, CHIP_H), label: 'Filtro Alimentos' },
    { chip: 'Hogar',     rect: r(73.9, CHIP_TOP, 15.7, CHIP_H), label: 'Filtro Hogar' },
  ],
  search: { rect: r(20, 32.0, 70, 4.3), label: 'Buscar por nombre o categoría', fontCqw: 3.0, paddingLeftCqw: 1.5 },
  // "Agregar al carrito" de las 4 tarjetas (izq→der, arriba→abajo)
  agregar: [
    { rect: r(8.8, 58.9, 39.2, 3.9),  label: 'Agregar producto 1 al carrito' },
    { rect: r(51.8, 58.9, 39.1, 3.9), label: 'Agregar producto 2 al carrito' },
    { rect: r(8.8, 85.4, 39.2, 3.9),  label: 'Agregar producto 3 al carrito' },
    { rect: r(51.8, 85.4, 39.1, 3.9), label: 'Agregar producto 4 al carrito' },
  ],
} as const
