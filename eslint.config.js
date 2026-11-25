// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Regla de dependencias (Clean Architecture, PROJECT_SPEC §2.2):
//   presentation → application → domain ← infrastructure
//   src/main (composition root) es el único que conoce todas las capas.
const capa = (nombre) => [`@/${nombre}`, `@/${nombre}/**`, `**/${nombre}`, `**/${nombre}/**`];

const frameworks = [
  'react',
  'react/**',
  'react-native',
  'react-native/**',
  'react-native-*',
  'expo',
  'expo-*',
  'expo-*/**',
  '@expo/**',
  '@supabase/**',
  '@tanstack/**',
  '@react-native-community/**',
  '@sentry/**',
  'uniwind',
  'lucide-react-native',
  'victory-native',
  '@shopify/**',
  '@maplibre/**',
  '@expo-google-fonts/**',
];

const prohibir = (grupos) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: grupos.map(({ group, message }) => ({ group, message })),
    },
  ],
});

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/**'],
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: prohibir([
      { group: frameworks, message: 'domain no puede depender de frameworks (solo zod).' },
      {
        group: [...capa('application'), ...capa('infrastructure'), ...capa('presentation'), ...capa('main'), ...capa('app')],
        message: 'domain es el círculo interno: no importa capas externas.',
      },
    ]),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: prohibir([
      { group: frameworks, message: 'application no puede depender de frameworks.' },
      {
        group: [...capa('infrastructure'), ...capa('presentation'), ...capa('main'), ...capa('app')],
        message: 'application solo depende de domain.',
      },
    ]),
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}'],
    rules: prohibir([
      {
        group: [...capa('presentation'), ...capa('main'), ...capa('app')],
        message: 'infrastructure implementa puertos de domain/application; no conoce la UI.',
      },
    ]),
  },
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    rules: prohibir([
      {
        group: [...capa('infrastructure'), ...capa('main')],
        message: 'presentation llama casos de uso; nunca a Supabase/SQLite directamente.',
      },
    ]),
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: prohibir([
      {
        group: capa('infrastructure'),
        message: 'Las rutas no usan infrastructure; las dependencias se inyectan desde src/main.',
      },
    ]),
  },
]);
