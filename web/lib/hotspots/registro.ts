// registro.jpg — Registro: correo, username, contraseña, confirmación, botón y redes sociales.
// Los 4 campos se miden del recuadro (33,7–40,1 %, 41,9–48,3 %, 50,1–56,5 %, 58,2–64,6 %).
// Cada <input> real se coloca a la derecha del ícono (desde 22 %) y es transparente mientras está vacío,
// así se ve el texto de ejemplo de la imagen; al escribir toma fondo blanco para tapar ese texto.
import { imageUrl, r } from './types'
export const REGISTRO = {
  src: imageUrl('registro.jpg'),
  alt: 'Regístrate en Mano. Conectamos negocios con oportunidades. Crecemos juntos.',
  inputs: {
    email:    { rect: r(22, 34.2, 66.5, 5.4), label: 'Correo electrónico' },
    username: { rect: r(22, 42.4, 66.5, 5.4), label: 'Username' },
    password: { rect: r(22, 50.6, 66.5, 5.4), label: 'Contraseña' },
    confirm:  { rect: r(22, 58.7, 66.5, 5.4), label: 'Confirmar contraseña' },
  },
  inputFontCqw: 2.9,   // tamaño de letra relativo al ancho de la imagen (container query units)
  inputPaddingLeftCqw: 1.8,
  submit:   { rect: r(9.5, 67.2, 81, 5.2), label: 'Registrarse' },
  facebook: { rect: r(33.7, 82.3, 7, 4.0), label: 'Continuar con Facebook' },
  apple:    { rect: r(46.5, 82.3, 7, 4.0), label: 'Continuar con Apple' },
  google:   { rect: r(59.4, 82.3, 7, 4.0), label: 'Continuar con Google' },
  login:    { rect: r(57.2, 91.2, 18, 2.8), label: 'Inicia sesión' },
  messageArea: r(9.5, 27.6, 81, 5),   // zona blanca libre entre el texto y el primer campo
} as const
