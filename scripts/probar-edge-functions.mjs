// Prueba de punta a punta de las Edge Functions con cada rol (PROJECT_SPEC §4.13).
// Crea personas de prueba temporales (@example.com), inicia sesión con cada una,
// llama a las funciones contra el proyecto real y al final BORRA todo lo creado.
// No envía correos: el código OTP se obtiene con admin.generate_link.
//
// Uso: node --env-file=.env --env-file=.env.local scripts/probar-edge-functions.mjs
import { randomUUID } from 'node:crypto';

const URL_SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PUBLICA = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const SECRETA = process.env.SUPABASE_SECRET_KEY;
if (!URL_SUPABASE || !PUBLICA || !SECRETA?.startsWith('sb_secret_')) {
  console.error('✖ Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY (.env) o SUPABASE_SECRET_KEY (.env.local).');
  process.exit(1);
}

const sufijo = randomUUID().slice(0, 8);
const creados = []; // ids de auth.users a borrar
const resultados = [];

async function http(ruta, { metodo = 'GET', llave = SECRETA, token, cuerpo, prefer } = {}) {
  const headers = { apikey: llave, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${URL_SUPABASE}${ruta}`, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }
  return { status: r.status, json };
}

const caso = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? '✔' : '✖'} ${nombre}${ok ? '' : `  → ${detalle}`}`);
};

// --- Datos base ------------------------------------------------------------
const recintos = (await http('/rest/v1/recintos?select=id,codigo&codigo=in.(989,1007)')).json;
const r1 = recintos.find((r) => r.codigo === '989').id;
const r2 = recintos.find((r) => r.codigo === '1007').id;

// Cédulas válidas (módulo 10) reservadas para pruebas; no corresponden a personas del sistema.
// Se generan (módulo 10) con prefijo 1001 para no quedarse sin cédulas al añadir casos.
function cedulaPrueba(n) {
  const base = `1001${String(n).padStart(5, '0')}`;
  const suma = [...base].reduce((s, d, i) => {
    const v = Number(d) * (i % 2 === 0 ? 2 : 1);
    return s + (v > 9 ? v - 9 : v);
  }, 0);
  return base + ((10 - (suma % 10)) % 10);
}
const CEDULAS = Array.from({ length: 40 }, (_, i) => cedulaPrueba(i + 1));
let siguienteCedula = 0;
const correo = (k) => `cne.prueba.${k}.${sufijo}@example.com`;
const CLAVE = `Prueba${sufijo}9`;

async function persona(k, rol, { temporal = false, provincia, recintoCoordinado, recintoVeedor, creadoPor } = {}) {
  const u = await http('/auth/v1/admin/users', { metodo: 'POST', cuerpo: { email: correo(k), password: CLAVE, email_confirm: true } });
  if (u.status >= 300) throw new Error(`createUser ${k}: ${JSON.stringify(u.json)}`);
  creados.push(u.json.id);
  const p = await http('/rest/v1/perfiles', {
    metodo: 'POST',
    prefer: 'return=minimal',
    cuerpo: {
      id: u.json.id,
      cedula: CEDULAS[siguienteCedula++],
      nombres: 'Prueba',
      apellidos: k.toUpperCase().replace(/[^A-Z]/g, 'X'),
      telefono: '0990000000',
      correo: correo(k),
      rol,
      debe_cambiar_clave: temporal,
      creado_por: creadoPor ?? null,
    },
  });
  if (p.status >= 300) throw new Error(`perfil ${k}: ${JSON.stringify(p.json)}`);
  if (provincia) await http('/rest/v1/coordinaciones_provinciales', { metodo: 'POST', prefer: 'return=minimal', cuerpo: { coordinador_id: u.json.id, provincia_id: provincia } });
  if (recintoCoordinado) await http('/rest/v1/coordinaciones_recinto', { metodo: 'POST', prefer: 'return=minimal', cuerpo: { recinto_id: recintoCoordinado, coordinador_id: u.json.id, asignado_por: creadoPor } });
  if (recintoVeedor) await http('/rest/v1/veedores_recinto', { metodo: 'POST', prefer: 'return=minimal', cuerpo: { veedor_id: u.json.id, recinto_id: recintoVeedor, registrado_por: creadoPor } });
  return u.json.id;
}

async function ingresar(k) {
  const r = await http('/auth/v1/token?grant_type=password', { metodo: 'POST', llave: PUBLICA, cuerpo: { email: correo(k), password: CLAVE } });
  return r.status === 200 ? r.json.access_token : null;
}

const funcion = (nombre, token, cuerpo) => http(`/functions/v1/${nombre}`, { metodo: 'POST', llave: PUBLICA, token, cuerpo });
const perfilDe = async (id) => (await http(`/rest/v1/perfiles?id=eq.${id}&select=activo,debe_cambiar_clave,correo_verificado`)).json[0];

try {
  // --- Escenario ----------------------------------------------------------
  const P = await persona('prov', 'coordinador_provincial', { provincia: 10 });
  const PT = await persona('provtemp', 'coordinador_provincial', { provincia: 10, temporal: true });
  const C1 = await persona('coord1', 'coordinador_recinto', { recintoCoordinado: r1, creadoPor: P });
  await persona('coord2', 'coordinador_recinto', { recintoCoordinado: r2, creadoPor: P });
  const V1 = await persona('veedor1', 'veedor', { recintoVeedor: r1, creadoPor: P });
  const V2 = await persona('veedor2', 'veedor', { recintoVeedor: r2, creadoPor: P });

  const tP = await ingresar('prov');
  const tPT = await ingresar('provtemp');
  const tC1 = await ingresar('coord1');
  const tV1 = await ingresar('veedor1');

  const nueva = (k, rol, recintoId) => ({
    cedula: CEDULAS[siguienteCedula++],
    nombres: 'Nueva',
    apellidos: 'Persona',
    telefono: '0981111111',
    correo: correo(k),
    rol,
    recintoId,
  });

  // --- crear-cuenta (F1, D-13) --------------------------------------------
  let r = await funcion('crear-cuenta', tP, nueva('n1', 'veedor', r1));
  caso('provincial crea un veedor en su jurisdicción', r.status === 201 && /^[a-z2-9]{10}$/.test(r.json?.claveTemporal ?? ''), JSON.stringify(r.json));
  if (r.json?.perfilId) creados.push(r.json.perfilId);
  const nuevoVeedor = r.json?.perfilId;
  if (nuevoVeedor) {
    const p = await perfilDe(nuevoVeedor);
    caso('…con clave temporal pendiente (debe_cambiar_clave = true)', p?.debe_cambiar_clave === true, JSON.stringify(p));
    const vr = (await http(`/rest/v1/veedores_recinto?veedor_id=eq.${nuevoVeedor}&select=recinto_id`)).json;
    caso('…y registrado en su recinto (veedores_recinto)', vr?.[0]?.recinto_id === r1, JSON.stringify(vr));
  }

  r = await funcion('crear-cuenta', tP, nueva('n2', 'coordinador_recinto', null));
  caso('provincial crea un coordinador de recinto (sin recinto, D-14)', r.status === 201, JSON.stringify(r.json));
  if (r.json?.perfilId) creados.push(r.json.perfilId);

  r = await funcion('crear-cuenta', tC1, nueva('n3', 'veedor', r1));
  caso('coordinador de recinto crea un veedor de su recinto', r.status === 201, JSON.stringify(r.json));
  if (r.json?.perfilId) creados.push(r.json.perfilId);

  r = await funcion('crear-cuenta', tC1, nueva('n4', 'veedor', r2));
  caso('coordinador de recinto NO crea veedores de otro recinto', r.status === 403 && r.json?.codigo === 'sin_permiso', JSON.stringify(r.json));

  r = await funcion('crear-cuenta', tC1, nueva('n5', 'coordinador_recinto', null));
  caso('coordinador de recinto NO crea coordinadores', r.status === 403, JSON.stringify(r.json));

  r = await funcion('crear-cuenta', tV1, nueva('n6', 'veedor', r1));
  caso('veedor NO crea cuentas', r.status === 403, JSON.stringify(r.json));

  r = await funcion('crear-cuenta', tPT, nueva('n7', 'veedor', r1));
  caso('provincial con clave temporal NO crea cuentas', r.status === 403, JSON.stringify(r.json));

  r = await funcion('crear-cuenta', tP, { ...nueva('n8', 'coordinador_provincial', null) });
  caso('nadie crea coordinadores provinciales desde la app', r.status === 403, JSON.stringify(r.json));

  r = await funcion('crear-cuenta', tP, { ...nueva('n9', 'veedor', r1), cedula: CEDULAS[0] });
  caso('cédula repetida → cedula_duplicada', r.status === 409 && r.json?.codigo === 'cedula_duplicada', JSON.stringify(r.json));

  r = await funcion('crear-cuenta', tP, { ...nueva('n10', 'veedor', r1), correo: correo('veedor1') });
  caso('correo repetido → correo_duplicado', r.status === 409 && r.json?.codigo === 'correo_duplicado', JSON.stringify(r.json));

  r = await funcion('crear-cuenta', tP, { ...nueva('n11', 'veedor', r1), cedula: '1710034064' });
  caso('cédula inválida la rechaza el CHECK de la base y no deja usuario huérfano', r.status === 400, JSON.stringify(r.json));
  const huerfano = (await http(`/rest/v1/perfiles?correo=eq.${encodeURIComponent(correo('n11'))}&select=id`)).json;
  caso('…sin perfil creado', Array.isArray(huerfano) && huerfano.length === 0, JSON.stringify(huerfano));

  // --- restablecer-clave (F3 asistida, D-28) ------------------------------
  r = await funcion('restablecer-clave', tC1, { perfilId: V2 });
  caso('coordinador NO restablece a un veedor de otro recinto', r.status === 403, JSON.stringify(r.json));
  r = await funcion('restablecer-clave', tC1, { perfilId: P });
  caso('coordinador NO restablece al provincial', r.status === 403, JSON.stringify(r.json));
  r = await funcion('restablecer-clave', tP, { perfilId: P });
  caso('nadie se restablece a sí mismo', r.status === 403, JSON.stringify(r.json));
  r = await funcion('restablecer-clave', tV1, { perfilId: V2 });
  caso('veedor NO restablece claves', r.status === 403, JSON.stringify(r.json));
  r = await funcion('restablecer-clave', tC1, { perfilId: V1 });
  caso('coordinador restablece a un veedor de su recinto', r.status === 200 && !!r.json?.claveTemporal, JSON.stringify(r.json));
  caso('…y vuelve a exigir el cambio de clave', (await perfilDe(V1))?.debe_cambiar_clave === true);
  const viejaSesion = await http('/auth/v1/token?grant_type=password', { metodo: 'POST', llave: PUBLICA, cuerpo: { email: correo('veedor1'), password: CLAVE } });
  caso('…la clave anterior ya no sirve', viejaSesion.status !== 200, String(viejaSesion.status));
  const conTemporal = await http('/auth/v1/token?grant_type=password', { metodo: 'POST', llave: PUBLICA, cuerpo: { email: correo('veedor1'), password: r.json?.claveTemporal } });
  caso('…la clave temporal sí sirve', conTemporal.status === 200, String(conTemporal.status));
  const tV1temp = conTemporal.json?.access_token;

  // --- completar-primer-ingreso (F2, D-25) --------------------------------
  r = await funcion('completar-primer-ingreso', tV1temp, { clave: 'NuevaClave2027' });
  caso('sin código de correo → codigo_requerido', r.status === 403 && r.json?.codigo === 'codigo_requerido', JSON.stringify(r.json));

  const enlace = await http('/auth/v1/admin/generate_link', { metodo: 'POST', cuerpo: { type: 'magiclink', email: correo('veedor1') } });
  const otp = enlace.json?.email_otp ?? enlace.json?.properties?.email_otp;
  const verificado = await http('/auth/v1/verify', { metodo: 'POST', llave: PUBLICA, cuerpo: { type: 'email', email: correo('veedor1'), token: otp } });
  caso('el código del correo abre una sesión con amr = otp', verificado.status === 200, JSON.stringify(verificado.json)?.slice(0, 200));
  const tOtp = verificado.json?.access_token;

  r = await funcion('completar-primer-ingreso', tOtp, { clave: 'corta1' });
  caso('clave débil → clave_debil', r.status === 400 && r.json?.codigo === 'clave_debil', JSON.stringify(r.json));
  r = await funcion('completar-primer-ingreso', tOtp, { clave: 'NuevaClave2027' });
  caso('código + clave nueva → cuenta liberada', r.status === 200, JSON.stringify(r.json));
  const pV1 = await perfilDe(V1);
  caso('…debe_cambiar_clave = false y correo_verificado = true', pV1?.debe_cambiar_clave === false && pV1?.correo_verificado === true, JSON.stringify(pV1));
  r = await funcion('completar-primer-ingreso', tOtp, { clave: 'OtraClave2027' });
  caso('…y no se puede repetir (no_requerido)', r.status === 409 && r.json?.codigo === 'no_requerido', JSON.stringify(r.json));

  // --- desactivar-cuenta (F4, D-28) ---------------------------------------
  r = await funcion('desactivar-cuenta', tV1, { perfilId: V2 });
  caso('veedor NO desactiva cuentas', r.status === 403, JSON.stringify(r.json));
  r = await funcion('desactivar-cuenta', tC1, { perfilId: V1 });
  caso('coordinador desactiva a un veedor de su recinto', r.status === 200, JSON.stringify(r.json));
  caso('…activo = false', (await perfilDe(V1))?.activo === false);
  const bloqueado = await http('/auth/v1/token?grant_type=password', { metodo: 'POST', llave: PUBLICA, cuerpo: { email: correo('veedor1'), password: 'NuevaClave2027' } });
  caso('…y ya no puede iniciar sesión (ban_duration)', bloqueado.status !== 200, `${bloqueado.status} ${JSON.stringify(bloqueado.json)?.slice(0, 120)}`);
  r = await funcion('desactivar-cuenta', tP, { perfilId: C1 });
  caso('provincial desactiva a un coordinador de su jurisdicción', r.status === 200, JSON.stringify(r.json));
  r = await funcion('crear-cuenta', tC1, nueva('n12', 'veedor', r1));
  caso('…y el coordinador desactivado ya no crea cuentas', r.status === 403 || r.status === 401, `${r.status} ${JSON.stringify(r.json)}`);
} catch (e) {
  caso('ejecución del escenario', false, e instanceof Error ? e.message : String(e));
} finally {
  // --- Limpieza -------------------------------------------------------------
  for (const id of creados) {
    for (const [tabla, col] of [
      ['asignaciones_mesa', 'veedor_id'],
      ['veedores_recinto', 'veedor_id'],
      ['veedores_recinto', 'registrado_por'],
      ['coordinaciones_recinto', 'coordinador_id'],
      ['coordinaciones_recinto', 'asignado_por'],
      ['coordinaciones_provinciales', 'coordinador_id'],
    ]) {
      await http(`/rest/v1/${tabla}?${col}=eq.${id}`, { metodo: 'DELETE' });
    }
  }
  for (const id of [...creados].reverse()) await http(`/rest/v1/perfiles?creado_por=eq.${id}`, { metodo: 'DELETE' });
  for (const id of creados) await http(`/rest/v1/perfiles?id=eq.${id}`, { metodo: 'DELETE' });
  for (const id of creados) await http(`/auth/v1/admin/users/${id}`, { metodo: 'DELETE' });
  const quedan = (await http(`/rest/v1/perfiles?correo=like.*${sufijo}*&select=id`)).json;
  caso('limpieza: no quedan personas de prueba', Array.isArray(quedan) && quedan.length === 0, JSON.stringify(quedan));

  const fallidas = resultados.filter((x) => !x.ok).length;
  console.log(`\n${resultados.length - fallidas} aprobadas, ${fallidas} fallidas`);
  process.exit(fallidas ? 1 : 0);
}
