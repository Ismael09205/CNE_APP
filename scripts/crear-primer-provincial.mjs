// Crea el PRIMER coordinador provincial (D-17). Nadie puede crearlo desde la app
// porque no tiene superior. Se ejecuta una sola vez, en la computadora del equipo.
//
// Requisitos:
//   - .env con EXPO_PUBLIC_SUPABASE_URL (ya existe).
//   - .env.local (ignorado por git) con SUPABASE_SECRET_KEY=sb_secret_...
//     Dashboard → Project Settings → API Keys → Secret keys. NUNCA en la app ni en git.
//
// Uso (PowerShell o bash, desde la raíz del proyecto):
//   node --env-file=.env --env-file=.env.local scripts/crear-primer-provincial.mjs \
//     --cedula 1700000000 --nombres "Nombre" --apellidos "Apellido" \
//     --telefono 0990000000 --correo persona@correo.com --provincia 10
//
// Imprime una clave temporal UNA sola vez. En el primer ingreso la app exige un
// código enviado al correo y una clave nueva (D-25).
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({
  options: {
    cedula: { type: 'string' },
    nombres: { type: 'string' },
    apellidos: { type: 'string' },
    telefono: { type: 'string' },
    correo: { type: 'string' },
    provincia: { type: 'string', default: '10' },
  },
});

const URL_SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRETA = process.env.SUPABASE_SECRET_KEY;
const salir = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
if (!URL_SUPABASE) salir('Falta EXPO_PUBLIC_SUPABASE_URL (.env).');
if (!SECRETA?.startsWith('sb_secret_')) salir('Falta SUPABASE_SECRET_KEY=sb_secret_... en .env.local.');
for (const campo of ['cedula', 'nombres', 'apellidos', 'telefono', 'correo']) {
  if (!a[campo]?.trim()) salir(`Falta --${campo}.`);
}

const nombre = (v) => v.normalize('NFC').trim().replace(/\s+/g, ' ');
const datos = {
  cedula: a.cedula.trim(),
  nombres: nombre(a.nombres),
  apellidos: nombre(a.apellidos),
  telefono: a.telefono.trim(),
  correo: a.correo.trim().toLowerCase(),
  provincia: Number(a.provincia),
};

// Misma política que las Edge Functions (D-15, D-26): 10 caracteres, letras y números, sin 0/O/1/l/I.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
function claveTemporal() {
  for (;;) {
    const c = Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    if (/[a-z]/.test(c) && /\d/.test(c)) return c;
  }
}

const cabeceras = { apikey: SECRETA, 'Content-Type': 'application/json' };
async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${URL_SUPABASE}${ruta}`, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const cuerpo = await r.text();
  return { ok: r.ok, status: r.status, cuerpo: cuerpo ? JSON.parse(cuerpo) : null };
}

const clave = claveTemporal();
const usuario = await pedir('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({ email: datos.correo, password: clave, email_confirm: true }),
});
if (!usuario.ok) salir(`No se creó el usuario de Auth (${usuario.status}): ${JSON.stringify(usuario.cuerpo)}`);
const id = usuario.cuerpo.id;

async function deshacer(motivo) {
  await pedir(`/rest/v1/perfiles?id=eq.${id}`, { method: 'DELETE' });
  await pedir(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  salir(motivo);
}

const perfil = await pedir('/rest/v1/perfiles', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    id,
    cedula: datos.cedula,
    nombres: datos.nombres,
    apellidos: datos.apellidos,
    telefono: datos.telefono,
    correo: datos.correo,
    rol: 'coordinador_provincial',
  }),
});
if (!perfil.ok) await deshacer(`Perfil rechazado por la base (${perfil.status}): ${perfil.cuerpo?.message ?? ''}`);

const jurisdiccion = await pedir('/rest/v1/coordinaciones_provinciales', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ coordinador_id: id, provincia_id: datos.provincia }),
});
if (!jurisdiccion.ok) await deshacer(`Jurisdicción rechazada (${jurisdiccion.status}): ${jurisdiccion.cuerpo?.message ?? ''}`);

console.log('✔ Coordinador provincial creado.');
console.log(`  Correo: ${datos.correo}`);
console.log(`  Clave temporal (se muestra UNA vez): ${clave}`);
console.log('  En el primer ingreso se pedirá un código enviado al correo y una clave nueva.');
