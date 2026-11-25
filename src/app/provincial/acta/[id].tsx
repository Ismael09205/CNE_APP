import { useLocalSearchParams } from 'expo-router';

import { DetalleActaPantalla } from '@/presentation/pantallas/resultados';

export default function Ruta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DetalleActaPantalla actaId={id} />;
}
