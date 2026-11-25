// Edge Functions de gestión de cuentas (F1, F2, F3 asistida, F4) detrás de los puertos.
import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import type { PrimerIngresoGateway, RechazoPrimerIngreso } from '@/application/ports/autenticacion.port';
import type {
  AdministracionCuentaRepository,
  RechazoAdministracion,
} from '@/domain/repositories/administracion-cuenta.repository';
import type { CuentaCreada, CuentaRepository, RechazoCrearCuenta } from '@/domain/repositories/cuenta.repository';
import type { NuevaCuenta } from '@/domain/schemas/perfil.schema';
import { fail, ok, type Result } from '@/domain/shared/result';

type Respuesta = { ok: boolean; codigo?: string; [k: string]: unknown };

/** Invoca la función y devuelve su cuerpo; para respuestas 4xx devuelve el código de rechazo. */
async function invocar(supabase: SupabaseClient, nombre: string, cuerpo: object): Promise<Respuesta> {
  const { data, error } = await supabase.functions.invoke<Respuesta>(nombre, { body: cuerpo });
  if (!error && data) return data;
  if (error instanceof FunctionsHttpError) {
    const respuesta = error.context as Response;
    const json = (await respuesta.json().catch(() => null)) as Respuesta | null;
    if (json?.codigo && respuesta.status < 500) return json;
  }
  throw new Error(`Falló ${nombre}: ${error?.message ?? 'respuesta vacía'}`);
}

function rechazo<C extends string>(r: Respuesta, validos: readonly C[]): C {
  if (validos.includes(r.codigo as C)) return r.codigo as C;
  throw new Error(`Rechazo inesperado del servidor: ${r.codigo}`);
}

export class CuentasSupabase implements CuentaRepository, AdministracionCuentaRepository, PrimerIngresoGateway {
  constructor(private readonly supabase: SupabaseClient) {}

  async crear(cuenta: NuevaCuenta): Promise<Result<CuentaCreada, RechazoCrearCuenta>> {
    const r = await invocar(this.supabase, 'crear-cuenta', {
      ...cuenta,
      recintoId: cuenta.rol === 'veedor' ? cuenta.recintoId : null,
    });
    if (r.ok) return ok({ perfilId: String(r.perfilId), claveTemporal: String(r.claveTemporal) });
    return fail(rechazo(r, ['sin_permiso', 'cedula_duplicada', 'correo_duplicado', 'recinto_no_valido'] as const));
  }

  async restablecerClave(perfilId: string): Promise<Result<{ claveTemporal: string }, RechazoAdministracion>> {
    const r = await invocar(this.supabase, 'restablecer-clave', { perfilId });
    return r.ok ? ok({ claveTemporal: String(r.claveTemporal) }) : fail(rechazo(r, ['sin_permiso'] as const));
  }

  async desactivar(perfilId: string): Promise<Result<void, RechazoAdministracion>> {
    const r = await invocar(this.supabase, 'desactivar-cuenta', { perfilId });
    return r.ok ? ok(undefined) : fail(rechazo(r, ['sin_permiso'] as const));
  }

  async completar(clave: string): Promise<Result<void, RechazoPrimerIngreso>> {
    const r = await invocar(this.supabase, 'completar-primer-ingreso', { clave });
    return r.ok
      ? ok(undefined)
      : fail(rechazo(r, ['codigo_requerido', 'clave_debil', 'cuenta_inactiva', 'no_requerido'] as const));
  }
}
