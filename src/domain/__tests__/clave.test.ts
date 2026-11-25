import { claveValida, MENSAJES_CLAVE } from '../rules/clave.rules';
import { codigoYClaveSchema, inicioSesionSchema } from '../schemas/auth.schema';

describe('claveValida (D-26)', () => {
  it.each(['abcdefg1', 'Clave2027', 'ñandú2026', '12345678a'])('acepta %s', (c) => expect(claveValida(c)).toBe(true));
  it.each(['abc1234', 'abcdefgh', '12345678', '', 'a1'.repeat(37)])('rechaza %s', (c) => expect(claveValida(c)).toBe(false));
});

describe('codigoYClaveSchema', () => {
  const ok = { codigo: '123456', clave: 'clave2027', confirmacion: 'clave2027' };

  it('acepta código de 6 dígitos y claves iguales', () => {
    expect(codigoYClaveSchema.safeParse(ok).success).toBe(true);
  });

  it.each([
    [{ ...ok, codigo: '12345' }, 'codigo', MENSAJES_CLAVE.codigo],
    [{ ...ok, codigo: 'abcdef' }, 'codigo', MENSAJES_CLAVE.codigo],
    [{ ...ok, clave: 'corta1', confirmacion: 'corta1' }, 'clave', MENSAJES_CLAVE.longitud],
    [{ ...ok, clave: 'sololetras', confirmacion: 'sololetras' }, 'clave', MENSAJES_CLAVE.letrasYNumeros],
    [{ ...ok, confirmacion: 'otra2027' }, 'confirmacion', MENSAJES_CLAVE.noCoinciden],
  ])('rechaza %j en %s', (input, campo, mensaje) => {
    const r = codigoYClaveSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.path.join('.'), i.message])).toContainEqual([campo, mensaje]);
  });
});

describe('inicioSesionSchema', () => {
  it('normaliza el correo', () => {
    expect(inicioSesionSchema.parse({ correo: ' Ana@Correo.EC ', clave: 'x' }).correo).toBe('ana@correo.ec');
  });
  it('exige clave', () => {
    expect(inicioSesionSchema.safeParse({ correo: 'ana@correo.ec', clave: '' }).success).toBe(false);
  });
});
