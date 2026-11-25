import { ordenarMesas } from '../entities/mesa';
import { MENSAJES_TERRITORIO, nuevoRecintoSchema, rangoMesasSchema, ubicacionGpsSchema } from '../schemas/territorio.schema';

const gps = { lat: 0.3, lng: -78.26, precisionM: 12, simulada: false };

describe('ubicacionGpsSchema (D-30, D-31)', () => {
  it('acepta 50 m o mejor', () => {
    expect(ubicacionGpsSchema.safeParse(gps).success).toBe(true);
    expect(ubicacionGpsSchema.safeParse({ ...gps, precisionM: 50 }).success).toBe(true);
  });
  it('rechaza precisión peor que 50 m', () => {
    const r = ubicacionGpsSchema.safeParse({ ...gps, precisionM: 50.5 });
    expect(r.error?.issues[0].message).toBe(MENSAJES_TERRITORIO.ubicacionImprecisa);
  });
  it('rechaza ubicación simulada', () => {
    const r = ubicacionGpsSchema.safeParse({ ...gps, simulada: true });
    expect(r.error?.issues[0].message).toBe(MENSAJES_TERRITORIO.ubicacionSimulada);
  });
});

describe('nuevoRecintoSchema', () => {
  const base = {
    parroquiaId: 5910,
    codigo: ' 990001 ',
    nombre: '  Escuela   Nueva  ',
    codigoZona: 0,
    nombreZona: '',
    direccion: ' Calle 1 ',
    dificilAcceso: false,
    sinConectividad: true,
    ubicacion: gps,
  };
  it('normaliza textos y vacíos a null', () => {
    const r = nuevoRecintoSchema.parse(base);
    expect(r).toMatchObject({ codigo: '990001', nombre: 'Escuela Nueva', nombreZona: null, direccion: 'Calle 1' });
  });
  it('exige ubicación del GPS', () => {
    const { ubicacion: _, ...sinGps } = base;
    const r = nuevoRecintoSchema.safeParse(sinGps);
    expect(r.error?.issues.map((i) => i.message)).toContain(MENSAJES_TERRITORIO.ubicacionFalta);
  });
  it.each(['', 'A12', '12345678901'])('rechaza el código %j', (codigo) => {
    expect(nuevoRecintoSchema.safeParse({ ...base, codigo }).success).toBe(false);
  });
});

describe('rangoMesasSchema (D-32)', () => {
  it('acepta un rango válido', () => expect(rangoMesasSchema.safeParse({ sexo: 'F', desde: 6, hasta: 11 }).success).toBe(true));
  it('acepta una sola junta', () => expect(rangoMesasSchema.safeParse({ sexo: 'M', desde: 3, hasta: 3 }).success).toBe(true));
  it('rechaza el rango invertido en el campo hasta', () => {
    const r = rangoMesasSchema.safeParse({ sexo: 'F', desde: 5, hasta: 3 });
    expect(r.error?.issues[0]).toMatchObject({ path: ['hasta'], message: MENSAJES_TERRITORIO.rango });
  });
  it('rechaza más de 60 juntas', () => {
    expect(rangoMesasSchema.safeParse({ sexo: 'F', desde: 1, hasta: 61 }).error?.issues[0].message).toBe(MENSAJES_TERRITORIO.rangoLargo);
    expect(rangoMesasSchema.safeParse({ sexo: 'F', desde: 1, hasta: 60 }).success).toBe(true);
  });
  it('rechaza números menores que 1 y sexo inválido', () => {
    expect(rangoMesasSchema.safeParse({ sexo: 'F', desde: 0, hasta: 2 }).success).toBe(false);
    expect(rangoMesasSchema.safeParse({ sexo: 'X', desde: 1, hasta: 2 }).success).toBe(false);
  });
});

describe('ordenarMesas (F7: primero las que no tienen veedor)', () => {
  it('ordena sin veedor primero, luego por sexo y número', () => {
    const v = { id: 'v', nombres: 'A', apellidos: 'B', telefono: '0990000000' };
    const mesas = [
      { numero: 2, sexo: 'F' as const, veedor: v },
      { numero: 2, sexo: 'M' as const, veedor: null },
      { numero: 1, sexo: 'F' as const, veedor: null },
      { numero: 10, sexo: 'F' as const, veedor: null },
    ];
    expect(ordenarMesas(mesas).map((m) => `${m.numero}${m.sexo}`)).toEqual(['1F', '10F', '2M', '2F']);
  });
});
