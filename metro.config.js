// Metro con Uniwind (Tailwind CSS v4 para React Native), según planUi.md.
// withUniwindConfig debe ser el envoltorio más externo.
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
