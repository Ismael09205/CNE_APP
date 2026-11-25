import { Tabs } from 'expo-router/js-tabs';
import { Building2, ChartColumn, House, User, Users } from '@/presentation/components/iconos';

import { crearBarraPestanas } from '@/presentation/components/barra-pestanas';

const Barra = crearBarraPestanas({
  index: { titulo: 'Inicio', icono: House },
  recintos: { titulo: 'Recintos', icono: Building2 },
  personas: { titulo: 'Personas', icono: Users },
  resultados: { titulo: 'Votos', icono: ChartColumn },
  perfil: { titulo: 'Perfil', icono: User },
});

export default function Layout() {
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <Barra {...props} />} />;
}
