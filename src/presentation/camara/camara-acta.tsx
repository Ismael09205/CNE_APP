// F9 paso 2 — Foto del acta con VisionCamera (ADR-13), sin acceso a la galería.
// F6-2: la nitidez se mide en vivo (varianza del Laplaciano en cada cuadro) y el disparador
// solo se habilita tras varios cuadros nítidos seguidos; luego el veedor revisa la foto.
import { useCallback, useRef, useState } from 'react';
import { Camera as CameraIcon } from '@/presentation/components/iconos';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView as SafeAreaViewBase } from 'react-native-safe-area-context';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';
import { withUniwind } from 'uniwind';

import { CUADROS_NITIDOS_REQUERIDOS, esNitida, UMBRAL_NITIDEZ } from '@/domain/rules/evidencia.rules';

import { Aviso, Boton, Pantalla, Parrafo } from '../components/ui';
import { varianzaLaplaciano } from './nitidez';

const SafeAreaView = withUniwind(SafeAreaViewBase);

export type FotoActa = { readonly uri: string; readonly capturadaEn: Date };

type Props = {
  /** Se llama al disparar (para leer el GPS en ese momento, RF-13). */
  readonly alDisparar: () => void;
  readonly alConfirmar: (foto: FotoActa) => void;
  readonly alCancelar: () => void;
};

const aUri = (ruta: string) => (ruta.startsWith('file://') ? ruta : `file://${ruta}`);

export function CamaraActa({ alDisparar, alConfirmar, alCancelar }: Props) {
  const permiso = useCameraPermission();
  const dispositivo = useCameraDevice('back');
  const [foto, setFoto] = useState<FotoActa | null>(null);
  const [tomando, setTomando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nitidez: el worklet reporta cada cuadro; aquí se cuentan los nítidos seguidos y se
  // actualiza la pantalla como mucho 5 veces por segundo.
  const seguidos = useRef(0);
  const ultimaActualizacion = useRef(0);
  const [lectura, setLectura] = useState<{ varianza: number; lista: boolean; medible: boolean }>({
    varianza: 0,
    lista: false,
    medible: true,
  });

  const reportar = useCallback((varianza: number) => {
    const medible = Number.isFinite(varianza);
    seguidos.current = esNitida(varianza) ? seguidos.current + 1 : 0;
    const ahora = Date.now();
    if (ahora - ultimaActualizacion.current < 200) return;
    ultimaActualizacion.current = ahora;
    setLectura({ varianza, medible, lista: seguidos.current >= CUADROS_NITIDOS_REQUERIDOS });
  }, []);

  const salidaCuadros = useFrameOutput({
    pixelFormat: 'yuv',
    // HD: suficiente para medir la nitidez con la hoja completa en el encuadre.
    targetResolution: CommonResolutions.HD_4_3,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';
      try {
        let varianza = Number.NaN;
        const planos = frame.getPlanes();
        if (planos.length > 0) {
          const y = planos[0]; // plano Y (luminancia) en YUV
          varianza = varianzaLaplaciano(new Uint8Array(y.getPixelBuffer()), y.width, y.height, y.bytesPerRow);
        }
        scheduleOnRN(reportar, varianza);
      } finally {
        frame.dispose();
      }
    },
  });

  const salidaFoto = usePhotoOutput({
    targetResolution: CommonResolutions.FHD_4_3,
    containerFormat: 'jpeg', // el bucket solo acepta JPEG
    quality: 0.85,
    qualityPrioritization: 'quality',
  });

  const disparar = async () => {
    setError(null);
    setTomando(true);
    alDisparar();
    try {
      const archivo = await salidaFoto.capturePhotoToFile({ flashMode: 'off', enableShutterSound: true }, {});
      setFoto({ uri: aUri(archivo.filePath), capturadaEn: new Date() });
    } catch {
      setError('No se pudo tomar la foto. Intente de nuevo.');
    } finally {
      setTomando(false);
    }
  };

  if (!permiso.hasPermission) {
    return (
      <Pantalla volver={alCancelar} fija>
        <View className="flex-1 justify-center gap-2">
          <Parrafo>Para fotografiar el acta, la app necesita permiso para usar la cámara.</Parrafo>
          {permiso.canRequestPermission ? (
            <Boton titulo="Permitir cámara" onPress={() => void permiso.requestPermission()} />
          ) : (
            <Boton titulo="Abrir ajustes" onPress={() => void Linking.openSettings()} />
          )}
        </View>
      </Pantalla>
    );
  }

  if (!dispositivo) {
    return (
      <Pantalla volver={alCancelar} fija>
        <Aviso tipo="error" titulo="No encontramos la cámara">Este teléfono no tiene cámara trasera disponible.</Aviso>
      </Pantalla>
    );
  }

  if (foto) {
    return (
      <SafeAreaView className="flex-1 bg-camara" edges={['bottom']}>
        <Image source={{ uri: foto.uri }} className="flex-1" resizeMode="contain" accessibilityLabel="Foto del acta tomada" />
        <View className="gap-1 rounded-t-2xl bg-fondo p-4">
          <Parrafo>Revise que se lean todos los números del acta.</Parrafo>
          <Boton titulo="Usar esta foto" onPress={() => alConfirmar(foto)} />
          <Boton titulo="Tomar otra" variante="secundario" onPress={() => setFoto(null)} />
        </View>
      </SafeAreaView>
    );
  }

  // Si el teléfono no entrega el plano de luminancia, no se puede medir: se permite disparar
  // y la revisión de la foto queda a cargo del veedor.
  const nitidezOk = lectura.lista || !lectura.medible;
  const puedeDisparar = nitidezOk && !tomando;
  const nivel = lectura.medible ? Math.min(1, lectura.varianza / (UMBRAL_NITIDEZ * 2)) : 0;

  return (
    <SafeAreaView className="flex-1 bg-camara" edges={['bottom']}>
      <View className="flex-1">
        {/* VisionCamera es un componente externo: su tamaño se fija con style. */}
        <Camera
          style={StyleSheet.absoluteFill}
          device={dispositivo}
          isActive={!foto}
          outputs={[salidaCuadros, salidaFoto]}
          enableNativeTapToFocusGesture
        />
        <GuiaEncuadre />
      </View>
      <View className="gap-1 rounded-t-2xl bg-fondo p-4">
        <View className="mb-1 h-3.5 overflow-hidden rounded-full bg-pista" accessibilityLabel={`Nitidez ${Math.round(nivel * 100)} por ciento`}>
          {/* El ancho es un dato en vivo (nivel de nitidez), por eso va en style. */}
          <View className={`h-full rounded-full ${lectura.lista ? 'bg-exito' : 'bg-error'}`} style={{ width: `${nivel * 100}%` }} />
        </View>
        <Text className="font-medio text-lg text-texto" accessibilityLiveRegion="polite">
          {!lectura.medible
            ? 'No se puede medir la nitidez en este teléfono. Revise la foto con cuidado.'
            : lectura.lista
              ? 'Imagen nítida. Puede tomar la foto.'
              : 'Imagen borrosa: acérquese, sostenga firme el teléfono o toque el acta para enfocar.'}
        </Text>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        <Boton titulo="Tomar foto" icono={CameraIcon} onPress={() => void disparar()} deshabilitado={!puedeDisparar} cargando={tomando} />
        <Boton titulo="Cancelar" variante="secundario" onPress={alCancelar} />
      </View>
    </SafeAreaView>
  );
}

/** F6-8 (D): marcas de las 4 esquinas del acta (los cuadros negros del papel) para encuadrarla completa. */
function GuiaEncuadre() {
  const esquina = 'absolute size-9 border-sobre-primario';
  return (
    <View className="absolute inset-0 mx-[8%] my-[6%]" pointerEvents="none">
      <View className={`${esquina} top-0 left-0 border-t-4 border-l-4`} />
      <View className={`${esquina} top-0 right-0 border-t-4 border-r-4`} />
      <View className={`${esquina} bottom-0 left-0 border-b-4 border-l-4`} />
      <View className={`${esquina} right-0 bottom-0 border-r-4 border-b-4`} />
      <Text className="absolute bottom-11 self-center rounded-lg bg-velo px-2 py-1 text-center font-medio text-base text-sobre-primario">
        Encuadre el acta completa: sus 4 esquinas negras dentro de las marcas
      </Text>
    </View>
  );
}
