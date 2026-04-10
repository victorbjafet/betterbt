import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { TELEMETRY_CONFIG } from '@/constants/config';

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
const telemetryEndpoint = TELEMETRY_CONFIG.ENDPOINT;
const telemetryEnabled =
  Boolean(telemetryEndpoint) && (!isDev || TELEMETRY_CONFIG.ENABLE_IN_DEV);
const maxBatchSize = 20;
const flushDebounceMs = 4_000;
const maxRetryDelayMs = 60_000;
const heartbeatIntervalMs = 60_000;

const createSessionId = (): string => {
  const randomChunk = Math.random().toString(36).slice(2, 10);
  return `s_${Date.now().toString(36)}_${randomChunk}`;
};

const sessionId = createSessionId();
const sessionStartedAtMs = Date.now();

let queue: TelemetryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let retryAttempt = 0;
let hasInitialized = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function emit(event: TelemetryEvent) {
  if (isDev && !telemetryEnabled) {
    console.log('[telemetry]', event);
  }
}

const getSessionUptimeSeconds = () =>
  Math.max(0, Math.round((Date.now() - sessionStartedAtMs) / 1000));

const withDefaultPayload = (payload?: TelemetryPayload): TelemetryPayload => ({
  appVersion,
  platform: Platform.OS,
  platformVersion: String(Platform.Version ?? 'unknown'),
  sessionId,
  ...payload,
});

const enqueueEvent = (event: TelemetryEvent) => {
  queue.push(event);

  if (queue.length >= maxBatchSize) {
    void flushQueue();
    return;
  }

  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, flushDebounceMs);
};

const scheduleRetry = () => {
  if (retryTimer) return;

  const delay = Math.min(maxRetryDelayMs, 1000 * 2 ** Math.max(0, retryAttempt - 1));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue();
  }, delay);
};

const flushQueue = async () => {
  if (!telemetryEnabled || !telemetryEndpoint) return;
  if (isFlushing) return;
  if (queue.length === 0) return;

  isFlushing = true;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const batch = queue.slice(0, maxBatchSize);

  try {
    const response = await fetch(telemetryEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: batch,
      }),
    });

    if (!response.ok) {
      throw new Error(`Telemetry ingestion failed with HTTP ${response.status}`);
    }

    queue = queue.slice(batch.length);
    retryAttempt = 0;

    if (queue.length > 0) {
      void flushQueue();
    }
  } catch (error) {
    retryAttempt += 1;
    emit({
      event: 'telemetry.flush_failed',
      timestamp: new Date().toISOString(),
      payload: withDefaultPayload({
        error: error instanceof Error ? error.message : String(error),
        queuedEvents: queue.length,
        retryAttempt,
      }),
    });
    scheduleRetry();
  } finally {
    isFlushing = false;
  }
};

export async function flushTelemetry() {
  await flushQueue();
}

export function trackEvent(event: string, payload?: TelemetryPayload) {
  const telemetryEvent: TelemetryEvent = {
    event,
    timestamp: new Date().toISOString(),
    payload: withDefaultPayload(payload),
  };

  if (!telemetryEnabled) {
    emit(telemetryEvent);
    return;
  }

  enqueueEvent(telemetryEvent);
}

export function logError(code: string, error: unknown, context?: TelemetryPayload) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  trackEvent(`error.${code}`, {
    message,
    stack,
    ...context,
  });
}

export function trackScreenView(screen: string, payload?: TelemetryPayload) {
  trackEvent('screen.view', {
    screen,
    ...payload,
  });
}

export function initializeTelemetry() {
  if (hasInitialized) return;
  hasInitialized = true;

  trackEvent('app.session_started', {
    visitedAt: new Date(sessionStartedAtMs).toISOString(),
  });

  heartbeatTimer = setInterval(() => {
    trackEvent('app.session_heartbeat', {
      uptimeSeconds: getSessionUptimeSeconds(),
    });
  }, heartbeatIntervalMs);

  AppState.addEventListener('change', (nextState) => {
    trackEvent('app.lifecycle_state_changed', {
      state: nextState,
      uptimeSeconds: getSessionUptimeSeconds(),
    });

    if (nextState === 'background') {
      void flushTelemetry();
    }
  });

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('pagehide', () => {
      trackEvent('app.session_ended', {
        uptimeSeconds: getSessionUptimeSeconds(),
      });
      void flushTelemetry();
    });
  }
}