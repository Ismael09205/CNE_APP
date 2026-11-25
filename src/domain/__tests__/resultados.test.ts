import {
  actasRecibidas,
  coincideBusqueda,
  cumpleFiltro,
  type FiltroAvance,
  avanceGeneral,
  detalleRequiereRevision,
  distanciaMetros,
  ordenarPorAvance,
  porcentajeTexto,
  proporcion,
  type AvanceRecinto,
} from '../entities/resultados';

const recinto = (cambios: Partial<AvanceRecinto>): AvanceRecinto => ({
  recintoId: 'r',
  codigo: '1',
  nombre: 'Recinto',
  parroquia: 'Parroquia',
  ubicacion: null,
  sinConectividad: false,
  mesas: 2,
  actasEsperadas: 4,
  actasAlcaldia: 0,
  actasPrefectura: 0,
  actasEnRevision: 0,
  ultimaRecibida: null,
  ...cambios,
});

describe('avance (RF-17)', () => {
  test('actas recibidas = alcaldía + prefectura', () => {
    expect(actasRecibidas({ actasAlcaldia: 2, actasPrefectura: 1 })).toBe(3);
  });

  test('avance general suma recintos y cuenta los completos', () => {
    const g = avanceGeneral([
      recinto({ actasAlcaldia: 2, actasPrefectura: 2, actasEnRevision: 1 }),
      recinto({ actasAlcaldia: 1 }),
      recinto({ mesas: 0, actasEsperadas: 0 }),
    ]);
    expect(g).toEqual({ recintos: 3, recintosCompletos: 1, actasEsperadas: 8, actasRecibidas: 5, actasEnRevision: 1 });
  });

  test('un recinto sin mesas no cuenta como completo', () => {
    expect(avanceGeneral([recinto({ mesas: 0, actasEsperadas: 0 })]).recintosCompletos).toBe(0);
  });

  test('ordena primero los de menos avance y deja al final los que no tienen mesas', () => {
    const orden = ordenarPorAvance([
      recinto({ nombre: 'Completo', actasAlcaldia: 2, actasPrefectura: 2 }),
      recinto({ nombre: 'Sin mesas', mesas: 0, actasEsperadas: 0 }),
      recinto({ nombre: 'Bajo', actasAlcaldia: 1 }),
      recinto({ nombre: 'Ana', actasAlcaldia: 1 }),
    ]).map((r) => r.nombre);
    expect(orden).toEqual(['Ana', 'Bajo', 'Completo', 'Sin mesas']);
  });
});

describe('porcentajes', () => {
  test('proporción acotada entre 0 y 1, y 0 si el total es 0', () => {
    expect(proporcion(1, 4)).toBe(0.25);
    expect(proporcion(5, 4)).toBe(1);
    expect(proporcion(3, 0)).toBe(0);
  });

  test('porcentaje con un decimal y coma (es-EC)', () => {
    expect(porcentajeTexto(1, 3)).toMatch(/^33[,.]3 %$/);
    expect(porcentajeTexto(0, 0)).toMatch(/^0[,.]0 %$/);
  });
});

describe('lugar de registro (ADR-13)', () => {
  test('distancia de haversine: 0,001° de latitud ≈ 111 m', () => {
    const d = distanciaMetros({ lat: 0.3, lng: -78.26 }, { lat: 0.301, lng: -78.26 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  test('revisión por ubicación imprecisa o simulada (F6-4)', () => {
    expect(detalleRequiereRevision({ ubicacion: { lat: 0, lng: 0, precisionM: 6, simulada: false } })).toBe(false);
    expect(detalleRequiereRevision({ ubicacion: { lat: 0, lng: 0, precisionM: 80, simulada: false } })).toBe(true);
    expect(detalleRequiereRevision({ ubicacion: { lat: 0, lng: 0, precisionM: 6, simulada: true } })).toBe(true);
  });
});

describe('filtros del avance por recinto', () => {
  const lista = [
    recinto({ nombre: 'Completo', actasAlcaldia: 2, actasPrefectura: 2 }),
    recinto({ nombre: 'Con revisión', actasAlcaldia: 1, actasEnRevision: 1 }),
    recinto({ nombre: 'Sin actas' }),
    recinto({ nombre: 'Sin mesas', mesas: 0, actasEsperadas: 0 }),
  ];
  const nombres = (f: FiltroAvance) => lista.filter((r) => cumpleFiltro(r, f)).map((r) => r.nombre);

  test('faltan: los que tienen mesas y no están completos', () => {
    expect(nombres('faltan')).toEqual(['Con revisión', 'Sin actas']);
  });
  test('por revisar, completos y todos', () => {
    expect(nombres('revisar')).toEqual(['Con revisión']);
    expect(nombres('conActas')).toEqual(['Completo', 'Con revisión']);
    expect(nombres('completos')).toEqual(['Completo']);
    expect(nombres('todos')).toHaveLength(4);
  });
  test('la búsqueda ignora tildes y mayúsculas, y mira nombre, parroquia y código', () => {
    const r = { nombre: 'UNIDAD EDUCATIVA SAN JOSÉ', parroquia: 'Quiroga', codigo: '989' };
    expect(coincideBusqueda(r, 'jose')).toBe(true);
    expect(coincideBusqueda(r, 'QUIROGA')).toBe(true);
    expect(coincideBusqueda(r, '98')).toBe(true);
    expect(coincideBusqueda(r, 'imantag')).toBe(false);
    expect(coincideBusqueda(r, '  ')).toBe(true);
  });
});
