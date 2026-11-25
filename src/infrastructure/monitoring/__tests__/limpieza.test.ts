import { limpiarEvento, limpiarMiga, limpiarValor, ocultarDatosPersonales } from '../limpieza';

describe('privacidad en Sentry (ADR-18)', () => {
  test('oculta correos, cédulas, teléfonos y tokens en textos', () => {
    const t = ocultarDatosPersonales(
      'Falló ana.perez@correo.ec cédula 1003123450 tel 0991234567 token eyJhbGciOi.eyJzdWIiOi.abc123 sb_secret_xyz',
    );
    expect(t).toBe('Falló [correo] cédula [número] tel [número] token [token] [token]');
  });

  test('oculta el token de una URL firmada', () => {
    expect(ocultarDatosPersonales('https://x.supabase.co/storage/v1/object/sign/actas/m1/alcaldia.jpg?token=abc.def')).toBe(
      'https://x.supabase.co/storage/v1/object/sign/actas/m1/alcaldia.jpg?token=[oculto]',
    );
  });

  test('borra claves personales o de votos en datos anidados', () => {
    expect(
      limpiarValor({ cedula: '1003123450', correo: 'a@b.ec', votos: [1, 2], operacion: 'sincronizar', anidado: { telefono: '099', nota: 'mail a@b.ec' } }),
    ).toEqual({ operacion: 'sincronizar', anidado: { nota: 'mail [correo]' } });
  });

  test('del usuario solo queda el rol, y se quita la petición', () => {
    const e = limpiarEvento({
      user: { id: 'u1', email: 'a@b.ec', ip_address: '1.2.3.4', rol: 'veedor' },
      request: { url: 'https://x' },
      message: 'Error con a@b.ec',
      exception: { values: [{ value: 'No se pudo leer 1003123450' }] },
      breadcrumbs: [{ message: 'GET a@b.ec', data: { correo: 'a@b.ec', status: 500 } }],
    });
    expect(e.user).toEqual({ rol: 'veedor' });
    expect(e.request).toBeUndefined();
    expect(e.message).toBe('Error con [correo]');
    expect(e.exception?.values?.[0].value).toBe('No se pudo leer [número]');
    expect(e.breadcrumbs?.[0]).toEqual({ message: 'GET [correo]', data: { status: 500 } });
  });

  test('sin rol no queda usuario', () => {
    expect(limpiarEvento({ user: { id: 'u1' } }).user).toBeUndefined();
  });

  test('migas sin datos quedan igual', () => {
    expect(limpiarMiga({ message: 'navegación' })).toEqual({ message: 'navegación', data: undefined });
  });
});
