import Constants from 'expo-constants';

type TelemetryPayload = Record<string, string | number | boolean | null | undefined>;

type TelemetryEvent = {
  event: string;
  timestamp: string;
  payload?: TelemetryPayload;
};

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const appVersion =
  Constants.expoConfig?.version ??
  Constants.manifest2?.extra?.expoClient?.version ??
  'unknown';

function emit(event: TelemetryEvent) {
  // In production this can be replaced with a network sink (Sentry, PostHog, etc.).
  if (isDev) {
    console.log('[telemetry]', event);
  }
}

export function trackEvent(event: string, payload?: TelemetryPayload) {
  emit({
    event,
    timestamp: new Date().toISOString(),
    payload: {
      appVersion,
      ...payload,
    },
  });
}

export function logError(code: string, error: unknown, context?: TelemetryPayload) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  emit({
    event: `error.${code}`,
    timestamp: new Date().toISOString(),
    payload: {
      appVersion,
      message,
      stack,
      ...context,
    },
  });
}