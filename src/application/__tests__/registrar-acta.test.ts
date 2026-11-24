import { MENSAJES_ACTA } from '@/domain/rules/acta.rules';
import type { Dignidad } from '@/domain/value-objects/dignidad';

import { RegistrarActa, type RegistrarActaInput } from '../use-cases/registrar-acta';
import {
  AsignacionesEnMemoria,
  CANDIDATURAS,
  CandidaturasEnMemoria,
  FotosEnMemoria,
  MesasEnMemoria,
  OutboxEnMemoria,
  perfil,
  SesionFalsa,
  vigencia,
} from './dobles';

const AHORA = new Date('2027-02-16T18:00:00Z');

function montar() {
  const sesion = new SesionFalsa(perfil({ id: 'v1', rol: 'veedor' }));
  const asignaciones = new AsignacionesEnMemoria([{ id: 'a1', mesaId: 'm1', veedorId: 'v1', asignadoPor: 'c1', ...vigencia }]);
  const mesas = new MesasEnMemoria([
    { id: 'm1', recintoId: 'r1', numero: 1, sexo: 'F', numeroElectores: null },
    { id: 'm2', recintoId: 'r1', numero: 1, sexo: 'M', numeroElectores: 300 },
  ]);
  const outbox = new OutboxEnMemoria();
  const fotos = new FotosEnMemoria();
  const casoDeUso = new RegistrarActa({
    sesion,
    asignaciones,
    mesas,
    candidaturas: new CandidaturasEnMemoria(),
    outbox,
    fotos,
    ids: { uuid: () => 'uuid-1' },
    reloj: { ahora: () => AHORA },
  });
  return { casoDeUso, sesion, asignaciones, mesas, outbox, fotos };
}

// 20 votos por lista + 2 nulos + 3 blancos. Alcaldía (5 listas) = 105; prefectura (4 listas) = 85.
const resultados = (dignidad: Dignidad) => ({
  votosNulos: 2,
  votosBlancos: 3,
  totalSufragantes: CANDIDATURAS[dignidad].length * 20 + 5,
  votos: CANDIDATURAS[dignidad].map((c) => ({ candidaturaId: c.id, votos: 20 })),
});

const input = (cambios: Partial<RegistrarActaInput> = {}): RegistrarActaInput => ({
  mesaId: 'm1',
  dignidad: 'alcaldia',
  resultados: resultados(cambios.dignidad ?? 'alcaldia'),
  evidencia: {
    fotoUriTemporal: 'file:///cache/foto.jpg',
    lat: 0.3,
    lng: -78.26,
    precisionM: 6,
    ubicacionSimulada: false,
    capturadaEn: new Date('2027-02-16T17:59:00Z'),
  },
  ...cambios,
});

describe('RegistrarActa', () => {
  it('guarda el acta enviada en la outbox con UUID, foto local y hora de confirmación', async () => {
    const { casoDeUso, outbox, fotos } = montar();
    const r = await casoDeUso.ejecutar(input());

    expect(r).toEqual({ ok: true, value: { actaId: 'uuid-1', estadoEnvio: 'pendiente' } });
    expect(outbox.actas).toHaveLength(1);
    const acta = outbox.actas[0];
    expect(acta).toMatchObject({ id: 'uuid-1', mesaId: 'm1', dignidad: 'alcaldia', veedorId: 'v1', estado: 'enviada', confirmadaEn: AHORA });
    expect(acta.evidencia.fotoPath).toBe('file:///documentos/actas/uuid-1.jpg');
    expect(Object.isFrozen(acta)).toBe(true);
    expect(fotos.guardadas.has(acta.evidencia.fotoPath)).toBe(true);
  });

  it('impide una segunda acta de la misma dignidad en la mesa, aun sin conexión', async () => {
    const { casoDeUso, outbox } = montar();
    await casoDeUso.ejecutar(input());
    const r = await casoDeUso.ejecutar(input());
    expect(!r.ok && r.error.codigo).toBe('acta_ya_registrada');
    expect(outbox.actas).toHaveLength(1);
  });

  it('permite el acta de la otra dignidad en la misma mesa', async () => {
    const { casoDeUso, outbox } = montar();
    await casoDeUso.ejecutar(input());
    const r = await casoDeUso.ejecutar(input({ dignidad: 'prefectura' }));
    expect(r.ok).toBe(true);
    expect(outbox.actas.map((a) => a.dignidad)).toEqual(['alcaldia', 'prefectura']);
    expect(outbox.actas[1].votos).toHaveLength(4);
  });

  it('exige exactamente las listas de la dignidad del acta', async () => {
    const { casoDeUso, outbox } = montar();
    // Acta de prefectura llenada con las listas de alcaldía.
    const r = await casoDeUso.ejecutar(input({ dignidad: 'prefectura', resultados: resultados('alcaldia') }));
    expect(!r.ok && r.error.violaciones?.map((v) => v.mensaje)).toContain(MENSAJES_ACTA.candidaturaFaltante);
    expect(!r.ok && r.error.violaciones?.map((v) => v.mensaje)).toContain(MENSAJES_ACTA.candidaturaDesconocida);
    expect(outbox.actas).toHaveLength(0);
  });

  it('devuelve los errores por campo y no guarda nada si el acta no cuadra', async () => {
    const { casoDeUso, outbox, fotos } = montar();
    const r = await casoDeUso.ejecutar(input({ resultados: { ...input().resultados, totalSufragantes: 110 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.codigo).toBe('validacion');
      expect(r.error.violaciones).toEqual([
        { campo: ['totalSufragantes'], codigo: 'custom', mensaje: MENSAJES_ACTA.sumaNoCuadra(105, 110) },
      ]);
    }
    expect(outbox.actas).toHaveLength(0);
    expect(fotos.guardadas.size).toBe(0);
  });

  it('exige foto y ubicación antes de guardar (RF-13)', async () => {
    const { casoDeUso, outbox } = montar();
    const r = await casoDeUso.ejecutar(input({ evidencia: { ...input().evidencia, fotoUriTemporal: '' } }));
    expect(!r.ok && r.error.violaciones?.map((v) => v.codigo)).toEqual(['foto_requerida']);
    expect(outbox.actas).toHaveLength(0);
  });

  it('aplica el máximo de electores cuando la mesa lo tiene', async () => {
    const { casoDeUso, asignaciones } = montar();
    asignaciones.asignaciones = [{ id: 'a2', mesaId: 'm2', veedorId: 'v1', asignadoPor: 'c1', ...vigencia }];
    const votos = CANDIDATURAS.alcaldia.map((c) => ({ candidaturaId: c.id, votos: 60 }));
    const r = await casoDeUso.ejecutar(
      input({ mesaId: 'm2', resultados: { votosNulos: 1, votosBlancos: 0, totalSufragantes: 301, votos } }),
    );
    expect(!r.ok && r.error.violaciones?.map((v) => v.campo)).toEqual([['totalSufragantes']]);
  });

  it('rechaza si la mesa no está asignada al veedor (RF-16)', async () => {
    const { casoDeUso } = montar();
    const r = await casoDeUso.ejecutar(input({ mesaId: 'm2' }));
    expect(!r.ok && r.error.codigo).toBe('mesa_no_asignada');
  });

  it('rechaza a quien no es veedor, está inactivo o tiene clave temporal', async () => {
    for (const p of [
      perfil({ id: 'v1', rol: 'coordinador_recinto' }),
      perfil({ id: 'v1', activo: false }),
      perfil({ id: 'v1', debeCambiarClave: true }),
    ]) {
      const { casoDeUso, sesion } = montar();
      sesion.perfil = p;
      const r = await casoDeUso.ejecutar(input());
      expect(!r.ok && r.error.codigo).toBe('no_autorizado');
    }
  });

  it('rechaza sin sesión', async () => {
    const { casoDeUso, sesion } = montar();
    sesion.perfil = null;
    const r = await casoDeUso.ejecutar(input());
    expect(!r.ok && r.error.codigo).toBe('sin_sesion');
  });

  it('borra la foto copiada si falla el guardado local y propaga el error', async () => {
    const { casoDeUso, outbox, fotos } = montar();
    outbox.falla = new Error('SQLite lleno');
    await expect(casoDeUso.ejecutar(input())).rejects.toThrow('SQLite lleno');
    expect(fotos.guardadas.size).toBe(0);
  });
});
