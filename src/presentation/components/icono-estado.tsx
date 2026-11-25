// Ícono animado de las tarjetas de estado (Lottie propio en assets/animations/estado-*.json,
// reproducido con Skottie de Skia: sin librerías nativas nuevas). Se reproduce una vez al
// aparecer y queda quieto; con «reducir movimiento» se muestra directamente el final.
import { Canvas, Skia, Skottie } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Easing, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import advertencia from '@/assets/animations/estado-advertencia.json';
import error from '@/assets/animations/estado-error.json';
import exito from '@/assets/animations/estado-exito.json';
import info from '@/assets/animations/estado-info.json';

export type TipoEstado = 'exito' | 'info' | 'advertencia' | 'error';

const ANIMACIONES: Record<TipoEstado, object> = { exito, info, advertencia, error };

export function IconoEstado({ tipo, tamano = 44 }: { tipo: TipoEstado; tamano?: number }) {
  const animacion = useMemo(() => Skia.Skottie.Make(JSON.stringify(ANIMACIONES[tipo])), [tipo]);
  const ultimo = animacion.duration() * animacion.fps() - 1;
  const sinMovimiento = useReducedMotion();
  const cuadro = useSharedValue(sinMovimiento ? ultimo : 0);

  useEffect(() => {
    if (sinMovimiento) {
      cuadro.value = ultimo;
      return;
    }
    cuadro.value = 0;
    cuadro.value = withTiming(ultimo, { duration: animacion.duration() * 1000, easing: Easing.linear });
  }, [tipo, animacion, ultimo, sinMovimiento, cuadro]);

  return (
    <Canvas style={{ width: tamano, height: tamano }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Skottie animation={animacion} frame={cuadro} transform={[{ scale: tamano / animacion.size().width }]} />
    </Canvas>
  );
}
