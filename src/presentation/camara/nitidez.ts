// F6-2 — Nitidez de un cuadro de la cámara: varianza del Laplaciano sobre la luminancia (plano Y
// del YUV) submuestreada. Una imagen desenfocada tiene bordes suaves, Laplaciano casi constante
// y varianza baja. Corre como worklet en el hilo de la cámara (sin asignar memoria por píxel).

/**
 * @param luma bytes del plano Y (1 byte por píxel).
 * @param paso distancia entre muestras (y vecinos): reduce el costo y el ruido del sensor.
 * @param margen fracción de cada borde que se ignora (el acta ocupa el centro del encuadre).
 * @returns varianza del Laplaciano, o NaN si no hay datos suficientes.
 */
export function varianzaLaplaciano(
  luma: Uint8Array,
  ancho: number,
  alto: number,
  bytesPorFila: number,
  paso = 4,
  margen = 0.15,
): number {
  'worklet';
  const x0 = Math.max(paso, Math.floor(ancho * margen));
  const x1 = Math.min(ancho - paso - 1, Math.floor(ancho * (1 - margen)));
  const y0 = Math.max(paso, Math.floor(alto * margen));
  const y1 = Math.min(alto - paso - 1, Math.floor(alto * (1 - margen)));
  if (x1 <= x0 || y1 <= y0 || luma.length < bytesPorFila * alto) return Number.NaN;

  let n = 0;
  let suma = 0;
  let sumaCuadrados = 0;
  for (let y = y0; y <= y1; y += paso) {
    const fila = y * bytesPorFila;
    const arriba = (y - paso) * bytesPorFila;
    const abajo = (y + paso) * bytesPorFila;
    for (let x = x0; x <= x1; x += paso) {
      const centro = luma[fila + x];
      const lap = 4 * centro - luma[fila + x - paso] - luma[fila + x + paso] - luma[arriba + x] - luma[abajo + x];
      suma += lap;
      sumaCuadrados += lap * lap;
      n++;
    }
  }
  if (n < 100) return Number.NaN;
  const media = suma / n;
  return sumaCuadrados / n - media * media;
}
