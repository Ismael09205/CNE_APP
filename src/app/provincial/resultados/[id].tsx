import { useLocalSearchParams } from 'expo-router';

import { ResultadosRecinto } from '@/presentation/pantallas/resultados';

export default function Ruta() {
  const { id, nombre } = useLocalSearchParams<{ id: string; nombre?: string }>();
  return <ResultadosRecinto recintoId={id} nombre={nombre} />;
}
