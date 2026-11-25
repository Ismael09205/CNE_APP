// Veedor (F9, F10, RNF-05, RNF-09): su mesa, el estado de cada acta y el registro sin conexión.
// Diseño: Figma (encabezado y tarjeta destacada, tarjetas de lista como las de candidatos,
// ventana «Confirmation» para el envío definitivo y «Thanks» al guardar).
import { useForm, useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Camera, ClipboardCheck, FileText, Pencil, RefreshCw, Send, Wifi, WifiOff } from '@/presentation/components/iconos';
import { useRef, useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';

import type { EstadoActaMesa, MesaDelVeedor } from '@/application/use-cases/mesa-veedor';
import type { UbicacionActa } from '@/application/use-cases/ubicacion-acta';
import type { Candidatura } from '@/domain/entities/candidatura';
import { etiquetaMesa } from '@/domain/entities/mesa';
import { MAX_CASILLA_ACTA, validarResultadosActa, type ResultadosActaInput } from '@/domain/rules/acta.rules';
import { numeroEnLetras } from '@/domain/rules/numero-letras';
import type { Dignidad } from '@/domain/value-objects/dignidad';

import { CamaraActa, type FotoActa } from '../camara/camara-acta';
import { Icono } from '../components/icono';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Destacado,
  Encabezado,
  ModalConfirmacion,
  ModalExito,
  Pantalla,
  Parrafo,
  Subtitulo,
  Titulo,
  type Confirmacion,
  type TipoAviso,
} from '../components/ui';
import { MENSAJE_INESPERADO, mensajeError, mensajesCampo, reportarInesperado } from '../hooks/use-errores';
import { useCasosDeUso } from '../providers/contenedor';
import { useSesion } from '../providers/sesion';
import { useSincronizacion } from '../providers/sincronizacion';
import { LogoLista } from '../components/logo-lista';
import { NOMBRE_ROL, PantallaPerfil } from './perfil';

export const NOMBRE_DIGNIDAD: Record<Dignidad, string> = { alcaldia: 'Alcaldía', prefectura: 'Prefectura' };

function useMesaDelVeedor() {
  const { consultarMesaDelVeedor } = useCasosDeUso();
  return useQuery({ queryKey: ['mesa-veedor'], queryFn: () => consultarMesaDelVeedor.ejecutar(), networkMode: 'always' });
}

// ---------------------------------------------------------------------------
// Estado de cada acta (RNF-09)
// ---------------------------------------------------------------------------
const TEXTO_ESTADO: Record<EstadoActaMesa['estado'], { texto: string; tipo: TipoAviso }> = {
  sin_registrar: { texto: 'Sin registrar', tipo: 'info' },
  pendiente: { texto: 'Guardada en el teléfono. Pendiente de envío', tipo: 'info' },
  enviando: { texto: 'Enviando…', tipo: 'info' },
  guardada: { texto: 'Enviada y guardada en el servidor', tipo: 'exito' },
  registrada: { texto: 'Ya registrada en el servidor', tipo: 'exito' },
  error: { texto: 'No se pudo enviar', tipo: 'error' },
  conflicto: { texto: 'Conflicto: ya existe otra acta para esta mesa', tipo: 'error' },
};

const MOTIVOS: Record<string, string> = {
  sin_conexion: 'Se enviará automáticamente cuando haya conexión.',
  sin_sesion: 'Su sesión terminó. Ingrese de nuevo para enviar el acta.',
  hora_invalida: 'La hora del teléfono está adelantada. Corrija la fecha y hora automáticas; se reintentará solo.',
  fuera_de_vigencia: 'La mesa ya no estaba asignada a usted cuando confirmó el acta. Avise a su coordinador.',
  no_autorizado: 'Su cuenta no está habilitada para enviar actas. Avise a su coordinador.',
  foto_faltante: 'No se pudo guardar la foto del acta en el servidor. Avise a su coordinador.',
  conflicto: 'Otra persona ya registró el acta de esta dignidad. Su acta se conserva en el teléfono; avise a su coordinador.',
  error_inesperado: 'Ocurrió un error inesperado. Se reintentará automáticamente.',
};

const motivo = (codigo: string | null) =>
  codigo ? (MOTIVOS[codigo] ?? 'El servidor rechazó el acta. Avise a su coordinador.') : null;

function TarjetaActa({ acta }: { acta: EstadoActaMesa }) {
  const estado = TEXTO_ESTADO[acta.estado];
  const detalle = acta.estado === 'guardada' ? null : motivo(acta.ultimoError);
  return (
    <View className="my-1 gap-2 rounded-2xl bg-tarjeta shadow-tarjeta p-4">
      <View className="flex-row items-center gap-3">
        <View className="size-12 items-center justify-center rounded-full bg-acento-suave">
          <Icono icono={FileText} tono="primario" />
        </View>
        <Text accessibilityRole="header" className="flex-1 font-seminegrita text-xl text-texto">
          Acta de {NOMBRE_DIGNIDAD[acta.dignidad].toLowerCase()}
        </Text>
      </View>
      <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>
      {detalle ? <Parrafo suave>{detalle}</Parrafo> : null}
      {acta.requiereRevision ? <Parrafo suave>Su coordinador revisará la ubicación de esta acta.</Parrafo> : null}
      {acta.estado === 'sin_registrar' ? (
        <Boton
          titulo={`Registrar acta de ${NOMBRE_DIGNIDAD[acta.dignidad].toLowerCase()}`}
          icono={ClipboardCheck}
          onPress={() => router.push({ pathname: '/veedor/acta/[dignidad]', params: { dignidad: acta.dignidad } })}
        />
      ) : null}
    </View>
  );
}

/** Actas del teléfono que aún no llegan al servidor (las mismas que muestran las tarjetas). */
const contarPorEnviar = (datos: MesaDelVeedor | null) =>
  datos?.actas.filter((a) => a.estado === 'pendiente' || a.estado === 'enviando').length ?? 0;

const actas = (n: number) => (n === 1 ? '1 acta' : `${n} actas`);

/**
 * Barra fija arriba de todas las pantallas del veedor (RNF-09): conexión y actas por enviar.
 * La muestra el layout de la sección mediante BarraSuperiorPantalla.
 */
export function EstadoEnvioVeedor() {
  const { conectado, sincronizando } = useSincronizacion();
  const consulta = useMesaDelVeedor();
  const porEnviar = contarPorEnviar(consulta.data?.ok ? consulta.data.value : null);
  const texto = !conectado
    ? porEnviar > 0
      ? `Sin conexión · ${actas(porEnviar)} pendiente${porEnviar === 1 ? '' : 's'} de envío`
      : 'Sin conexión · puede registrar actas'
    : porEnviar > 0
      ? sincronizando
        ? `Enviando ${actas(porEnviar)}…`
        : `Con conexión · ${actas(porEnviar)} por enviar`
      : 'Con conexión · todo enviado';
  const exito = conectado && porEnviar === 0;
  return (
    <View
      className={`flex-row items-center gap-3 px-6 py-2 ${exito ? 'bg-fondo-exito' : 'bg-fondo-info'}`}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={texto}>
      <Icono icono={conectado ? Wifi : WifiOff} tono={exito ? 'exito' : 'info'} tamano={22} />
      <Text className={`flex-1 font-seminegrita text-base ${exito ? 'text-exito' : 'text-info'}`}>{texto}</Text>
      {porEnviar > 0 ? (
        <View className="min-w-8 items-center rounded-full bg-info px-2 py-0.5">
          <Text className="font-negrita text-base text-sobre-primario">{porEnviar}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Pestaña «Mi mesa». */
export function PanelVeedor() {
  const { perfil } = useSesion();
  const { conectado, sincronizando, sincronizar } = useSincronizacion();
  const consulta = useMesaDelVeedor();
  const datos = consulta.data?.ok ? consulta.data.value : null;
  const porEnviar = contarPorEnviar(datos);

  return (
    <Pantalla>
      <Encabezado nombres={perfil?.nombres} apellidos={perfil?.apellidos} rol={NOMBRE_ROL.veedor} />

      {consulta.isPending ? <Cargando texto="Cargando su mesa…" /> : null}
      {consulta.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      {consulta.data && !consulta.data.ok ? <Aviso tipo="info">{consulta.data.error.mensaje}</Aviso> : null}

      {datos ? (
        <>
          <Destacado
            icono={ClipboardCheck}
            titulo="Su mesa"
            valor={etiquetaMesa(datos.mesa)}
            detalle={porEnviar > 0 ? `${porEnviar} acta(s) por enviar` : undefined}
          />
          {datos.actas.map((a) => (
            <TarjetaActa key={a.dignidad} acta={a} />
          ))}
          {porEnviar > 0 ? (
            <Boton titulo="Enviar ahora" icono={Send} onPress={() => void sincronizar(true)} cargando={sincronizando} deshabilitado={!conectado} />
          ) : null}
        </>
      ) : null}

      <Boton titulo="Actualizar" variante="secundario" icono={RefreshCw} onPress={() => void consulta.refetch()} />
    </Pantalla>
  );
}

/** Pestaña «Perfil» del veedor: avisa si quedan actas sin enviar antes de cerrar sesión. */
export function PerfilVeedor() {
  const consulta = useMesaDelVeedor();
  const porEnviar = contarPorEnviar(consulta.data?.ok ? consulta.data.value : null);
  return (
    <PantallaPerfil
      avisoSalida={
        porEnviar > 0
          ? 'Hay actas sin enviar. Si cierra sesión, no se enviarán hasta que vuelva a ingresar con su cuenta en este teléfono.'
          : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Registro de un acta (F9): formulario → foto + GPS → confirmación
// ---------------------------------------------------------------------------
type Valores = { votos: string[]; votosNulos: string; votosBlancos: string; totalSufragantes: string };

const aNumero = (s: string) => (s.trim() === '' || !/^\d+$/.test(s.trim()) ? Number.NaN : Number(s.trim()));

const aResultados = (v: Valores, candidaturas: readonly Candidatura[]): ResultadosActaInput => ({
  votosNulos: aNumero(v.votosNulos),
  votosBlancos: aNumero(v.votosBlancos),
  totalSufragantes: aNumero(v.totalSufragantes),
  votos: candidaturas.map((c, i) => ({ candidaturaId: c.id, votos: aNumero(v.votos[i] ?? '') })),
});

/** Ruta de una violación del dominio → nombre del campo en el formulario. */
const campoDe = (campo: readonly (string | number)[]) =>
  campo[0] === 'votos' && typeof campo[1] === 'number' ? `votos[${campo[1]}]` : String(campo[0]);

export function RegistroActa({ dignidad }: { dignidad: Dignidad }) {
  const consulta = useMesaDelVeedor();
  const datos = consulta.data?.ok ? consulta.data.value : null;

  if (consulta.isPending) {
    return (
      <Pantalla volver>
        <Cargando texto="Cargando…" />
      </Pantalla>
    );
  }
  if (!datos) {
    return (
      <Pantalla volver>
        <Aviso tipo="error">{consulta.data && !consulta.data.ok ? consulta.data.error.mensaje : MENSAJE_INESPERADO}</Aviso>
      </Pantalla>
    );
  }
  const acta = datos.actas.find((a) => a.dignidad === dignidad);
  if (acta?.estado !== 'sin_registrar') {
    return (
      <Pantalla volver>
        <Aviso tipo="info" titulo="Esta acta ya está registrada">
          Por seguridad, el acta de {NOMBRE_DIGNIDAD[dignidad].toLowerCase()} ya no se puede cambiar.
        </Aviso>
      </Pantalla>
    );
  }
  return <FlujoRegistro datos={datos} dignidad={dignidad} />;
}

type Evidencia = { readonly foto: FotoActa; readonly ubicacion: UbicacionActa };

type Paso =
  // `evidencia`: al corregir los números desde la confirmación se conservan la foto y la ubicación.
  | { tipo: 'formulario'; evidencia?: Evidencia }
  | { tipo: 'camara'; resultados: ResultadosActaInput }
  | ({ tipo: 'confirmar'; resultados: ResultadosActaInput } & Evidencia);

function FlujoRegistro({ datos, dignidad }: { datos: MesaDelVeedor; dignidad: Dignidad }) {
  const { tomarUbicacionActa } = useCasosDeUso();
  const candidaturas = datos.candidaturas[dignidad];
  const [paso, setPaso] = useState<Paso>({ tipo: 'formulario' });
  // Los números escritos se conservan al ir y volver de la cámara.
  const [borrador, setBorrador] = useState<Valores | null>(null);
  const lecturaGps = useRef<ReturnType<typeof tomarUbicacionActa.ejecutar> | null>(null);

  if (paso.tipo === 'formulario') {
    return (
      <FormularioActa
        candidaturas={candidaturas}
        maxSufragantes={datos.mesa.numeroElectores}
        titulo={`Acta de ${NOMBRE_DIGNIDAD[dignidad].toLowerCase()}`}
        mesa={etiquetaMesa(datos.mesa)}
        iniciales={borrador}
        conFoto={!!paso.evidencia}
        alContinuar={(resultados, valores) => {
          setBorrador(valores);
          setPaso(paso.evidencia ? { tipo: 'confirmar', resultados, ...paso.evidencia } : { tipo: 'camara', resultados });
        }}
      />
    );
  }

  if (paso.tipo === 'camara') {
    return (
      <CamaraActa
        // RF-13: la ubicación se lee al disparar la foto.
        alDisparar={() => {
          lecturaGps.current = tomarUbicacionActa.ejecutar();
        }}
        alConfirmar={async (foto) => {
          const r = await (lecturaGps.current ?? tomarUbicacionActa.ejecutar());
          lecturaGps.current = null; // si falló, el próximo intento vuelve a leer el GPS
          if (!r.ok) {
            Alert.alert('No se obtuvo la ubicación', `${r.error.mensaje} Después toque de nuevo "Usar esta foto".`);
            return;
          }
          setPaso({ tipo: 'confirmar', resultados: paso.resultados, foto, ubicacion: r.value });
        }}
        alCancelar={() => setPaso({ tipo: 'formulario' })}
      />
    );
  }

  return (
    <PasoConfirmacion
      dignidad={dignidad}
      mesaId={datos.mesa.id}
      candidaturas={candidaturas}
      {...paso}
      alVolver={() => setPaso({ tipo: 'camara', resultados: paso.resultados })}
      alCorregir={() => setPaso({ tipo: 'formulario', evidencia: { foto: paso.foto, ubicacion: paso.ubicacion } })}
    />
  );
}

function FormularioActa({
  candidaturas,
  maxSufragantes,
  titulo,
  mesa,
  iniciales,
  conFoto,
  alContinuar,
}: {
  candidaturas: readonly Candidatura[];
  maxSufragantes: number | null;
  titulo: string;
  mesa: string;
  iniciales: Valores | null;
  /** Ya hay foto (se vino a corregir los números): se vuelve directo a la confirmación. */
  conFoto: boolean;
  alContinuar: (r: ResultadosActaInput, valores: Valores) => void;
}) {
  const opciones = { candidaturaIds: candidaturas.map((c) => c.id), maxSufragantes };
  const form = useForm({
    defaultValues: iniciales ?? ({ votos: candidaturas.map(() => ''), votosNulos: '', votosBlancos: '', totalSufragantes: '' } as Valores),
    validators: {
      // ADR-12: mismas reglas del dominio, en vivo. La suma se revalida al cambiar cualquier casilla.
      onChange: ({ value }) => {
        const violaciones = validarResultadosActa(aResultados(value, candidaturas), opciones);
        if (violaciones.length === 0) return undefined;
        const fields: Record<string, string> = {};
        for (const v of violaciones) fields[campoDe(v.campo)] ??= v.mensaje;
        return { form: violaciones[0].mensaje, fields };
      },
    },
    onSubmit: ({ value }) => alContinuar(aResultados(value, candidaturas), value),
  });
  const intentado = useStore(form.store, (s) => s.submissionAttempts > 0);
  const errorForm = useStore(form.store, (s) => s.errorMap.onChange);

  const campoNumero = (nombre: 'votosNulos' | 'votosBlancos' | 'totalSufragantes', etiqueta: string, ayuda?: string) => (
    <form.Field name={nombre}>
      {(f) => (
        <Campo
          etiqueta={etiqueta}
          value={f.state.value}
          onChangeText={f.handleChange}
          onBlur={f.handleBlur}
          keyboardType="number-pad"
          maxLength={String(MAX_CASILLA_ACTA).length}
          ayuda={ayuda}
          errores={f.state.meta.isTouched || intentado ? mensajesCampo(f.state.meta.errors) : []}
        />
      )}
    </form.Field>
  );

  return (
    <Pantalla volver>
      <Titulo>{titulo}</Titulo>
      <Parrafo suave>{mesa} · Copie los números en el mismo orden del acta física.</Parrafo>

      {campoNumero(
        'totalSufragantes',
        'Total de sufragantes (firmas y huellas del padrón)',
        maxSufragantes != null ? `Máximo ${maxSufragantes} (electores de la mesa).` : 'Debe ser igual a la suma de todos los votos.',
      )}
      {campoNumero('votosBlancos', 'Votos en blanco')}
      {campoNumero('votosNulos', 'Votos nulos')}
      <Subtitulo>Votación por lista</Subtitulo>
      {candidaturas.map((c, i) => {
        return (
          // Figma: tarjeta de candidato (logo arriba, en su proporción). La franja usa el color de la lista (D-18).
          <View key={c.id} className="my-1 rounded-2xl border-l-8 bg-tarjeta shadow-tarjeta p-4" style={{ borderLeftColor: c.color }}>
            <View className="mb-3 gap-2">
              <LogoLista lista={c.lista} color={c.color} alto={48} anchoMax={200} />
              <View>
                <Text className="font-negrita text-xl text-texto">Lista {c.lista}</Text>
                <Text className="font-medio text-base text-texto">{c.organizacionPolitica}</Text>
                <Text className="font-regular text-base text-texto-suave">{c.binomio ? `${c.candidato} / ${c.binomio}` : c.candidato}</Text>
              </View>
            </View>
            <form.Field name={`votos[${i}]`}>
              {(f) => (
                <Campo
                  etiqueta={`Votos lista ${c.lista}`}
                  value={f.state.value}
                  onChangeText={f.handleChange}
                  onBlur={f.handleBlur}
                  keyboardType="number-pad"
                  maxLength={String(MAX_CASILLA_ACTA).length}
                  errores={f.state.meta.isTouched || intentado ? mensajesCampo(f.state.meta.errors) : []}
                />
              )}
            </form.Field>
          </View>
        );
      })}

      {intentado && errorForm ? <Aviso tipo="error" titulo="Revise los datos marcados">Los campos en rojo le dicen qué corregir.</Aviso> : null}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(enviando) =>
          conFoto ? (
            <Boton titulo="Volver a la confirmación" icono={Send} onPress={() => void form.handleSubmit()} cargando={enviando} />
          ) : (
            <Boton titulo="Continuar a la foto del acta" icono={Camera} onPress={() => void form.handleSubmit()} cargando={enviando} />
          )
        }
      </form.Subscribe>
    </Pantalla>
  );
}

function PasoConfirmacion({
  dignidad,
  mesaId,
  candidaturas,
  resultados,
  foto,
  ubicacion,
  alVolver,
  alCorregir,
}: {
  dignidad: Dignidad;
  mesaId: string;
  candidaturas: readonly Candidatura[];
  resultados: ResultadosActaInput;
  foto: FotoActa;
  ubicacion: UbicacionActa;
  alVolver: () => void;
  /** Vuelve al formulario con los números escritos, sin perder la foto (antes de guardar, S-07). */
  alCorregir: () => void;
}) {
  const { registrarActa } = useCasosDeUso();
  const { sincronizar, conectado } = useSincronizacion();
  // Conexión en el momento de guardar: decide el mensaje de la ventana final.
  const [sinConexionAlGuardar, setSinConexionAlGuardar] = useState(false);
  const queryClient = useQueryClient();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [guardada, setGuardada] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await registrarActa.ejecutar({
        mesaId,
        dignidad,
        resultados,
        evidencia: {
          fotoUriTemporal: foto.uri,
          lat: ubicacion.lat,
          lng: ubicacion.lng,
          precisionM: ubicacion.precisionM,
          ubicacionSimulada: ubicacion.simulada,
          capturadaEn: foto.capturadaEn,
        },
      });
      if (!r.ok) {
        setError(mensajeError(r.error));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['mesa-veedor'] });
      setSinConexionAlGuardar(!conectado);
      void sincronizar(true);
      setGuardada(true);
    } catch (e) {
      reportarInesperado(e, 'guardar_acta');
      setError('No se pudo guardar el acta en el teléfono. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // F9 paso 4: recordatorio de que el envío es definitivo (RF-14). Figma: ventana «Confirmation».
  const confirmar = () =>
    setConfirmacion({
      titulo: 'Confirmación',
      mensaje: '¿Está seguro? El acta no se podrá modificar después.',
      nota: 'Revise que los números sean iguales a los del acta en papel. Se enviará apenas haya conexión.',
      textoCancelar: 'Volver a revisar',
      textoConfirmar: 'Confirmar',
      alConfirmar: () => void guardar(),
    });

  return (
    <Pantalla volver={alCorregir}>
      <Titulo>Confirme el acta de {NOMBRE_DIGNIDAD[dignidad].toLowerCase()}</Titulo>
      <Parrafo suave>Compare cada número, y cómo se escribe en letras, con el acta en papel.</Parrafo>
      <View className="my-2 rounded-2xl bg-tarjeta shadow-tarjeta px-4 py-1">
        <FilaConfirmacion etiqueta="Total de sufragantes" valor={resultados.totalSufragantes} />
        <FilaConfirmacion etiqueta="Votos en blanco" valor={resultados.votosBlancos} />
        <FilaConfirmacion etiqueta="Votos nulos" valor={resultados.votosNulos} />
        {candidaturas.map((c, i) => (
          <FilaConfirmacion key={c.id} etiqueta={`Lista ${c.lista}`} valor={resultados.votos[i]?.votos ?? 0} ultima={i === candidaturas.length - 1} />
        ))}
      </View>
      <Image source={{ uri: foto.uri }} className="my-2 h-72 w-full rounded-2xl bg-tarjeta shadow-tarjeta" resizeMode="contain" accessibilityLabel="Foto del acta" />
      {ubicacion.aviso ? (
        <Aviso tipo="advertencia" titulo="Su coordinador revisará la ubicación">
          {ubicacion.aviso}
        </Aviso>
      ) : (
        <Aviso tipo="exito" titulo="Ubicación lista">
          Margen del GPS: {Math.round(ubicacion.precisionM)} m.
        </Aviso>
      )}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Boton titulo="Confirmar y guardar" icono={Send} onPress={confirmar} cargando={guardando} />
      <Boton titulo="Corregir los números" variante="secundario" icono={Pencil} onPress={alCorregir} deshabilitado={guardando} />
      <Boton titulo="Tomar otra foto" variante="secundario" icono={Camera} onPress={alVolver} deshabilitado={guardando} />
      <ModalConfirmacion datos={confirmacion} alCerrar={() => setConfirmacion(null)} />
      <ModalExito
        visible={guardada}
        titulo={sinConexionAlGuardar ? 'Acta guardada, pendiente de envío' : 'Acta guardada'}
        mensaje={
          sinConexionAlGuardar
            ? 'No hay conexión a internet. El acta quedó guardada en este teléfono y se enviará sola cuando vuelva la conexión. Arriba verá cuántas actas faltan por enviar. No cierre sesión hasta que se envíe.'
            : 'Quedó guardada en el teléfono y se está enviando. Arriba verá cuando quede enviada.'
        }
        textoBoton="Ver mi mesa"
        alCerrar={() => {
          setGuardada(false);
          router.back();
        }}
      />
    </Pantalla>
  );
}

function FilaConfirmacion({ etiqueta, valor, ultima }: { etiqueta: string; valor: number; ultima?: boolean }) {
  return (
    <View
      className={`py-3 ${ultima ? '' : 'border-b border-borde'}`}
      accessible
      accessibilityLabel={`${etiqueta}: ${valor}, ${numeroEnLetras(valor) ?? ''}`}>
      <Text className="font-regular text-base text-texto-suave">{etiqueta}</Text>
      <Text className="font-negrita text-2xl text-texto">
        {valor} · <Text className="font-regular text-lg italic">{numeroEnLetras(valor)}</Text>
      </Text>
    </View>
  );
}
