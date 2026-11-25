// SesionActual + ObservadorSesion sobre Supabase Auth.
// El perfil propio siempre es legible por RLS (D-22), incluso con clave temporal.
// Sin conexión la envuelve SesionConCache (infrastructure/local/cache.sqlite.ts).
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ObservadorSesion, SesionActual } from '@/application/ports/sesion.port';
import type { Perfil } from '@/domain/entities/perfil';

import { aPerfil, COLUMNAS_PERFIL, type FilaPerfil } from './mapeos';

export class SesionSupabase implements SesionActual, ObservadorSesion {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Usuario de la sesión guardada en el teléfono (no consulta la base). */
  async usuarioActualId(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user.id ?? null;
  }

  async perfilActual(): Promise<Perfil | null> {
    const usuarioId = await this.usuarioActualId();
    if (!usuarioId) return null;

    const { data, error } = await this.supabase
      .from('perfiles')
      .select(COLUMNAS_PERFIL)
      .eq('id', usuarioId)
      .maybeSingle<FilaPerfil>();
    if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
    return data ? aPerfil(data) : null;
  }

  suscribir(alCambiar: (usuarioId: string | null) => void): () => void {
    const { data } = this.supabase.auth.onAuthStateChange((_evento, sesion) => {
      alCambiar(sesion?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }
}
