import { varianzaLaplaciano } from '../nitidez';

const ANCHO = 160;
const ALTO = 120;

function imagen(pixel: (x: number, y: number) => number, bytesPorFila = ANCHO) {
  const luma = new Uint8Array(bytesPorFila * ALTO);
  for (let y = 0; y < ALTO; y++) for (let x = 0; x < ANCHO; x++) luma[y * bytesPorFila + x] = pixel(x, y);
  return { luma, bytesPorFila };
}

// "Texto" nítido: líneas negras de 2 px cada 6 px sobre blanco.
const nitida = (x: number, y: number) => (x % 6 < 2 || y % 6 < 2 ? 20 : 235);

// La misma imagen desenfocada con un promedio de caja de 9×9.
function desenfocada() {
  const base = imagen(nitida).luma;
  return imagen((x, y) => {
    let s = 0;
    let c = 0;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const xx = Math.min(ANCHO - 1, Math.max(0, x + dx));
        const yy = Math.min(ALTO - 1, Math.max(0, y + dy));
        s += base[yy * ANCHO + xx];
        c++;
      }
    return Math.round(s / c);
  });
}

describe('varianzaLaplaciano (F6-2)', () => {
  test('una imagen uniforme tiene varianza 0', () => {
    const { luma } = imagen(() => 128);
    expect(varianzaLaplaciano(luma, ANCHO, ALTO, ANCHO, 1)).toBe(0);
  });

  test('la imagen nítida mide mucho más que la desenfocada', () => {
    const a = imagen(nitida);
    const b = desenfocada();
    const vNitida = varianzaLaplaciano(a.luma, ANCHO, ALTO, ANCHO, 1);
    const vBorrosa = varianzaLaplaciano(b.luma, ANCHO, ALTO, ANCHO, 1);
    expect(vNitida).toBeGreaterThan(vBorrosa * 10);
  });

  test('respeta bytesPorFila (relleno al final de cada fila)', () => {
    const sinRelleno = imagen(nitida);
    const conRelleno = imagen(nitida, ANCHO + 32);
    expect(varianzaLaplaciano(conRelleno.luma, ANCHO, ALTO, ANCHO + 32)).toBeCloseTo(
      varianzaLaplaciano(sinRelleno.luma, ANCHO, ALTO, ANCHO),
    );
  });

  test('sin datos suficientes devuelve NaN', () => {
    expect(varianzaLaplaciano(new Uint8Array(10), 4, 4, 4)).toBeNaN();
    expect(varianzaLaplaciano(new Uint8Array(ANCHO * 10), ANCHO, ALTO, ANCHO)).toBeNaN();
  });
});
