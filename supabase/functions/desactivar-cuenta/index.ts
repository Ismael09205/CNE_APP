// F4 — Desactivación de cuenta (RF-02, ADR-02, D-28).
// activo = false corta el acceso a datos de inmediato (RLS); ban_duration impide
// volver a iniciar sesión o renovar el token.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { admin, autenticar, fallo, leerJson, responder, texto } from '../_shared/comun.ts';

const BLOQUEO = '876000h'; // ~100 años: hasta que un superior la reactive desde el servidor

Deno.serve(async (req) => {
  const claims = await autenticar(req);
  if (claims instanceof Response) return claims;
  const cuerpo = await leerJson(req);
  if (cuerpo instanceof Response) return cuerpo;

  const perfilId = texto(cuerpo.perfilId);
  const { data: permitido, error } = await admin.rpc('gestion_puede_administrar', {
    p_actor: claims.sub,
    p_objetivo: perfilId,
  });
  if (error) return fallo(error.code === '22P02' ? 400 : 500, error.code === '22P02' ? 'validacion' : 'error_servidor');
  if (!permitido) return fallo(403, 'sin_permiso');

  const { error: errorPerfil } = await admin.from('perfiles').update({ activo: false }).eq('id', perfilId);
  if (errorPerfil) return fallo(500, 'error_servidor');

  const { error: errorBan } = await admin.auth.admin.updateUserById(perfilId, { ban_duration: BLOQUEO });
  if (errorBan) return fallo(500, 'error_servidor');

  return responder(200, { ok: true });
});
