import type { NuevoRecinto, RangoMesas } from '@/domain/schemas/territorio.schema';
import { fail, ok } from '@/domain/shared/result';

import {
  AgregarMesas,
  AsignarCoordinador,
  AsignarVeedor,
  CrearRecinto,
  ListarCoordinadores,
  ListarVeedoresDeRecinto,
  MENSAJES_TERRITORIO_APP,
  TomarUbicacionRecinto,
} from '../use-cases/territorio';
import { perfil, SesionFalsa } from './dobles';

const provincial = perfil({ id: 'prov', rol: 'coordinador_provincial' });
const coordinador = perfil({ id: 'c1', rol: 'coordinador_recinto' });
const gps = { lat: 0.3, lng: -78.26, precisionM: 12, simulada: false };

describe('TomarUbicacionRecinto', () => {
  it('devuelve la lectura si cumple la precisión', async () => {
    const r = await new TomarUbicacionRecinto({ ubicacion: { leerUbicacionActual: async () => ok(gps) } }).ejecutar();
    expect(r).toEqual({ ok: true, value: gps });
  });
  it('rechaza una lectura imprecisa con el mensaje del dominio', async () => {
    const r = await new TomarUbicacionRecinto({ ubicacion: { leerUbicacionActual: async () => ok({ ...gps, precisionM: 120 }) } }).ejecutar();
    expect(!r.ok && r.error.codigo).toBe('validacion');
  });
  it('traduce el permiso denegado', async () => {
    const r = await new TomarUbicacionRecinto({ ubicacion: { leerUbicacionActual: async () => fail('permiso_denegado' as const) } }).ejecutar();
    expect(!r.ok && r.error.mensaje).toBe(MENSAJES_TERRITORIO_APP.permiso_denegado);
  });
});

describe('CrearRecinto', () => {
  const entrada = { parroquiaId: 5910, codigo: '990001', nombre: 'Escuela', codigoZona: 0, nombreZona: '', direccion: '', dificilAcceso: false, sinConectividad: false, ubicacion: gps };

  it('el provincial crea el recinto firmado con su id', async () => {
    const creados: [NuevoRecinto, string][] = [];
    const recintos = {
      listarVisibles: async () => [],
      listarParroquias: async () => [],
      crear: async (r: NuevoRecinto, por: string) => {
        creados.push([r, por]);
        return ok({ id: 'r9', parroquiaId: '5910', codigo: r.codigo, nombre: r.nombre, codigoZona: 0, nombreZona: null, direccion: null, ubicacion: { lat: 0.3, lng: -78.26 }, dificilAcceso: false, sinConectividad: false });
      },
    };
    const r = await new CrearRecinto({ sesion: new SesionFalsa(provincial), recintos }).ejecutar(entrada);
    expect(r.ok).toBe(true);
    expect(creados[0][1]).toBe('prov');
    expect(creados[0][0].direccion).toBeNull();
  });

  it('el coordinador de recinto no crea recintos', async () => {
    const r = await new CrearRecinto({
      sesion: new SesionFalsa(coordinador),
      recintos: { listarVisibles: async () => [], listarParroquias: async () => [], crear: async () => fail('sin_permiso' as const) },
    }).ejecutar(entrada);
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
  });

  it('traduce el código duplicado', async () => {
    const r = await new CrearRecinto({
      sesion: new SesionFalsa(provincial),
      recintos: { listarVisibles: async () => [], listarParroquias: async () => [], crear: async () => fail('codigo_duplicado' as const) },
    }).ejecutar(entrada);
    expect(!r.ok && r.error.mensaje).toBe(MENSAJES_TERRITORIO_APP.codigo_duplicado);
  });
});

describe('AgregarMesas', () => {
  const repo = (respuesta: Awaited<ReturnType<ConstructorParameters<typeof AgregarMesas>[0]['mesas']['agregarRango']>>) => {
    const llamadas: RangoMesas[] = [];
    return {
      llamadas,
      obtenerPorId: async () => null,
      listarPorRecinto: async () => [],
      agregarRango: async (_: string, r: RangoMesas) => {
        llamadas.push(r);
        return respuesta;
      },
    };
  };

  it('crea el rango', async () => {
    const mesas = repo(ok(5));
    const r = await new AgregarMesas({ sesion: new SesionFalsa(provincial), mesas }).ejecutar('r1', { sexo: 'F', desde: 1, hasta: 5 });
    expect(r).toEqual({ ok: true, value: { creadas: 5 } });
  });
  it('indica qué juntas ya existen', async () => {
    const r = await new AgregarMesas({ sesion: new SesionFalsa(provincial), mesas: repo(fail({ codigo: 'mesas_existentes', existentes: '3, 4' })) }).ejecutar('r1', { sexo: 'F', desde: 1, hasta: 5 });
    expect(!r.ok && r.error.mensaje).toContain('3, 4');
  });
  it('valida el rango sin llamar al servidor', async () => {
    const mesas = repo(ok(0));
    const r = await new AgregarMesas({ sesion: new SesionFalsa(provincial), mesas }).ejecutar('r1', { sexo: 'F', desde: 9, hasta: 2 });
    expect(!r.ok && r.error.codigo).toBe('validacion');
    expect(mesas.llamadas).toEqual([]);
  });
});

describe('AsignarCoordinador y ListarCoordinadores (F6)', () => {
  it('traduce coordinador_con_recinto', async () => {
    const r = await new AsignarCoordinador({
      sesion: new SesionFalsa(provincial),
      coordinaciones: { obtenerVigentePorRecinto: async () => null, listarVigentes: async () => [], asignar: async () => fail('coordinador_con_recinto' as const) },
    }).ejecutar('r1', 'c9');
    expect(!r.ok && r.error.mensaje).toBe(MENSAJES_TERRITORIO_APP.coordinador_con_recinto);
  });

  it('lista coordinadores activos, primero los que no tienen recinto', async () => {
    const lista = await new ListarCoordinadores({
      perfiles: {
        obtenerPorId: async () => null,
        listarVisibles: async () => [
          perfil({ id: 'a', rol: 'coordinador_recinto', apellidos: 'Alba' }),
          perfil({ id: 'b', rol: 'coordinador_recinto', apellidos: 'Borja' }),
          perfil({ id: 'c', rol: 'coordinador_recinto', activo: false }),
          perfil({ id: 'v', rol: 'veedor' }),
        ],
      },
      coordinaciones: {
        obtenerVigentePorRecinto: async () => null,
        listarVigentes: async () => [{ recintoId: 'r1', coordinador: { id: 'a', nombres: 'X', apellidos: 'Alba', telefono: '0990000000' } }],
        asignar: async () => ok(undefined),
      },
    }).ejecutar();
    expect(lista.map((c) => [c.id, c.recintoId])).toEqual([['b', null], ['a', 'r1']]);
  });
});

describe('AsignarVeedor y ListarVeedoresDeRecinto (F7)', () => {
  const asignaciones = () => {
    const llamadas: string[] = [];
    return {
      llamadas,
      obtenerVigentePorMesa: async () => null,
      obtenerVigentePorVeedor: async () => null,
      asignarVeedor: async (m: string, v: string) => {
        llamadas.push(`${m}:${v}`);
        return ok(undefined);
      },
      reemplazarVeedor: async () => ok(undefined),
    };
  };

  it('el coordinador asigna un veedor a una mesa vacía', async () => {
    const a = asignaciones();
    const r = await new AsignarVeedor({ sesion: new SesionFalsa(coordinador), asignaciones: a }).ejecutar({ id: 'm1', veedor: null }, 'v1');
    expect(r.ok).toBe(true);
    expect(a.llamadas).toEqual(['m1:v1']);
  });
  it('una mesa con veedor se reemplaza, no se asigna', async () => {
    const a = asignaciones();
    const r = await new AsignarVeedor({ sesion: new SesionFalsa(coordinador), asignaciones: a }).ejecutar(
      { id: 'm1', veedor: { id: 'v0', nombres: 'A', apellidos: 'B', telefono: '0990000000' } },
      'v1',
    );
    expect(!r.ok && r.error.codigo).toBe('mesa_con_veedor');
    expect(a.llamadas).toEqual([]);
  });
  it('el provincial no asigna veedores (RF-09)', async () => {
    const r = await new AsignarVeedor({ sesion: new SesionFalsa(provincial), asignaciones: asignaciones() }).ejecutar({ id: 'm1', veedor: null }, 'v1');
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
  });
  it('lista veedores libres primero', async () => {
    const lista = await new ListarVeedoresDeRecinto({
      veedoresRecinto: {
        obtenerVigentePorVeedor: async () => null,
        listarPorRecinto: async () => [
          { id: 'x', nombres: 'X', apellidos: 'Zeta', telefono: '0990000000', activo: true, mesaId: 'm1' },
          { id: 'y', nombres: 'Y', apellidos: 'Ana', telefono: '0990000000', activo: true, mesaId: null },
        ],
      },
    }).ejecutar('r1');
    expect(lista.map((v) => v.id)).toEqual(['y', 'x']);
  });
});
