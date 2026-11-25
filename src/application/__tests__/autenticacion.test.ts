import type { Perfil } from '@/domain/entities/perfil';
import { fail, ok, type Result } from '@/domain/shared/result';

import type {
  AutenticacionGateway,
  FalloAutenticacion,
  PrimerIngresoGateway,
  RechazoPrimerIngreso,
} from '../ports/autenticacion.port';
import { DesactivarCuenta, RestablecerClaveAsistido } from '../use-cases/administrar-cuenta';
import {
  CompletarPrimerIngreso,
  IniciarSesion,
  MENSAJES_ACCESO,
  RestablecerConCodigo,
  SolicitarCodigoPrimerIngreso,
} from '../use-cases/autenticacion';
import { perfil, SesionFalsa } from './dobles';

class AuthFalso implements AutenticacionGateway {
  sesionDe: string | null = null;
  llamadas: string[] = [];
  fallaIngreso: FalloAutenticacion | null = null;
  codigoValido = '123456';

  async iniciarSesion(correo: string) {
    this.llamadas.push('iniciarSesion');
    if (this.fallaIngreso) return fail(this.fallaIngreso);
    this.sesionDe = correo;
    return ok(undefined);
  }
  async cerrarSesion() {
    this.llamadas.push('cerrarSesion');
    this.sesionDe = null;
  }
  async correoSesion() {
    return this.sesionDe;
  }
  async enviarCodigoAcceso(correo: string) {
    this.llamadas.push(`codigo:${correo}`);
    return ok(undefined);
  }
  async verificarCodigoAcceso(_correo: string, codigo: string): Promise<Result<void, FalloAutenticacion>> {
    this.llamadas.push('verificarAcceso');
    return codigo === this.codigoValido ? ok(undefined) : fail('codigo_invalido');
  }
  async enviarCodigoRecuperacion() {
    return ok(undefined);
  }
  async verificarCodigoRecuperacion(correo: string, codigo: string): Promise<Result<void, FalloAutenticacion>> {
    this.llamadas.push('verificarRecuperacion');
    if (codigo !== this.codigoValido) return fail('codigo_invalido');
    this.sesionDe = correo;
    return ok(undefined);
  }
  async actualizarClave() {
    this.llamadas.push('actualizarClave');
    return ok(undefined);
  }
}

class PrimerIngresoFalso implements PrimerIngresoGateway {
  claves: string[] = [];
  rechazo: RechazoPrimerIngreso | null = null;
  async completar(clave: string) {
    if (this.rechazo) return fail(this.rechazo);
    this.claves.push(clave);
    return ok(undefined);
  }
}

const datos = { codigo: '123456', clave: 'nueva2027', confirmacion: 'nueva2027' };

describe('IniciarSesion', () => {
  it('ingresa y devuelve el perfil (aunque tenga clave temporal)', async () => {
    const auth = new AuthFalso();
    const p = perfil({ debeCambiarClave: true });
    const r = await new IniciarSesion({ auth, sesion: new SesionFalsa(p) }).ejecutar({ correo: 'Ana@Correo.ec', clave: 'tmp12345' });
    expect(r).toEqual({ ok: true, value: p });
    expect(auth.sesionDe).toBe('ana@correo.ec');
  });

  it('traduce credenciales incorrectas a un mensaje claro', async () => {
    const auth = new AuthFalso();
    auth.fallaIngreso = 'credenciales';
    const r = await new IniciarSesion({ auth, sesion: new SesionFalsa(perfil()) }).ejecutar({ correo: 'ana@correo.ec', clave: 'x' });
    expect(!r.ok && r.error).toEqual({ codigo: 'credenciales', mensaje: MENSAJES_ACCESO.credenciales });
  });

  it('cierra la sesión si la cuenta está desactivada (RF-02)', async () => {
    const auth = new AuthFalso();
    const r = await new IniciarSesion({ auth, sesion: new SesionFalsa(perfil({ activo: false })) }).ejecutar({
      correo: 'ana@correo.ec',
      clave: 'x',
    });
    expect(!r.ok && r.error.codigo).toBe('cuenta_inactiva');
    expect(auth.llamadas).toContain('cerrarSesion');
  });

  it('cierra la sesión si no hay perfil', async () => {
    const auth = new AuthFalso();
    const r = await new IniciarSesion({ auth, sesion: new SesionFalsa(null) }).ejecutar({ correo: 'ana@correo.ec', clave: 'x' });
    expect(!r.ok && r.error.codigo).toBe('sin_perfil');
    expect(auth.sesionDe).toBeNull();
  });

  it('valida el formulario antes de llamar al servidor', async () => {
    const auth = new AuthFalso();
    const r = await new IniciarSesion({ auth, sesion: new SesionFalsa(perfil()) }).ejecutar({ correo: 'no-es-correo', clave: '' });
    expect(!r.ok && r.error.codigo).toBe('validacion');
    expect(auth.llamadas).toEqual([]);
  });
});

describe('Primer ingreso (F2, D-25)', () => {
  it('envía el código al correo de la sesión', async () => {
    const auth = new AuthFalso();
    auth.sesionDe = 'ana@correo.ec';
    const r = await new SolicitarCodigoPrimerIngreso({ auth }).ejecutar();
    expect(r).toEqual({ ok: true, value: { correo: 'ana@correo.ec' } });
    expect(auth.llamadas).toEqual(['codigo:ana@correo.ec']);
  });

  it('verifica el código y luego completa en el servidor', async () => {
    const auth = new AuthFalso();
    auth.sesionDe = 'ana@correo.ec';
    const primerIngreso = new PrimerIngresoFalso();
    const r = await new CompletarPrimerIngreso({ auth, primerIngreso }).ejecutar(datos);
    expect(r.ok).toBe(true);
    expect(auth.llamadas).toEqual(['verificarAcceso', 'cerrarSesion']);
    expect(primerIngreso.claves).toEqual(['nueva2027']);
  });

  it('al guardar la clave cierra la sesión para volver al ingreso (el servidor ya la invalidó)', async () => {
    const auth = new AuthFalso();
    auth.sesionDe = 'ana@correo.ec';
    await new CompletarPrimerIngreso({ auth, primerIngreso: new PrimerIngresoFalso() }).ejecutar(datos);
    expect(auth.sesionDe).toBeNull();
  });

  it('si la clave ya estaba cambiada, cierra la sesión y lo dice con claridad', async () => {
    const auth = new AuthFalso();
    auth.sesionDe = 'ana@correo.ec';
    const primerIngreso = new PrimerIngresoFalso();
    primerIngreso.rechazo = 'no_requerido';
    const r = await new CompletarPrimerIngreso({ auth, primerIngreso }).ejecutar(datos);
    expect(!r.ok && r.error).toEqual({ codigo: 'no_requerido', mensaje: MENSAJES_ACCESO.no_requerido });
    expect(auth.sesionDe).toBeNull();
  });

  it('con otros rechazos mantiene la sesión para reintentar', async () => {
    const auth = new AuthFalso();
    auth.sesionDe = 'ana@correo.ec';
    const primerIngreso = new PrimerIngresoFalso();
    primerIngreso.rechazo = 'clave_debil';
    await new CompletarPrimerIngreso({ auth, primerIngreso }).ejecutar(datos);
    expect(auth.sesionDe).toBe('ana@correo.ec');
  });

  it('no cambia la clave si el código es incorrecto', async () => {
    const auth = new AuthFalso();
    auth.sesionDe = 'ana@correo.ec';
    const primerIngreso = new PrimerIngresoFalso();
    const r = await new CompletarPrimerIngreso({ auth, primerIngreso }).ejecutar({ ...datos, codigo: '000000' });
    expect(!r.ok && r.error.codigo).toBe('codigo_invalido');
    expect(primerIngreso.claves).toEqual([]);
  });

  it('rechaza claves que no cumplen la política sin llamar al servidor', async () => {
    const auth = new AuthFalso();
    auth.sesionDe = 'ana@correo.ec';
    const r = await new CompletarPrimerIngreso({ auth, primerIngreso: new PrimerIngresoFalso() }).ejecutar({
      ...datos,
      clave: 'solo',
      confirmacion: 'solo',
    });
    expect(!r.ok && r.error.codigo).toBe('validacion');
    expect(auth.llamadas).toEqual([]);
  });

  it('exige sesión abierta', async () => {
    const r = await new CompletarPrimerIngreso({ auth: new AuthFalso(), primerIngreso: new PrimerIngresoFalso() }).ejecutar(datos);
    expect(!r.ok && r.error.codigo).toBe('sin_sesion');
  });
});

describe('RestablecerConCodigo (F3 autónoma)', () => {
  it('con cuenta habilitada cambia la clave con la sesión de recuperación', async () => {
    const auth = new AuthFalso();
    const primerIngreso = new PrimerIngresoFalso();
    const r = await new RestablecerConCodigo({ auth, sesion: new SesionFalsa(perfil()), primerIngreso }).ejecutar('ana@correo.ec', datos);
    expect(r.ok).toBe(true);
    expect(auth.llamadas).toEqual(['verificarRecuperacion', 'actualizarClave', 'cerrarSesion']);
    expect(primerIngreso.claves).toEqual([]);
  });

  it('con clave temporal completa el primer ingreso en el servidor', async () => {
    const auth = new AuthFalso();
    const primerIngreso = new PrimerIngresoFalso();
    const sesion = new SesionFalsa(perfil({ debeCambiarClave: true }));
    const r = await new RestablecerConCodigo({ auth, sesion, primerIngreso }).ejecutar('ana@correo.ec', datos);
    expect(r.ok).toBe(true);
    expect(primerIngreso.claves).toEqual(['nueva2027']);
    expect(auth.llamadas).not.toContain('actualizarClave');
    expect(auth.sesionDe).toBeNull();
  });

  it('no deja entrar a una cuenta desactivada', async () => {
    const auth = new AuthFalso();
    const r = await new RestablecerConCodigo({
      auth,
      sesion: new SesionFalsa(perfil({ activo: false })),
      primerIngreso: new PrimerIngresoFalso(),
    }).ejecutar('ana@correo.ec', datos);
    expect(!r.ok && r.error.codigo).toBe('cuenta_inactiva');
    expect(auth.llamadas).toContain('cerrarSesion');
  });
});

describe('Administración de cuentas (F3 asistida, F4, D-28)', () => {
  const cuentas = () => {
    const llamadas: string[] = [];
    return {
      llamadas,
      restablecerClave: async (id: string) => {
        llamadas.push(`restablecer:${id}`);
        return ok({ claveTemporal: 'abc12345de' });
      },
      desactivar: async (id: string) => {
        llamadas.push(`desactivar:${id}`);
        return ok(undefined);
      },
    };
  };
  const provincial: Perfil = perfil({ id: 'prov', rol: 'coordinador_provincial' });

  it('el provincial restablece la clave y recibe la temporal', async () => {
    const c = cuentas();
    const r = await new RestablecerClaveAsistido({ sesion: new SesionFalsa(provincial), cuentas: c }).ejecutar('v1');
    expect(r).toEqual({ ok: true, value: { claveTemporal: 'abc12345de' } });
  });

  it('nadie se administra a sí mismo', async () => {
    const c = cuentas();
    const r = await new DesactivarCuenta({ sesion: new SesionFalsa(provincial), cuentas: c }).ejecutar('prov');
    expect(!r.ok && r.error.codigo).toBe('misma_cuenta');
    expect(c.llamadas).toEqual([]);
  });

  it('un veedor no administra cuentas', async () => {
    const c = cuentas();
    const r = await new DesactivarCuenta({ sesion: new SesionFalsa(perfil({ rol: 'veedor' })), cuentas: c }).ejecutar('v2');
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
    expect(c.llamadas).toEqual([]);
  });

  it('traduce el rechazo del servidor', async () => {
    const r = await new DesactivarCuenta({
      sesion: new SesionFalsa(provincial),
      cuentas: { restablecerClave: async () => fail('sin_permiso' as const), desactivar: async () => fail('sin_permiso' as const) },
    }).ejecutar('otro');
    expect(!r.ok && r.error.codigo).toBe('sin_permiso');
  });
});
