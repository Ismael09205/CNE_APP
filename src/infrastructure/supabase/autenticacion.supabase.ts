// Adaptador de Supabase Auth para AutenticacionGateway (F2, F3).
import type { AuthError, SupabaseClient } from '@supabase/supabase-js';

import type { AutenticacionGateway, FalloAutenticacion } from '@/application/ports/autenticacion.port';
import { fail, ok, type Result } from '@/domain/shared/result';

function traducir(e: AuthError): FalloAutenticacion {
  if (e.status === 0 || e.name === 'AuthRetryableFetchError') return 'sin_conexion';
  switch (e.code) {
    case 'user_banned':
      return 'cuenta_bloqueada';
    case 'otp_expired':
    case 'otp_disabled':
      return 'codigo_invalido';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'demasiados_intentos';
    default:
      return e.status === 429 ? 'demasiados_intentos' : 'credenciales';
  }
}

const resultado = (error: AuthError | null, siFalla: FalloAutenticacion | null = null): Result<void, FalloAutenticacion> =>
  error ? fail(siFalla ?? traducir(error)) : ok(undefined);

export class AutenticacionSupabase implements AutenticacionGateway {
  constructor(private readonly supabase: SupabaseClient) {}

  async iniciarSesion(correo: string, clave: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email: correo, password: clave });
    return resultado(error);
  }

  async cerrarSesion() {
    await this.supabase.auth.signOut();
  }

  async correoSesion() {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user.email ?? null;
  }

  async enviarCodigoAcceso(correo: string) {
    const { error } = await this.supabase.auth.signInWithOtp({ email: correo, options: { shouldCreateUser: false } });
    return resultado(error);
  }

  async verificarCodigoAcceso(correo: string, codigo: string) {
    const { error } = await this.supabase.auth.verifyOtp({ email: correo, token: codigo, type: 'email' });
    return error && error.status !== 0 && error.status !== 429 ? fail<FalloAutenticacion>('codigo_invalido') : resultado(error);
  }

  async enviarCodigoRecuperacion(correo: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(correo);
    return resultado(error);
  }

  async verificarCodigoRecuperacion(correo: string, codigo: string) {
    const { error } = await this.supabase.auth.verifyOtp({ email: correo, token: codigo, type: 'recovery' });
    return error && error.status !== 0 && error.status !== 429 ? fail<FalloAutenticacion>('codigo_invalido') : resultado(error);
  }

  async actualizarClave(clave: string) {
    const { error } = await this.supabase.auth.updateUser({ password: clave });
    return resultado(error);
  }
}
