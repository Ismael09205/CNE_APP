// Logos de cada lista empaquetados en la app (funcionan sin conexión).
// Origen: sources/Partidos_imagenes (reducidos a 384 px). La base solo guarda el número de lista.
import type { ImageSourcePropType } from 'react-native';

const LOGOS: Record<string, ImageSourcePropType> = {
  '7': require('@/assets/images/listas/lista-7.png'),
  '8': require('@/assets/images/listas/lista-8.png'),
  '17': require('@/assets/images/listas/lista-17.png'),
  '20': require('@/assets/images/listas/lista-20.png'),
  '62': require('@/assets/images/listas/lista-62.png'),
  '70-17': require('@/assets/images/listas/lista-70-17.png'),
  '103-62': require('@/assets/images/listas/lista-103-62.png'),
};

/** Logo de la lista, o null si no hay imagen para ese número. */
export const logoDeLista = (lista: string): ImageSourcePropType | null => LOGOS[lista] ?? null;
