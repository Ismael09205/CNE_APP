// F3 asistida — el superior entrega un acceso nuevo (S-03, ADR-06, D-28).
// Nueva clave temporal y vuelve a exigir el cambio de clave en el próximo ingreso.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { admin, autenticar, fallo, generarClaveTemporal, leerJson, responder, texto } from '../_shared/comun.ts';

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

  // Primero se bloquea el acceso a datos (RLS), luego se cambia la clave.
  const { error: errorPerfil } = await admin.from('perfiles').update({ debe_cambiar_clave: true }).eq('id', perfilId);
  if (errorPerfil) return fallo(500, 'error_servidor');

  const claveTemporal = generarClaveTemporal();
  const { error: errorClave } = await admin.auth.admin.updateUserById(perfilId, { password: claveTemporal });
  if (errorClave) return fallo(500, 'error_servidor');

  return responder(200, { ok: true, claveTemporal });
});
