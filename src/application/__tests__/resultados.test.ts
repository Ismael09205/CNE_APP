import type { ActaRecibida, AvanceRecinto, DetalleActa, TotalCandidatura } from '@/domain/entities/resultados';
import type { ResultadosRepository } from '@/domain/repositories/resultados.repository';
import type { Dignidad } from '@/domain/value-objects/dignidad';

import type { FotosActaRemotas } from '../ports/seguimiento.port';
import { ConsultarResultadosRecinto, ConsultarTablero, MENSAJES_RESULTADOS, VerDetalleActa } from '../use-cases/resultados';
import { MesasEnMemoria, perfil, SesionFalsa } from './dobles';

const avance = (nombre: string, recibidas: number): AvanceRecinto => ({
  recintoId: nombre,
  codigo: nombre,
  nombre,
  parroquia: 'Cotacachi',
  ubicacion: null,
  sinConectividad: false,
  mesas: 1,
  actasEsperadas: 2,
  actasAlcaldia: recibidas,
  actasPrefectura: 0,
  actasEnRevision: 0,
  ultimaRecibida: null,
});

const total = (lista: string, votos: number): TotalCandidatura => ({
  candidaturaId: lista,
  lista,
  organizacionPolitica: `Org ${lista}`,
  candidato: `Candidato ${lista}`,
  binomio: null,
  color: '#000000',
  votos,
});

const detalle: DetalleActa = {
  id: 'a1',
  dignidad: 'alcaldia',
  mesa: { id: 'm1', numero: 1, sexo: 'F' },
  recinto: { id: 'r1', nombre: 'Recinto 1', ubicacion: { lat: 0.3, lng: -78.26 } },
  totalSufragantes: 10,
  votosBlancos: 0,
  votosNulos: 0,
  votos: [],
  fotoPath: 'm1/alcaldia.jpg',
  ubicacion: { lat: 0.3, lng: -78.26, precisionM: 5, simulada: false },
  confirmadaEn: new Date('2027-02-01T18:00:00Z'),
  recibidaEn: new Date('2027-02-01T18:01:00Z'),
};

class ResultadosEnMemoria implements ResultadosRepository {
  pedidos: string[] = [];
  actas: ActaRecibida[] = [];
  async avancePorRecinto() {
    return [avance('Zeta', 2), avance('Alfa', 0)];
  }
  async totalesPorCandidato(d: Dignidad, recintoId?: string) {
    this.pedidos.push(`totales:${d}:${recintoId ?? 'todos'}`);
    return [total('7', 30), total('8', 10)];
  }
  async resumenVotos() {
    return { actas: 1, sufragantes: 42, blancos: 1, nulos: 1 };
  }
  async actasDeRecinto() {
    return this.actas;
  }
  async detalleActa(id: string) {
    return id === 'a1' ? detalle : null;
  }
}

class FotosFalsas implements FotosActaRemotas {
  falla = false;
  async urlFirmada(path: string) {
    if (this.falla) throw new Error('sin red');
    return `https://firmada/${path}`;
  }
}

const provincial = new SesionFalsa(perfil({ rol: 'coordinador_provincial' }));
const coordinador = new SesionFalsa(perfil({ rol: 'coordinador_recinto' }));
const veedor = new SesionFalsa(perfil({ rol: 'veedor' }));

describe('ConsultarTablero (RF-17)', () => {
  it('arma el tablero del provincial con los menos avanzados primero', async () => {
    const r = await new ConsultarTablero({ sesion: provincial, resultados: new ResultadosEnMemoria() }).ejecutar('alcaldia');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.recintos.map((x) => x.nombre)).toEqual(['Alfa', 'Zeta']);
    expect(r.value.general).toMatchObject({ recintos: 2, actasEsperadas: 4, actasRecibidas: 2, recintosCompletos: 1 });
    expect(r.value.totales.map((t) => t.lista)).toEqual(['7', '8']);
  });

  it('el coordinador de recinto no tiene tablero (RF-17 es del provincial)', async () => {
    const r = await new ConsultarTablero({ sesion: coordinador, resultados: new ResultadosEnMemoria() }).ejecutar('alcaldia');
    expect(!r.ok && r.error).toEqual({ codigo: 'sin_permiso', mensaje: MENSAJES_RESULTADOS.sin_permiso });
  });

  it('sin sesión', async () => {
    const r = await new ConsultarTablero({ sesion: new SesionFalsa(null), resultados: new ResultadosEnMemoria() }).ejecutar('alcaldia');
    expect(!r.ok && r.error.codigo).toBe('sin_sesion');
  });

  it('una cuenta con clave temporal no consulta', async () => {
    const sesion = new SesionFalsa(perfil({ rol: 'coordinador_provincial', debeCambiarClave: true }));
    const r = await new ConsultarTablero({ sesion, resultados: new ResultadosEnMemoria() }).ejecutar('alcaldia');
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
  });
});

describe('ConsultarResultadosRecinto', () => {
  const mesas = () =>
    new MesasEnMemoria([
      { id: 'm2', recintoId: 'r1', numero: 1, sexo: 'M', numeroElectores: null },
      { id: 'm1', recintoId: 'r1', numero: 1, sexo: 'F', numeroElectores: null },
      { id: 'm3', recintoId: 'r1', numero: 2, sexo: 'F', numeroElectores: null },
    ]);

  it('une cada mesa con sus dos actas y ordena por sexo y número', async () => {
    const resultados = new ResultadosEnMemoria();
    resultados.actas = [{ id: 'a1', mesaId: 'm1', dignidad: 'alcaldia', recibidaEn: null, requiereRevision: true }];
    const r = await new ConsultarResultadosRecinto({ sesion: coordinador, resultados, mesas: mesas() }).ejecutar('r1', 'prefectura');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mesas.map((m) => m.id)).toEqual(['m1', 'm3', 'm2']);
    expect(r.value.mesas[0].actas.alcaldia?.id).toBe('a1');
    expect(r.value.mesas[0].actas.prefectura).toBeNull();
    expect(resultados.pedidos).toEqual(['totales:prefectura:r1']);
  });

  it('el veedor no consulta resultados de recintos', async () => {
    const r = await new ConsultarResultadosRecinto({ sesion: veedor, resultados: new ResultadosEnMemoria(), mesas: mesas() }).ejecutar(
      'r1',
      'alcaldia',
    );
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
  });
});

describe('VerDetalleActa (RF-13, ADR-13)', () => {
  it('devuelve el acta con la foto firmada', async () => {
    const r = await new VerDetalleActa({ sesion: provincial, resultados: new ResultadosEnMemoria(), fotos: new FotosFalsas() }).ejecutar('a1');
    expect(r.ok && r.value.urlFoto).toBe('https://firmada/m1/alcaldia.jpg');
  });

  it('si la foto no se puede firmar, muestra el acta igual', async () => {
    const fotos = new FotosFalsas();
    fotos.falla = true;
    const r = await new VerDetalleActa({ sesion: coordinador, resultados: new ResultadosEnMemoria(), fotos }).ejecutar('a1');
    expect(r.ok && r.value.urlFoto).toBeNull();
  });

  it('un acta fuera del alcance (o inexistente) se informa con claridad', async () => {
    const r = await new VerDetalleActa({ sesion: provincial, resultados: new ResultadosEnMemoria(), fotos: new FotosFalsas() }).ejecutar('otra');
    expect(!r.ok && r.error.codigo).toBe('no_encontrada');
  });

  it('el veedor no abre actas de otros', async () => {
    const r = await new VerDetalleActa({ sesion: veedor, resultados: new ResultadosEnMemoria(), fotos: new FotosFalsas() }).ejecutar('a1');
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
  });
});
