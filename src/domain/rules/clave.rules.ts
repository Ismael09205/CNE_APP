// Contraseñas y códigos por correo (D-26, D-27).
// Deben coincidir con la configuración de Supabase Auth y con
// supabase/functions/_shared/comun.ts (claveValida).

export const LONGITUD_CLAVE = { min: 8, max: 72 } as const;
export const LONGITUD_CODIGO = 6;

export const MENSAJES_CLAVE = {
  longitud: `La clave debe tener al menos ${LONGITUD_CLAVE.min} caracteres.`,
  larga: `La clave no puede pasar de ${LONGITUD_CLAVE.max} caracteres.`,
  letrasYNumeros: 'La clave debe tener letras y números.',
  noCoinciden: 'Las dos claves no son iguales.',
  codigo: `Escriba el código de ${LONGITUD_CODIGO} números que llegó a su correo.`,
  obligatoria: 'Escriba su clave.',
} as const;

export const tieneLetra = (clave: string) => /\p{L}/u.test(clave);
export const tieneNumero = (clave: string) => /\d/.test(clave);

export const claveValida = (clave: string) =>
  clave.length >= LONGITUD_CLAVE.min && clave.length <= LONGITUD_CLAVE.max && tieneLetra(clave) && tieneNumero(clave);

export const PATRON_CODIGO = new RegExp(`^\\d{${LONGITUD_CODIGO}}$`);
