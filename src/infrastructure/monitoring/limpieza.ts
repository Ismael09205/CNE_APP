// Privacidad en Sentry (ADR-18, PROJECT_SPEC §3 regla 10): antes de enviar un evento se
// borran la identidad de la persona y cualquier correo, cédula, teléfono o token que haya
// quedado en mensajes, rutas o datos extra. Funciones puras: se prueban sin Sentry.

const CORREO = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Cédula o teléfono ecuatoriano (10 dígitos) y cualquier número largo. */
const NUMERO_LARGO = /\b\d{9,13}\b/g;
/** JWT y llaves de Supabase. */
const TOKEN = /\b(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_(publishable|secret)_[\w-]+)\b/g;
/** Parámetros de URL firmadas o con token. */
const PARAMETRO_SENSIBLE = /([?&](token|apikey|access_token|refresh_token)=)[^&\s]+/gi;

export function ocultarDatosPersonales(texto: string): string {
  return texto
    .replace(TOKEN, '[token]')
    .replace(PARAMETRO_SENSIBLE, '$1[oculto]')
    .replace(CORREO, '[correo]')
    .replace(NUMERO_LARGO, '[número]');
}

/** Claves que nunca se envían, aunque estén vacías. */
const CLAVES_PROHIBIDAS = /^(cedula|correo|email|telefono|nombres|apellidos|clave|password|votos|votos_\w+|total_sufragantes|lat|lng)$/i;

export function limpiarValor(valor: unknown, profundidad = 0): unknown {
  if (typeof valor === 'string') return ocultarDatosPersonales(valor);
  if (profundidad > 5 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v) => limpiarValor(v, profundidad + 1));
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .filter(([k]) => !CLAVES_PROHIBIDAS.test(k))
      .map(([k, v]) => [k, limpiarValor(v, profundidad + 1)]),
  );
}

type EventoMinimo = {
  user?: Record<string, unknown>;
  request?: unknown;
  message?: string;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  exception?: { values?: { value?: string }[] };
};

/** Limpia un evento de Sentry: solo queda el rol como "usuario". */
export function limpiarEvento<T extends EventoMinimo>(evento: T): T {
  const rol = typeof evento.user?.rol === 'string' ? evento.user.rol : undefined;
  return {
    ...evento,
    user: rol ? { rol } : undefined,
    request: undefined,
    message: evento.message ? ocultarDatosPersonales(evento.message) : evento.message,
    extra: evento.extra ? (limpiarValor(evento.extra) as Record<string, unknown>) : undefined,
    contexts: evento.contexts ? (limpiarValor(evento.contexts) as Record<string, unknown>) : undefined,
    tags: evento.tags ? (limpiarValor(evento.tags) as Record<string, unknown>) : undefined,
    breadcrumbs: evento.breadcrumbs?.map(limpiarMiga),
    exception: evento.exception
      ? {
          ...evento.exception,
          values: evento.exception.values?.map((v) => ({ ...v, value: v.value ? ocultarDatosPersonales(v.value) : v.value })),
        }
      : undefined,
  };
}

export function limpiarMiga<T extends { message?: string; data?: Record<string, unknown> }>(miga: T): T {
  return {
    ...miga,
    message: miga.message ? ocultarDatosPersonales(miga.message) : miga.message,
    data: miga.data ? (limpiarValor(miga.data) as Record<string, unknown>) : miga.data,
  };
}
