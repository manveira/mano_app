// comisionista.jpg — Inicio del comisionista ("Hola, Manuel"). Los datos (28 ventas, $1.250.200) son de ejemplo
// y vienen dentro de la imagen; se cambiarán cuando el diseñador entregue la versión dinámica.
import { imageUrl, r } from './types'
export const COMISIONISTA = {
  src: imageUrl('comisionista.jpg'),
  alt: 'Inicio del comisionista: acceso rápido, catálogo y herramientas',
  hotspots: {
    notificaciones: { rect: r(83.5, 4.7, 6.6, 3.7),   label: 'Notificaciones' },
    ventas:         { rect: r(15.9, 24.7, 31.8, 5.3), label: 'Ventas' },
    comisiones:     { rect: r(51.0, 24.7, 31.7, 5.3), label: 'Comisiones' },
    buscar:         { rect: r(7.2, 37.4, 37.5, 7.5),  label: 'Buscar negocios' },
    misVentas:      { rect: r(53.3, 37.3, 37.5, 7.5), label: 'Mis ventas' },
    misProductos:   { rect: r(7.2, 51.0, 84.1, 7.6),  label: 'Mis productos' },
    miPerfil:       { rect: r(7.2, 67.2, 84.1, 7.6),  label: 'Mi perfil' },
    compartir:      { rect: r(7.2, 75.6, 84.1, 7.6),  label: 'Comparte tu enlace' },
    cerrarSesion:   { rect: r(9.3, 89.5, 81.0, 5.4),  label: 'Cerrar sesión' },
  },
} as const
