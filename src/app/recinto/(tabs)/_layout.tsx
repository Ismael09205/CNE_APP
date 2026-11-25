import { Tabs } from 'expo-router/js-tabs';
import { ChartColumn, ClipboardList, House, User, Users } from '@/presentation/components/iconos';

import { crearBarraPestanas } from '@/presentation/components/barra-pestanas';

const Barra = crearBarraPestanas({
  index: { titulo: 'Inicio', icono: House },
  mesas: { titulo: 'Mesas', icono: ClipboardList },
  personas: { titulo: 'Veedores', icono: Users },
  resultados: { titulo: 'Votos', icono: ChartColumn },
  perfil: { titulo: 'Perfil', icono: User },
});

export default function Layout() {
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <Barra {...props} />} />;
}
