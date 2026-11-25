// Navegación por rol con Stack.Protected (ADR-16, RF-16, RNF-05).
// Las rutas son solo una capa de presentación: la seguridad real está en RLS y
// en las Edge Functions (Stack.Protected no reemplaza el control del servidor).
import '../global.css';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Uniwind } from 'uniwind';

import { crearContenedor } from '@/main/contenedor';
import { ContenedorProvider } from '@/presentation/providers/contenedor';
import { SesionProvider, useSesion } from '@/presentation/providers/sesion';

void SplashScreen.preventAutoHideAsync();
// Solo tema claro (planUi.md: el Figma no tiene tema oscuro; mejor lectura al sol).
Uniwind.setTheme('light');

const contenedor = crearContenedor();
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

export default function RootLayout() {
  return (
    <ContenedorProvider valor={contenedor}>
      <QueryClientProvider client={queryClient}>
        <SesionProvider>
          <Navegacion />
        </SesionProvider>
      </QueryClientProvider>
    </ContenedorProvider>
  );
}

function Navegacion() {
  const { estado, perfil } = useSesion();
  const rol = estado === 'operativa' ? perfil?.rol : undefined;
  // Poppins es la única tipografía (planUi.md). Si la carga falla, se usa la del sistema.
  const [fuentes, errorFuentes] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold });
  const listo = estado !== 'cargando' && (fuentes || !!errorFuentes);

  useEffect(() => {
    if (listo) void SplashScreen.hideAsync();
  }, [listo]);

  if (!listo) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={estado === 'anonimo'}>
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(auth)/recuperar" />
        </Stack.Protected>
        <Stack.Protected guard={estado === 'clave_temporal'}>
          <Stack.Screen name="(auth)/primer-ingreso" />
        </Stack.Protected>
        <Stack.Protected guard={rol === 'coordinador_provincial'}>
          <Stack.Screen name="provincial" />
        </Stack.Protected>
        <Stack.Protected guard={rol === 'coordinador_recinto'}>
          <Stack.Screen name="recinto" />
        </Stack.Protected>
        <Stack.Protected guard={rol === 'veedor'}>
          <Stack.Screen name="veedor" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
