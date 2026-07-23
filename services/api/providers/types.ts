/**
 * Transit API Provider contract.
 *
 * Every provider (legacy reverse-engineered RideBT, or official BT4U) implements
 * this identical surface and returns the same normalized `Bt*` types. The
 * `btApi` facade delegates to whichever provider `API_PROVIDER` selects, so app
 * hooks/screens never know or care which backend is live.
 *
 * The core methods (mirroring the historical `btApi` exports) are required.
 * `capabilities` documents which optional/extended features a provider supports
 * so callers can degrade gracefully instead of relying on hard-coded knowledge.
 */

import { ApiProviderId } from '@/constants/config';
import {
  BtAlert,
  BtArrival,
  BtDeparture,
  BtNearestStop,
  BtPattern,
  BtPatternPoint,
  BtRoute,
  BtStop,
  BtVehicle,
} from '@/types/btApi';
import { ServiceStatus } from '@/types/serviceLevel';

export interface TransitApiProvider {
  /** Stable identifier for logging/telemetry/debug. */
  readonly id: ApiProviderId;

  // --- Core surface (kept 1:1 compatible with the original btApi exports) ---
  fetchVehicles(): Promise<BtVehicle[]>;
  fetchRoutes(): Promise<BtRoute[]>;
  fetchRoutePatterns(): Promise<BtPattern[]>;
  fetchPatternPoints(patternName: string): Promise<BtPatternPoint[]>;
  fetchNextDeparturesForStop(stopCode: string, numOfTrips?: number): Promise<BtDeparture[]>;
  fetchRouteTripsPageEmbeddedJson(routeShortName: string): Promise<Record<string, unknown>>;
  fetchStops(): Promise<BtStop[]>;
  fetchArrivals(stopId: string): Promise<BtArrival[]>;
  fetchAlerts(): Promise<BtAlert[]>;

  // --- Optional extended capabilities ---
  // Only providers whose backend natively supports these implement them. Callers
  // must feature-detect (`if (provider.fetchNearestStops) ...`) rather than assume.

  /** Stops nearest a coordinate, ordered by distance. */
  fetchNearestStops?(latitude: number, longitude: number, count?: number): Promise<BtNearestStop[]>;

  /** Today's service level, sourced from the backend rather than assumed. */
  fetchServiceStatus?(): Promise<ServiceStatus>;
}
