export interface AlmacenFotosLocal {
  /** Copia la foto temporal de la cámara al almacenamiento privado de la app. Devuelve la ruta definitiva. */
  persistir(uriTemporal: string, actaId: string): Promise<string>;
  /** Borra la foto local (tras sincronizar, F6-3). No falla si ya no existe. */
  eliminar(ruta: string): Promise<void>;
}
