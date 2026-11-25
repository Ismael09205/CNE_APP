import { Stack } from 'expo-router';

// Pestañas del rol + pantallas que se abren encima (con botón circular de regreso).
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
