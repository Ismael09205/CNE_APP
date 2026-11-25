// Estado de acceso para la navegación por rol (ADR-16, RF-03, D-22).
// `enTransicion` congela el estado mientras dura una operación de acceso
// (p. ej. recuperación: Supabase abre sesión antes de que se cambie la clave).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { puedeOperar, type Perfil } from '@/domain/entities/perfil';

import { useCasosDeUso } from './contenedor';

export type EstadoAcceso = 'cargando' | 'anonimo' | 'clave_temporal' | 'operativa';

type ContextoSesion = {
  readonly estado: EstadoAcceso;
  readonly perfil: Perfil | null;
  /** Ejecuta una operación de acceso sin que la navegación cambie a mitad; al final refresca el perfil. */
  readonly enTransicion: <T>(operacion: () => Promise<T>) => Promise<T>;
  /** Mensaje para la pantalla de ingreso (p. ej. «su clave nueva quedó guardada»). */
  readonly avisoIngreso: { readonly tipo: 'exito' | 'info'; readonly titulo: string; readonly texto: string } | null;
  readonly avisarEnIngreso: (aviso: { tipo: 'exito' | 'info'; titulo: string; texto: string } | null) => void;
};

const Contexto = createContext<ContextoSesion | null>(null);

function calcularEstado(usuarioId: string | null | undefined, perfil: Perfil | null | undefined, cargandoPerfil: boolean): EstadoAcceso {
  if (usuarioId === undefined) return 'cargando';
  if (usuarioId === null) return 'anonimo';
  if (cargandoPerfil) return 'cargando';
  if (!perfil || !perfil.activo) return 'anonimo';
  if (perfil.debeCambiarClave) return 'clave_temporal';
  return puedeOperar(perfil) ? 'operativa' : 'anonimo';
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const { sesion, cerrarSesion } = useCasosDeUso();
  const queryClient = useQueryClient();
  const [usuarioId, setUsuarioId] = useState<string | null | undefined>(undefined);
  const [congelado, setCongelado] = useState<EstadoAcceso | null>(null);
  const [avisoIngreso, avisarEnIngreso] = useState<ContextoSesion['avisoIngreso']>(null);

  // Al cerrar sesión se olvida el perfil en memoria: si no, al volver a entrar se mostraría
  // el perfil viejo (p. ej. todavía con clave temporal) porque la consulta no caduca.
  useEffect(
    () =>
      sesion.suscribir((id) => {
        if (!id) queryClient.removeQueries({ queryKey: ['perfil'] });
        setUsuarioId(id);
      }),
    [sesion, queryClient],
  );

  const consulta = useQuery({
    queryKey: ['perfil', usuarioId],
    queryFn: () => sesion.perfilActual(),
    enabled: !!usuarioId,
    staleTime: Infinity,
  });

  const perfil = usuarioId ? (consulta.data ?? null) : null;
  const estadoReal = calcularEstado(usuarioId, perfil, !!usuarioId && consulta.isPending);

  // Sesión abierta de una cuenta desactivada o sin perfil: se cierra (RF-02).
  useEffect(() => {
    if (usuarioId && consulta.isSuccess && (!consulta.data || !consulta.data.activo)) void cerrarSesion.ejecutar();
  }, [usuarioId, consulta.isSuccess, consulta.data, cerrarSesion]);

  const enTransicion = useCallback(
    async <T,>(operacion: () => Promise<T>): Promise<T> => {
      setCongelado(estadoReal);
      try {
        return await operacion();
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['perfil'] });
        setCongelado(null);
      }
    },
    [queryClient, estadoReal],
  );

  return (
    <Contexto.Provider value={{ estado: congelado ?? estadoReal, perfil, enTransicion, avisoIngreso, avisarEnIngreso }}>{children}</Contexto.Provider>
  );
}

export function useSesion(): ContextoSesion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return c;
}
