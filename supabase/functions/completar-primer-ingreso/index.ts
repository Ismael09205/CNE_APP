// F2 — Primer ingreso (RF-03, RF-05, ADR-03, ADR-05, D-25).
// Exige que la sesión venga de un código enviado al correo hace pocos minutos
// (claim `amr` con método otp/recovery): eso prueba que la persona controla su
// buzón. Entonces cambia la clave y libera la cuenta en una sola operación.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { admin, autenticar, claveValida, fallo, leerJson, responder, texto } from '../_shared/comun.ts';

const VENTANA_SEGUNDOS = 15 * 60; // D-27: el código vence en 15 minutos
const METODOS_CORREO = new Set(['otp', 'recovery', 'magiclink']);

Deno.serve(async (req) => {
  const claims = await autenticar(req);
  if (claims instanceof Response) return claims;
  const cuerpo = await leerJson(req);
  if (cuerpo instanceof Response) return cuerpo;

  const ahora = Math.floor(Date.now() / 1000);
  const validoCorreo = (claims.amr ?? []).some(
    (m) => METODOS_CORREO.has(m.method) && ahora - m.timestamp <= VENTANA_SEGUNDOS,
  );
  if (!validoCorreo) return fallo(403, 'codigo_requerido');

  const clave = texto(cuerpo.clave);
  if (!claveValida(clave)) return fallo(400, 'clave_debil');

  const { data: perfil, error } = await admin
    .from('perfiles')
    .select('activo, debe_cambiar_clave')
    .eq('id', claims.sub)
    .maybeSingle();
  if (error) return fallo(500, 'error_servidor');
  if (!perfil) return fallo(404, 'sin_perfil');
  if (!perfil.activo) return fallo(403, 'cuenta_inactiva');
  if (!perfil.debe_cambiar_clave) return fallo(409, 'no_requerido');

  const { error: errorClave } = await admin.auth.admin.updateUserById(claims.sub, { password: clave });
  if (errorClave) return fallo(errorClave.code === 'weak_password' ? 400 : 500, errorClave.code === 'weak_password' ? 'clave_debil' : 'error_servidor');

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .update({ debe_cambiar_clave: false, correo_verificado: true })
    .eq('id', claims.sub);
  if (errorPerfil) return fallo(500, 'error_servidor');

  return responder(200, { ok: true });
});
