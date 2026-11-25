// F6-8 (C): el acta física pide cada valor también "en letras". La app muestra el número
// escrito en palabras para que el veedor lo compare antes del envío definitivo.
import { MAX_CASILLA_ACTA } from './acta.rules';

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIEZ_A_VEINTINUEVE = [
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
  'veintiocho', 'veintinueve',
];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos',
];

function hastaNoventaYNueve(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 30) return DIEZ_A_VEINTINUEVE[n - 10];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`;
}

/** 0–999 en palabras ("ciento veinte", "cien", "veintiuno"). null si está fuera de rango. */
export function numeroEnLetras(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > MAX_CASILLA_ACTA) return null;
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c === 0) return hastaNoventaYNueve(resto);
  return resto === 0 ? CENTENAS[c] : `${CENTENAS[c]} ${hastaNoventaYNueve(resto)}`;
}
