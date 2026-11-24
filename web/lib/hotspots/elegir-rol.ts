// QUE MANO ELIGES.jpg — "¿Qué mano eliges?" (4 tarjetas de rol). Medido sobre la imagen 4500×8000.
import { imageUrl, r } from './types'
export const ELEGIR_ROL = {
  src: imageUrl('QUE MANO ELIGES.jpg'),
  alt: '¿Qué mano eliges? Selecciona el perfil que mejor te describa para comenzar',
  hotspots: {
    negocio:       { rect: r(5.9, 82.3, 20.7, 10.1),  label: 'Negocio',                 role: 'business_owner' },
    servicios:     { rect: r(28.4, 82.3, 20.8, 10.1), label: 'Prestación de servicios', role: 'service_provider' },
    comisionista:  { rect: r(50.9, 82.3, 20.8, 10.1), label: 'Comisionista',            role: 'freelancer' },
    domiciliario:  { rect: r(73.4, 82.3, 20.8, 10.1), label: 'Domiciliario',            role: 'courier' },
  },
} as const
