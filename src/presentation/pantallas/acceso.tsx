// Pantallas de acceso: ingreso (F2 paso 1), primer ingreso (F2) y recuperación (F3 autónoma).
// Diseño: Figma «Welcome» (ingreso) y «Almost there» (código de 6 dígitos), planUi.md.
import { useForm } from '@tanstack/react-form';
import { router } from 'expo-router';
import { Mail } from '@/presentation/components/iconos';
import { useState } from 'react';
import { View } from 'react-native';

import { MENSAJE_CLAVE_GUARDADA } from '@/application/use-cases/autenticacion';
import { codigoYClaveSchema, inicioSesionSchema, solicitudCodigoSchema } from '@/domain/schemas/auth.schema';

import { AnimacionUrna } from '../components/animacion-urna';
import { Aviso, Boton, Campo, CodigoOtp, Enlace, Pantalla, Parrafo, Titulo } from '../components/ui';
import { MENSAJE_INESPERADO, mensajeError, mensajesCampo } from '../hooks/use-errores';
import { useCasosDeUso } from '../providers/contenedor';
import { useSesion } from '../providers/sesion';

// ---------------------------------------------------------------------------
// Ingreso
// ---------------------------------------------------------------------------
export function PantallaIngreso() {
  const { iniciarSesion } = useCasosDeUso();
  const { enTransicion, avisoIngreso, avisarEnIngreso } = useSesion();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { correo: '', clave: '' },
    validators: { onSubmit: inicioSesionSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      avisarEnIngreso(null);
      try {
        const r = await enTransicion(() => iniciarSesion.ejecutar(value));
        if (!r.ok) setError(mensajeError(r.error));
      } catch {
        setError(MENSAJE_INESPERADO);
      }
    },
  });

  return (
    <Pantalla>
      {/* Figma: animación centrada y bienvenida (Lottie propio, sin la marca del Figma). */}
      <View className="mt-4 mb-6 items-center gap-2">
        <AnimacionUrna tamano={176} />
        <Titulo centrado>Control Electoral</Titulo>
        <Parrafo suave centrado>
          Ingrese con el correo y la clave que le entregó su coordinador.
        </Parrafo>
      </View>
      {avisoIngreso ? <Aviso tipo={avisoIngreso.tipo}>{avisoIngreso.texto}</Aviso> : null}
      <form.Field name="correo">
        {(f) => (
          <Campo
            etiqueta="Correo electrónico"
            value={f.state.value}
            onChangeText={f.handleChange}
            onBlur={f.handleBlur}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            icono={Mail}
            errores={mensajesCampo(f.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="clave">
        {(f) => (
          <Campo
            etiqueta="Clave"
            value={f.state.value}
            onChangeText={f.handleChange}
            onBlur={f.handleBlur}
            clave
            autoCapitalize="none"
            autoComplete="password"
            errores={mensajesCampo(f.state.meta.errors)}
          />
        )}
      </form.Field>
      <Enlace titulo="¿Olvidó su clave?" onPress={() => router.push('/recuperar')} />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(enviando) => <Boton titulo="Ingresar" onPress={() => void form.handleSubmit()} cargando={enviando} className="mt-6" />}
      </form.Subscribe>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Formulario compartido: código del correo + clave nueva repetida
// ---------------------------------------------------------------------------
function FormularioCodigoYClave({
  textoBoton,
  alEnviar,
  alReenviar,
  reenviando,
}: {
  textoBoton: string;
  alEnviar: (v: { codigo: string; clave: string; confirmacion: string }) => Promise<string | null>;
  /** Figma: «¿No recibió el código? Reenviar». */
  alReenviar: () => void;
  reenviando: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { codigo: '', clave: '', confirmacion: '' },
    validators: { onChange: codigoYClaveSchema },
    onSubmit: async ({ value }) => setError(await alEnviar(value)),
  });

  return (
    <>
      <form.Field name="codigo">
        {(f) => <CodigoOtp valor={f.state.value} onCambio={f.handleChange} errores={mensajesCampo(f.state.meta.errors)} />}
      </form.Field>
      <form.Field name="clave">
        {(f) => (
          <Campo
            etiqueta="Clave nueva"
            value={f.state.value}
            onChangeText={f.handleChange}
            onBlur={f.handleBlur}
            clave
            autoCapitalize="none"
            autoComplete="new-password"
            ayuda="Al menos 8 caracteres, con letras y números."
            errores={mensajesCampo(f.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="confirmacion" validators={{ onChangeListenTo: ['clave'] }}>
        {(f) => (
          <Campo
            etiqueta="Repita la clave nueva"
            value={f.state.value}
            onChangeText={f.handleChange}
            onBlur={f.handleBlur}
            clave
            autoCapitalize="none"
            errores={mensajesCampo(f.state.meta.errors)}
          />
        )}
      </form.Field>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([puede, enviando]) => (
          <Boton titulo={textoBoton} onPress={() => void form.handleSubmit()} cargando={enviando} deshabilitado={!puede} />
        )}
      </form.Subscribe>
      <View className="mt-4 items-center">
        <Parrafo suave centrado>
          ¿No recibió el código?
        </Parrafo>
        <Enlace titulo={reenviando ? 'Enviando…' : 'Enviar otro código'} onPress={alReenviar} alineado="centro" />
      </View>
    </>
  );
}

/**
 * Tras guardar la clave el caso de uso cierra la sesión y la navegación vuelve al ingreso,
 * donde se muestra el aviso. Devuelve el error a mostrar si la persona sigue en la pantalla.
 */
function useAlGuardarClave() {
  const { avisarEnIngreso } = useSesion();
  return (r: { ok: true } | { ok: false; error: { codigo: string; mensaje: string } }): string | null => {
    if (r.ok) {
      avisarEnIngreso({ tipo: 'exito', texto: MENSAJE_CLAVE_GUARDADA });
      return null;
    }
    if (r.error.codigo === 'no_requerido') {
      avisarEnIngreso({ tipo: 'info', texto: r.error.mensaje });
      return null;
    }
    return mensajeError(r.error);
  };
}

// ---------------------------------------------------------------------------
// Primer ingreso (F2, D-25)
// ---------------------------------------------------------------------------
export function PantallaPrimerIngreso() {
  const { solicitarCodigoPrimerIngreso, completarPrimerIngreso, cerrarSesion } = useCasosDeUso();
  const { enTransicion, perfil } = useSesion();
  const alGuardar = useAlGuardarClave();
  const [correo, setCorreo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pedirCodigo() {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await solicitarCodigoPrimerIngreso.ejecutar();
      if (r.ok) setCorreo(r.value.correo);
      else setError(mensajeError(r.error));
    } catch {
      setError(MENSAJE_INESPERADO);
    } finally {
      setEnviando(false);
    }
  }

  return (
    // Volver = salir de la cuenta con clave temporal.
    <Pantalla volver={() => void cerrarSesion.ejecutar()}>
      <Titulo>{correo ? 'Casi listo' : `Bienvenido${perfil ? `, ${perfil.nombres}` : ''}`}</Titulo>
      {correo ? (
        <>
          <Parrafo suave>
            Escriba el código de 6 números que enviamos a {correo}. Revise también la carpeta de correo no deseado.
          </Parrafo>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <FormularioCodigoYClave
            textoBoton="Guardar mi clave nueva"
            alReenviar={() => void pedirCodigo()}
            reenviando={enviando}
            alEnviar={async (v) => {
              try {
                return alGuardar(await enTransicion(() => completarPrimerIngreso.ejecutar(v)));
              } catch {
                return MENSAJE_INESPERADO;
              }
            }}
          />
        </>
      ) : (
        <>
          <Parrafo>Antes de continuar debe confirmar su correo y elegir una clave nueva que solo usted conozca.</Parrafo>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Boton titulo="Enviar código a mi correo" onPress={() => void pedirCodigo()} cargando={enviando} />
        </>
      )}
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Recuperación autónoma (F3)
// ---------------------------------------------------------------------------
export function PantallaRecuperar() {
  const { solicitarRecuperacion, restablecerConCodigo } = useCasosDeUso();
  const { enTransicion } = useSesion();
  const alGuardar = useAlGuardarClave();
  const [correo, setCorreo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);

  async function reenviar(destino: string) {
    if (reenviando) return;
    setReenviando(true);
    setError(null);
    try {
      const r = await solicitarRecuperacion.ejecutar({ correo: destino });
      if (!r.ok) setError(mensajeError(r.error));
    } catch {
      setError(MENSAJE_INESPERADO);
    } finally {
      setReenviando(false);
    }
  }

  const form = useForm({
    defaultValues: { correo: '' },
    validators: { onSubmit: solicitudCodigoSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const r = await solicitarRecuperacion.ejecutar(value);
        if (r.ok) setCorreo(r.value.correo);
        else setError(mensajeError(r.error));
      } catch {
        setError(MENSAJE_INESPERADO);
      }
    },
  });

  return (
    <Pantalla volver>
      <Titulo>{correo ? 'Casi listo' : 'Recuperar mi clave'}</Titulo>
      {correo ? (
        <>
          <Parrafo suave>Si el correo está registrado, le llegará un código de 6 números a {correo}.</Parrafo>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <FormularioCodigoYClave
            textoBoton="Cambiar mi clave"
            alReenviar={() => void reenviar(correo)}
            reenviando={reenviando}
            alEnviar={async (v) => {
              try {
                return alGuardar(await enTransicion(() => restablecerConCodigo.ejecutar(correo, v)));
              } catch {
                return MENSAJE_INESPERADO;
              }
            }}
          />
        </>
      ) : (
        <>
          <Parrafo>Escriba su correo. Le enviaremos un código para elegir una clave nueva.</Parrafo>
          <Parrafo suave>Si no puede recibir correos, pida a su coordinador una clave temporal nueva.</Parrafo>
          <View className="mt-4">
            <form.Field name="correo">
              {(f) => (
                <Campo
                  etiqueta="Correo electrónico"
                  value={f.state.value}
                  onChangeText={f.handleChange}
                  onBlur={f.handleBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  icono={Mail}
                  errores={mensajesCampo(f.state.meta.errors)}
                />
              )}
            </form.Field>
          </View>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(enviando) => <Boton titulo="Enviar código" onPress={() => void form.handleSubmit()} cargando={enviando} />}
          </form.Subscribe>
        </>
      )}
    </Pantalla>
  );
}
