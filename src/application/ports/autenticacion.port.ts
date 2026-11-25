import type { Result } from '@/domain/shared/result';

export type FalloAutenticacion = 'credenciales' | 'cuenta_bloqueada' | 'codigo_invalido' | 'sin_conexion' | 'demasiados_intentos';

// Supabase Auth en infrastructure. Ningún caso de uso conoce Supabase.
export interface AutenticacionGateway {
  iniciarSesion(correo: string, clave: string): Promise<Result<void, FalloAutenticacion>>;
  cerrarSesion(): Promise<void>;
  /** Correo de la sesión abierta, o null. */
  correoSesion(): Promise<string | null>;
  /** Código de 6 dígitos al correo de una cuenta existente (no crea cuentas). */
  enviarCodigoAcceso(correo: string): Promise<Result<void, FalloAutenticacion>>;
  verificarCodigoAcceso(correo: string, codigo: string): Promise<Result<void, FalloAutenticacion>>;
  enviarCodigoRecuperacion(correo: string): Promise<Result<void, FalloAutenticacion>>;
  verificarCodigoRecuperacion(correo: string, codigo: string): Promise<Result<void, FalloAutenticacion>>;
  /** Cambia la clave de la sesión actual (cuenta ya habilitada). */
  actualizarClave(clave: string): Promise<Result<void, FalloAutenticacion>>;
}

export type RechazoPrimerIngreso = 'codigo_requerido' | 'clave_debil' | 'cuenta_inactiva' | 'no_requerido';

// Edge Function `completar-primer-ingreso` (D-25).
export interface PrimerIngresoGateway {
  completar(clave: string): Promise<Result<void, RechazoPrimerIngreso>>;
}
