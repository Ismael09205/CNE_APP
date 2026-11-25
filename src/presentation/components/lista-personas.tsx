// F3 asistida y F4 — Personas a cargo: nueva clave temporal o desactivar (D-28).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserX } from '@/presentation/components/iconos';
import { useState } from 'react';
import { Text, View } from 'react-native';

import type { Perfil } from '@/domain/entities/perfil';

import { MENSAJE_INESPERADO, mensajeError } from '../hooks/use-errores';
import { NOMBRE_ROL } from '../pantallas/perfil';
import { useCasosDeUso } from '../providers/contenedor';
import { useSesion } from '../providers/sesion';
import { Aviso, Avatar, Boton, Cargando, DatoSecreto, ModalConfirmacion, Parrafo, type Confirmacion } from './ui';

const estadoCuenta = (p: Perfil) =>
  !p.activo
    ? { texto: 'Desactivada', clase: 'bg-fondo-error text-error' }
    : p.debeCambiarClave
      ? { texto: 'Pendiente de primer ingreso', clase: 'bg-fondo-info text-info' }
      : { texto: 'Activa', clase: 'bg-fondo-exito text-exito' };

export function ListaPersonas() {
  const { listarPersonas, restablecerClaveAsistido, desactivarCuenta } = useCasosDeUso();
  const { perfil } = useSesion();
  const queryClient = useQueryClient();
  const personas = useQuery({ queryKey: ['personas'], queryFn: () => listarPersonas.ejecutar() });
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  // Contraseña temporal recién emitida (D-15: se muestra solo esta vez, oculta hasta tocar el ojo).
  const [nuevaClave, setNuevaClave] = useState<{ nombre: string; clave: string } | null>(null);

  async function ejecutar(id: string, accion: () => Promise<void>) {
    setOcupado(id);
    setAviso(null);
    setNuevaClave(null);
    try {
      await accion();
      await queryClient.invalidateQueries({ queryKey: ['personas'] });
    } catch {
      setAviso({ tipo: 'error', texto: MENSAJE_INESPERADO });
    } finally {
      setOcupado(null);
    }
  }

  const restablecer = (p: Perfil) =>
    setConfirmacion({
      titulo: 'Nueva clave temporal',
      mensaje: `¿Dar una clave temporal nueva a ${p.nombres} ${p.apellidos}?`,
      nota: 'La clave anterior dejará de funcionar. Al ingresar, la persona elegirá una nueva.',
      textoConfirmar: 'Dar clave',
      alConfirmar: () =>
        void ejecutar(p.id, async () => {
          const r = await restablecerClaveAsistido.ejecutar(p.id);
          if (r.ok) setNuevaClave({ nombre: `${p.nombres} ${p.apellidos}`, clave: r.value.claveTemporal });
          else setAviso({ tipo: 'error', texto: mensajeError(r.error) });
        }),
    });

  const desactivar = (p: Perfil) =>
    setConfirmacion({
      titulo: 'Desactivar cuenta',
      mensaje: `¿Seguro que desea desactivar la cuenta de ${p.nombres} ${p.apellidos}?`,
      nota: 'Desde este momento ya no podrá ingresar a la app.',
      textoConfirmar: 'Desactivar',
      peligro: true,
      alConfirmar: () =>
        void ejecutar(p.id, async () => {
          const r = await desactivarCuenta.ejecutar(p.id);
          setAviso(r.ok ? { tipo: 'exito', texto: 'Cuenta desactivada.' } : { tipo: 'error', texto: mensajeError(r.error) });
        }),
    });

  if (personas.isPending) return <Cargando texto="Cargando personas…" />;
  if (personas.isError) return <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso>;

  return (
    <>
      {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}
      {nuevaClave ? (
        <View className="my-1 gap-1 rounded-2xl bg-tarjeta px-4 py-3 shadow-tarjeta">
          <Aviso tipo="exito" titulo="Contraseña temporal lista">Es para {nuevaClave.nombre}.</Aviso>
          <DatoSecreto etiqueta="Contraseña temporal" valor={nuevaClave.clave} />
          <Parrafo suave>Solo se muestra esta vez. Entréguesela a la persona; al ingresar elegirá una nueva.</Parrafo>
          <Boton titulo="Listo, ya la entregué" variante="secundario" onPress={() => setNuevaClave(null)} />
        </View>
      ) : null}
      {personas.data.length === 0 ? (
        <Parrafo suave>
          {perfil?.rol === 'coordinador_recinto' ? 'Todavía no hay veedores en su recinto.' : 'Todavía no hay personas a su cargo.'}
        </Parrafo>
      ) : null}
      {personas.data.map((p) => {
        const estado = estadoCuenta(p);
        return (
          // Figma: tarjeta de candidato (foto a la izquierda, nombre, detalle y botones).
          <View key={p.id} className="my-1 gap-3 rounded-2xl bg-tarjeta shadow-tarjeta p-4">
            <View className="flex-row items-center gap-4">
              <Avatar nombres={p.nombres} apellidos={p.apellidos} />
              <View className="flex-1 gap-1">
                <Text className="font-seminegrita text-lg text-texto">
                  {p.apellidos} {p.nombres}
                </Text>
                <Text className="font-regular text-base text-texto-suave">
                  {NOMBRE_ROL[p.rol]} · {p.telefono}
                </Text>
                <Text className={`self-start rounded-full px-3 py-0.5 font-medio text-base ${estado.clase}`}>{estado.texto}</Text>
              </View>
            </View>
            {p.activo && p.rol !== 'coordinador_provincial' ? (
              <View className="gap-1">
                <Boton
                  titulo="Dar nueva clave temporal"
                  variante="secundario"
                  icono={KeyRound}
                  cargando={ocupado === p.id}
                  onPress={() => restablecer(p)}
                />
                <Boton titulo="Desactivar cuenta" variante="peligro" icono={UserX} deshabilitado={ocupado === p.id} onPress={() => desactivar(p)} />
              </View>
            ) : null}
          </View>
        );
      })}
      <ModalConfirmacion datos={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </>
  );
}
