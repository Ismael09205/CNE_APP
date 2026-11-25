// EstadoRed con NetInfo (ADR-15).
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import type { EstadoRed } from '@/application/ports/red.port';

// `isInternetReachable` es null mientras NetInfo no lo comprueba: en ese caso basta `isConnected`.
const conectado = (s: NetInfoState) => s.isConnected === true && s.isInternetReachable !== false;

export class RedNetInfo implements EstadoRed {
  async hayConexion(): Promise<boolean> {
    return conectado(await NetInfo.fetch());
  }

  suscribir(alCambiar: (conectado: boolean) => void): () => void {
    return NetInfo.addEventListener((s) => alCambiar(conectado(s)));
  }
}
