// Inicio de cada coordinador (Figma: encabezado con avatar, tarjeta destacada y accesos) y altas de cuentas.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Building2, ClipboardList, MapPinPlus, UserPlus } from '@/presentation/components/iconos';

import { FormularioCuenta } from '../components/formulario-cuenta';
import { ListaPersonas } from '../components/lista-personas';
import { Aviso, Cargando, Destacado, Encabezado, FilaMenu, Pantalla, Parrafo, Subtitulo, Titulo } from '../components/ui';
import { MENSAJE_INESPERADO } from '../hooks/use-errores';
import { useCasosDeUso } from '../providers/contenedor';
import { useSesion } from '../providers/sesion';
import { NOMBRE_ROL } from './perfil';

function useRecintos() {
  const { listarRecintos } = useCasosDeUso();
  return useQuery({ queryKey: ['recintos'], queryFn: () => listarRecintos.ejecutar() });
}

// ---------------------------------------------------------------------------
// Coordinador provincial
// ---------------------------------------------------------------------------
export function PanelProvincial() {
  const { perfil } = useSesion();
  const recintos = useRecintos();
  return (
    <Pantalla>
      <Encabezado nombres={perfil?.nombres} apellidos={perfil?.apellidos} rol={NOMBRE_ROL.coordinador_provincial} />
      {recintos.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      <Destacado
        icono={Building2}
        titulo="Recintos en su jurisdicción"
        valor={recintos.data ? String(recintos.data.length) : '…'}
        detalle="Toque «Recintos» abajo para ver cada uno."
      />
      <Subtitulo>¿Qué desea hacer?</Subtitulo>
      <FilaMenu titulo="Nuevo recinto" icono={MapPinPlus} onPress={() => router.push('/provincial/recinto-nuevo')} />
      <FilaMenu titulo="Crear cuenta" icono={UserPlus} onPress={() => router.push('/provincial/cuentas')} />
    </Pantalla>
  );
}

export function CuentasProvincial() {
  const recintos = useRecintos();
  return (
    <Pantalla volver>
      <Titulo>Crear cuenta</Titulo>
      {recintos.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      <FormularioCuenta roles={['coordinador_recinto', 'veedor']} recintos={recintos.data ?? []} />
    </Pantalla>
  );
}

/** Pestaña «Personas» (provincial) y «Veedores» (coordinador de recinto). */
export function PersonasACargo() {
  const { perfil } = useSesion();
  return (
    <Pantalla>
      <Titulo>{perfil?.rol === 'coordinador_recinto' ? 'Veedores de mi recinto' : 'Personas a mi cargo'}</Titulo>
      <ListaPersonas />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Coordinador de recinto
// ---------------------------------------------------------------------------
export function PanelRecinto() {
  const { perfil } = useSesion();
  const { listarMesasDeRecinto } = useCasosDeUso();
  const recintos = useRecintos();
  const recinto = recintos.data?.[0];
  const mesas = useQuery({
    queryKey: ['mesas', recinto?.id],
    queryFn: () => listarMesasDeRecinto.ejecutar(recinto!.id),
    enabled: !!recinto,
  });
  const total = mesas.data?.length ?? 0;
  const conVeedor = mesas.data?.filter((m) => m.veedor).length ?? 0;

  return (
    <Pantalla>
      <Encabezado nombres={perfil?.nombres} apellidos={perfil?.apellidos} rol={NOMBRE_ROL.coordinador_recinto} />
      {recintos.isPending ? (
        <Cargando texto="Cargando su recinto…" />
      ) : recinto ? (
        <>
          <Destacado
            icono={Building2}
            titulo={recinto.nombre}
            valor={mesas.data ? `${conVeedor} de ${total}` : '…'}
            detalle="mesas con veedor asignado"
            progreso={total ? conVeedor / total : undefined}
          />
          <Subtitulo>¿Qué desea hacer?</Subtitulo>
          <FilaMenu titulo="Crear veedor" icono={UserPlus} onPress={() => router.push('/recinto/veedores')} />
          <FilaMenu titulo="Asignar veedores a las mesas" icono={ClipboardList} onPress={() => router.push('/recinto/mesas')} />
        </>
      ) : (
        <Aviso tipo="info">Todavía no tiene un recinto asignado. Comuníquese con el coordinador provincial.</Aviso>
      )}
    </Pantalla>
  );
}

export function VeedoresRecinto() {
  const recintos = useRecintos();
  const recinto = recintos.data?.[0];
  return (
    <Pantalla volver>
      <Titulo>Crear veedor</Titulo>
      {recinto ? (
        <>
          <Parrafo suave>Recinto: {recinto.nombre}</Parrafo>
          <FormularioCuenta roles={['veedor']} recintos={[recinto]} recintoFijo={recinto.id} />
        </>
      ) : (
        <Cargando texto="Cargando su recinto…" />
      )}
    </Pantalla>
  );
}
