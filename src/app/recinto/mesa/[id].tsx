import { useLocalSearchParams } from 'expo-router';

import { MesaRecinto } from '@/presentation/pantallas/territorio';

export default function Ruta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MesaRecinto mesaId={id} />;
}
