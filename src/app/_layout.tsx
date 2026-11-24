import { Stack } from 'expo-router';

// Layout raíz provisional. En la Fase 4 se reemplaza por Stack.Protected
// con los grupos (auth), (provincial), (recinto) y (veedor).
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
