import { ReemplazarVeedor } from '../use-cases/reemplazar-veedor';
import {
  AsignacionesEnMemoria,
  CoordinacionesEnMemoria,
  MesasEnMemoria,
  perfil,
  PerfilesEnMemoria,
  SesionFalsa,
  VeedoresRecintoEnMemoria,
  vigencia,
} from './dobles';

function montar() {
  const sesion = new SesionFalsa(perfil({ id: 'c1', rol: 'coordinador_recinto' }));
  const mesas = new MesasEnMemoria([{ id: 'm1', recintoId: 'r1', numero: 1, sexo: 'F', numeroElectores: null }]);
  const perfiles = new PerfilesEnMemoria([
    perfil({ id: 'ausente' }),
    perfil({ id: 'libre' }),
    perfil({ id: 'ocupado' }),
    perfil({ id: 'otro-recinto' }),
    perfil({ id: 'sin-recinto' }),
    perfil({ id: 'inactivo', activo: false }),
    perfil({ id: 'coord2', rol: 'coordinador_recinto' }),
  ]);
  const coordinaciones = new CoordinacionesEnMemoria([
    { id: 'k0', recintoId: 'r1', coordinadorId: 'anterior', desde: new Date('2026-12-01'), hasta: new Date('2027-01-01') },
    { id: 'k1', recintoId: 'r1', coordinadorId: 'c1', ...vigencia },
  ]);
  const veedoresRecinto = new VeedoresRecintoEnMemoria(
    [
      ['ausente', 'r1'],
      ['libre', 'r1'],
      ['ocupado', 'r1'],
      ['otro-recinto', 'r2'],
      ['inactivo', 'r1'],
    ].map(([veedorId, recintoId], i) => ({ id: `vr${i}`, veedorId, recintoId, ...vigencia })),
  );
  const asignaciones = new AsignacionesEnMemoria([
    { id: 'a1', mesaId: 'm1', veedorId: 'ausente', asignadoPor: 'c1', ...vigencia },
    { id: 'a2', mesaId: 'm9', veedorId: 'ocupado', asignadoPor: 'c1', ...vigencia },
  ]);
  const casoDeUso = new ReemplazarVeedor({ sesion, mesas, perfiles, coordinaciones, veedoresRecinto, asignaciones });
  return { casoDeUso, sesion, coordinaciones, asignaciones };
}

const codigo = async (nuevoVeedorId: string, m = montar()) => {
  const r = await m.casoDeUso.ejecutar({ mesaId: 'm1', nuevoVeedorId });
  return r.ok ? 'ok' : r.error.codigo;
};

describe('ReemplazarVeedor', () => {
  it('reemplaza al ausente por un veedor libre del mismo recinto', async () => {
    const { casoDeUso, asignaciones } = montar();
    const r = await casoDeUso.ejecutar({ mesaId: 'm1', nuevoVeedorId: 'libre' });

    expect(r.ok).toBe(true);
    // Envía al servidor el veedor que se mostraba (detección de reemplazo concurrente).
    expect(asignaciones.ultimoVeedorActual).toBe('ausente');
    const historial = asignaciones.asignaciones.filter((a) => a.mesaId === 'm1');
    expect(historial.find((a) => a.veedorId === 'ausente')?.hasta).not.toBeNull();
  });

  it.each([
    ['otro-recinto', 'veedor_de_otro_recinto'], // S-06
    ['sin-recinto', 'veedor_de_otro_recinto'], // S-06: sin membresía
    ['ocupado', 'veedor_con_otra_mesa'], // S-04
    ['inactivo', 'veedor_no_valido'],
    ['coord2', 'veedor_no_valido'],
    ['no-existe', 'veedor_no_valido'],
    ['ausente', 'mismo_veedor'],
  ])('rechaza a %s con %s sin llamar al servidor', async (veedor, esperado) => {
    const m = montar();
    expect(await codigo(veedor, m)).toBe(esperado);
    expect(m.asignaciones.llamadasReemplazo).toBe(0);
  });

  it('solo lo hace el coordinador vigente del recinto', async () => {
    const m = montar();
    m.sesion.perfil = perfil({ id: 'anterior', rol: 'coordinador_recinto' });
    expect(await codigo('libre', m)).toBe('no_es_coordinador_vigente');
  });

  it('rechaza otros roles y cuentas con clave temporal', async () => {
    for (const p of [perfil({ id: 'c1', rol: 'veedor' }), perfil({ id: 'c1', rol: 'coordinador_recinto', debeCambiarClave: true })]) {
      const m = montar();
      m.sesion.perfil = p;
      expect(await codigo('libre', m)).toBe('no_autorizado');
    }
  });

  it('pide usar Asignar si la mesa no tiene veedor', async () => {
    const m = montar();
    m.asignaciones.asignaciones = m.asignaciones.asignaciones.filter((a) => a.mesaId !== 'm1');
    expect(await codigo('libre', m)).toBe('mesa_sin_veedor');
  });

  it('traduce el rechazo del servidor (reemplazo concurrente)', async () => {
    const m = montar();
    m.asignaciones.rechazoServidor = 'reemplazo_concurrente';
    const r = await m.casoDeUso.ejecutar({ mesaId: 'm1', nuevoVeedorId: 'libre' });
    expect(!r.ok && r.error).toEqual({
      codigo: 'reemplazo_concurrente',
      mensaje: 'Otra persona cambió esta mesa al mismo tiempo. Actualice e intente de nuevo.',
    });
  });
});
