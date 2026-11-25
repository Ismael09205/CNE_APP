// Consultas de lectura para las pantallas de gestión (RLS decide el alcance).
import type { Perfil } from '@/domain/entities/perfil';
import type { Recinto } from '@/domain/entities/recinto';
import type { PerfilRepository } from '@/domain/repositories/perfil.repository';
import type { RecintoRepository } from '@/domain/repositories/recinto.repository';

export class ListarRecintos {
  constructor(private readonly deps: { recintos: RecintoRepository }) {}

  async ejecutar(): Promise<Recinto[]> {
    const recintos = await this.deps.recintos.listarVisibles();
    return [...recintos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
}

export class ListarPersonas {
  constructor(private readonly deps: { perfiles: PerfilRepository }) {}

  async ejecutar(): Promise<Perfil[]> {
    const personas = await this.deps.perfiles.listarVisibles();
    return [...personas].sort((a, b) =>
      `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`, 'es'),
    );
  }
}
