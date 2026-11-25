// Ancla de la navegación: envía a cada persona a la sección que le corresponde.
import { Redirect } from 'expo-router';

import { useSesion } from '@/presentation/providers/sesion';

const DESTINO = {
  coordinador_provincial: '/provincial',
  coordinador_recinto: '/recinto',
  veedor: '/veedor',
} as const;

export default function Inicio() {
  const { estado, perfil } = useSesion();
  if (estado === 'clave_temporal') return <Redirect href="/primer-ingreso" />;
  if (estado === 'operativa' && perfil) return <Redirect href={DESTINO[perfil.rol]} />;
  return <Redirect href="/login" />;
}
