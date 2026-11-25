import { MAX_CASILLA_ACTA, validarResultadosActa } from '../rules/acta.rules';
import { requiereRevisionActa } from '../rules/evidencia.rules';
import { numeroEnLetras } from '../rules/numero-letras';

describe('numeroEnLetras (F6-8 C: "Total en letras" del acta)', () => {
  test.each([
    [0, 'cero'],
    [1, 'uno'],
    [15, 'quince'],
    [16, 'dieciséis'],
    [21, 'veintiuno'],
    [22, 'veintidós'],
    [30, 'treinta'],
    [45, 'cuarenta y cinco'],
    [100, 'cien'],
    [101, 'ciento uno'],
    [120, 'ciento veinte'],
    [200, 'doscientos'],
    [355, 'trescientos cincuenta y cinco'],
    [500, 'quinientos'],
    [777, 'setecientos setenta y siete'],
    [999, 'novecientos noventa y nueve'],
  ])('%p → %p', (n, letras) => {
    expect(numeroEnLetras(n)).toBe(letras);
  });

  test('fuera de rango o no entero → null', () => {
    expect(numeroEnLetras(-1)).toBeNull();
    expect(numeroEnLetras(1000)).toBeNull();
    expect(numeroEnLetras(2.5)).toBeNull();
    expect(numeroEnLetras(Number.NaN)).toBeNull();
  });
});

describe('Casillas de tres dígitos (F6-8 B)', () => {
  const opciones = { candidaturaIds: ['k1'] };

  test('999 es válido', () => {
    const v = validarResultadosActa({ votosNulos: 0, votosBlancos: 0, totalSufragantes: 999, votos: [{ candidaturaId: 'k1', votos: 999 }] }, opciones);
    expect(v).toEqual([]);
  });

  test('más de 999 se rechaza en el campo correspondiente', () => {
    const v = validarResultadosActa(
      { votosNulos: 0, votosBlancos: 0, totalSufragantes: 1000, votos: [{ candidaturaId: 'k1', votos: 1000 }] },
      opciones,
    );
    expect(v.filter((x) => x.codigo === 'tres_digitos').map((x) => x.campo)).toEqual([['totalSufragantes'], ['votos', 0, 'votos']]);
    expect(MAX_CASILLA_ACTA).toBe(999);
  });
});

describe('requiereRevisionActa (F6-4: solo por la ubicación)', () => {
  const base = { precisionM: 6, ubicacionSimulada: false };
  test('todo en orden → sin revisión', () => expect(requiereRevisionActa(base)).toBe(false));
  test('ubicación simulada → revisión', () => expect(requiereRevisionActa({ ...base, ubicacionSimulada: true })).toBe(true));
  test('GPS impreciso → revisión', () => expect(requiereRevisionActa({ ...base, precisionM: 80 })).toBe(true));
});
