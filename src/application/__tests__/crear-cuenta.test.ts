import { CrearCuenta } from '../use-cases/crear-cuenta';
import { CoordinacionesEnMemoria, CuentasEnMemoria, perfil, SesionFalsa, vigencia } from './dobles';

const datos = {
  cedula: '1003123450',
  nombres: 'Luis Alberto',
  apellidos: 'Tituaña',
  telefono: '0987654321',
  correo: 'luis@correo.ec',
};

function montar(actor = perfil({ id: 'prov', rol: 'coordinador_provincial' })) {
  const sesion = new SesionFalsa(actor);
  const coordinaciones = new CoordinacionesEnMemoria([{ id: 'k1', recintoId: 'r1', coordinadorId: 'crec', ...vigencia }]);
  const cuentas = new CuentasEnMemoria();
  return { casoDeUso: new CrearCuenta({ sesion, coordinaciones, cuentas }), sesion, cuentas };
}

describe('CrearCuenta', () => {
  it('el provincial crea un veedor y recibe la clave temporal del servidor', async () => {
    const { casoDeUso, cuentas } = montar();
    const r = await casoDeUso.ejecutar({ ...datos, rol: 'veedor', recintoId: 'r1' });
    expect(r).toEqual({ ok: true, value: { perfilId: 'nuevo-1', claveTemporal: 'Temp-1234' } });
    expect(cuentas.creadas[0]).toMatchObject({ rol: 'veedor', recintoId: 'r1', cedula: '1003123450' });
  });

  it('el provincial crea un coordinador de recinto sin recinto (se asigna en F6)', async () => {
    const { casoDeUso } = montar();
    expect((await casoDeUso.ejecutar({ ...datos, rol: 'coordinador_recinto' })).ok).toBe(true);
  });

  it('el coordinador de recinto crea veedores solo de su recinto', async () => {
    const { casoDeUso, sesion } = montar(perfil({ id: 'crec', rol: 'coordinador_recinto' }));
    expect((await casoDeUso.ejecutar({ ...datos, rol: 'veedor', recintoId: 'r1' })).ok).toBe(true);

    const otro = await casoDeUso.ejecutar({ ...datos, rol: 'veedor', recintoId: 'r2' });
    expect(!otro.ok && otro.error.codigo).toBe('sin_permiso');

    const coord = await casoDeUso.ejecutar({ ...datos, rol: 'coordinador_recinto' });
    expect(!coord.ok && coord.error.codigo).toBe('sin_permiso');

    sesion.perfil = perfil({ id: 'crec', rol: 'coordinador_recinto', debeCambiarClave: true });
    const temporal = await casoDeUso.ejecutar({ ...datos, rol: 'veedor', recintoId: 'r1' });
    expect(!temporal.ok && temporal.error.codigo).toBe('sin_permiso');
  });

  it('el veedor no crea cuentas', async () => {
    const { casoDeUso, cuentas } = montar(perfil({ rol: 'veedor' }));
    const r = await casoDeUso.ejecutar({ ...datos, rol: 'veedor', recintoId: 'r1' });
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
    expect(cuentas.creadas).toHaveLength(0);
  });

  it('valida con el mismo esquema del formulario y no llama al servidor', async () => {
    const { casoDeUso, cuentas } = montar();
    const r = await casoDeUso.ejecutar({ ...datos, cedula: '1003123451', telefono: '123', rol: 'veedor', recintoId: 'r1' });
    expect(!r.ok && r.error.codigo).toBe('validacion');
    expect(!r.ok && r.error.violaciones?.map((v) => v.campo)).toEqual([['cedula'], ['telefono']]);
    expect(cuentas.creadas).toHaveLength(0);
  });

  it('traduce los rechazos del servidor (cédula duplicada)', async () => {
    const { casoDeUso, cuentas } = montar();
    cuentas.rechazo = 'cedula_duplicada';
    const r = await casoDeUso.ejecutar({ ...datos, rol: 'veedor', recintoId: 'r1' });
    expect(!r.ok && r.error).toEqual({ codigo: 'cedula_duplicada', mensaje: 'Ya existe una cuenta con esta cédula.' });
  });
});
