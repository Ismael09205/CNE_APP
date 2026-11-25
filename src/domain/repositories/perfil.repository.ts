import type { Perfil } from '../entities/perfil';

export interface PerfilRepository {
  obtenerPorId(id: string): Promise<Perfil | null>;
  /** Personas que quien llama puede ver (RLS, D-22 y D-23), sin incluirse. */
  listarVisibles(): Promise<Perfil[]>;
}
