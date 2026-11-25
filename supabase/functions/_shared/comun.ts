// Utilidades compartidas por las Edge Functions de gestión de cuentas.
// La llave secreta solo existe aquí (servidor). Nunca en la app (ADR-01).
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const PUBLICAS = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
const SECRETAS = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
const LLAVE_PUBLICA: string = PUBLICAS.default ?? Deno.env.get('SUPABASE_ANON_KEY')!;
const LLAVE_SECRETA: string = SECRETAS.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Cliente con privilegios de servidor (salta RLS). Solo para operaciones ya autorizadas. */
export const admin = createClient(URL_SUPABASE, LLAVE_SECRETA, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Claims = {
  sub: string;
  amr?: { method: string; timestamp: number }[];
  [k: string]: unknown;
};

export const responder = (status: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export const fallo = (status: number, codigo: string) => responder(status, { ok: false, codigo });

/** Verifica el JWT del usuario (firma y vigencia) y devuelve sus claims. */
export async function autenticar(req: Request): Promise<Claims | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return fallo(401, 'sin_sesion');
  const cliente = createClient(URL_SUPABASE, LLAVE_PUBLICA, { auth: { persistSession: false } });
  const { data, error } = await cliente.auth.getClaims(token);
  const claims = data?.claims as Claims | undefined;
  if (error || !claims?.sub) return fallo(401, 'sin_sesion');
  return claims;
}

export async function leerJson(req: Request): Promise<Record<string, unknown> | Response> {
  if (req.method !== 'POST') return fallo(405, 'metodo_no_permitido');
  try {
    const cuerpo = await req.json();
    return cuerpo && typeof cuerpo === 'object' ? cuerpo : fallo(400, 'validacion');
  } catch {
    return fallo(400, 'validacion');
  }
}

export const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/** D-26: mínimo 8 caracteres, con letras y números. Igual a src/domain/rules/clave.rules.ts */
export const claveValida = (clave: string) =>
  clave.length >= 8 && clave.length <= 72 && /\p{L}/u.test(clave) && /\d/.test(clave);

// Sin caracteres que se confunden al dictar (0/O, 1/l/I): pensado para personas mayores.
const LETRAS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITOS = '23456789';

/** Clave temporal de 10 caracteres con letras y números, generada con aleatoriedad criptográfica (D-15). */
export function generarClaveTemporal(): string {
  const alfabeto = LETRAS + DIGITOS;
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const clave = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
    if (claveValida(clave)) return clave;
  }
}
