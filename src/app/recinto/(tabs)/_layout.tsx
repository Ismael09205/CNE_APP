import { Tabs } from 'expo-router/js-tabs';
import { ClipboardList, FileText, House, User, Users } from '@/presentation/components/iconos';

import { crearBarraPestanas } from '@/presentation/components/barra-pestanas';

const Barra = crearBarraPestanas({
  index: { titulo: 'Inicio', icono: House },
  mesas: { titulo: 'Mesas', icono: ClipboardList },
  personas: { titulo: 'Veedores', icono: Users },
  resultados: { titulo: 'Actas', icono: FileText },
  perfil: { titulo: 'Perfil', icono: User },
});

export default function Layout() {
  return <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <Barra {...props} />} />;
}
