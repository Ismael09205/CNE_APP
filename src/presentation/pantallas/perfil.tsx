// Perfil (Figma: avatar, nombre, rol y filas de menú) y la pestaña de resultados (Fase 7).
import { ChartColumn, LogOut } from '@/presentation/components/iconos';
import { useState } from 'react';
import { View } from 'react-native';

import type { Rol } from '@/domain/value-objects/rol';

import { Icono } from '../components/icono';
import { Avatar, Dato, FilaMenu, ModalConfirmacion, Pantalla, Parrafo, Titulo, type Confirmacion } from '../components/ui';
import { useCasosDeUso } from '../providers/contenedor';
import { useSesion } from '../providers/sesion';

export const NOMBRE_ROL: Record<Rol, string> = {
  coordinador_provincial: 'Coordinador provincial',
  coordinador_recinto: 'Coordinador de recinto',
  veedor: 'Veedor',
};

export function PantallaPerfil({ avisoSalida }: { avisoSalida?: string } = {}) {
  const { perfil } = useSesion();
  const { cerrarSesion } = useCasosDeUso();
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  const salir = () =>
    setConfirmacion({
      titulo: 'Cerrar sesión',
      mensaje: avisoSalida ?? '¿Desea cerrar sesión?',
      nota: 'Para volver a entrar necesitará su correo y su clave.',
      textoConfirmar: 'Cerrar sesión',
      peligro: !!avisoSalida,
      alConfirmar: () => void cerrarSesion.ejecutar(),
    });

  return (
    <Pantalla>
      <View className="mb-4 flex-row items-center gap-4">
        <Avatar nombres={perfil?.nombres} apellidos={perfil?.apellidos} grande />
        <View className="flex-1">
          <Titulo>
            {perfil?.nombres} {perfil?.apellidos}
          </Titulo>
          <Parrafo suave>{perfil ? NOMBRE_ROL[perfil.rol] : ''}</Parrafo>
        </View>
      </View>
      {perfil ? (
        <View className="mb-4 rounded-2xl bg-tarjeta shadow-tarjeta px-4 py-2">
          <Dato etiqueta="Cédula" valor={perfil.cedula} />
          <Dato etiqueta="Correo electrónico" valor={perfil.correo} />
          <Dato etiqueta="Celular" valor={perfil.telefono} />
        </View>
      ) : null}
      <FilaMenu titulo="Cerrar sesión" icono={LogOut} onPress={salir} peligro />
      <ModalConfirmacion datos={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </Pantalla>
  );
}

/** Pestaña reservada: el tablero en tiempo real se construye en la Fase 7. */
export function PantallaResultados() {
  return (
    <Pantalla fija>
      <Titulo>Resultados</Titulo>
      <View className="flex-1 items-center justify-center gap-4">
        <View className="size-24 items-center justify-center rounded-full bg-acento-suave">
          <Icono icono={ChartColumn} tono="primario" tamano={44} />
        </View>
        <Parrafo centrado>Aquí verá el avance del conteo y los votos por candidatura.</Parrafo>
        <Parrafo suave centrado>
          Disponible próximamente.
        </Parrafo>
      </View>
    </Pantalla>
  );
}
