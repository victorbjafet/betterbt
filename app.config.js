const fs = require('node:fs');
const path = require('node:path');
const appJson = require('./app.json');

const DEBUG_FLAG_RELATIVE_PATH = 'debug/mock-api.enabled';

module.exports = ({ config }) => {
  const baseConfig = appJson.expo ?? config ?? {};
  const debugFlagPath = path.join(__dirname, DEBUG_FLAG_RELATIVE_PATH);
  const debugMockApiEnabled = fs.existsSync(debugFlagPath);
  const existingPlugins = Array.isArray(baseConfig.plugins) ? baseConfig.plugins : [];
  const plugins = existingPlugins.includes('expo-secure-store')
    ? existingPlugins
    : [...existingPlugins, 'expo-secure-store'];

  return {
    ...baseConfig,
    plugins,
    extra: {
      ...(baseConfig.extra ?? {}),
      debugMockApiEnabled,
      debugMockApiFlagFile: DEBUG_FLAG_RELATIVE_PATH,
    },
  };
};