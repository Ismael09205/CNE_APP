export interface AlmacenFotosLocal {
  /** Copia la foto temporal de la cámara al directorio de documentos. Devuelve la ruta definitiva. */
  persistir(uriTemporal: string, actaId: string): Promise<string>;
  eliminar(ruta: string): Promise<void>;
}
