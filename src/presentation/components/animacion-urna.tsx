// Animación del inicio de sesión: urna con un voto que cae y un check (Lottie propio en
// assets/animations/urna.json). Se reproduce con Skottie, el motor Lottie que ya trae
// @shopify/react-native-skia: no requiere otra librería nativa ni otra build.
import { Canvas, Skia, Skottie, useClock } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';

import urna from '@/assets/animations/urna.json';

export function AnimacionUrna({ tamano = 160 }: { tamano?: number }) {
  const animacion = useMemo(() => Skia.Skottie.Make(JSON.stringify(urna)), []);
  const reloj = useClock();
  const cuadros = animacion.duration() * animacion.fps();
  const cuadro = useDerivedValue(() => Math.floor(((reloj.value / 1000) * animacion.fps()) % cuadros));
  const escala = tamano / animacion.size().width;

  return (
    <Canvas
      style={{ width: tamano, height: tamano }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Urna electoral">
      <Skottie animation={animacion} frame={cuadro} transform={[{ scale: escala }]} />
    </Canvas>
  );
}
