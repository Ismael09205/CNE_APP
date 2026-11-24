import type { Perfil } from '../entities/perfil';

export interface PerfilRepository {
  obtenerPorId(id: string): Promise<Perfil | null>;
}
