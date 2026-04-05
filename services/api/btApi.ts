/**
 * RideBT API Service
 * Wrapper around the Joomla AJAX endpoints used by ridebt.org.
 */

import { API_ENDPOINTS, CORS_PROXY } from '@/constants/config';
import { DEBUG_MOCK_API_FLAG_FILE, DEBUG_USE_MOCK_API } from '@/constants/debug';
import { STATIC_ROUTES } from '@/constants/staticTransitData';
import { BtAlert, BtArrival, BtDeparture, BtPattern, BtPatternPoint, BtRoute, BtStop, BtVehicle } from '@/types/btApi';
import { Platform } from 'react-native';
import * as mockApi from './btApi.mock';
import { fetchTripsPageEmbeddedJson } from './routeScheduleHtml';

const BASE = API_ENDPOINTS.BT_AJAX_BASE;
const ROUTES_BASE = API_ENDPOINTS.BT_ROUTES_AJAX_BASE;

if (DEBUG_USE_MOCK_API) {
  console.info(
    `[btApi] Showcase mock mode active (enabled by ${DEBUG_MOCK_API_FLAG_FILE}). Live network requests are bypassed.`
  );
}

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

const getUrlForMethodWithParamsAtBase = (
  base: string,
  method: string,
  params?: Record<string, string | number>
) => {
  const url = new URL(base);
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

const postJsonFormWithParams = async <T>(
  base: string,
  method: string,
  params: Record<string, string | number>
): Promise<T> => {
  const targetUrl = getUrlForMethodWithParamsAtBase(base, method);

  if (Platform.OS === 'web') {
    // Prefer a POST-capable proxy for form-based AJAX methods (e.g., getNextDeparturesForStop).
    // The legacy GET proxy path often returns empty arrays for these methods.
    const formBody = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ).toString();

    const postProxyBase = API_ENDPOINTS.BT_WEB_POST_PROXY_BASE;
    if (postProxyBase) {
      const postProxyUrl = `${postProxyBase}${targetUrl}`;

      try {
        const postProxyResponse = await fetch(postProxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: formBody,
        });

        if (postProxyResponse.ok) {
          const postProxyPayload = (await postProxyResponse.json()) as BtAjaxResponse<T> | BtProxyResponse<T>;

          if ('success' in postProxyPayload) {
            if (!postProxyPayload.success) {
              throw new Error(postProxyPayload.message || `RideBT API ${method} returned success=false`);
            }
            return postProxyPayload.data;
          }

          return postProxyPayload.data;
        }
      } catch (postProxyError) {
        console.warn(`RideBT API ${method} web POST proxy failed, trying legacy GET proxy`, postProxyError);
      }
    }

    const getUrl = `${API_ENDPOINTS.BT_WEB_PROXY_BASE}${encodeURIComponent(
      getUrlForMethodWithParamsAtBase(base, method, params)
    )}`;
    const webResponse = await fetch(getUrl, { method: 'GET' });

    if (!webResponse.ok) {
      throw new Error(`RideBT API ${method} failed with HTTP ${webResponse.status}`);
    }

    const webPayload = (await webResponse.json()) as BtAjaxResponse<T> | BtProxyResponse<T>;
    if ('success' in webPayload) {
      if (!webPayload.success) {
        throw new Error(webPayload.message || `RideBT API ${method} returned success=false`);
      }
      return webPayload.data;
    }

    return webPayload.data;
  }

  const nativeUrl = withProxyIfConfigured(targetUrl);
  const formBody = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  ).toString();

  const response = await fetch(nativeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: formBody,
  });

  if (!response.ok) {
    throw new Error(`RideBT API ${method} failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as BtAjaxResponse<T> | BtProxyResponse<T>;
  if ('success' in payload) {
    if (!payload.success) {
      throw new Error(payload.message || `RideBT API ${method} returned success=false`);
    }
    return payload.data;
  }

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
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchVehicles();
  }

  try {
    const vehicles = await postJson<BtVehicleRaw[]>('getBuses');

    const normalizedVehicles = vehicles
      .map((vehicle): BtVehicle | null => {
        const state = vehicle.states?.[0];
        if (!state) return null;

        const lat = state.realtimeLatitude ?? state.latitude;
        const lng = state.realtimeLongitude ?? state.longitude;

        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        const normalized: BtVehicle = {
          id: vehicle.id,
          routeID: vehicle.routeId,
          routeName: vehicle.patternName || vehicle.routeId,
          heading: Number(state.direction || 0),
          lat,
          lng,
          speed: Number(state.speed || 0),
          updated: normalizeEpochSeconds(state.version),
        };

        if (vehicle.stopId) normalized.stopID = vehicle.stopId;

        const capacity = normalizeNumeric(vehicle.capacity);
        if (capacity !== undefined) normalized.capacity = capacity;

        const occupancy = normalizeNumeric(vehicle.percentOfCapacity);
        if (occupancy !== undefined) normalized.percentOfCapacity = occupancy;

        const passengers = normalizeNumeric(state.passengers);
        if (passengers !== undefined) normalized.passengers = passengers;

        const isBusAtStop = normalizeBooleanFlag(state.isBusAtStop);
        if (isBusAtStop !== undefined) normalized.isBusAtStop = isBusAtStop;

        const tripStartOn = normalizeEpochSeconds(vehicle.tripStartOn);
        if (tripStartOn !== undefined) normalized.tripStartOn = tripStartOn;

        return normalized;
      });

    return normalizedVehicles.filter((vehicle): vehicle is BtVehicle => vehicle !== null);
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
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchRoutes();
  }

  return STATIC_ROUTES;
};

/**
 * Fetch route patterns (pattern names keyed by route)
 */
export const fetchRoutePatterns = async (): Promise<BtPattern[]> => {
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchRoutePatterns();
  }

  return postJson<BtPattern[]>('getRoutePatterns');
};

/**
 * Fetch all geometry points for a specific pattern name
 */
export const fetchPatternPoints = async (patternName: string): Promise<BtPatternPoint[]> => {
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchPatternPoints(patternName);
  }

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
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchNextDeparturesForStop(stopCode, numOfTrips);
  }

  return postJsonFormWithParams<BtDeparture[]>(ROUTES_BASE, 'getNextDeparturesForStop', {
    stopCode,
    numOfTrips,
  });
};

export const fetchRouteTripsPageEmbeddedJson = async (routeShortName: string) => {
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchRouteTripsPageEmbeddedJson(routeShortName);
  }

  return fetchTripsPageEmbeddedJson(routeShortName);
};

/**
 * Fetch all stops in the system
 * Called once on app load, cached for session
 */
export const fetchStops = async (): Promise<BtStop[]> => {
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchStops();
  }

  // Stop metadata endpoint is not yet confirmed for this feed.
  // Return an empty list so callers can handle graceful loading.
  return [];
};

/**
 * Fetch upcoming arrivals for a specific stop
 * Called when user views a stop detail screen
 */
export const fetchArrivals = async (stopId: string): Promise<BtArrival[]> => {
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchArrivals(stopId);
  }

  try {
    const departures = await fetchNextDeparturesForStop(stopId, 10);

    return departures
      .map((departure): BtArrival | null => {
        const timestampMs = Date.parse(departure.adjustedDepartureTime);
        if (Number.isNaN(timestampMs)) return null;

        return {
          routeID: departure.routeShortName,
          routeName: departure.patternName || departure.routeShortName,
          stopID: stopId,
          arrivalTime: Math.floor(timestampMs / 1000),
          isScheduled: true,
          isLive: false,
        };
      })
      .filter((arrival): arrival is BtArrival => arrival !== null);
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
  if (DEBUG_USE_MOCK_API) {
    return mockApi.fetchAlerts();
  }

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
