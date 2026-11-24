export type Coordenadas = { readonly lat: number; readonly lng: number };

// Campos tomados del distributivo del CNE (sources/Juntas_Del_Voto/JUNTAS_FILTRADAS.xlsx).
export type Recinto = {
  readonly id: string;
  readonly parroquiaId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly codigoZona: number;
  readonly nombreZona: string | null;
  readonly direccion: string | null;
  readonly ubicacion: Coordenadas;
  readonly dificilAcceso: boolean;
  readonly sinConectividad: boolean;
};
