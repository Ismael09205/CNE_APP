// Sube el token de Sentry a EAS como variable SECRETA del ambiente `preview`, para que la build
// en la nube pueda subir los source maps de Hermes (ADR-18). El token se lee de
// .env.sentry-build-plugin (ignorado por git) y nunca se imprime.
//
// Uso:  node scripts/subir-token-sentry.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ARCHIVO = '.env.sentry-build-plugin';

function salir(mensaje) {
  console.error(`✖ ${mensaje}`);
  process.exit(1);
}

let contenido;
try {
  contenido = readFileSync(ARCHIVO, 'utf8');
} catch {
  salir(`No se encontró ${ARCHIVO} en la carpeta del proyecto.`);
}

const token = contenido
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith('SENTRY_AUTH_TOKEN='))
  ?.split('=')
  .slice(1)
  .join('=')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/^﻿/, '')
  .trim();

if (!token) salir(`Pegue el token después de SENTRY_AUTH_TOKEN= en ${ARCHIVO}.`);
// sntrys_ = Organization Token · sntryu_ = Personal/User Auth Token (ambos sirven para source maps).
if (!/^sntry[su]_/.test(token)) {
  salir(
    `El token no parece de Sentry: empieza con «${token.slice(0, 7)}…» y debería empezar con sntrys_ o sntryu_. ` +
      '¿Pegó el DSN (https://…) o el código de handoff (sntryh_…)? Cree un token en Settings → Developer Settings → Organization Tokens.',
  );
}
if (/\s/.test(token)) salir('El token tiene espacios o saltos de línea en medio: péguelo en una sola línea.');

console.log('Subiendo SENTRY_AUTH_TOKEN a EAS (ambiente preview, visibilidad secreta)…');
const r = spawnSync(
  'npx',
  ['eas-cli@latest', 'env:set', '--environment', 'preview', '--name', 'SENTRY_AUTH_TOKEN', '--value', token, '--visibility', 'secret', '--non-interactive'],
  { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' },
);
if (r.status !== 0) salir('EAS no aceptó la variable. ¿Inició sesión con «npx eas-cli@latest login»?');
console.log('✔ Listo: el token quedó guardado en EAS como secreto. Avise al asistente para activar la subida de source maps.');
