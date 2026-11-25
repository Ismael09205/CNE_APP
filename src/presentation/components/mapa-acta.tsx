// Mapa del detalle del acta (ADR-13, RF-17): punto donde se registró y el recinto.
// Teselas de OpenFreeMap (decisión Fase 7): sin API key ni cuenta. Sin conexión (o si el
// mapa no carga) se muestran las coordenadas en texto.
import { Camera, Map, Marker, NetworkManager } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { distanciaMetros, type Coordenadas } from '@/domain/entities/resultados';

import { Parrafo } from './ui';

const ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/liberty';
/** Más cerca que esto, los dos puntos se ven como uno: se centra en el acta. */
const MISMO_LUGAR_M = 30;

const texto = (c: Coordenadas) => `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;

function Punto({ claseColor, etiqueta }: { claseColor: string; etiqueta: string }) {
  return (
    <View className="items-center">
      <View className="rounded-md bg-tarjeta px-2 py-0.5 shadow-tarjeta">
        <Text className="font-seminegrita text-base text-texto">{etiqueta}</Text>
      </View>
      <View className={`mt-1 size-5 rounded-full border-4 border-tarjeta ${claseColor}`} />
    </View>
  );
}

function CoordenadasEnTexto({ mensaje, acta, recinto }: { mensaje: string; acta: Coordenadas; recinto: Coordenadas | null }) {
  return (
    <View className="my-2 gap-1 rounded-2xl bg-tarjeta p-4 shadow-tarjeta">
      <Parrafo suave>{mensaje}</Parrafo>
      <Text className="font-medio text-base text-texto">Acta: {texto(acta)}</Text>
      {recinto ? <Text className="font-medio text-base text-texto">Recinto: {texto(recinto)}</Text> : null}
    </View>
  );
}

export function MapaActa({ acta, recinto, conectado }: { acta: Coordenadas; recinto: Coordenadas | null; conectado: boolean }) {
  const [fallo, setFallo] = useState(false);

  // En Android MapLibre lleva su propio estado de red; se le avisa que hay conexión.
  useEffect(() => {
    if (Platform.OS === 'android' && conectado) NetworkManager.setConnected(true);
  }, [conectado]);

  if (!conectado) {
    return <CoordenadasEnTexto mensaje="Sin conexión no podemos mostrar el mapa. Estas son las coordenadas:" acta={acta} recinto={recinto} />;
  }
  if (fallo) {
    return <CoordenadasEnTexto mensaje="El mapa no cargó esta vez. Estas son las coordenadas:" acta={acta} recinto={recinto} />;
  }

  const juntos = !recinto || distanciaMetros(acta, recinto) < MISMO_LUGAR_M;
  const vista = juntos
    ? { center: [acta.lng, acta.lat] as [number, number], zoom: 16 }
    : {
        bounds: [
          Math.min(acta.lng, recinto.lng),
          Math.min(acta.lat, recinto.lat),
          Math.max(acta.lng, recinto.lng),
          Math.max(acta.lat, recinto.lat),
        ] as [number, number, number, number],
        padding: { top: 70, bottom: 40, left: 60, right: 60 },
      };

  return (
    <View>
      <View
        className="my-2 h-72 overflow-hidden rounded-2xl bg-pista"
        accessible
        accessibilityLabel={`Mapa. Acta registrada en ${texto(acta)}${recinto ? `; recinto en ${texto(recinto)}` : ''}`}>
        {/* MapLibre es un componente nativo externo: su tamaño se fija con style. */}
        <Map style={{ flex: 1 }} mapStyle={ESTILO_MAPA} logo={false} attribution onDidFailLoadingMap={() => setFallo(true)}>
          <Camera initialViewState={vista} maxZoom={18} />
          {recinto && !juntos ? (
            <Marker id="recinto" lngLat={[recinto.lng, recinto.lat]} anchor="bottom">
              <Punto claseColor="bg-acento" etiqueta="Recinto" />
            </Marker>
          ) : null}
          <Marker id="acta" lngLat={[acta.lng, acta.lat]} anchor="bottom">
            <Punto claseColor="bg-primario" etiqueta={recinto && juntos ? 'Acta y recinto' : 'Acta'} />
          </Marker>
        </Map>
      </View>
    </View>
  );
}
