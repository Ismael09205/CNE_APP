import { Redirect, useLocalSearchParams } from 'expo-router';

import { esDignidad } from '@/domain/value-objects/dignidad';
import { RegistroActa } from '@/presentation/pantallas/veedor';

export default function Ruta() {
  const { dignidad } = useLocalSearchParams<{ dignidad: string }>();
  if (!esDignidad(dignidad)) return <Redirect href="/veedor" />;
  return <RegistroActa dignidad={dignidad} />;
}
