// Reglas de los datos personales obligatorios (RF-04, ADR-04).
// Deben coincidir con los CHECK de la tabla `perfiles`.

/**
 * Nombres y apellidos: cualquier letra Unicode (tildes, ñ, ü), espacios y guiones
 * (nombres compuestos como "María-José" o "De la Torre"). Sin apóstrofo. 2–60 caracteres.
 * Debe empezar y terminar en letra. Se compara en Unicode NFC, igual que el CHECK de PostgreSQL
 * ('^[[:alpha:]]([[:alpha:] -]*[[:alpha:]])?$' + `is nfc normalized`).
 */
export const PATRON_NOMBRE = /^\p{L}(?:[\p{L} -]*\p{L})?$/u;
export const LONGITUD_NOMBRE = { min: 2, max: 60 } as const;

/** Celular de Ecuador: 10 dígitos que empiezan con 09. */
export const PATRON_TELEFONO = /^09\d{8}$/;

export const MENSAJES_PERFIL = {
  nombreLongitud: `Debe tener entre ${LONGITUD_NOMBRE.min} y ${LONGITUD_NOMBRE.max} letras.`,
  nombreCaracteres: 'Use solo letras, espacios o guiones.',
  telefono: 'Escriba un celular de 10 números que empiece con 09.',
  correo: 'Escriba un correo válido, por ejemplo nombre@correo.com.',
  obligatorio: 'Este dato es obligatorio.',
  recintoObligatorio: 'Elija el recinto del veedor.',
} as const;

/** Unicode NFC, espacios repetidos a uno y sin espacios en los extremos. */
export const normalizarNombre = (valor: string) => valor.normalize('NFC').trim().replace(/\s+/g, ' ');
