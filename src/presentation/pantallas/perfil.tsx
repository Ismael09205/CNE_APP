// Perfil (Figma: avatar, nombre, rol y filas de menú).
import { Bug, LogOut, Zap } from '@/presentation/components/iconos';
import { useState } from 'react';
import { View } from 'react-native';

import type { Rol } from '@/domain/value-objects/rol';

import { Avatar, Aviso, Dato, FilaMenu, ModalConfirmacion, Pantalla, Parrafo, Titulo, type Confirmacion } from '../components/ui';
import { reportarInesperado } from '../hooks/use-errores';
import { useCasosDeUso } from '../providers/contenedor';
import { useSesion } from '../providers/sesion';

export const NOMBRE_ROL: Record<Rol, string> = {
  coordinador_provincial: 'Coordinador provincial',
  coordinador_recinto: 'Coordinador de recinto',
  veedor: 'Veedor',
};

export function PantallaPerfil({ avisoSalida }: { avisoSalida?: string } = {}) {
  const { perfil } = useSesion();
  const { cerrarSesion, reporteErrores, consultarResultadosRecinto, verDetalleActa } = useCasosDeUso();
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [pruebaEnviada, setPruebaEnviada] = useState(false);

  // Demostración del monitoreo (ADR-18, RF-18): solo el coordinador provincial (y en desarrollo).
  // Provoca fallas REALES en el servidor (consultas con un identificador inválido), así Sentry
  // muestra el código donde de verdad falla (repositorio de Supabase → caso de uso), no el botón:
  // 1) una falla controlada (se atrapa y se reporta, como en el resto de la app);
  // 2) una no controlada (promesa sin atrapar): Sentry la captura sin cerrar la app.
  const puedeProbarMonitoreo = __DEV__ || perfil?.rol === 'coordinador_provincial';
  const ID_INVALIDO = 'demo-id-invalido';
  const probarMonitoreo = () =>
    setConfirmacion({
      titulo: 'Probar el monitoreo',
      mensaje: '¿Provocar dos fallas de prueba y enviarlas a Sentry?',
      nota: 'Se piden al servidor un recinto y un acta que no existen. La app no se cerrará.',
      textoConfirmar: 'Enviar prueba',
      alConfirmar: () => {
        consultarResultadosRecinto
          .ejecutar(ID_INVALIDO, 'alcaldia')
          .catch((e: unknown) => reportarInesperado(e, 'prueba_monitoreo_consulta_recinto'));
        void verDetalleActa.ejecutar(ID_INVALIDO);
        setPruebaEnviada(true);
      },
    });

  // ADR-18 «cierres nativos»: la app se cierra de verdad; Sentry envía el reporte al reabrirla.
  const probarCierre = () =>
    setConfirmacion({
      titulo: 'Probar un cierre de la app',
      mensaje: 'La app se cerrará de golpe. ¿Continuar?',
      nota: 'Vuelva a abrirla: el reporte del cierre llegará a Sentry en ese momento.',
      textoConfirmar: 'Cerrar la app',
      peligro: true,
      alConfirmar: () => reporteErrores.probarCierreNativo(),
    });

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
      {puedeProbarMonitoreo ? (
        <>
          <FilaMenu titulo="Probar el monitoreo de errores" icono={Bug} onPress={probarMonitoreo} />
          <FilaMenu titulo="Probar un cierre de la app" icono={Zap} onPress={probarCierre} />
          {pruebaEnviada ? (
            <Aviso tipo="info" titulo="Errores de prueba enviados">
              En sentry.io › Issues verá dos errores «No se pudo leer…» con el código donde fallaron.
            </Aviso>
          ) : null}
        </>
      ) : null}
      <FilaMenu titulo="Cerrar sesión" icono={LogOut} onPress={salir} peligro />
      <ModalConfirmacion datos={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </Pantalla>
  );
}
