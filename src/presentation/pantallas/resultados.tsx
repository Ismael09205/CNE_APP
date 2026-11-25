// Fase 7 — Seguimiento y revisión (RF-17, ADR-17, ADR-13).
// - TableroProvincial: pestaña «Votos» del provincial (avance por recinto y votos por candidato).
// - ResultadosRecinto: votos de un recinto y el estado de las actas de cada mesa.
// - ActasMiRecinto: pestaña «Actas» del coordinador de recinto (solo el estado y el detalle).
// - DetalleActaPantalla: votos, foto (URL firmada) y mapa del lugar de registro.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import type { ResultadosRecinto as DatosRecinto } from '@/application/use-cases/resultados';
import { etiquetaMesa } from '@/domain/entities/mesa';
import {
  actasRecibidas,
  coincideBusqueda,
  cumpleFiltro,
  detalleRequiereRevision,
  distanciaMetros,
  FILTROS_AVANCE,
  porcentajeTexto,
  proporcion,
  type AvanceRecinto,
  type FiltroAvance,
  type ResumenVotos,
} from '@/domain/entities/resultados';
import { numeroEnLetras } from '@/domain/rules/numero-letras';
import { DIGNIDADES, type Dignidad } from '@/domain/value-objects/dignidad';

import { GraficoVotos } from '../components/grafico-votos';
import { Building2, FileText, Search } from '@/presentation/components/iconos';
import { MapaActa } from '../components/mapa-acta';
import { Aviso, Campo, Cargando, Destacado, Pantalla, Parrafo, Subtitulo, Tarjeta, Titulo } from '../components/ui';
import { useActasEnVivo } from '../hooks/use-actas-en-vivo';
import { MENSAJE_INESPERADO } from '../hooks/use-errores';
import { useCasosDeUso } from '../providers/contenedor';
import { NOMBRE_DIGNIDAD } from './veedor';

const hora = (d: Date) => d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
const fechaHora = (d: Date) =>
  d.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Botones segmentados (p. ej. Alcaldía / Prefectura, o Votos / Recintos). */
function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: readonly { valor: T; texto: string }[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <View className="my-2 flex-row gap-1 rounded-2xl bg-pista p-1" accessibilityRole="tablist">
      {opciones.map((o) => {
        const elegida = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => onCambio(o.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: elegida }}
            className={`min-h-12 flex-1 items-center justify-center rounded-xl px-2 ${elegida ? 'bg-tarjeta shadow-tarjeta' : 'active:bg-primario-suave'}`}>
            <Text className={`text-center text-lg ${elegida ? 'font-negrita text-primario' : 'font-medio text-texto-suave'}`}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Alcaldía / Prefectura (cada mesa tiene un acta por dignidad, ADR-11). */
const SelectorDignidad = ({ valor, onCambio }: { valor: Dignidad; onCambio: (d: Dignidad) => void }) => (
  <Segmentado opciones={DIGNIDADES.map((d) => ({ valor: d, texto: NOMBRE_DIGNIDAD[d] }))} valor={valor} onCambio={onCambio} />
);

function AvisoSinConexion({ conectado }: { conectado: boolean }) {
  if (conectado) return null;
  return (
    <Aviso tipo="info" titulo="Sin conexión">
      Le mostramos los últimos datos que se cargaron.
    </Aviso>
  );
}

/** Sufragantes, blancos y nulos de las actas contadas. */
function Resumen({ resumen }: { resumen: ResumenVotos }) {
  const celdas = [
    { etiqueta: 'Actas contadas', valor: resumen.actas },
    { etiqueta: 'Sufragantes', valor: resumen.sufragantes },
    { etiqueta: 'En blanco', valor: resumen.blancos },
    { etiqueta: 'Nulos', valor: resumen.nulos },
  ];
  return (
    <View className="my-1 flex-row flex-wrap gap-2">
      {celdas.map((c) => (
        <View key={c.etiqueta} className="min-w-[47%] flex-1 rounded-2xl bg-tarjeta p-3 shadow-tarjeta" accessible accessibilityLabel={`${c.etiqueta}: ${c.valor}`}>
          <Text className="font-regular text-base text-texto-suave">{c.etiqueta}</Text>
          <Text className="font-negrita text-2xl text-texto">{c.valor.toLocaleString('es-EC')}</Text>
        </View>
      ))}
    </View>
  );
}

function Pastilla({ texto, tono }: { texto: string; tono: 'exito' | 'info' | 'error' | 'neutro' }) {
  const clase = {
    exito: 'bg-fondo-exito text-exito',
    info: 'bg-fondo-info text-info',
    error: 'bg-fondo-error text-error',
    neutro: 'bg-pista text-texto',
  }[tono];
  return <Text className={`self-start rounded-full px-3 py-1 font-seminegrita text-base ${clase}`}>{texto}</Text>;
}

function TarjetaAvance({ r, alTocar }: { r: AvanceRecinto; alTocar: () => void }) {
  const recibidas = actasRecibidas(r);
  const completo = r.actasEsperadas > 0 && recibidas >= r.actasEsperadas;
  return (
    <Tarjeta onPress={alTocar} etiqueta={`${r.nombre}: ${recibidas} de ${r.actasEsperadas} actas`}>
      <Text className="font-seminegrita text-lg text-texto">{r.nombre}</Text>
      <Text className="font-regular text-base text-texto-suave">
        {r.parroquia} · {r.mesas} mesas
      </Text>
      <View className="mt-1 h-2.5 overflow-hidden rounded-full bg-pista">
        {/* El ancho es un dato (avance del recinto), por eso va en style. */}
        <View
          className={`h-full rounded-full ${completo ? 'bg-exito' : 'bg-acento'}`}
          style={{ width: `${proporcion(recibidas, r.actasEsperadas) * 100}%` }}
        />
      </View>
      <View className="mt-1 flex-row flex-wrap gap-2">
        <Pastilla texto={`${recibidas} de ${r.actasEsperadas} actas`} tono={completo ? 'exito' : 'neutro'} />
        {r.actasEnRevision > 0 ? <Pastilla texto={`${r.actasEnRevision} por revisar`} tono="error" /> : null}
        {r.sinConectividad && !completo ? <Pastilla texto="Sin señal en la zona" tono="info" /> : null}
      </View>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Tablero del coordinador provincial (RF-17)
// ---------------------------------------------------------------------------
const TEXTO_FILTRO: Record<FiltroAvance, string> = {
  faltan: 'Les faltan actas',
  conActas: 'Con al menos un acta',
  revisar: 'Por revisar',
  completos: 'Completos',
  todos: 'Todos',
};

/** Filtros en fichas con su cantidad (se puede deslizar a los lados). */
function FiltrosAvance({ recintos, valor, onCambio }: { recintos: readonly AvanceRecinto[]; valor: FiltroAvance; onCambio: (f: FiltroAvance) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 py-1" accessibilityRole="tablist">
      {FILTROS_AVANCE.map((f) => {
        const elegido = f === valor;
        const cantidad = recintos.filter((r) => cumpleFiltro(r, f)).length;
        return (
          <Pressable
            key={f}
            onPress={() => onCambio(f)}
            accessibilityRole="tab"
            accessibilityState={{ selected: elegido }}
            accessibilityLabel={`${TEXTO_FILTRO[f]}: ${cantidad}`}
            className={`min-h-12 flex-row items-center gap-2 rounded-full border-2 px-4 ${
              elegido ? 'border-primario bg-primario' : 'border-borde bg-tarjeta active:bg-primario-suave'
            }`}>
            <Text className={`font-seminegrita text-base ${elegido ? 'text-sobre-primario' : 'text-texto'}`}>{TEXTO_FILTRO[f]}</Text>
            <Text className={`font-negrita text-base ${elegido ? 'text-sobre-primario' : 'text-primario'}`}>{cantidad}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type VistaTablero = 'votos' | 'recintos';

export function TableroProvincial() {
  const { consultarTablero } = useCasosDeUso();
  const { conectado } = useActasEnVivo();
  const [dignidad, setDignidad] = useState<Dignidad>('alcaldia');
  const [vista, setVista] = useState<VistaTablero>('votos');
  const [filtro, setFiltro] = useState<FiltroAvance>('faltan');
  const [busqueda, setBusqueda] = useState('');
  const tablero = useQuery({
    queryKey: ['resultados', 'tablero', dignidad],
    queryFn: () => consultarTablero.ejecutar(dignidad),
  });
  const datos = tablero.data?.ok ? tablero.data.value : null;
  const visibles = datos?.recintos.filter((r) => cumpleFiltro(r, filtro) && coincideBusqueda(r, busqueda)) ?? [];

  return (
    <Pantalla>
      <Titulo>Resultados en vivo</Titulo>
      <Parrafo suave>
        Se actualiza solo cada vez que llega un acta.
        {tablero.dataUpdatedAt ? ` Última actualización: ${hora(new Date(tablero.dataUpdatedAt))}.` : ''}
      </Parrafo>
      <AvisoSinConexion conectado={conectado} />

      {tablero.isPending ? <Cargando texto="Cargando resultados…" /> : null}
      {tablero.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      {tablero.data && !tablero.data.ok ? <Aviso tipo="error">{tablero.data.error.mensaje}</Aviso> : null}

      {datos ? (
        <>
          <Destacado
            icono={FileText}
            titulo="Actas recibidas (alcaldía y prefectura)"
            valor={`${datos.general.actasRecibidas} de ${datos.general.actasEsperadas}`}
            progreso={proporcion(datos.general.actasRecibidas, datos.general.actasEsperadas)}
            detalle={`${porcentajeTexto(datos.general.actasRecibidas, datos.general.actasEsperadas)} · ${datos.general.recintosCompletos} de ${datos.general.recintos} recintos completos${
              datos.general.actasEnRevision > 0 ? ` · ${datos.general.actasEnRevision} por revisar` : ''
            }`}
          />
          <Segmentado
            opciones={[
              { valor: 'votos', texto: 'Votos' },
              { valor: 'recintos', texto: 'Recintos' },
            ]}
            valor={vista}
            onCambio={setVista}
          />

          {vista === 'votos' ? (
            <>
              <SelectorDignidad valor={dignidad} onCambio={setDignidad} />
              {datos.resumen.actas === 0 ? (
                <Aviso tipo="info" titulo="Aún no llegan actas">
                  Las de {NOMBRE_DIGNIDAD[dignidad].toLowerCase()} aparecerán aquí apenas se envíen.
                </Aviso>
              ) : null}
              <GraficoVotos totales={datos.totales} />
              <Resumen resumen={datos.resumen} />
            </>
          ) : (
            <>
              <Campo
                etiqueta="Buscar recinto"
                placeholder="Nombre, parroquia o código"
                value={busqueda}
                onChangeText={setBusqueda}
                icono={Search}
                autoCorrect={false}
              />
              <FiltrosAvance recintos={datos.recintos} valor={filtro} onCambio={setFiltro} />
              {visibles.length === 0 ? (
                <Parrafo suave>
                  {filtro === 'faltan' && !busqueda
                    ? '¡Todos los recintos ya enviaron sus actas!'
                    : 'Ningún recinto coincide. Pruebe con otro filtro o con otra búsqueda.'}
                </Parrafo>
              ) : null}
              {visibles.map((r) => (
                <TarjetaAvance
                  key={r.recintoId}
                  r={r}
                  alTocar={() => router.push({ pathname: '/provincial/resultados/[id]', params: { id: r.recintoId, nombre: r.nombre } })}
                />
              ))}
            </>
          )}
        </>
      ) : null}
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Resultados de un recinto (provincial) y actas del recinto (coordinador de recinto)
// ---------------------------------------------------------------------------
function EstadoActasMesas({ datos, rutaActa }: { datos: DatosRecinto; rutaActa: '/provincial/acta/[id]' | '/recinto/acta/[id]' }) {
  if (datos.mesas.length === 0) return <Aviso tipo="info" titulo="Sin mesas">Este recinto aún no tiene mesas registradas.</Aviso>;
  return (
    <>
      {datos.mesas.map((m) => (
        <View key={m.id} className="my-1 gap-2 rounded-2xl bg-tarjeta p-4 shadow-tarjeta">
          <Text className="font-seminegrita text-lg text-texto">{etiquetaMesa(m)}</Text>
          <View className="flex-row gap-2">
            {DIGNIDADES.map((d) => {
              const acta = m.actas[d];
              const texto = acta ? (acta.requiereRevision ? 'Revisar' : 'Recibida') : 'Falta';
              return (
                <Pressable
                  key={d}
                  disabled={!acta}
                  onPress={() => acta && router.push({ pathname: rutaActa, params: { id: acta.id } })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !acta }}
                  accessibilityLabel={`${NOMBRE_DIGNIDAD[d]}: ${texto}${acta ? '. Toque para ver el acta' : ''}`}
                  className={`min-h-14 flex-1 justify-center rounded-xl px-3 py-2 ${
                    !acta ? 'bg-pista' : acta.requiereRevision ? 'bg-fondo-error active:opacity-80' : 'bg-fondo-exito active:opacity-80'
                  }`}>
                  <Text className="font-regular text-base text-texto-suave">{NOMBRE_DIGNIDAD[d]}</Text>
                  <Text
                    className={`font-negrita text-base ${!acta ? 'text-texto-suave' : acta.requiereRevision ? 'text-error' : 'text-exito'}`}>
                    {texto}
                    {acta ? ' ›' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}

export function ResultadosRecinto({ recintoId, nombre }: { recintoId: string; nombre?: string }) {
  const { consultarResultadosRecinto } = useCasosDeUso();
  const { conectado } = useActasEnVivo();
  const [dignidad, setDignidad] = useState<Dignidad>('alcaldia');
  const consulta = useQuery({
    queryKey: ['resultados', 'recinto', recintoId, dignidad],
    queryFn: () => consultarResultadosRecinto.ejecutar(recintoId, dignidad),
  });
  const datos = consulta.data?.ok ? consulta.data.value : null;

  return (
    <Pantalla volver>
      <Titulo>{nombre ?? 'Resultados del recinto'}</Titulo>
      <AvisoSinConexion conectado={conectado} />
      <SelectorDignidad valor={dignidad} onCambio={setDignidad} />
      {consulta.isPending ? <Cargando texto="Cargando el recinto…" /> : null}
      {consulta.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      {consulta.data && !consulta.data.ok ? <Aviso tipo="error">{consulta.data.error.mensaje}</Aviso> : null}
      {datos ? (
        <>
          <Subtitulo>Votos · {NOMBRE_DIGNIDAD[dignidad]}</Subtitulo>
          <GraficoVotos totales={datos.totales} />
          <Resumen resumen={datos.resumen} />
          <Subtitulo>Actas por mesa</Subtitulo>
          <Parrafo suave>Toque un acta recibida para ver sus votos, la foto y dónde se registró.</Parrafo>
          <EstadoActasMesas datos={datos} rutaActa="/provincial/acta/[id]" />
        </>
      ) : null}
    </Pantalla>
  );
}

/** Pestaña «Actas» del coordinador de recinto: estado de las actas de su recinto y su detalle. */
export function ActasMiRecinto() {
  const { listarRecintos, consultarResultadosRecinto } = useCasosDeUso();
  const { conectado } = useActasEnVivo();
  const recintos = useQuery({ queryKey: ['recintos'], queryFn: () => listarRecintos.ejecutar() });
  const recinto = recintos.data?.[0];
  // La consulta trae ambas dignidades por mesa; la dignidad solo afecta a los votos (no se muestran aquí).
  const consulta = useQuery({
    queryKey: ['resultados', 'recinto', recinto?.id, 'alcaldia'],
    queryFn: () => consultarResultadosRecinto.ejecutar(recinto!.id, 'alcaldia'),
    enabled: !!recinto,
  });
  const datos = consulta.data?.ok ? consulta.data.value : null;
  const recibidas = datos?.mesas.reduce((s, m) => s + DIGNIDADES.filter((d) => m.actas[d]).length, 0) ?? 0;
  const esperadas = (datos?.mesas.length ?? 0) * DIGNIDADES.length;

  return (
    <Pantalla>
      <Titulo>Actas de mi recinto</Titulo>
      <AvisoSinConexion conectado={conectado} />
      {recintos.isPending || consulta.isLoading ? <Cargando texto="Cargando las actas…" /> : null}
      {recintos.isError || consulta.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      {recintos.data && !recinto ? (
        <Aviso tipo="info" titulo="Aún no tiene recinto">
          Pídale a su coordinador provincial que se lo asigne.
        </Aviso>
      ) : null}
      {consulta.data && !consulta.data.ok ? <Aviso tipo="error">{consulta.data.error.mensaje}</Aviso> : null}
      {recinto && datos ? (
        <>
          <Destacado
            icono={Building2}
            titulo={recinto.nombre}
            valor={`${recibidas} de ${esperadas}`}
            progreso={proporcion(recibidas, esperadas)}
            detalle="actas ya recibidas"
          />
          <EstadoActasMesas datos={datos} rutaActa="/recinto/acta/[id]" />
        </>
      ) : null}
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Detalle del acta (RF-13, RF-17, ADR-13)
// ---------------------------------------------------------------------------
function FilaVoto({ etiqueta, valor, color }: { etiqueta: string; valor: number; color?: string }) {
  return (
    <View className="flex-row items-center gap-3 border-b border-borde py-3" accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      {/* Franja con el color de la lista (dato, D-18). */}
      {color ? <View className="h-8 w-2 rounded-full" style={{ backgroundColor: color }} /> : null}
      <Text className="flex-1 font-medio text-lg text-texto">{etiqueta}</Text>
      <View className="items-end">
        <Text className="font-negrita text-xl text-texto">{valor}</Text>
        <Text className="font-regular text-base italic text-texto-suave">{numeroEnLetras(valor)}</Text>
      </View>
    </View>
  );
}

export function DetalleActaPantalla({ actaId }: { actaId: string }) {
  const { verDetalleActa } = useCasosDeUso();
  const { conectado } = useActasEnVivo();
  const consulta = useQuery({ queryKey: ['resultados', 'acta', actaId], queryFn: () => verDetalleActa.ejecutar(actaId) });
  const acta = consulta.data?.ok ? consulta.data.value : null;

  if (!acta) {
    return (
      <Pantalla volver>
        <Titulo>Acta</Titulo>
        {consulta.isPending ? <Cargando texto="Cargando el acta…" /> : null}
        {consulta.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
        {consulta.data && !consulta.data.ok ? <Aviso tipo="error">{consulta.data.error.mensaje}</Aviso> : null}
      </Pantalla>
    );
  }

  const revisar = detalleRequiereRevision(acta);
  const distancia = acta.recinto.ubicacion ? distanciaMetros(acta.ubicacion, acta.recinto.ubicacion) : null;
  const sumaVotos = acta.votos.reduce((s, v) => s + v.votos, 0) + acta.votosBlancos + acta.votosNulos;
  const lugar =
    distancia === null
      ? null
      : distancia < 50
        ? 'Se registró junto al recinto.'
        : `Se registró a ${distancia < 1000 ? `${Math.round(distancia)} m` : `${(distancia / 1000).toFixed(1)} km`} del recinto.`;

  return (
    <Pantalla volver>
      <Titulo>Acta de {NOMBRE_DIGNIDAD[acta.dignidad].toLowerCase()}</Titulo>
      <Parrafo suave>
        {etiquetaMesa(acta.mesa)} · {acta.recinto.nombre}
      </Parrafo>
      {revisar ? (
        <Aviso tipo="advertencia" titulo="Para revisar">
          {acta.ubicacion.simulada
            ? 'El teléfono indicó que la ubicación podría no ser real.'
            : `El GPS tuvo un margen de ${Math.round(acta.ubicacion.precisionM)} m (lo ideal es menos de 50 m).`}
          {lugar ? ` ${lugar}` : ''}
        </Aviso>
      ) : (
        <Aviso tipo="exito" titulo="Ubicación confiable">
          {lugar ? `${lugar} ` : ''}Margen del GPS: {Math.round(acta.ubicacion.precisionM)} m.
        </Aviso>
      )}

      <Subtitulo>Votos</Subtitulo>
      <View className="my-1 rounded-2xl bg-tarjeta px-4 shadow-tarjeta">
        <FilaVoto etiqueta="Total de sufragantes" valor={acta.totalSufragantes} />
        <FilaVoto etiqueta="Votos en blanco" valor={acta.votosBlancos} />
        <FilaVoto etiqueta="Votos nulos" valor={acta.votosNulos} />
        {acta.votos.map((v) => (
          <FilaVoto key={v.candidaturaId} etiqueta={`Lista ${v.lista} · ${v.candidato}`} valor={v.votos} color={v.color} />
        ))}
      </View>
      {sumaVotos === acta.totalSufragantes ? (
        <Aviso tipo="exito" titulo="Las cuentas cuadran">
          La suma de votos ({sumaVotos}) es igual al total de sufragantes.
        </Aviso>
      ) : (
        <Aviso tipo="advertencia" titulo="Las cuentas no cuadran">
          La suma de votos es {sumaVotos} y el total de sufragantes es {acta.totalSufragantes}.
        </Aviso>
      )}

      <Subtitulo>Foto del acta</Subtitulo>
      {acta.urlFoto ? (
        <Image
          source={{ uri: acta.urlFoto }}
          className="my-1 h-96 w-full rounded-2xl bg-pista"
          resizeMode="contain"
          accessibilityLabel={`Foto del acta de ${NOMBRE_DIGNIDAD[acta.dignidad].toLowerCase()}`}
        />
      ) : (
        <Aviso tipo="info" titulo={conectado ? 'La foto no cargó' : 'Sin conexión'}>
          {conectado ? 'Vuelva a abrir el acta en un momento.' : 'La foto se verá cuando vuelva la conexión.'}
        </Aviso>
      )}

      <Subtitulo>Lugar de registro</Subtitulo>
      <MapaActa acta={acta.ubicacion} recinto={acta.recinto.ubicacion} conectado={conectado} />
      {distancia === null ? (
        <Parrafo suave>Este recinto no tiene ubicación guardada, así que no podemos medir la distancia.</Parrafo>
      ) : null}

      <Parrafo suave>
        Confirmada {fechaHora(acta.confirmadaEn)}
        {acta.recibidaEn ? ` · Recibida ${fechaHora(acta.recibidaEn)}` : ''}
      </Parrafo>
    </Pantalla>
  );
}
