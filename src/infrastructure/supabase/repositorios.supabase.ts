// Repositorio de perfiles sobre PostgREST. RLS decide qué filas ve cada rol (D-22, D-23).
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PerfilRepository } from '@/domain/repositories/perfil.repository';

import { aPerfil, COLUMNAS_PERFIL, type FilaPerfil } from './mapeos';

export class PerfilesSupabase implements PerfilRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async obtenerPorId(id: string) {
    const { data, error } = await this.supabase.from('perfiles').select(COLUMNAS_PERFIL).eq('id', id).maybeSingle<FilaPerfil>();
    if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
    return data ? aPerfil(data) : null;
  }

  async listarVisibles() {
    const { data: sesion } = await this.supabase.auth.getSession();
    const propio = sesion.session?.user.id ?? '';
    const { data, error } = await this.supabase.from('perfiles').select(COLUMNAS_PERFIL).neq('id', propio).returns<FilaPerfil[]>();
    if (error) throw new Error(`No se pudo leer las personas: ${error.message}`);
    return (data ?? []).map(aPerfil);
  }
}
