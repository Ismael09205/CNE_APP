// Fase 5 — Pantallas de gestión territorial (F5, F6, F7, F8). RNF-05: textos grandes y pasos simples.
// Diseño: listas como las tarjetas de candidatos del Figma, búsqueda y confirmaciones en ventana.
import { useForm } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LocateFixed, MapPinPlus, Search } from '@/presentation/components/iconos';
import { useMemo, useState } from 'react';

import type { LecturaGps } from '@/application/ports/ubicacion.port';
import { etiquetaMesa, type MesaConVeedor } from '@/domain/entities/mesa';
import { veedoresLibres } from '@/domain/entities/veedor-recinto';
import { nuevoRecintoSchema, PRECISION_MAXIMA_M, rangoMesasSchema } from '@/domain/schemas/territorio.schema';

import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Destacado,
  ModalConfirmacion,
  Opciones,
  Pantalla,
  Parrafo,
  Subtitulo,
  Tarjeta,
  Titulo,
  type Confirmacion,
} from '../components/ui';
import { MENSAJE_INESPERADO, mensajeError, mensajesCampo, reportarInesperado } from '../hooks/use-errores';
import { useCasosDeUso } from '../providers/contenedor';

type AvisoEstado = { tipo: 'exito' | 'error' | 'info'; texto: string } | null;

const SI_NO = [
  { valor: 'no', texto: 'No' },
  { valor: 'si', texto: 'Sí' },
] as const;

// ===========================================================================
// Provincial · Lista de recintos (F5)
// ===========================================================================
export function RecintosProvincial() {
  const { listarRecintos, listarCoordinaciones } = useCasosDeUso();
  const recintos = useQuery({ queryKey: ['recintos'], queryFn: () => listarRecintos.ejecutar() });
  const coordinaciones = useQuery({ queryKey: ['coordinaciones'], queryFn: () => listarCoordinaciones.ejecutar() });
  const [busqueda, setBusqueda] = useState('');

  const coordinadorDe = useMemo(
    () => new Map((coordinaciones.data ?? []).map((c) => [c.recintoId, `${c.coordinador.nombres} ${c.coordinador.apellidos}`])),
    [coordinaciones.data],
  );
  const filtro = busqueda.trim().toLocaleLowerCase('es');
  const lista = (recintos.data ?? []).filter((r) => !filtro || r.nombre.toLocaleLowerCase('es').includes(filtro) || r.codigo.includes(filtro));

  return (
    <Pantalla>
      <Titulo>Recintos</Titulo>
      <Boton titulo="Nuevo recinto" icono={MapPinPlus} onPress={() => router.push('/provincial/recinto-nuevo')} />
      <Campo
        etiqueta="Buscar por nombre o código"
        value={busqueda}
        onChangeText={setBusqueda}
        autoCorrect={false}
        icono={Search}
        placeholder="Buscar recinto…"
      />
      {recintos.isPending ? <Cargando texto="Cargando recintos…" /> : null}
      {recintos.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      {recintos.data && lista.length === 0 ? <Parrafo suave>No hay recintos que coincidan con la búsqueda.</Parrafo> : null}
      {lista.map((r) => (
        <Tarjeta
          key={r.id}
          etiqueta={`Recinto ${r.nombre}`}
          onPress={() => router.push({ pathname: '/provincial/recinto/[id]', params: { id: r.id } })}>
          <Parrafo>{r.nombre}</Parrafo>
          <Parrafo suave>
            Código {r.codigo}
            {r.sinConectividad ? ' · Sin conectividad' : ''}
            {r.dificilAcceso ? ' · Difícil acceso' : ''}
          </Parrafo>
          <Parrafo suave>Coordinador: {coordinadorDe.get(r.id) ?? 'sin asignar'}</Parrafo>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}

// ===========================================================================
// Provincial · Nuevo recinto con GPS (F5, D-30, D-31)
// ===========================================================================
export function NuevoRecinto() {
  const { listarParroquias, tomarUbicacionRecinto, crearRecinto } = useCasosDeUso();
  const queryClient = useQueryClient();
  const parroquias = useQuery({ queryKey: ['parroquias'], queryFn: () => listarParroquias.ejecutar() });
  const [gps, setGps] = useState<LecturaGps | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<AvisoEstado>(null);

  async function tomarUbicacion() {
    setLeyendo(true);
    setAviso(null);
    try {
      const r = await tomarUbicacionRecinto.ejecutar();
      if (r.ok) setGps(r.value);
      else setAviso({ tipo: 'error', texto: mensajeError(r.error) });
    } catch (e) {
      reportarInesperado(e, 'tomar_gps_recinto');
      setAviso({ tipo: 'error', texto: MENSAJE_INESPERADO });
    } finally {
      setLeyendo(false);
    }
  }

  const form = useForm({
    defaultValues: { parroquiaId: '', codigo: '', nombre: '', codigoZona: '0', nombreZona: '', direccion: '', dificilAcceso: 'no', sinConectividad: 'no' },
    onSubmit: async ({ value }) => {
      setAviso(null);
      if (!gps) return setAviso({ tipo: 'error', texto: 'Tome la ubicación con el GPS estando en el recinto.' });
      try {
        const r = await crearRecinto.ejecutar({
          parroquiaId: Number(value.parroquiaId),
          codigo: value.codigo,
          nombre: value.nombre,
          codigoZona: Number(value.codigoZona),
          nombreZona: value.nombreZona,
          direccion: value.direccion,
          dificilAcceso: value.dificilAcceso === 'si',
          sinConectividad: value.sinConectividad === 'si',
          ubicacion: gps,
        });
        if (!r.ok) return setAviso({ tipo: 'error', texto: mensajeError(r.error) });
        await queryClient.invalidateQueries({ queryKey: ['recintos'] });
        router.replace({ pathname: '/provincial/recinto/[id]', params: { id: r.value.id } });
      } catch (e) {
        reportarInesperado(e, 'crear_recinto');
        setAviso({ tipo: 'error', texto: MENSAJE_INESPERADO });
      }
    },
  });

  const s = nuevoRecintoSchema.shape;
  return (
    <Pantalla volver>
      <Titulo>Nuevo recinto</Titulo>
      <Parrafo suave>Registre el recinto estando allí: la ubicación se toma con el GPS del teléfono, mejor al aire libre.</Parrafo>

      <form.Field name="parroquiaId" validators={{ onSubmit: ({ value }) => (value ? undefined : 'Elija la parroquia.') }}>
        {(f) => (
          <Opciones etiqueta="Parroquia" valor={f.state.value || undefined} onCambio={f.handleChange}
            opciones={(parroquias.data ?? []).map((p) => ({ valor: String(p.id), texto: p.nombre }))} errores={mensajesCampo(f.state.meta.errors)} />
        )}
      </form.Field>
      <form.Field name="codigo" validators={{ onChange: s.codigo }}>
        {(f) => <Campo etiqueta="Código del recinto (CNE)" value={f.state.value} onChangeText={f.handleChange} keyboardType="number-pad" errores={mensajesCampo(f.state.meta.errors)} />}
      </form.Field>
      <form.Field name="nombre" validators={{ onChange: s.nombre }}>
        {(f) => <Campo etiqueta="Nombre del recinto" value={f.state.value} onChangeText={f.handleChange} errores={mensajesCampo(f.state.meta.errors)} />}
      </form.Field>
      <form.Field name="codigoZona" validators={{ onChange: ({ value }) => (/^\d+$/.test(value) ? undefined : 'Escriba el código de zona (0 si no tiene).') }}>
        {(f) => <Campo etiqueta="Código de zona" value={f.state.value} onChangeText={f.handleChange} keyboardType="number-pad" errores={mensajesCampo(f.state.meta.errors)} />}
      </form.Field>
      <form.Field name="nombreZona">
        {(f) => <Campo etiqueta="Nombre de la zona (opcional)" value={f.state.value} onChangeText={f.handleChange} />}
      </form.Field>
      <form.Field name="direccion">
        {(f) => <Campo etiqueta="Dirección (opcional)" value={f.state.value} onChangeText={f.handleChange} />}
      </form.Field>
      <form.Field name="sinConectividad">
        {(f) => <Opciones etiqueta="¿Sin conectividad?" valor={f.state.value} onCambio={f.handleChange} opciones={SI_NO} />}
      </form.Field>
      <form.Field name="dificilAcceso">
        {(f) => <Opciones etiqueta="¿Difícil acceso?" valor={f.state.value} onCambio={f.handleChange} opciones={SI_NO} />}
      </form.Field>

      {gps ? (
        <Aviso tipo="exito" titulo="Ubicación lista">
          Margen del GPS: {Math.round(gps.precisionM)} m · {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
        </Aviso>
      ) : (
        <Parrafo suave>Necesitamos un margen de {PRECISION_MAXIMA_M} metros o menos. Al aire libre suele lograrse en pocos segundos.</Parrafo>
      )}
      <Boton
        titulo={gps ? 'Volver a tomar la ubicación' : 'Tomar ubicación del recinto'}
        variante="secundario"
        icono={LocateFixed}
        onPress={() => void tomarUbicacion()}
        cargando={leyendo}
      />

      {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}
      <form.Subscribe selector={(st) => st.isSubmitting}>
        {(enviando) => <Boton titulo="Guardar recinto" onPress={() => void form.handleSubmit()} cargando={enviando} deshabilitado={!gps} />}
      </form.Subscribe>
    </Pantalla>
  );
}

// ===========================================================================
// Provincial · Detalle de recinto: coordinador (F6) y juntas (F5)
// ===========================================================================
export function DetalleRecintoProvincial({ recintoId }: { recintoId: string }) {
  const casos = useCasosDeUso();
  const queryClient = useQueryClient();
  const recintos = useQuery({ queryKey: ['recintos'], queryFn: () => casos.listarRecintos.ejecutar() });
  const coordinaciones = useQuery({ queryKey: ['coordinaciones'], queryFn: () => casos.listarCoordinaciones.ejecutar() });
  const coordinadores = useQuery({ queryKey: ['coordinadores'], queryFn: () => casos.listarCoordinadores.ejecutar() });
  const mesas = useQuery({ queryKey: ['mesas', recintoId], queryFn: () => casos.listarMesasDeRecinto.ejecutar(recintoId) });
  const [aviso, setAviso] = useState<AvisoEstado>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  const recinto = recintos.data?.find((r) => r.id === recintoId);
  const actual = coordinaciones.data?.find((c) => c.recintoId === recintoId)?.coordinador;
  const libres = (coordinadores.data ?? []).filter((c) => !c.recintoId);

  const asignar = (id: string, nombre: string) =>
    setConfirmacion({
      titulo: 'Asignar coordinador',
      mensaje: `¿Asignar a ${nombre} como coordinador de este recinto?`,
      nota: actual ? `${actual.nombres} ${actual.apellidos} dejará de serlo.` : undefined,
      textoConfirmar: 'Asignar',
      alConfirmar: async () => {
        try {
          const r = await casos.asignarCoordinador.ejecutar(recintoId, id);
          setAviso(r.ok ? { tipo: 'exito', texto: `${nombre} es ahora el coordinador del recinto.` } : { tipo: 'error', texto: mensajeError(r.error) });
          if (r.ok) setEligiendo(false);
          await queryClient.invalidateQueries({ queryKey: ['coordinaciones'] });
          await queryClient.invalidateQueries({ queryKey: ['coordinadores'] });
        } catch (e) {
          reportarInesperado(e, 'asignar_coordinador');
          setAviso({ tipo: 'error', texto: MENSAJE_INESPERADO });
        }
      },
    });

  const form = useForm({
    defaultValues: { sexo: 'F', desde: '', hasta: '' },
    validators: {
      onSubmit: ({ value }) => {
        const r = rangoMesasSchema.safeParse({ sexo: value.sexo, desde: Number(value.desde) || 0, hasta: Number(value.hasta) || 0 });
        return r.success ? undefined : { fields: Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])) };
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setAviso(null);
      try {
        const r = await casos.agregarMesas.ejecutar(recintoId, { sexo: value.sexo as 'F' | 'M', desde: Number(value.desde), hasta: Number(value.hasta) });
        if (!r.ok) return setAviso({ tipo: 'error', texto: mensajeError(r.error) });
        setAviso({ tipo: 'exito', texto: `Se agregaron ${r.value.creadas} juntas.` });
        formApi.reset();
        await queryClient.invalidateQueries({ queryKey: ['mesas', recintoId] });
      } catch (e) {
        reportarInesperado(e, 'agregar_mesas');
        setAviso({ tipo: 'error', texto: MENSAJE_INESPERADO });
      }
    },
  });

  const total = mesas.data?.length ?? 0;
  const conVeedor = mesas.data?.filter((m) => m.veedor).length ?? 0;
  const femeninas = mesas.data?.filter((m) => m.sexo === 'F').length ?? 0;

  return (
    <Pantalla volver>
      <Titulo>{recinto?.nombre ?? 'Recinto'}</Titulo>
      {recinto ? (
        <Parrafo suave>
          Código {recinto.codigo}
          {recinto.direccion ? ` · ${recinto.direccion}` : ''}
        </Parrafo>
      ) : null}
      {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

      <Subtitulo>Coordinador</Subtitulo>
      <Parrafo>{actual ? `${actual.nombres} ${actual.apellidos} · ${actual.telefono}` : 'Sin asignar'}</Parrafo>
      {eligiendo ? (
        <>
          {libres.length === 0 ? (
            <Aviso tipo="info" titulo="No hay coordinadores disponibles">Puede crear uno con Crear cuenta, en el Inicio.</Aviso>
          ) : (
            libres.map((c) => (
              <Tarjeta key={c.id} etiqueta={`Asignar a ${c.nombres} ${c.apellidos}`} onPress={() => asignar(c.id, `${c.nombres} ${c.apellidos}`)}>
                <Parrafo>
                  {c.apellidos} {c.nombres}
                </Parrafo>
                <Parrafo suave>{c.telefono}</Parrafo>
              </Tarjeta>
            ))
          )}
          <Boton titulo="Cancelar" variante="secundario" onPress={() => setEligiendo(false)} />
        </>
      ) : (
        <Boton titulo={actual ? 'Cambiar coordinador' : 'Asignar coordinador'} onPress={() => setEligiendo(true)} />
      )}

      <Subtitulo>Mesas (juntas) de este recinto</Subtitulo>
      <Destacado titulo="Mesas (juntas) del recinto" valor={String(total)} detalle={`${femeninas} F · ${total - femeninas} M · ${conVeedor} con veedor`} />
      <form.Field name="sexo">
        {(f) => (
          <Opciones etiqueta="Agregar mesas (juntas) a este recinto: sexo de la junta" valor={f.state.value} onCambio={f.handleChange}
            opciones={[{ valor: 'F', texto: 'Femenino' }, { valor: 'M', texto: 'Masculino' }]} />
        )}
      </form.Field>
      <form.Field name="desde">
        {(f) => (
          <Campo
            etiqueta="Desde la junta número"
            value={f.state.value}
            onChangeText={f.handleChange}
            keyboardType="number-pad"
            ayuda="Ejemplo: Femenino, desde 1 hasta 5 crea las juntas 1F, 2F, 3F, 4F y 5F de este recinto."
            errores={mensajesCampo(f.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Field name="hasta">
        {(f) => (
          <Campo
            etiqueta="Hasta la junta número"
            value={f.state.value}
            onChangeText={f.handleChange}
            keyboardType="number-pad"
            ayuda="Las juntas que ya existen no se repiten. Cada junta tendrá después su propio veedor."
            errores={mensajesCampo(f.state.meta.errors)}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(st) => st.isSubmitting}>
        {(enviando) => <Boton titulo="Agregar mesas" onPress={() => void form.handleSubmit()} cargando={enviando} />}
      </form.Subscribe>
      <ModalConfirmacion datos={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </Pantalla>
  );
}

// ===========================================================================
// Coordinador de recinto · Mesas y veedores (F7, F8)
// ===========================================================================
function useRecintoPropio() {
  const { listarRecintos } = useCasosDeUso();
  const recintos = useQuery({ queryKey: ['recintos'], queryFn: () => listarRecintos.ejecutar() });
  return recintos.data?.[0];
}

export function MesasRecinto() {
  const { listarMesasDeRecinto } = useCasosDeUso();
  const recinto = useRecintoPropio();
  const mesas = useQuery({
    queryKey: ['mesas', recinto?.id],
    queryFn: () => listarMesasDeRecinto.ejecutar(recinto!.id),
    enabled: !!recinto,
  });
  const sinVeedor = mesas.data?.filter((m) => !m.veedor).length ?? 0;

  return (
    <Pantalla>
      <Titulo>Mesas y veedores</Titulo>
      {mesas.isPending ? <Cargando texto="Cargando mesas…" /> : null}
      {mesas.isError ? <Aviso tipo="error">{MENSAJE_INESPERADO}</Aviso> : null}
      {mesas.data ? (
        sinVeedor > 0 ? (
          <Aviso tipo="advertencia" titulo={sinVeedor === 1 ? '1 mesa sin veedor' : `${sinVeedor} mesas sin veedor`}>
            Asígneles un veedor antes de la jornada.
          </Aviso>
        ) : (
          <Aviso tipo="exito" titulo="¡Todas las mesas tienen veedor!" />
        )
      ) : null}
      {mesas.data?.map((m) => (
        <Tarjeta key={m.id} etiqueta={etiquetaMesa(m)} onPress={() => router.push({ pathname: '/recinto/mesa/[id]', params: { id: m.id } })}>
          <Parrafo>{etiquetaMesa(m)}</Parrafo>
          <Parrafo suave>{m.veedor ? `Veedor: ${m.veedor.nombres} ${m.veedor.apellidos} · ${m.veedor.telefono}` : 'Sin veedor: toque para asignar'}</Parrafo>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}

export function MesaRecinto({ mesaId }: { mesaId: string }) {
  const casos = useCasosDeUso();
  const queryClient = useQueryClient();
  const recinto = useRecintoPropio();
  const mesas = useQuery({
    queryKey: ['mesas', recinto?.id],
    queryFn: () => casos.listarMesasDeRecinto.ejecutar(recinto!.id),
    enabled: !!recinto,
  });
  const veedores = useQuery({
    queryKey: ['veedores-recinto', recinto?.id],
    queryFn: () => casos.listarVeedoresDeRecinto.ejecutar(recinto!.id),
    enabled: !!recinto,
  });
  const [aviso, setAviso] = useState<AvisoEstado>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const mesa: MesaConVeedor | undefined = mesas.data?.find((m) => m.id === mesaId);
  const libres = veedoresLibres(veedores.data ?? []);

  const elegir = (veedorId: string, nombre: string) => {
    if (!mesa) return;
    const anterior = mesa.veedor;
    setConfirmacion({
      titulo: anterior ? 'Reemplazar veedor' : 'Asignar veedor',
      mensaje: anterior
        ? `¿Reemplazar a ${anterior.nombres} ${anterior.apellidos} por ${nombre}?`
        : `¿Asignar a ${nombre} a la ${etiquetaMesa(mesa)}?`,
      nota: anterior ? `${anterior.nombres} perderá el acceso a la mesa de inmediato.` : undefined,
      textoConfirmar: anterior ? 'Reemplazar' : 'Asignar',
      peligro: !!anterior,
      alConfirmar: async () => {
        setAviso(null);
        try {
          const r = anterior
            ? await casos.reemplazarVeedor.ejecutar({ mesaId: mesa.id, nuevoVeedorId: veedorId })
            : await casos.asignarVeedor.ejecutar(mesa, veedorId);
          await queryClient.invalidateQueries({ queryKey: ['mesas', recinto?.id] });
          await queryClient.invalidateQueries({ queryKey: ['veedores-recinto', recinto?.id] });
          if (r.ok) router.back();
          else setAviso({ tipo: 'error', texto: mensajeError(r.error) });
        } catch (e) {
          reportarInesperado(e, 'asignar_veedor');
          setAviso({ tipo: 'error', texto: MENSAJE_INESPERADO });
        }
      },
    });
  };

  if (!mesa) {
    return (
      <Pantalla volver>
        {mesas.isPending ? <Cargando texto="Cargando…" /> : <Aviso tipo="error" titulo="No encontramos esta mesa">Vuelva atrás y elíjala otra vez.</Aviso>}
      </Pantalla>
    );
  }

  return (
    <Pantalla volver>
      <Titulo>{etiquetaMesa(mesa)}</Titulo>
      <Parrafo>{mesa.veedor ? `Veedor actual: ${mesa.veedor.nombres} ${mesa.veedor.apellidos} · ${mesa.veedor.telefono}` : 'Esta mesa no tiene veedor.'}</Parrafo>
      {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}
      <Subtitulo>{mesa.veedor ? 'Elija el veedor que lo reemplaza' : 'Elija un veedor libre de su recinto'}</Subtitulo>
      {veedores.isPending ? <Cargando texto="Cargando veedores…" /> : null}
      {veedores.data && libres.length === 0 ? (
        <Aviso tipo="info" titulo="Todos sus veedores ya tienen mesa">Puede registrar uno nuevo con Crear veedor, en el Inicio.</Aviso>
      ) : null}
      {libres.map((v) => (
        <Tarjeta key={v.id} etiqueta={`Elegir a ${v.nombres} ${v.apellidos}`} onPress={() => elegir(v.id, `${v.nombres} ${v.apellidos}`)}>
          <Parrafo>
            {v.apellidos} {v.nombres}
          </Parrafo>
          <Parrafo suave>{v.telefono}</Parrafo>
        </Tarjeta>
      ))}
      <ModalConfirmacion datos={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </Pantalla>
  );
}
