import Constants from 'expo-constants';

interface DebugExtraConfig {
  debugMockApiEnabled?: boolean;
  debugMockApiFlagFile?: string;
}

const readDebugExtra = (): DebugExtraConfig => {
  const expoExtra = (Constants.expoConfig?.extra ?? {}) as DebugExtraConfig;
  const legacyExtra = (Constants.manifest?.extra ?? {}) as DebugExtraConfig;
  return {
    ...legacyExtra,
    ...expoExtra,
  };
};

const DEBUG_EXTRA = readDebugExtra();

export const DEBUG_USE_MOCK_API = Boolean(DEBUG_EXTRA.debugMockApiEnabled);
export const DEBUG_MOCK_API_FLAG_FILE = DEBUG_EXTRA.debugMockApiFlagFile ?? 'debug/mock-api.enabled';