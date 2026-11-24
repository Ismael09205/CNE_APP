import { validarCedula, type MotivoCedulaInvalida } from '../rules/cedula.mod10';
import { fail, ok, type Result } from '../shared/result';

declare const marca: unique symbol;
/** Cédula ya validada (módulo 10 + provincia + tercer dígito). */
export type Cedula = string & { readonly [marca]: 'Cedula' };

export function crearCedula(valor: string): Result<Cedula, MotivoCedulaInvalida> {
  const limpio = valor.trim();
  const validacion = validarCedula(limpio);
  return validacion.valida ? ok(limpio as Cedula) : fail(validacion.motivo);
}
