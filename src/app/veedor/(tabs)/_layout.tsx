import { Tabs } from 'expo-router/js-tabs';
import { ClipboardCheck, User } from '@/presentation/components/iconos';

import { crearBarraPestanas } from '@/presentation/components/barra-pestanas';

const Barra = crearBarraPestanas({
  index: { titulo: 'Mi mesa', icono: ClipboardCheck },
  perfil: { titulo: 'Perfil', icono: User },
});

export default function Layout() {
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <Barra {...props} />} />;
}
