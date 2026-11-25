// Traducción filas de PostgreSQL (snake_case) ⇄ entidades del dominio.
import type { CoordinacionRecinto } from '@/domain/entities/coordinacion-recinto';
import type { Perfil } from '@/domain/entities/perfil';
import type { Recinto } from '@/domain/entities/recinto';
import type { Rol } from '@/domain/value-objects/rol';

export const COLUMNAS_PERFIL =
  'id, cedula, nombres, apellidos, telefono, correo, rol, activo, debe_cambiar_clave, correo_verificado';

export type FilaPerfil = {
  id: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  debe_cambiar_clave: boolean;
  correo_verificado: boolean;
};

export const aPerfil = (f: FilaPerfil): Perfil => ({
  id: f.id,
  cedula: f.cedula,
  nombres: f.nombres,
  apellidos: f.apellidos,
  telefono: f.telefono,
  correo: f.correo,
  rol: f.rol,
  activo: f.activo,
  debeCambiarClave: f.debe_cambiar_clave,
  correoVerificado: f.correo_verificado,
});

export const COLUMNAS_RECINTO =
  'id, parroquia_id, codigo, nombre, codigo_zona, nombre_zona, direccion, lat, lng, dificil_acceso, sin_conectividad';

export type FilaRecinto = {
  id: string;
  parroquia_id: number;
  codigo: string;
  nombre: string;
  codigo_zona: number;
  nombre_zona: string | null;
  direccion: string | null;
  lat: number;
  lng: number;
  dificil_acceso: boolean;
  sin_conectividad: boolean;
};

export const aRecinto = (f: FilaRecinto): Recinto => ({
  id: f.id,
  parroquiaId: String(f.parroquia_id),
  codigo: f.codigo,
  nombre: f.nombre,
  codigoZona: f.codigo_zona,
  nombreZona: f.nombre_zona,
  direccion: f.direccion,
  ubicacion: { lat: f.lat, lng: f.lng },
  dificilAcceso: f.dificil_acceso,
  sinConectividad: f.sin_conectividad,
});

export type FilaCoordinacionRecinto = {
  id: string;
  recinto_id: string;
  coordinador_id: string;
  desde: string;
  hasta: string | null;
};

export const aCoordinacionRecinto = (f: FilaCoordinacionRecinto): CoordinacionRecinto => ({
  id: f.id,
  recintoId: f.recinto_id,
  coordinadorId: f.coordinador_id,
  desde: new Date(f.desde),
  hasta: f.hasta ? new Date(f.hasta) : null,
});
