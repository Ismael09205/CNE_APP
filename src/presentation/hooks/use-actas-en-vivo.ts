// F11 / ADR-17: los resultados se vuelven a consultar cuando llega un acta (Realtime),
// al recuperar la conexión y al volver la app a primer plano. Varios avisos seguidos se
// agrupan en una sola consulta para no gastar datos.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useCasosDeUso } from '../providers/contenedor';

const AGRUPAR_MS = 1_500;

/** Activa el seguimiento en vivo y devuelve si hay conexión (para el mapa y los avisos). */
export function useActasEnVivo(): { conectado: boolean } {
  const { observadorActas, red } = useCasosDeUso();
  const queryClient = useQueryClient();
  const [conectado, setConectado] = useState(true);

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => {
      if (espera) return;
      espera = setTimeout(() => {
        espera = null;
        void queryClient.invalidateQueries({ queryKey: ['resultados'] });
      }, AGRUPAR_MS);
    };
    void red.hayConexion().then(setConectado);
    const dejarActas = observadorActas.suscribir(refrescar);
    const dejarRed = red.suscribir((c) => {
      setConectado(c);
      if (c) refrescar();
    });
    const app = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') refrescar();
    });
    return () => {
      if (espera) clearTimeout(espera);
      dejarActas();
      dejarRed();
      app.remove();
    };
  }, [observadorActas, red, queryClient]);

  return { conectado };
}
