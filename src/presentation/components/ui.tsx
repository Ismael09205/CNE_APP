// Componentes base con el diseño de planUi.md (Figma "Voting App") y Uniwind.
// RNF-05/RNF-06: texto mínimo de 16 px, cuerpo de 18 px, contraste AA y objetivos táctiles de 56 px.
import { router } from 'expo-router';
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Info, type LucideIcon } from '@/presentation/components/iconos';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView as SafeAreaViewBase } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { Icono, type TonoIcono } from './icono';
import { IconoEstado, type TipoEstado } from './icono-estado';

const SafeAreaView = withUniwind(SafeAreaViewBase);

// ---------------------------------------------------------------------------
// Estructura de pantalla
// ---------------------------------------------------------------------------
/**
 * Barra fija bajo la barra de estado, en todas las pantallas de una sección (p. ej. el veedor:
 * conexión y actas por enviar). La define el layout de la sección; por defecto no hay.
 */
export const BarraSuperiorPantalla = createContext<ReactNode>(null);

export function Pantalla({
  children,
  volver,
  fija,
}: {
  children: ReactNode;
  /** Botón circular de regreso del Figma. `true` = router.back(). */
  volver?: boolean | (() => void);
  /** Contenido sin desplazamiento (p. ej. pantallas que se centran). */
  fija?: boolean;
}) {
  const alVolver = typeof volver === 'function' ? volver : () => router.back();
  const cabecera = volver ? <BotonVolver onPress={alVolver} /> : null;
  const barra = useContext(BarraSuperiorPantalla);
  return (
    <SafeAreaView className="flex-1 bg-fondo" edges={['top', 'bottom']}>
      {barra}
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {fija ? (
          <View className="flex-1 gap-2 px-6 pt-4 pb-6">
            {cabecera}
            {children}
          </View>
        ) : (
          <ScrollView contentContainerClassName="grow gap-2 px-6 pt-4 pb-8" keyboardShouldPersistTaps="handled">
            {cabecera}
            {children}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BotonVolver({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Volver"
      hitSlop={8}
      className="mb-4 size-12 items-center justify-center rounded-full bg-primario active:bg-primario-presionado">
      <Icono icono={ChevronLeft} tono="sobre-primario" tamano={28} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------
export const Titulo = ({ children, centrado }: { children: ReactNode; centrado?: boolean }) => (
  <Text accessibilityRole="header" className={`mb-2 font-negrita text-2xl text-texto ${centrado ? 'text-center' : ''}`}>
    {children}
  </Text>
);

export const Subtitulo = ({ children }: { children: ReactNode }) => (
  <Text accessibilityRole="header" className="mt-4 mb-1 font-seminegrita text-xl text-texto">
    {children}
  </Text>
);

export const Parrafo = ({ children, suave, centrado }: { children: ReactNode; suave?: boolean; centrado?: boolean }) => (
  <Text
    className={`font-regular text-lg leading-7 ${suave ? 'text-texto-suave' : 'text-texto'} ${centrado ? 'text-center' : ''}`}>
    {children}
  </Text>
);

export const Cargando = ({ texto }: { texto: string }) => (
  <View className="flex-row items-center gap-3 py-4" accessibilityLiveRegion="polite">
    <ActivityIndicator colorClassName="accent-primario" />
    <Parrafo suave>{texto}</Parrafo>
  </View>
);

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------
type VarianteBoton = 'primario' | 'secundario' | 'peligro';

const FONDO_BOTON: Record<VarianteBoton, string> = {
  primario: 'bg-primario shadow-boton active:bg-primario-presionado',
  secundario: 'border-2 border-primario bg-tarjeta active:bg-primario-suave',
  peligro: 'bg-error active:opacity-80',
};

export function Boton({
  titulo,
  onPress,
  cargando,
  deshabilitado,
  variante = 'primario',
  icono,
  className = '',
}: {
  titulo: string;
  onPress: () => void;
  cargando?: boolean;
  deshabilitado?: boolean;
  variante?: VarianteBoton;
  icono?: LucideIcon;
  className?: string;
}) {
  const inactivo = !!(deshabilitado || cargando);
  const tono: TonoIcono = variante === 'secundario' ? 'texto' : 'sobre-primario';
  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: !!cargando }}
      className={`mt-2 min-h-14 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 disabled:opacity-50 ${FONDO_BOTON[variante]} ${className}`}>
      {cargando ? (
        <ActivityIndicator colorClassName={variante === 'secundario' ? 'accent-texto' : 'accent-sobre-primario'} />
      ) : (
        <>
          {icono ? <Icono icono={icono} tono={tono} /> : null}
          <Text
            className={`text-center font-seminegrita text-lg ${variante === 'secundario' ? 'text-texto' : 'text-sobre-primario'}`}>
            {titulo}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Enlace de texto (Figma: «Forgot a password?»), con área táctil amplia. */
export function Enlace({ titulo, onPress, alineado = 'derecha' }: { titulo: string; onPress: () => void; alineado?: 'derecha' | 'centro' }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      className={`min-h-12 justify-center ${alineado === 'derecha' ? 'self-end' : 'self-center'}`}>
      <Text className="font-seminegrita text-base text-primario underline">{titulo}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------
export function Campo({
  etiqueta,
  errores,
  ayuda,
  icono,
  clave,
  ...props
}: TextInputProps & {
  etiqueta: string;
  errores?: readonly string[];
  ayuda?: string;
  /** Ícono decorativo a la derecha (Figma: User_light). */
  icono?: LucideIcon;
  /** Campo de clave con botón para mostrarla (Figma: View_alt_light). */
  clave?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const error = errores?.[0];
  const conAccesorio = !!icono || !!clave;
  return (
    <View className="mb-3">
      <Text className="mb-1.5 font-medio text-base text-texto">{etiqueta}</Text>
      <View className="justify-center">
        <TextInput
          accessibilityLabel={etiqueta}
          placeholderTextColorClassName="accent-texto-suave"
          secureTextEntry={clave ? !visible : props.secureTextEntry}
          className={`min-h-14 rounded-xl border-2 bg-campo px-4 font-regular text-lg text-texto focus:border-primario ${
            error ? 'border-error' : 'border-borde'
          } ${conAccesorio ? 'pr-14' : ''}`}
          {...props}
        />
        {clave ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar clave' : 'Mostrar clave'}
            className="absolute right-1 size-12 items-center justify-center">
            <Icono icono={visible ? EyeOff : Eye} tono="texto-suave" />
          </Pressable>
        ) : icono ? (
          <View className="absolute right-4" pointerEvents="none">
            <Icono icono={icono} tono="texto-suave" />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text className="mt-1.5 font-medio text-base text-error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : ayuda ? (
        <Text className="mt-1.5 font-regular text-base text-texto-suave">{ayuda}</Text>
      ) : null}
    </View>
  );
}

/** Código de 6 dígitos en casillas (Figma: «OTP Input»). Un solo TextInput invisible recibe el teclado. */
export function CodigoOtp({
  valor,
  onCambio,
  errores,
  largo = 6,
}: {
  valor: string;
  onCambio: (v: string) => void;
  errores?: readonly string[];
  largo?: number;
}) {
  const entrada = useRef<TextInput>(null);
  const [enfocado, setEnfocado] = useState(false);
  const error = errores?.[0];
  return (
    <View className="mb-3">
      <Text className="mb-1.5 font-medio text-base text-texto">Código del correo</Text>
      <Pressable onPress={() => entrada.current?.focus()} className="flex-row justify-between gap-2" accessible={false}>
        {Array.from({ length: largo }, (_, i) => {
          const activa = enfocado && (i === valor.length || (i === largo - 1 && valor.length === largo));
          return (
            <View
              key={i}
              className={`h-16 flex-1 items-center justify-center rounded-xl border-2 bg-campo ${
                error ? 'border-error' : activa ? 'border-primario' : 'border-borde'
              }`}>
              <Text className="font-negrita text-2xl text-texto">{valor[i] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={entrada}
          value={valor}
          onChangeText={(t) => onCambio(t.replace(/\D/g, '').slice(0, largo))}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={largo}
          accessibilityLabel={`Código de ${largo} números enviado a su correo`}
          caretHidden
          className="absolute inset-0 text-transparent opacity-0"
        />
      </Pressable>
      {error ? (
        <Text className="mt-1.5 font-medio text-base text-error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Opciones grandes tipo botón (para pocas alternativas: rol, recinto). */
export function Opciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
  errores,
}: {
  etiqueta: string;
  opciones: readonly { valor: T; texto: string }[];
  valor: T | undefined;
  onCambio: (v: T) => void;
  errores?: readonly string[];
}) {
  return (
    <View className="mb-3 gap-2" accessibilityRole="radiogroup" accessibilityLabel={etiqueta}>
      <Text className="font-medio text-base text-texto">{etiqueta}</Text>
      {opciones.map((o) => {
        const elegido = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => onCambio(o.valor)}
            accessibilityRole="radio"
            accessibilityState={{ checked: elegido }}
            className={`min-h-14 flex-row items-center gap-3 rounded-xl border-2 px-4 py-3 ${
              elegido ? 'border-primario bg-primario-suave' : 'border-borde bg-campo active:bg-primario-suave'
            }`}>
            <View className={`size-6 items-center justify-center rounded-full border-2 ${elegido ? 'border-primario' : 'border-texto-suave'}`}>
              {elegido ? <View className="size-3 rounded-full bg-primario" /> : null}
            </View>
            <Text className={`flex-1 text-lg text-texto ${elegido ? 'font-seminegrita' : 'font-regular'}`}>{o.texto}</Text>
          </Pressable>
        );
      })}
      {errores?.[0] ? <Text className="font-medio text-base text-error">{errores[0]}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
export type TipoAviso = TipoEstado;

// Tarjeta de estado: ícono animado (Lottie) en un círculo de color, título corto y detalle.
const AVISO: Record<TipoAviso, { borde: string; texto: string }> = {
  error: { borde: 'border-error', texto: 'text-error' },
  exito: { borde: 'border-exito', texto: 'text-exito' },
  info: { borde: 'border-info', texto: 'text-info' },
  advertencia: { borde: 'border-advertencia', texto: 'text-advertencia' },
};

export function Aviso({ tipo, titulo, children }: { tipo: TipoAviso; titulo?: string; children?: ReactNode }) {
  const a = AVISO[tipo];
  return (
    <View
      className={`my-1 flex-row items-center gap-3 rounded-2xl border-l-4 bg-tarjeta py-3 pr-4 pl-3 shadow-tarjeta ${a.borde}`}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <IconoEstado tipo={tipo} />
      <View className="flex-1 gap-0.5">
        {titulo ? <Text className={`font-negrita text-lg ${a.texto}`}>{titulo}</Text> : null}
        {children ? (
          <Text className={titulo ? 'font-regular text-base leading-6 text-texto' : `font-medio text-lg leading-7 ${a.texto}`}>{children}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tarjetas y encabezados (Figma: tarjetas de candidatos, encabezado con avatar, tarjeta con degradado)
// ---------------------------------------------------------------------------
export function Tarjeta({
  children,
  onPress,
  acento,
  etiqueta,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Color de la lista (D-18): franja izquierda. Es un dato, por eso va en style. */
  acento?: string;
  /** Texto para lectores de pantalla cuando la tarjeta es tocable. */
  etiqueta?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={etiqueta}
      style={acento ? { borderLeftColor: acento } : undefined}
      className={`my-1 min-h-14 flex-row items-center gap-3 rounded-2xl bg-tarjeta p-4 shadow-tarjeta ${acento ? 'border-l-8' : ''} ${
        onPress ? 'active:bg-primario-suave' : ''
      }`}>
      <View className="flex-1 gap-1">{children}</View>
      {onPress ? <Icono icono={ChevronRight} tono="texto-suave" /> : null}
    </Pressable>
  );
}

export const iniciales = (nombres?: string, apellidos?: string) =>
  `${nombres?.trim()[0] ?? ''}${apellidos?.trim()[0] ?? ''}`.toLocaleUpperCase('es');

export function Avatar({ nombres, apellidos, grande, claro }: { nombres?: string; apellidos?: string; grande?: boolean; claro?: boolean }) {
  return (
    <View
      className={`items-center justify-center rounded-full ${claro ? 'border-2 border-sobre-degradado-suave bg-tarjeta' : 'bg-acento-suave'} ${grande ? 'size-24' : 'size-16'}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text className={`font-negrita text-primario ${grande ? 'text-3xl' : 'text-xl'}`}>{iniciales(nombres, apellidos)}</Text>
    </View>
  );
}

/** Encabezado del inicio (Figma: avatar, nombre y rol), como banda en degradado de borde a borde. */
export function Encabezado({ nombres, apellidos, rol }: { nombres?: string; apellidos?: string; rol: string }) {
  return (
    <View className="-mx-6 -mt-4 mb-2 flex-row items-center gap-4 rounded-b-3xl bg-linear-to-br from-degradado-desde to-degradado-hasta px-6 pt-6 pb-8">
      <Avatar nombres={nombres} apellidos={apellidos} claro />
      <View className="flex-1 gap-1">
        <Text className="font-regular text-base text-sobre-degradado-suave">Hola,</Text>
        <Text accessibilityRole="header" numberOfLines={2} className="font-negrita text-2xl text-sobre-primario">
          {nombres}
        </Text>
        <View className="self-start rounded-full bg-primario-presionado px-3 py-1">
          <Text className="font-medio text-base text-sobre-primario">{rol}</Text>
        </View>
      </View>
    </View>
  );
}

/** Tarjeta destacada (Figma: «Total votes counted»): número grande, ícono y barra de avance opcional. */
export function Destacado({
  titulo,
  valor,
  detalle,
  icono,
  progreso,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  icono?: LucideIcon;
  /** Avance de 0 a 1 (p. ej. mesas con veedor). */
  progreso?: number;
}) {
  const avance = progreso === undefined ? undefined : Math.min(1, Math.max(0, progreso));
  return (
    <View
      className="my-2 gap-2 rounded-2xl bg-tarjeta p-5 shadow-tarjeta"
      accessible
      accessibilityLabel={`${titulo}: ${valor}${detalle ? `. ${detalle}` : ''}`}>
      <View className="flex-row items-center gap-3">
        {icono ? (
          <View className="size-12 items-center justify-center rounded-full bg-acento-suave">
            <Icono icono={icono} tono="primario" />
          </View>
        ) : null}
        <Text className="flex-1 font-seminegrita text-lg text-texto">{titulo}</Text>
      </View>
      <Text className="font-negrita text-4xl text-primario">{valor}</Text>
      {avance !== undefined ? (
        <View className="h-3 overflow-hidden rounded-full bg-pista">
          <View className="h-full rounded-full bg-linear-to-r from-acento to-degradado-desde" style={{ width: `${avance * 100}%` }} />
        </View>
      ) : null}
      {detalle ? <Text className="font-regular text-base text-texto-suave">{detalle}</Text> : null}
    </View>
  );
}

/** Fila de menú con ícono en círculo y flecha (Figma: perfil «Support», «Settings», «Logout»). */
export function FilaMenu({
  titulo,
  icono,
  onPress,
  peligro,
}: {
  titulo: string;
  icono: LucideIcon;
  onPress: () => void;
  peligro?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="my-1 min-h-16 flex-row items-center gap-4 rounded-2xl bg-tarjeta px-4 py-3 shadow-tarjeta active:bg-primario-suave">
      <View className={`size-12 items-center justify-center rounded-full ${peligro ? 'bg-fondo-error' : 'bg-acento-suave'}`}>
        <Icono icono={icono} tono={peligro ? 'error' : 'primario'} />
      </View>
      <Text className={`flex-1 font-seminegrita text-lg ${peligro ? 'text-error' : 'text-texto'}`}>{titulo}</Text>
      {peligro ? null : <Icono icono={ChevronRight} tono="texto-suave" />}
    </Pressable>
  );
}

/** Dato con etiqueta (Figma: perfil del candidato «Birthday / 12/02/1976»). */
export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View className="gap-0.5 py-2">
      <Text className="font-regular text-base text-texto-suave">{etiqueta}</Text>
      <Text className="font-medio text-lg text-texto">{valor}</Text>
    </View>
  );
}

/**
 * Dato sensible (p. ej. la contraseña temporal, D-15): oculto por defecto, con un botón de ojo
 * para mostrarlo mientras se entrega a la persona. Se muestra en grupos de 5 para dictarlo mejor.
 */
export function DatoSecreto({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [visible, setVisible] = useState(false);
  const legible = valor.replace(/(.{5})(?=.)/g, '$1 ');
  return (
    <View className="flex-row items-center gap-2 py-2">
      <View className="flex-1 gap-0.5">
        <Text className="font-regular text-base text-texto-suave">{etiqueta}</Text>
        <Text
          selectable={visible}
          className="font-negrita text-2xl tracking-widest text-texto"
          accessibilityLabel={visible ? `${etiqueta}: ${valor.split('').join(' ')}` : `${etiqueta} oculta`}>
          {visible ? legible : '•'.repeat(valor.length)}
        </Text>
      </View>
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
        className="size-14 items-center justify-center rounded-full bg-acento-suave active:bg-primario-suave">
        <Icono icono={visible ? EyeOff : Eye} tono="primario" tamano={26} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ventanas (Figma: «Confirmation» y «Thanks for your voting»)
// ---------------------------------------------------------------------------
export type Confirmacion = {
  titulo: string;
  mensaje: string;
  nota?: string;
  textoConfirmar: string;
  textoCancelar?: string;
  peligro?: boolean;
  alConfirmar: () => void;
};

/** Ventana de confirmación. Se controla con un estado `Confirmacion | null`. */
export function ModalConfirmacion({ datos, alCerrar }: { datos: Confirmacion | null; alCerrar: () => void }) {
  return (
    <Modal visible={!!datos} transparent animationType="fade" onRequestClose={alCerrar} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-velo px-6">
        {datos ? (
          <View className="w-full max-w-md gap-3 rounded-3xl bg-tarjeta p-6" accessibilityViewIsModal>
            <Text accessibilityRole="header" className="text-center font-negrita text-xl text-primario">
              {datos.titulo}
            </Text>
            <Text className="text-center font-seminegrita text-lg leading-7 text-texto">{datos.mensaje}</Text>
            {datos.nota ? (
              <View className="flex-row gap-3">
                <Icono icono={Info} tono="texto-suave" />
                <Text className="flex-1 font-regular text-base text-texto-suave">{datos.nota}</Text>
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <Boton titulo={datos.textoCancelar ?? 'Cancelar'} variante="secundario" onPress={alCerrar} className="flex-1" />
              <Boton
                titulo={datos.textoConfirmar}
                variante={datos.peligro ? 'peligro' : 'primario'}
                className="flex-1"
                onPress={() => {
                  const accion = datos.alConfirmar;
                  alCerrar();
                  accion();
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function ModalExito({
  visible,
  titulo,
  mensaje,
  textoBoton,
  alCerrar,
}: {
  visible: boolean;
  titulo: string;
  mensaje?: string;
  textoBoton: string;
  alCerrar: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={alCerrar} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-velo px-6">
        <View className="w-full max-w-md items-center gap-4 rounded-3xl bg-tarjeta p-6" accessibilityViewIsModal>
          <Text accessibilityRole="header" className="text-center font-negrita text-2xl text-primario">
            {titulo}
          </Text>
          <Icono icono={CheckCircle2} tono="exito" tamano={72} grosor={1.5} />
          {mensaje ? <Parrafo centrado>{mensaje}</Parrafo> : null}
          <Boton titulo={textoBoton} onPress={alCerrar} className="self-stretch" />
        </View>
      </View>
    </Modal>
  );
}
