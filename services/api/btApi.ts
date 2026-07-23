/**
 * Transit API facade.
 *
 * Public entry point for the app's transit data. It preserves the exact function
 * surface consumers have always imported (`fetchVehicles`, `fetchRoutes`, ...)
 * and delegates each call to the active provider selected by `API_PROVIDER`:
 *   - `bt4u`:  official Blacksburg Transit BT4U web service (default).
 *   - `ridebt`: legacy reverse-engineered RideBT endpoints.
 *
 * Both providers return identical normalized `Bt*` types, so nothing downstream
 * changes when the provider is swapped. See:
 *   - API_DOCUMENTATION.md          (official BT4U provider)
 *   - API_DOCUMENTATION_LEGACY.md   (legacy RideBT provider)
 */

import { API_PROVIDER } from '@/constants/config';
import { DEBUG_MOCK_API_FLAG_FILE, DEBUG_USE_MOCK_API } from '@/constants/debug';
import { BtAlert, BtArrival, BtDeparture, BtPattern, BtPatternPoint, BtRoute, BtStop, BtVehicle } from '@/types/btApi';
import { getTransitApiProvider } from './providers';

const provider = getTransitApiProvider();

console.info(`[btApi] Active transit provider: ${provider.id} (API_PROVIDER=${API_PROVIDER})`);

if (DEBUG_USE_MOCK_API) {
  console.info(
    `[btApi] Showcase mock mode active (enabled by ${DEBUG_MOCK_API_FLAG_FILE}). Live network requests are bypassed.`
  );
}

/** Fetch all active bus positions. Called on the live-vehicle refresh interval. */
export const fetchVehicles = (): Promise<BtVehicle[]> => provider.fetchVehicles();

/** Fetch all routes and their metadata. Cached for the session. */
export const fetchRoutes = (): Promise<BtRoute[]> => provider.fetchRoutes();

/** Fetch route patterns (pattern names keyed by route). */
export const fetchRoutePatterns = (): Promise<BtPattern[]> => provider.fetchRoutePatterns();

/** Fetch all geometry points for a specific pattern name. */
export const fetchPatternPoints = (patternName: string): Promise<BtPatternPoint[]> =>
  provider.fetchPatternPoints(patternName);

/** Fetch next departures for a stop code. */
export const fetchNextDeparturesForStop = (stopCode: string, numOfTrips = 3): Promise<BtDeparture[]> =>
  provider.fetchNextDeparturesForStop(stopCode, numOfTrips);

/** Fetch the trips-page embedded schedule JSON (used for cycle-aligned timetables). */
export const fetchRouteTripsPageEmbeddedJson = (routeShortName: string): Promise<Record<string, unknown>> =>
  provider.fetchRouteTripsPageEmbeddedJson(routeShortName);

/** Fetch all stops in the system. Cached for the session. */
export const fetchStops = (): Promise<BtStop[]> => provider.fetchStops();

/** Fetch upcoming arrivals for a specific stop. */
export const fetchArrivals = (stopId: string): Promise<BtArrival[]> => provider.fetchArrivals(stopId);

/** Fetch current service alerts. */
export const fetchAlerts = (): Promise<BtAlert[]> => provider.fetchAlerts();

// Advanced/extended capabilities (feature-detect on the provider):
//   provider.fetchNearestStops?.(lat, lng, count)
//   provider.fetchServiceStatus?.()
export { getTransitApiProvider } from './providers';
export const transitApiProvider = provider;
