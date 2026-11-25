// F1 — Formulario de alta (RF-04, ADR-04): TanStack Form con los esquemas Zod del dominio,
// validación por campo mientras se escribe y la clave temporal mostrada una sola vez.
import { useForm } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import type { Recinto } from '@/domain/entities/recinto';
import { datosPersonalesSchema, type NuevaCuentaInput } from '@/domain/schemas/perfil.schema';

import { MENSAJE_INESPERADO, mensajeError, mensajesCampo, reportarInesperado } from '../hooks/use-errores';
import { useCasosDeUso } from '../providers/contenedor';
import { Aviso, Boton, Campo, Dato, DatoSecreto, Opciones, Parrafo } from './ui';

type RolCreable = 'coordinador_recinto' | 'veedor';
const ETIQUETA_ROL: Record<RolCreable, string> = { coordinador_recinto: 'Coordinador de recinto', veedor: 'Veedor' };

type Valores = {
  cedula: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  rol: RolCreable;
  recintoId: string;
};

const s = datosPersonalesSchema.shape;

export function FormularioCuenta({
  roles,
  recintos,
  recintoFijo,
}: {
  roles: readonly RolCreable[];
  recintos: readonly Recinto[];
  /** El coordinador de recinto solo crea veedores de su recinto (D-13). */
  recintoFijo?: string;
}) {
  const { crearCuenta } = useCasosDeUso();
  const queryClient = useQueryClient();
  const [creada, setCreada] = useState<{ nombre: string; correo: string; clave: string } | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      cedula: '',
      nombres: '',
      apellidos: '',
      telefono: '',
      correo: '',
      rol: roles[roles.length - 1],
      recintoId: recintoFijo ?? '',
    } as Valores,
    onSubmit: async ({ value }) => {
      setErrorGeneral(null);
      const entrada: NuevaCuentaInput =
        value.rol === 'veedor' ? { ...value, rol: 'veedor' } : { ...value, rol: 'coordinador_recinto' };
      try {
        const r = await crearCuenta.ejecutar(entrada);
        if (!r.ok) return setErrorGeneral(mensajeError(r.error));
        setCreada({ nombre: `${value.nombres} ${value.apellidos}`, correo: value.correo, clave: r.value.claveTemporal });
        form.reset();
        await queryClient.invalidateQueries({ queryKey: ['personas'] });
      } catch (e) {
        reportarInesperado(e, 'crear_cuenta');
        setErrorGeneral(MENSAJE_INESPERADO);
      }
    },
  });

  if (creada) {
    return (
      <>
        <Aviso tipo="exito" titulo="¡Cuenta creada!">{creada.nombre} ya puede ingresar a la app.</Aviso>
        <Parrafo>Entregue estos datos a la persona. La contraseña temporal se muestra solo esta vez: toque el ojo para verla.</Parrafo>
        <View className="rounded-2xl bg-tarjeta shadow-tarjeta px-4 py-2">
          <Dato etiqueta="Correo" valor={creada.correo} />
          <DatoSecreto etiqueta="Contraseña temporal" valor={creada.clave} />
        </View>
        <Parrafo suave>En su primer ingreso, la persona recibirá un código en su correo y elegirá una clave nueva.</Parrafo>
        <Boton titulo="Crear otra cuenta" onPress={() => setCreada(null)} />
      </>
    );
  }

  return (
    <>
      <form.Field name="cedula" validators={{ onChange: s.cedula }}>
        {(f) => (
          <Campo
            etiqueta="Cédula"
            value={f.state.value}
            onChangeText={f.handleChange}
            onBlur={f.handleBlur}
            keyboardType="number-pad"
            maxLength={10}
            errores={mensajesCampo(f.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="nombres" validators={{ onChange: s.nombres }}>
        {(f) => (
          <Campo etiqueta="Nombres" value={f.state.value} onChangeText={f.handleChange} onBlur={f.handleBlur}
            autoCapitalize="words" errores={mensajesCampo(f.state.meta.errors)} />
        )}
      </form.Field>
      <form.Field name="apellidos" validators={{ onChange: s.apellidos }}>
        {(f) => (
          <Campo etiqueta="Apellidos" value={f.state.value} onChangeText={f.handleChange} onBlur={f.handleBlur}
            autoCapitalize="words" errores={mensajesCampo(f.state.meta.errors)} />
        )}
      </form.Field>
      <form.Field name="telefono" validators={{ onChange: s.telefono }}>
        {(f) => (
          <Campo etiqueta="Celular" value={f.state.value} onChangeText={f.handleChange} onBlur={f.handleBlur}
            keyboardType="phone-pad" maxLength={10} ayuda="Ejemplo: 0991234567" errores={mensajesCampo(f.state.meta.errors)} />
        )}
      </form.Field>
      <form.Field name="correo" validators={{ onChange: s.correo }}>
        {(f) => (
          <Campo etiqueta="Correo electrónico" value={f.state.value} onChangeText={f.handleChange} onBlur={f.handleBlur}
            keyboardType="email-address" autoCapitalize="none" autoComplete="email" errores={mensajesCampo(f.state.meta.errors)} />
        )}
      </form.Field>

      {roles.length > 1 ? (
        <form.Field name="rol">
          {(f) => (
            <Opciones etiqueta="Tipo de cuenta" valor={f.state.value} onCambio={f.handleChange}
              opciones={roles.map((r) => ({ valor: r, texto: ETIQUETA_ROL[r] }))} />
          )}
        </form.Field>
      ) : null}

      <form.Subscribe selector={(st) => st.values.rol}>
        {(rol) =>
          rol === 'veedor' && !recintoFijo ? (
            <form.Field
              name="recintoId"
              validators={{ onChange: ({ value }) => (value ? undefined : 'Elija el recinto del veedor.') }}>
              {(f) => (
                <Opciones etiqueta="Recinto del veedor" valor={f.state.value || undefined} onCambio={f.handleChange}
                  opciones={recintos.map((r) => ({ valor: r.id, texto: r.nombre }))} errores={mensajesCampo(f.state.meta.errors)} />
              )}
            </form.Field>
          ) : rol === 'coordinador_recinto' ? (
            <Parrafo suave>El recinto se le asigna después, desde la pestaña Recintos.</Parrafo>
          ) : null
        }
      </form.Subscribe>

      {errorGeneral ? <Aviso tipo="error">{errorGeneral}</Aviso> : null}

      <form.Subscribe selector={(st) => [st.canSubmit, st.isSubmitting] as const}>
        {([puede, enviando]) => (
          <Boton titulo="Crear cuenta" onPress={() => void form.handleSubmit()} cargando={enviando} deshabilitado={!puede} />
        )}
      </form.Subscribe>
    </>
  );
}
