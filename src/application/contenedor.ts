// Contrato de lo que la UI puede usar. `src/main` lo implementa con infrastructure;
// `presentation` solo conoce este tipo (regla de dependencias).
import type { EstadoRed } from './ports/red.port';
import type { ReporteErrores } from './ports/reporte-errores.port';
import type { ObservadorActas } from './ports/seguimiento.port';
import type { ObservadorSesion, SesionActual } from './ports/sesion.port';
import type { DesactivarCuenta, RestablecerClaveAsistido } from './use-cases/administrar-cuenta';
import type {
  CerrarSesion,
  CompletarPrimerIngreso,
  IniciarSesion,
  RestablecerConCodigo,
  SolicitarCodigoPrimerIngreso,
  SolicitarRecuperacion,
} from './use-cases/autenticacion';
import type { ListarPersonas, ListarRecintos } from './use-cases/consultas';
import type { CrearCuenta } from './use-cases/crear-cuenta';
import type { ConsultarMesaDelVeedor } from './use-cases/mesa-veedor';
import type { RegistrarActa } from './use-cases/registrar-acta';
import type { ReemplazarVeedor } from './use-cases/reemplazar-veedor';
import type { ConsultarResultadosRecinto, ConsultarTablero, VerDetalleActa } from './use-cases/resultados';
import type { SincronizarActas } from './use-cases/sincronizar-actas';
import type {
  AgregarMesas,
  AsignarCoordinador,
  AsignarVeedor,
  CrearRecinto,
  ListarCoordinaciones,
  ListarCoordinadores,
  ListarMesasDeRecinto,
  ListarParroquias,
  ListarVeedoresDeRecinto,
  TomarUbicacionRecinto,
} from './use-cases/territorio';
import type { TomarUbicacionActa } from './use-cases/ubicacion-acta';

export type Contenedor = {
  readonly sesion: SesionActual & ObservadorSesion;
  readonly iniciarSesion: IniciarSesion;
  readonly cerrarSesion: CerrarSesion;
  readonly solicitarCodigoPrimerIngreso: SolicitarCodigoPrimerIngreso;
  readonly completarPrimerIngreso: CompletarPrimerIngreso;
  readonly solicitarRecuperacion: SolicitarRecuperacion;
  readonly restablecerConCodigo: RestablecerConCodigo;
  readonly crearCuenta: CrearCuenta;
  readonly restablecerClaveAsistido: RestablecerClaveAsistido;
  readonly desactivarCuenta: DesactivarCuenta;
  readonly listarRecintos: ListarRecintos;
  readonly listarPersonas: ListarPersonas;
  // Fase 5
  readonly tomarUbicacionRecinto: TomarUbicacionRecinto;
  readonly crearRecinto: CrearRecinto;
  readonly listarParroquias: ListarParroquias;
  readonly agregarMesas: AgregarMesas;
  readonly listarMesasDeRecinto: ListarMesasDeRecinto;
  readonly listarCoordinaciones: ListarCoordinaciones;
  readonly listarCoordinadores: ListarCoordinadores;
  readonly asignarCoordinador: AsignarCoordinador;
  readonly listarVeedoresDeRecinto: ListarVeedoresDeRecinto;
  readonly asignarVeedor: AsignarVeedor;
  readonly reemplazarVeedor: ReemplazarVeedor;
  // Fase 6
  readonly red: EstadoRed;
  readonly consultarMesaDelVeedor: ConsultarMesaDelVeedor;
  readonly tomarUbicacionActa: TomarUbicacionActa;
  readonly registrarActa: RegistrarActa;
  readonly sincronizarActas: SincronizarActas;
  // Fase 7
  readonly consultarTablero: ConsultarTablero;
  readonly consultarResultadosRecinto: ConsultarResultadosRecinto;
  readonly verDetalleActa: VerDetalleActa;
  readonly observadorActas: ObservadorActas;
  // Fase 8 (ADR-18)
  readonly reporteErrores: ReporteErrores;
};
