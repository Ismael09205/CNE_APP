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
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useNavigationContainerRef, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Uniwind } from 'uniwind';

import { crearContenedor } from '@/main/contenedor';
import { envolverRaiz, iniciarSentry, navegacionSentry } from '@/main/monitoreo';
import { ContenedorProvider } from '@/presentation/providers/contenedor';
import { SesionProvider, useSesion } from '@/presentation/providers/sesion';

// ADR-18: Sentry antes que nada, para capturar también los fallos del arranque (apagado sin DSN).
iniciarSentry();
void SplashScreen.preventAutoHideAsync();
// Solo tema claro (planUi.md: el Figma no tiene tema oscuro; mejor lectura al sol).
Uniwind.setTheme('light');

const contenedor = crearContenedor();
// Los errores inesperados de consultas y cambios se reportan con el nombre de la consulta (sin datos).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
  queryCache: new QueryCache({
    onError: (error, consulta) =>
      contenedor.reporteErrores.capturar(error, { operacion: `consulta:${String(consulta.queryKey[0])}` }),
  }),
  mutationCache: new MutationCache({
    onError: (error) => contenedor.reporteErrores.capturar(error, { operacion: 'cambio' }),
  }),
});

export default envolverRaiz(RootLayout);

function RootLayout() {
  // Sentry registra en qué pantalla ocurrió cada fallo (integración con Expo Router).
  const navegacion = useNavigationContainerRef();
  useEffect(() => {
    if (navegacion) navegacionSentry.registerNavigationContainer(navegacion);
  }, [navegacion]);

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

  // ADR-18: solo el rol acompaña a los reportes (nunca la identidad de la persona),
  // y cada error lleva la pantalla donde ocurrió.
  const ruta = usePathname();
  useEffect(() => {
    contenedor.reporteErrores.definirRol(rol ?? null);
  }, [rol]);
  useEffect(() => {
    contenedor.reporteErrores.definirPantalla(ruta);
  }, [ruta]);

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
