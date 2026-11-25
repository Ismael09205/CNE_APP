// Composition root (D-16): único lugar que conoce las implementaciones concretas.
// Arma los casos de uso y se los entrega a la UI como `Contenedor`.
import type { Contenedor } from '@/application/contenedor';
import { DesactivarCuenta, RestablecerClaveAsistido } from '@/application/use-cases/administrar-cuenta';
import {
  CerrarSesion,
  CompletarPrimerIngreso,
  IniciarSesion,
  RestablecerConCodigo,
  SolicitarCodigoPrimerIngreso,
  SolicitarRecuperacion,
} from '@/application/use-cases/autenticacion';
import { ListarPersonas, ListarRecintos } from '@/application/use-cases/consultas';
import { CrearCuenta } from '@/application/use-cases/crear-cuenta';
import { ConsultarMesaDelVeedor } from '@/application/use-cases/mesa-veedor';
import { RegistrarActa } from '@/application/use-cases/registrar-acta';
import { ReemplazarVeedor } from '@/application/use-cases/reemplazar-veedor';
import { ConsultarResultadosRecinto, ConsultarTablero, VerDetalleActa } from '@/application/use-cases/resultados';
import { SincronizarActas } from '@/application/use-cases/sincronizar-actas';
import {
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
} from '@/application/use-cases/territorio';
import { TomarUbicacionActa } from '@/application/use-cases/ubicacion-acta';
import { RedNetInfo } from '@/infrastructure/device/red.netinfo';
import { ReporteSentry } from '@/infrastructure/monitoring/sentry';
import { generadorIdExpo, relojSistema } from '@/infrastructure/device/sistema';
import { UbicacionExpo } from '@/infrastructure/device/ubicacion.expo';
import { ActaOutboxSqlite } from '@/infrastructure/local/acta-outbox.sqlite';
import { baseLocal } from '@/infrastructure/local/base-local';
import {
  AsignacionesConCache,
  CacheLocal,
  CandidaturasConCache,
  MesasConCache,
  SesionConCache,
} from '@/infrastructure/local/cache.sqlite';
import { FotosFileSystem } from '@/infrastructure/local/fotos.filesystem';
import { ActasSupabase, CandidaturasSupabase } from '@/infrastructure/supabase/actas.supabase';
import { AutenticacionSupabase } from '@/infrastructure/supabase/autenticacion.supabase';
import { supabase } from '@/infrastructure/supabase/client';
import { CuentasSupabase } from '@/infrastructure/supabase/cuentas.supabase';
import { PerfilesSupabase } from '@/infrastructure/supabase/repositorios.supabase';
import { FotosActaSupabase, ObservadorActasSupabase, ResultadosSupabase } from '@/infrastructure/supabase/resultados.supabase';
import { SesionSupabase } from '@/infrastructure/supabase/sesion.supabase';
import {
  AsignacionesSupabase,
  CoordinacionesSupabase,
  MesasSupabase,
  RecintosSupabase,
  VeedoresRecintoSupabase,
} from '@/infrastructure/supabase/territorio.supabase';

export function crearContenedor(): Contenedor {
  const auth = new AutenticacionSupabase(supabase);
  // Fase 6: caché local cifrada para trabajar sin conexión (ADR-15, F6-3).
  const red = new RedNetInfo();
  const cache = new CacheLocal(baseLocal);
  const sesion = new SesionConCache(new SesionSupabase(supabase), { cache, red });
  const cuentas = new CuentasSupabase(supabase);
  const perfiles = new PerfilesSupabase(supabase);
  const recintos = new RecintosSupabase(supabase);
  const coordinaciones = new CoordinacionesSupabase(supabase);
  const mesas = new MesasSupabase(supabase);
  const asignaciones = new AsignacionesConCache(new AsignacionesSupabase(supabase), { cache, red });
  const mesasVeedor = new MesasConCache(mesas, { cache, red });
  const candidaturas = new CandidaturasConCache(new CandidaturasSupabase(supabase), { cache, red });
  const servidorActas = new ActasSupabase(supabase);
  const outbox = new ActaOutboxSqlite(baseLocal);
  const fotos = new FotosFileSystem();
  const veedoresRecinto = new VeedoresRecintoSupabase(supabase);
  const ubicacion = new UbicacionExpo();
  const resultados = new ResultadosSupabase(supabase);
  const fotosRemotas = new FotosActaSupabase(supabase);
  const reporteErrores = new ReporteSentry();

  return {
    sesion,
    iniciarSesion: new IniciarSesion({ auth, sesion }),
    cerrarSesion: new CerrarSesion({ auth }),
    solicitarCodigoPrimerIngreso: new SolicitarCodigoPrimerIngreso({ auth }),
    completarPrimerIngreso: new CompletarPrimerIngreso({ auth, primerIngreso: cuentas }),
    solicitarRecuperacion: new SolicitarRecuperacion({ auth }),
    restablecerConCodigo: new RestablecerConCodigo({ auth, sesion, primerIngreso: cuentas }),
    crearCuenta: new CrearCuenta({ sesion, coordinaciones, cuentas }),
    restablecerClaveAsistido: new RestablecerClaveAsistido({ sesion, cuentas }),
    desactivarCuenta: new DesactivarCuenta({ sesion, cuentas }),
    listarRecintos: new ListarRecintos({ recintos }),
    listarPersonas: new ListarPersonas({ perfiles }),
    tomarUbicacionRecinto: new TomarUbicacionRecinto({ ubicacion }),
    crearRecinto: new CrearRecinto({ sesion, recintos }),
    listarParroquias: new ListarParroquias({ recintos }),
    agregarMesas: new AgregarMesas({ sesion, mesas }),
    listarMesasDeRecinto: new ListarMesasDeRecinto({ mesas }),
    listarCoordinaciones: new ListarCoordinaciones({ coordinaciones }),
    listarCoordinadores: new ListarCoordinadores({ perfiles, coordinaciones }),
    asignarCoordinador: new AsignarCoordinador({ sesion, coordinaciones }),
    listarVeedoresDeRecinto: new ListarVeedoresDeRecinto({ veedoresRecinto }),
    asignarVeedor: new AsignarVeedor({ sesion, asignaciones }),
    reemplazarVeedor: new ReemplazarVeedor({ sesion, mesas, perfiles, coordinaciones, veedoresRecinto, asignaciones }),
    red,
    consultarMesaDelVeedor: new ConsultarMesaDelVeedor({
      sesion,
      asignaciones,
      mesas: mesasVeedor,
      candidaturas,
      outbox,
      servidor: servidorActas,
    }),
    tomarUbicacionActa: new TomarUbicacionActa({ ubicacion }),
    registrarActa: new RegistrarActa({
      sesion,
      asignaciones,
      mesas: mesasVeedor,
      candidaturas,
      outbox,
      fotos,
      ids: generadorIdExpo,
      reloj: relojSistema,
      servidor: servidorActas,
    }),
    sincronizarActas: new SincronizarActas({ sesion, outbox, servidor: servidorActas, fotos, red, reloj: relojSistema, reporte: reporteErrores }),
    consultarTablero: new ConsultarTablero({ sesion, resultados }),
    consultarResultadosRecinto: new ConsultarResultadosRecinto({ sesion, resultados, mesas }),
    verDetalleActa: new VerDetalleActa({ sesion, resultados, fotos: fotosRemotas }),
    observadorActas: new ObservadorActasSupabase(supabase),
    reporteErrores,
  };
}
