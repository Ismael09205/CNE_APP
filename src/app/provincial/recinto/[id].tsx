import { useLocalSearchParams } from 'expo-router';

import { DetalleRecintoProvincial } from '@/presentation/pantallas/territorio';

export default function Ruta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DetalleRecintoProvincial recintoId={id} />;
}
