// F1 — Alta de cuenta por un superior (RF-01, RF-02, ADR-01, D-13, D-14, D-15).
// 1) Verifica el JWT del superior. 2) Valida permisos y duplicados en SQL.
// 3) Crea el usuario de Auth con clave temporal. 4) Crea perfil (+ recinto del
// veedor) en una transacción. Si 4 falla, borra el usuario creado en 3.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { admin, autenticar, fallo, generarClaveTemporal, leerJson, responder, texto } from '../_shared/comun.ts';

const normalizarNombre = (v: string) => v.normalize('NFC').trim().replace(/\s+/g, ' ');

Deno.serve(async (req) => {
  const claims = await autenticar(req);
  if (claims instanceof Response) return claims;
  const cuerpo = await leerJson(req);
  if (cuerpo instanceof Response) return cuerpo;

  const datos = {
    cedula: texto(cuerpo.cedula).trim(),
    nombres: normalizarNombre(texto(cuerpo.nombres)),
    apellidos: normalizarNombre(texto(cuerpo.apellidos)),
    telefono: texto(cuerpo.telefono).trim(),
    correo: texto(cuerpo.correo).trim().toLowerCase(),
    rol: texto(cuerpo.rol),
    recintoId: texto(cuerpo.recintoId) || null,
  };
  if (!datos.cedula || !datos.nombres || !datos.apellidos || !datos.telefono || !datos.correo) {
    return fallo(400, 'validacion');
  }

  const { data: motivo, error: errorValidacion } = await admin.rpc('gestion_validar_alta', {
    p_actor: claims.sub,
    p_rol: datos.rol,
    p_recinto: datos.recintoId,
    p_cedula: datos.cedula,
    p_correo: datos.correo,
  });
  if (errorValidacion) return fallo(errorValidacion.code === '22P02' ? 400 : 500, errorValidacion.code === '22P02' ? 'validacion' : 'error_servidor');
  if (motivo) return fallo(motivo === 'sin_permiso' ? 403 : 409, motivo);

  const claveTemporal = generarClaveTemporal();
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email: datos.correo,
    password: claveTemporal,
    email_confirm: true, // el correo se verifica en el primer ingreso con un código (D-25)
  });
  if (errorAuth || !creado.user) {
    return errorAuth?.code === 'email_exists' ? fallo(409, 'correo_duplicado') : fallo(500, 'error_servidor');
  }

  const { error: errorPerfil } = await admin.rpc('gestion_registrar_perfil', {
    p_id: creado.user.id,
    p_actor: claims.sub,
    p_cedula: datos.cedula,
    p_nombres: datos.nombres,
    p_apellidos: datos.apellidos,
    p_telefono: datos.telefono,
    p_correo: datos.correo,
    p_rol: datos.rol,
    p_recinto: datos.recintoId,
  });
  if (errorPerfil) {
    await admin.auth.admin.deleteUser(creado.user.id);
    if (errorPerfil.code === '23505') {
      return fallo(409, errorPerfil.message.includes('cedula') ? 'cedula_duplicada' : 'correo_duplicado');
    }
    if (errorPerfil.code === '23514') return fallo(400, errorPerfil.hint || 'validacion');
    return fallo(500, 'error_servidor');
  }

  // La clave temporal se devuelve una sola vez al superior; no se guarda en ningún lado.
  return responder(201, { ok: true, perfilId: creado.user.id, claveTemporal });
});
