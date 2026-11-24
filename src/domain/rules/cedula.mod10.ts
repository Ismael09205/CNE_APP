// Validación estructural de la cédula ecuatoriana (ADR-05, PROJECT_SPEC §4.7).
// Decisión: provincia 01–24 (sin el código 30) y tercer dígito < 6 (persona natural).
// La misma regla debe existir como función SQL en el CHECK de `perfiles`.

export type MotivoCedulaInvalida = 'formato' | 'provincia' | 'tercer_digito' | 'digito_verificador';

export type ValidacionCedula = { readonly valida: true } | { readonly valida: false; readonly motivo: MotivoCedulaInvalida };

export const MENSAJES_CEDULA: Record<MotivoCedulaInvalida, string> = {
  formato: 'La cédula debe tener 10 números.',
  provincia: 'Los dos primeros números de la cédula deben ser un código de provincia (01 a 24).',
  tercer_digito: 'El tercer número de la cédula debe ser menor que 6.',
  digito_verificador: 'La cédula no es válida. Revise que los números estén bien escritos.',
};

const COEFICIENTES = [2, 1, 2, 1, 2, 1, 2, 1, 2] as const;

export function validarCedula(cedula: string): ValidacionCedula {
  if (!/^\d{10}$/.test(cedula)) return { valida: false, motivo: 'formato' };

  const digitos = Array.from(cedula, Number);
  const provincia = digitos[0] * 10 + digitos[1];
  if (provincia < 1 || provincia > 24) return { valida: false, motivo: 'provincia' };
  if (digitos[2] >= 6) return { valida: false, motivo: 'tercer_digito' };

  const suma = COEFICIENTES.reduce((acc, coeficiente, i) => {
    const producto = digitos[i] * coeficiente;
    return acc + (producto > 9 ? producto - 9 : producto);
  }, 0);
  const verificador = (10 - (suma % 10)) % 10;

  return verificador === digitos[9] ? { valida: true } : { valida: false, motivo: 'digito_verificador' };
}
