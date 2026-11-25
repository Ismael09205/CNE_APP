import type { ContextoError, ReporteErrores } from '../ports/reporte-errores.port';
import type { Acta } from '@/domain/entities/acta';

import {
  FallaRed,
  SesionVencida,
  type RespuestaRegistro,
  type ResultadoSubidaFoto,
  type ServidorActas,
} from '../ports/servidor-actas.port';
import { SincronizarActas } from '../use-cases/sincronizar-actas';
import { FotosEnMemoria, OutboxEnMemoria, perfil, SesionFalsa } from './dobles';

const AHORA = new Date('2027-02-16T18:00:00Z');

const acta = (id: string, cambios: Partial<Acta> = {}): Acta => ({
  id,
  mesaId: 'm1',
  dignidad: 'alcaldia',
  veedorId: 'v1',
  estado: 'enviada',
  confirmadaEn: new Date('2027-02-16T17:00:00Z'),
  votosNulos: 0,
  votosBlancos: 0,
  totalSufragantes: 10,
  votos: [{ candidaturaId: 'k1', votos: 10 }],
  evidencia: {
    fotoPath: `file:///documentos/actas/${id}.jpg`,
    lat: 0.3,
    lng: -78.26,
    precisionM: 6,
    ubicacionSimulada: false,
    capturadaEn: new Date('2027-02-16T16:59:00Z'),
  },
  ...cambios,
});

class ServidorFalso implements Pick<ServidorActas, 'subirFoto' | 'registrar'> {
  public subidas: { id: string; reemplazar: boolean }[] = [];
  public registros: string[] = [];
  constructor(
    public foto: (a: Acta, reemplazar: boolean) => ResultadoSubidaFoto | Error = () => 'subida',
    public rpc: (a: Acta, intento: number) => RespuestaRegistro | Error = () => ({ tipo: 'guardada' }),
  ) {}
  async subirFoto(a: Acta, o: { reemplazar: boolean }) {
    this.subidas.push({ id: a.id, reemplazar: o.reemplazar });
    const r = this.foto(a, o.reemplazar);
    if (r instanceof Error) throw r;
    return r;
  }
  async registrar(a: Acta) {
    this.registros.push(a.id);
    const r = this.rpc(a, this.registros.filter((x) => x === a.id).length);
    if (r instanceof Error) throw r;
    return r;
  }
}

function montar(servidor = new ServidorFalso(), opciones: { conectado?: boolean; veedor?: string; reporte?: ReporteErrores } = {}) {
  const outbox = new OutboxEnMemoria();
  outbox.ahora = () => AHORA;
  const fotos = new FotosEnMemoria();
  let conectado = opciones.conectado ?? true;
  const caso = new SincronizarActas({
    sesion: new SesionFalsa(perfil({ id: opciones.veedor ?? 'v1', rol: 'veedor' })),
    outbox,
    servidor,
    fotos,
    red: { hayConexion: async () => conectado },
    reloj: { ahora: () => AHORA },
    reporte: opciones.reporte,
  });
  const encolar = async (a: Acta) => {
    fotos.guardadas.add(a.evidencia.fotoPath);
    await outbox.guardarYEncolar(a);
  };
  return { caso, outbox, fotos, servidor, encolar, desconectar: () => (conectado = false) };
}

const estado = (o: OutboxEnMemoria, id: string) => o.envios.get(id);

describe('SincronizarActas (F10)', () => {
  test('ADR-18: un error inesperado (la foto no sube) se reporta sin datos personales; la red caída no', async () => {
    const reportes: { error: unknown; contexto: ContextoError }[] = [];
    const reporte: ReporteErrores = { capturar: (error, contexto) => void reportes.push({ error, contexto }), definirRol: () => undefined, definirPantalla: () => undefined, probarCierreNativo: () => undefined };
    const { caso, outbox, encolar } = montar(new ServidorFalso(() => new Error('Storage 500')), { reporte });
    await encolar(acta('a1'));
    await caso.ejecutar();
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'pendiente', ultimoError: 'error_inesperado' });
    expect(reportes).toHaveLength(1);
    expect(reportes[0].contexto).toEqual({ operacion: 'sincronizar_acta', datos: { dignidad: 'alcaldia', intentos: 0 } });

    const sinRed = montar(new ServidorFalso(() => new FallaRed('sin red')), { reporte });
    await sinRed.encolar(acta('a2'));
    await sinRed.caso.ejecutar();
    expect(reportes).toHaveLength(1);
  });

  test('sube la foto, registra el acta, la marca guardada y borra la foto local (F6-3)', async () => {
    const { caso, outbox, fotos, servidor, encolar } = montar();
    await encolar(acta('a1'));
    const r = await caso.ejecutar();
    expect(r).toMatchObject({ enviadas: 1, pendientes: 0 });
    expect(servidor.subidas).toEqual([{ id: 'a1', reemplazar: false }]);
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'guardada', ultimoError: null });
    expect(fotos.guardadas.has('file:///documentos/actas/a1.jpg')).toBe(false);
  });

  test('reintento de un acta ya guardada (mismo UUID) también queda guardada', async () => {
    const { caso, outbox, encolar } = montar(new ServidorFalso(() => 'ya_existe', () => ({ tipo: 'ya_guardada' })));
    await encolar(acta('a1'));
    await caso.ejecutar();
    expect(estado(outbox, 'a1')?.estado).toBe('guardada');
  });

  test('otra acta para la misma mesa y dignidad → conflicto, sin sobrescribir y conservando la foto', async () => {
    const { caso, outbox, fotos, encolar } = montar(new ServidorFalso(() => 'sin_permiso', () => ({ tipo: 'conflicto' })));
    await encolar(acta('a1'));
    const r = await caso.ejecutar();
    expect(r.conflictos).toBe(1);
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'conflicto', ultimoError: 'conflicto' });
    expect(fotos.guardadas.has('file:///documentos/actas/a1.jpg')).toBe(true);
  });

  test('rechazo definitivo (fuera_de_vigencia, F6-5) → error con el motivo, no se reintenta', async () => {
    const { caso, outbox, servidor, encolar } = montar(
      new ServidorFalso(undefined, () => ({ tipo: 'rechazada', motivo: 'fuera_de_vigencia' })),
    );
    await encolar(acta('a1'));
    await caso.ejecutar();
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'error', ultimoError: 'fuera_de_vigencia' });
    await caso.ejecutar({ forzar: true });
    expect(servidor.registros).toEqual(['a1']);
  });

  test('hora del teléfono adelantada (F6-7): queda pendiente y se reintenta más tarde', async () => {
    const { caso, outbox, encolar } = montar(new ServidorFalso(undefined, () => ({ tipo: 'rechazada', motivo: 'hora_invalida' })));
    await encolar(acta('a1'));
    const r = await caso.ejecutar();
    expect(r.pendientes).toBe(1);
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'pendiente', intentos: 1, ultimoError: 'hora_invalida' });
  });

  test('foto huérfana de otro veedor (F6-6): la reemplaza y vuelve a registrar', async () => {
    const servidor = new ServidorFalso(
      (_a, reemplazar) => (reemplazar ? 'subida' : 'ya_existe'),
      (_a, intento) => (intento === 1 ? { tipo: 'rechazada', motivo: 'foto_faltante' } : { tipo: 'guardada' }),
    );
    const { caso, outbox, encolar } = montar(servidor);
    await encolar(acta('a1'));
    await caso.ejecutar();
    expect(servidor.subidas).toEqual([
      { id: 'a1', reemplazar: false },
      { id: 'a1', reemplazar: true },
    ]);
    expect(estado(outbox, 'a1')?.estado).toBe('guardada');
  });

  test('foto huérfana que no se puede reemplazar (veedor ya no vigente) → error foto_faltante', async () => {
    const servidor = new ServidorFalso(
      (_a, reemplazar) => (reemplazar ? 'sin_permiso' : 'ya_existe'),
      () => ({ tipo: 'rechazada', motivo: 'foto_faltante' }),
    );
    const { caso, outbox, encolar } = montar(servidor);
    await encolar(acta('a1'));
    await caso.ejecutar();
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'error', ultimoError: 'foto_faltante' });
  });

  test('se corta la red: el acta vuelve a pendiente con un intento más y se detiene el recorrido', async () => {
    const servidor = new ServidorFalso(() => new FallaRed());
    const { caso, outbox, encolar } = montar(servidor);
    await encolar(acta('a1'));
    await encolar(acta('a2', { dignidad: 'prefectura' }));
    const r = await caso.ejecutar();
    expect(r).toMatchObject({ detenida: 'sin_conexion', pendientes: 2 });
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'pendiente', intentos: 1, ultimoError: 'sin_conexion' });
    expect(servidor.subidas).toHaveLength(1);
  });

  test('respeta la espera entre reintentos salvo que se fuerce', async () => {
    const servidor = new ServidorFalso(() => new FallaRed());
    const { caso, encolar } = montar(servidor);
    await encolar(acta('a1'));
    await caso.ejecutar();
    servidor.foto = () => 'subida';
    // El reloj está fijo en AHORA y el último intento fue "ahora": todavía no vence la espera.
    const sinForzar = await caso.ejecutar();
    expect(sinForzar.pendientes).toBe(1);
    const forzada = await caso.ejecutar({ forzar: true });
    expect(forzada.enviadas).toBe(1);
  });

  test('sin conexión no intenta nada', async () => {
    const { caso, servidor, encolar } = montar(new ServidorFalso(), { conectado: false });
    await encolar(acta('a1'));
    const r = await caso.ejecutar();
    expect(r).toMatchObject({ detenida: 'sin_conexion', pendientes: 1 });
    expect(servidor.subidas).toHaveLength(0);
  });

  test('sesión vencida: se detiene y deja el acta pendiente', async () => {
    const { caso, outbox, encolar } = montar(new ServidorFalso(undefined, () => new SesionVencida()));
    await encolar(acta('a1'));
    const r = await caso.ejecutar();
    expect(r.detenida).toBe('sin_sesion');
    expect(estado(outbox, 'a1')).toMatchObject({ estado: 'pendiente', ultimoError: 'sin_sesion' });
  });

  test('solo envía las actas del veedor de la sesión', async () => {
    const { caso, servidor, encolar } = montar(new ServidorFalso(), { veedor: 'v2' });
    await encolar(acta('a1'));
    await caso.ejecutar();
    expect(servidor.subidas).toHaveLength(0);
  });

  test('dos llamadas simultáneas comparten el mismo recorrido (no hay envíos duplicados)', async () => {
    const { caso, servidor, encolar } = montar();
    await encolar(acta('a1'));
    await Promise.all([caso.ejecutar(), caso.ejecutar()]);
    expect(servidor.registros).toEqual(['a1']);
  });
});
