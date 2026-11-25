// Barra de pestañas flotante (Figma: tarjeta blanca con sombra, la pestaña activa en el color principal).
// El orden lo da `pestanas` (no el orden alfabético de los archivos): Perfil siempre al final.
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LucideIcon } from './iconos';
import { Icono } from './icono';

export type Pestana = { readonly titulo: string; readonly icono: LucideIcon };

/** Crea la barra para un rol. Las rutas que no estén en `pestanas` no se muestran. */
export function crearBarraPestanas(pestanas: Readonly<Record<string, Pestana>>) {
  const orden = Object.keys(pestanas);
  return function BarraPestanas({ state, navigation }: BottomTabBarProps) {
    const { bottom } = useSafeAreaInsets();
    const activa = state.routes[state.index]?.name;
    return (
      <View className="bg-fondo px-2 pt-2" style={{ paddingBottom: Math.max(bottom, 12) }}>
        <View className="flex-row rounded-3xl bg-tarjeta py-2 shadow-flotante" accessibilityRole="tablist">
          {orden.map((nombre) => {
            const ruta = state.routes.find((r) => r.name === nombre);
            const pestana = pestanas[nombre];
            if (!ruta || !pestana) return null;
            const elegida = activa === nombre;
            const alTocar = () => {
              const evento = navigation.emit({ type: 'tabPress', target: ruta.key, canPreventDefault: true });
              if (!elegida && !evento.defaultPrevented) navigation.navigate(ruta.name, ruta.params);
            };
            return (
              <Pressable
                key={ruta.key}
                onPress={alTocar}
                accessibilityRole="tab"
                accessibilityState={{ selected: elegida }}
                accessibilityLabel={pestana.titulo}
                className="min-h-16 flex-1 items-center justify-center gap-1 rounded-2xl active:bg-primario-suave">
                <View className={`h-8 w-14 items-center justify-center rounded-full ${elegida ? 'bg-acento-suave' : ''}`}>
                  <Icono icono={pestana.icono} tono={elegida ? 'primario' : 'texto-suave'} tamano={24} grosor={elegida ? 2.5 : 2} />
                </View>
                {/* Mismo tamaño en todas las pestañas: los nombres son cortos para que quepan sin encogerse. */}
                <Text numberOfLines={1} className={`text-sm ${elegida ? 'font-seminegrita text-primario' : 'font-medio text-texto-suave'}`}>
                  {pestana.titulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };
}
