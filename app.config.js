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

  // Optional web sub-path base URL, for hosting under a repo sub-path such as
  // GitHub Pages project sites (https://<user>.github.io/<repo>/). Set
  // EXPO_BASE_URL=/betterbt for that; leave it unset when serving at a domain
  // root (custom domain, or a *.github.io user/org page). No effect on native.
  const explicitBaseUrl = process.env.EXPO_BASE_URL?.trim();
  const experiments = {
    ...(baseConfig.experiments ?? {}),
    ...(explicitBaseUrl ? { baseUrl: explicitBaseUrl } : {}),
  };

  return {
    ...baseConfig,
    plugins,
    experiments,
    extra: {
      ...(baseConfig.extra ?? {}),
      debugMockApiEnabled,
      debugMockApiFlagFile: DEBUG_FLAG_RELATIVE_PATH,
    },
  };
};