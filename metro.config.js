// Metro: configuración de Sentry (ids de depuración para los source maps de Hermes, ADR-18)
// envuelta por Uniwind (estilos con className, planUi.md).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withUniwindConfig } = require('uniwind/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
