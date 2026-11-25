import { Stack } from 'expo-router';

import { BarraSuperiorPantalla } from '@/presentation/components/ui';
import { EstadoEnvioVeedor } from '@/presentation/pantallas/veedor';
import { SincronizacionProvider } from '@/presentation/providers/sincronizacion';

// El sincronizador de actas (F10) vive mientras el veedor tenga la sesión abierta.
// En todas sus pantallas se ve arriba la conexión y cuántas actas faltan por enviar (RNF-09).
export default function Layout() {
  return (
    <SincronizacionProvider>
      <BarraSuperiorPantalla.Provider value={<EstadoEnvioVeedor />}>
        <Stack screenOptions={{ headerShown: false }} />
      </BarraSuperiorPantalla.Provider>
    </SincronizacionProvider>
  );
}
