import { esperaReintentoMs } from '../entities/envio-acta';
import { esNitida, PRECISION_MAX_ACTA_M, requiereRevisionUbicacion, UMBRAL_NITIDEZ } from '../rules/evidencia.rules';

describe('Evidencia del acta (F6-2, F6-4)', () => {
  test.each([
    [6, false, false],
    [PRECISION_MAX_ACTA_M, false, false],
    [PRECISION_MAX_ACTA_M + 0.1, false, true],
    [3, true, true],
    [Number.NaN, false, true],
  ])('precisión %p m, simulada %p → revisión %p', (precisionM, ubicacionSimulada, esperado) => {
    expect(requiereRevisionUbicacion({ precisionM, ubicacionSimulada })).toBe(esperado);
  });

  test('nitidez: umbral inclusive y rechazo de valores no finitos', () => {
    expect(esNitida(UMBRAL_NITIDEZ)).toBe(true);
    expect(esNitida(UMBRAL_NITIDEZ - 1)).toBe(false);
    expect(esNitida(Number.NaN)).toBe(false);
  });

  test('espera entre reintentos: crece al doble y se limita a 5 minutos', () => {
    expect(esperaReintentoMs(1)).toBe(5_000);
    expect(esperaReintentoMs(2)).toBe(10_000);
    expect(esperaReintentoMs(3)).toBe(20_000);
    expect(esperaReintentoMs(50)).toBe(300_000);
  });
});
