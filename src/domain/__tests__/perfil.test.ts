import { MENSAJES_PERFIL } from '../rules/perfil.rules';
import { datosPersonalesSchema, nuevaCuentaSchema } from '../schemas/perfil.schema';

const datos = {
  cedula: '1003123450',
  nombres: 'María José',
  apellidos: 'Peñaherrera Ñúñez',
  telefono: '0991234567',
  correo: 'maria@correo.ec',
};

const mensajes = (input: unknown) => {
  const r = datosPersonalesSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => [i.path.join('.'), i.message]);
};

describe('datosPersonalesSchema', () => {
  it('acepta datos completos con tildes y ñ', () => {
    expect(mensajes(datos)).toEqual([]);
  });

  it.each(['Ana-María', 'De la Torre', 'Müller', 'Ñusta', 'Ruminahui Tituaña'])(
    'acepta el nombre %s',
    (nombres) => {
      expect(mensajes({ ...datos, nombres })).toEqual([]);
    },
  );

  it('normaliza a NFC: tildes compuestas (NFD) se aceptan igual que en PostgreSQL', () => {
    const nfd = 'María'.normalize('NFD');
    expect(datosPersonalesSchema.parse({ ...datos, nombres: nfd }).nombres).toBe('María'.normalize('NFC'));
  });

  it('normaliza espacios del nombre', () => {
    const r = datosPersonalesSchema.parse({ ...datos, nombres: '  María   José  ', correo: ' MARIA@Correo.EC ' });
    expect(r.nombres).toBe('María José');
    expect(r.correo).toBe('maria@correo.ec');
  });

  it.each(["O'Brien", 'Juan2', 'Ana_', '-Ana', 'Ana-'])('rechaza el nombre %s', (nombres) => {
    expect(mensajes({ ...datos, nombres })).toEqual([['nombres', MENSAJES_PERFIL.nombreCaracteres]]);
  });

  it('rechaza nombres cortos, largos o vacíos', () => {
    expect(mensajes({ ...datos, nombres: 'A' })).toEqual([['nombres', MENSAJES_PERFIL.nombreLongitud]]);
    expect(mensajes({ ...datos, nombres: 'a'.repeat(61) })).toEqual([['nombres', MENSAJES_PERFIL.nombreLongitud]]);
    expect(mensajes({ ...datos, apellidos: '   ' })[0]).toEqual(['apellidos', MENSAJES_PERFIL.obligatorio]);
  });

  it.each(['0891234567', '099123456', '09912345678', '+593991234567', '0991 234 567'])('rechaza el teléfono %s', (telefono) => {
    expect(mensajes({ ...datos, telefono })).toEqual([['telefono', MENSAJES_PERFIL.telefono]]);
  });

  it('rechaza correo inválido y datos faltantes (RF-04)', () => {
    expect(mensajes({ ...datos, correo: 'maria@' })).toEqual([['correo', MENSAJES_PERFIL.correo]]);
    expect(mensajes({}).map(([campo]) => campo)).toEqual(['cedula', 'nombres', 'apellidos', 'telefono', 'correo']);
  });
});

describe('nuevaCuentaSchema', () => {
  it('exige recinto para el veedor', () => {
    const r = nuevaCuentaSchema.safeParse({ ...datos, rol: 'veedor' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ['recintoId'], message: MENSAJES_PERFIL.recintoObligatorio });
    expect(nuevaCuentaSchema.safeParse({ ...datos, rol: 'veedor', recintoId: 'r1' }).success).toBe(true);
  });

  it('el coordinador de recinto se crea sin recinto (se asigna en F6)', () => {
    expect(nuevaCuentaSchema.safeParse({ ...datos, rol: 'coordinador_recinto' }).success).toBe(true);
  });

  it('no permite crear coordinadores provinciales desde la app', () => {
    expect(nuevaCuentaSchema.safeParse({ ...datos, rol: 'coordinador_provincial' }).success).toBe(false);
  });
});
