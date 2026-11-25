// La UI recibe los casos de uso ya armados (src/main) y solo conoce su tipo.
import { createContext, useContext, type ReactNode } from 'react';

import type { Contenedor } from '@/application/contenedor';

import { registrarReporteErrores } from '../hooks/use-errores';

const ContextoContenedor = createContext<Contenedor | null>(null);

export function ContenedorProvider({ valor, children }: { valor: Contenedor; children: ReactNode }) {
  registrarReporteErrores(valor.reporteErrores);
  return <ContextoContenedor.Provider value={valor}>{children}</ContextoContenedor.Provider>;
}

export function useCasosDeUso(): Contenedor {
  const c = useContext(ContextoContenedor);
  if (!c) throw new Error('useCasosDeUso debe usarse dentro de ContenedorProvider');
  return c;
}
