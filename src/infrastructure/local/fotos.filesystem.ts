// AlmacenFotosLocal con expo-file-system (ADR-15, F6-3): las fotos quedan en el directorio
// de documentos de la app (privado, no visible en la galería) hasta que se sincronizan.
import { Directory, File, Paths } from 'expo-file-system';

import type { AlmacenFotosLocal } from '@/application/ports/almacen-fotos.port';

const aUri = (ruta: string) => (ruta.startsWith('file://') ? ruta : `file://${ruta}`);

export class FotosFileSystem implements AlmacenFotosLocal {
  async persistir(uriTemporal: string, actaId: string): Promise<string> {
    const carpeta = new Directory(Paths.document, 'actas');
    if (!carpeta.exists) carpeta.create({ intermediates: true });

    const destino = new File(carpeta, `${actaId}.jpg`);
    if (destino.exists) destino.delete();
    const origen = new File(aUri(uriTemporal));
    await origen.copy(destino);
    // La copia temporal de la cámara ya no hace falta.
    try {
      origen.delete();
    } catch {
      // El sistema limpia la caché por su cuenta.
    }
    return destino.uri;
  }

  async eliminar(ruta: string): Promise<void> {
    const archivo = new File(aUri(ruta));
    if (archivo.exists) archivo.delete();
  }
}
