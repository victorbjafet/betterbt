/**
 * RideBT API Service
 * Wrapper around the Joomla AJAX endpoints used by ridebt.org.
 */

import { API_ENDPOINTS, CORS_PROXY } from '@/constants/config';
import { STATIC_ROUTES } from '@/constants/staticTransitData';
import { BtAlert, BtArrival, BtDeparture, BtPattern, BtPatternPoint, BtRoute, BtStop, BtVehicle } from '@/types/btApi';
import { Platform } from 'react-native';

const BASE = API_ENDPOINTS.BT_AJAX_BASE;

interface BtAjaxResponse<T> {
  success: boolean;
  message: string | null;
  messages: unknown;
  data: T;
}

interface BtProxyResponse<T> {
  data: T;
}

interface BtVehicleState {
  direction: string;
  speed: string;
  passengers?: string;
  isBusAtStop?: string;
  latitude: number;
  longitude: number;
  realtimeLatitude?: number;
  realtimeLongitude?: number;
  isProjected?: boolean;
  version?: number;
}

interface BtVehicleRaw {
  id: string;
  routeId: string;
  stopId?: string;
  capacity?: string;
  percentOfCapacity?: string;
  tripStartOn?: number;
  patternName?: string;
  states?: BtVehicleState[];
}

interface BtAlertRaw {
  id: string;
  title: string;
  message: string;
  startOn?: string;
  endOn?: string;
  effectTypeName?: string;
  causeTypeName?: string;
  affected?: string[] | string | null;
}

const normalizeEpochSeconds = (value: string | number | undefined): number => {
  if (value === undefined || value === null) return Math.floor(Date.now() / 1000);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return Math.floor(Date.now() / 1000);
  // API values are sometimes in ms and sometimes in seconds.
  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
};

const getUrlForMethod = (method: string) => {
  const url = new URL(BASE);
  url.searchParams.set('method', method);
  return url.toString();
};

const getUrlForMethodWithParams = (method: string, params?: Record<string, string | number>) => {
  const url = new URL(BASE);
  url.searchParams.set('method', method);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
};

const withProxyIfConfigured = (url: string): string => {
  if (!CORS_PROXY) return url;
  return `${CORS_PROXY}${url}`;
};

const postJson = async <T>(method: string): Promise<T> => {
  const targetUrl = getUrlForMethod(method);
  const url = Platform.OS === 'web'
    ? `${API_ENDPOINTS.BT_WEB_PROXY_BASE}${encodeURIComponent(targetUrl)}`
    : withProxyIfConfigured(targetUrl);

  console.log(`[btApi.${method}] Platform: ${Platform.OS}, URL: ${url.substring(0, 80)}...`);

  const response = await fetch(url, { method: Platform.OS === 'web' ? 'GET' : 'POST' });

  if (!response.ok) {
    console.error(`[btApi.${method}] HTTP ${response.status}`, response.statusText);
    throw new Error(`RideBT API ${method} failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BtAjaxResponse<T> | BtProxyResponse<T>;

  if ('success' in payload) {
    if (!payload.success) {
      console.error(`[btApi.${method}] API returned success=false`, payload.message);
      throw new Error(payload.message || `RideBT API ${method} returned success=false`);
    }
    console.log(`[btApi.${method}] ✓ Got data from direct API`);
    return payload.data;
  }

  console.log(`[btApi.${method}] ✓ Got data from proxy`);
  return payload.data;
};

const postJsonWithParams = async <T>(method: string, params: Record<string, string | number>): Promise<T> => {
  const targetUrl = getUrlForMethodWithParams(method, params);
  const url = Platform.OS === 'web'
    ? `${API_ENDPOINTS.BT_WEB_PROXY_BASE}${encodeURIComponent(targetUrl)}`
    : withProxyIfConfigured(targetUrl);

  console.log(`[btApi.${method}] Platform: ${Platform.OS}, URL: ${url.substring(0, 80)}...`);

  const response = await fetch(url, { method: Platform.OS === 'web' ? 'GET' : 'POST' });

  if (!response.ok) {
    console.error(`[btApi.${method}] HTTP ${response.status}`, response.statusText);
    throw new Error(`RideBT API ${method} failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BtAjaxResponse<T> | BtProxyResponse<T>;

  if ('success' in payload) {
    if (!payload.success) {
      console.error(`[btApi.${method}] API returned success=false`, payload.message);
      throw new Error(payload.message || `RideBT API ${method} returned success=false`);
    }
    console.log(`[btApi.${method}] ✓ Got data from direct API`);
    return payload.data;
  }

  console.log(`[btApi.${method}] ✓ Got data from proxy`);
  return payload.data;
};

const getSeverity = (alert: BtAlertRaw): BtAlert['severity'] => {
  const text = `${alert.effectTypeName || ''} ${alert.causeTypeName || ''} ${alert.title || ''}`.toLowerCase();
  if (text.includes('detour') || text.includes('closure') || text.includes('cancel')) return 'critical';
  if (text.includes('technical') || text.includes('delay') || text.includes('problem')) return 'warning';
  return 'info';
};

const normalizeNumeric = (value: string | number | undefined): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? undefined : numeric;
};

const normalizeBooleanFlag = (value: string | boolean | undefined): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'Y') return true;
  if (normalized === 'N') return false;
  return undefined;
};

/**
 * Fetch all active bus positions
 * Called every 15 seconds
 */
export const fetchVehicles = async (): Promise<BtVehicle[]> => {
  try {
    const vehicles = await postJson<BtVehicleRaw[]>('getBuses');

    return vehicles
      .map((vehicle) => {
        const state = vehicle.states?.[0];
        if (!state) return null;

        const lat = state.realtimeLatitude ?? state.latitude;
        const lng = state.realtimeLongitude ?? state.longitude;

        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        return {
          id: vehicle.id,
          routeID: vehicle.routeId,
          routeName: vehicle.patternName || vehicle.routeId,
          heading: Number(state.direction || 0),
          lat,
          lng,
          speed: Number(state.speed || 0),
          updated: normalizeEpochSeconds(state.version),
          stopID: vehicle.stopId,
          capacity: normalizeNumeric(vehicle.capacity),
          percentOfCapacity: normalizeNumeric(vehicle.percentOfCapacity),
          passengers: normalizeNumeric(state.passengers),
          isBusAtStop: normalizeBooleanFlag(state.isBusAtStop),
          tripStartOn: normalizeEpochSeconds(vehicle.tripStartOn),
        } satisfies BtVehicle;
      })
      .filter((vehicle): vehicle is BtVehicle => vehicle !== null);
  } catch (error) {
    console.error('Failed to fetch vehicles:', error);
    throw error;
  }
};

/**
 * Fetch all routes and their metadata
 * Called once on app load, cached for session
 */
export const fetchRoutes = async (): Promise<BtRoute[]> => {
  return STATIC_ROUTES;
};

/**
 * Fetch route patterns (pattern names keyed by route)
 */
export const fetchRoutePatterns = async (): Promise<BtPattern[]> => {
  return postJson<BtPattern[]>('getRoutePatterns');
};

/**
 * Fetch all geometry points for a specific pattern name
 */
export const fetchPatternPoints = async (patternName: string): Promise<BtPatternPoint[]> => {
  return postJsonWithParams<BtPatternPoint[]>('getPatternPoints', {
    patternName,
  });
};

/**
 * Fetch next departures for a stop code
 */
export const fetchNextDeparturesForStop = async (
  stopCode: string,
  numOfTrips = 3
): Promise<BtDeparture[]> => {
  return postJsonWithParams<BtDeparture[]>('getNextDeparturesForStop', {
    stopCode,
    numOfTrips,
  });
};

/**
 * Fetch all stops in the system
 * Called once on app load, cached for session
 */
export const fetchStops = async (): Promise<BtStop[]> => {
  // Stop metadata endpoint is not yet confirmed for this feed.
  // Return an empty list so callers can handle graceful loading.
  return [];
};

/**
 * Fetch upcoming arrivals for a specific stop
 * Called when user views a stop detail screen
 */
export const fetchArrivals = async (stopId: string): Promise<BtArrival[]> => {
  try {
    // Stop arrivals endpoint is not yet confirmed for this feed.
    // Return an empty list so callers can handle graceful loading.
    void stopId;
    return [];
  } catch (error) {
    console.error(`Failed to fetch arrivals for stop ${stopId}:`, error);
    throw error;
  }
};

/**
 * Fetch current service alerts
 * Called on app load and periodically (5 minute interval)
 */
export const fetchAlerts = async (): Promise<BtAlert[]> => {
  try {
    const alerts = await postJson<BtAlertRaw[]>('getActiveAlerts');

    return alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      body: alert.message,
      severity: getSeverity(alert),
      affectedRoutes:
        typeof alert.affected === 'string'
          ? [alert.affected]
          : alert.affected ?? undefined,
      effectiveFrom: normalizeEpochSeconds(alert.startOn),
      effectiveUntil: normalizeEpochSeconds(alert.endOn),
    }));
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    throw error;
  }
};
