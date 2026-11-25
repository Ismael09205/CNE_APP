// F10 — Dispara la sincronización de actas (ADR-15): al volver la conexión, al volver la app a
// primer plano, tras registrar un acta y cada 30 s mientras queden pendientes.
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { ResultadoSincronizacion } from '@/application/use-cases/sincronizar-actas';

import { useCasosDeUso } from './contenedor';

type ContextoSincronizacion = {
  readonly conectado: boolean;
  readonly sincronizando: boolean;
  readonly ultimo: ResultadoSincronizacion | null;
  /** `forzar` ignora la espera entre reintentos. */
  readonly sincronizar: (forzar?: boolean) => Promise<void>;
};

const Contexto = createContext<ContextoSincronizacion | null>(null);
const INTERVALO_MS = 30_000;

export function SincronizacionProvider({ children }: { children: ReactNode }) {
  const { sincronizarActas, red } = useCasosDeUso();
  const queryClient = useQueryClient();
  const [conectado, setConectado] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimo, setUltimo] = useState<ResultadoSincronizacion | null>(null);
  const pendientes = useRef(0);

  const sincronizar = useCallback(
    async (forzar = false) => {
      setSincronizando(true);
      try {
        const r = await sincronizarActas.ejecutar({ forzar });
        pendientes.current = r.pendientes;
        setUltimo(r);
        if (r.enviadas || r.conflictos || r.rechazadas) await queryClient.invalidateQueries({ queryKey: ['mesa-veedor'] });
      } catch {
        // Un fallo inesperado no debe romper la pantalla: se reintenta en el próximo ciclo.
      } finally {
        setSincronizando(false);
      }
    },
    [sincronizarActas, queryClient],
  );

  useEffect(() => {
    // Primera pasada al abrir la sección del veedor (actas que quedaron de antes).
    void red.hayConexion().then((c) => {
      setConectado(c);
      void sincronizar(true);
    });
    const dejarRed = red.suscribir((c) => {
      setConectado(c);
      if (c) void sincronizar(true);
    });
    const app = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizar(false);
    });
    const intervalo = setInterval(() => {
      if (pendientes.current > 0) void sincronizar(false);
    }, INTERVALO_MS);
    return () => {
      dejarRed();
      app.remove();
      clearInterval(intervalo);
    };
  }, [red, sincronizar]);

  return <Contexto.Provider value={{ conectado, sincronizando, ultimo, sincronizar }}>{children}</Contexto.Provider>;
}

export function useSincronizacion(): ContextoSincronizacion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSincronizacion debe usarse dentro de SincronizacionProvider');
  return c;
}
