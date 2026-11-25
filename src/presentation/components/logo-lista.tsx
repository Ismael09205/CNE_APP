// Logo de una lista (D-18) respetando su proporción: los logos del CNE son horizontales
// (p. ej. 384×63), así que en un cuadrado quedaban diminutos. Se fija el alto y el ancho
// sale de la proporción de la imagen, con un tope para que no empuje al texto.
import { Image, View } from 'react-native';

import { logoDeLista } from '../theme/logos-listas';

export function LogoLista({ lista, color, alto = 44, anchoMax = 168 }: { lista: string; color: string; alto?: number; anchoMax?: number }) {
  const logo = logoDeLista(lista);
  if (!logo) {
    // Sin imagen: un bloque con el color de la lista (dato, D-18).
    return <View className="rounded-lg" style={{ height: alto, width: alto, backgroundColor: color }} />;
  }
  const { width, height } = Image.resolveAssetSource(logo);
  const ancho = Math.min(anchoMax, Math.round((alto * width) / Math.max(1, height)));
  const altoFinal = ancho === anchoMax ? Math.round((anchoMax * height) / Math.max(1, width)) : alto;
  return (
    <Image
      source={logo}
      // Tamaño calculado de la imagen real: por eso va en style.
      style={{ width: ancho, height: altoFinal }}
      className="rounded-lg"
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
