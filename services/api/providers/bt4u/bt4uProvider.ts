/**
 * Official BT4U provider.
 *
 * Backs the app's API layer with the official Blacksburg Transit BT4U ASMX web
 * service (https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx). It
 * returns the exact same normalized `Bt*` types as the legacy RideBT provider,
 * so it is a drop-in behind the `btApi` facade.
 *
 * See API_DOCUMENTATION.md for the full endpoint reference and response schemas.
 * Cycle-aligned timetables ARE supported here (via
 * GetArrivalAndDepartureTimesForRoutes, which carries TripID + Rank).
 *
 * Confirmed against live daytime data (2026-07-22, buses running): the
 * GetCurrentBusInfo row element is actually `LatestInfoTable` (the parser here
 * is depth-based and doesn't care about the row tag name, so this never
 * mattered), and it DOES include `Direction`/`Speed` plus a direct
 * `RouteShortName` and `StopCode` — no client-side heading derivation is
 * actually needed in the common case. The derivation below is kept only as a
 * defensive fallback for the rare row missing those fields.
 */

import { DEBUG_USE_MOCK_API } from '@/constants/debug';
import { STATIC_ROUTES, STATIC_ROUTE_DEFINITIONS } from '@/constants/staticTransitData';
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
import { ServiceLevel, ServiceStatus } from '@/types/serviceLevel';
import * as mockApi from '../../btApi.mock';
import { TransitApiProvider } from '../types';
import { bt4uRequest, formatServiceDate } from './bt4uClient';
import { pickField, XmlRow } from './xml';

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const normalizeKey = (value: string): string => value.trim().replace(/\s+/g, ' ').toUpperCase();

const ensureHex = (value?: string): string => {
  const normalized = (value ?? '').trim().replace('#', '');
  if (normalized.length !== 6) return '#666666';
  return `#${normalized.toUpperCase()}`;
};

const toNumber = (value: string | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? undefined : numeric;
};

const normalizeEpochSeconds = (value: string | number | undefined): number => {
  if (value === undefined || value === null || value === '') return Math.floor(Date.now() / 1000);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
  }
  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
};

// ---------------------------------------------------------------------------
// Route identity resolution
//
// The feed labels vehicles/departures with a full RouteName or a PatternName,
// not always the short route code the app keys on. We resolve to a short id
// using the route metadata the app already ships. This is normalization of
// live values, not a hard-coded endpoint or schedule.
// ---------------------------------------------------------------------------

const PATTERN_TO_ROUTE_ID: Record<string, string> = {};
const NAME_TO_ROUTE_ID: Record<string, string> = {};

for (const route of STATIC_ROUTE_DEFINITIONS) {
  NAME_TO_ROUTE_ID[normalizeKey(route.name)] = route.id;
  NAME_TO_ROUTE_ID[normalizeKey(route.shortName)] = route.id;
  for (const pattern of route.patterns) {
    PATTERN_TO_ROUTE_ID[normalizeKey(pattern)] = route.id;
  }
}

const deriveRouteId = (patternName?: string, routeName?: string): string => {
  const patternKey = patternName ? normalizeKey(patternName) : '';
  if (patternKey && PATTERN_TO_ROUTE_ID[patternKey]) return PATTERN_TO_ROUTE_ID[patternKey];

  const nameKey = routeName ? normalizeKey(routeName) : '';
  if (nameKey && NAME_TO_ROUTE_ID[nameKey]) return NAME_TO_ROUTE_ID[nameKey];

  // "HXP FR" -> "HXP": the first token is the short code for most routes.
  if (patternKey) {
    const firstToken = patternKey.split(' ')[0];
    if (firstToken) return firstToken;
  }
  return routeName?.trim() || patternName?.trim() || 'UNKNOWN';
};

// ---------------------------------------------------------------------------
// Heading/speed derivation
//
// GetCurrentBusInfo provides position but NOT heading or speed. We derive both
// from consecutive positions across polls (documented gap). Values persist for
// the session so a stationary bus keeps its last heading instead of snapping.
// ---------------------------------------------------------------------------

interface PositionSample {
  lat: number;
  lng: number;
  t: number;
  heading: number;
}

const positionCache = new Map<string, PositionSample>();
const EARTH_RADIUS_M = 6_371_000;
const MIN_MOVE_METERS = 5;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

const haversineMeters = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

const bearingDegrees = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// ---------------------------------------------------------------------------
// Severity (mirrors the legacy provider's rules for consistent UI)
// ---------------------------------------------------------------------------

const deriveSeverity = (row: XmlRow): BtAlert['severity'] => {
  const text = `${row.AlertEffectName ?? ''} ${row.AlertCauseName ?? ''} ${row.AlertTitle ?? ''}`.toLowerCase();
  if (text.includes('detour') || text.includes('closure') || text.includes('cancel')) return 'critical';
  if (text.includes('technical') || text.includes('delay') || text.includes('problem')) return 'warning';
  return 'info';
};

/** Splits the mixed "routes + trips + stops" CSV, keeping non-numeric route codes. */
const parseAffectedRoutes = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const routes = value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '' && !/^\d+$/.test(token));
  return routes.length > 0 ? routes : undefined;
};

/** Normalizes a possibly display-formatted departure time to an ISO string. */
const normalizeDepartureTime = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!Number.isNaN(Date.parse(trimmed))) return trimmed;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  }
  return trimmed;
};

// ---------------------------------------------------------------------------
// Core surface
// ---------------------------------------------------------------------------

const fetchVehicles = async (): Promise<BtVehicle[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchVehicles();

  const rows = await bt4uRequest('GetCurrentBusInfo');

  return rows
    .map((row): BtVehicle | null => {
      const id = pickField(row, 'AgencyVehicleName', 'VehicleName');
      const lat = toNumber(pickField(row, 'Latitude'));
      const lng = toNumber(pickField(row, 'Longitude'));
      if (!id || lat === undefined || lng === undefined) return null;

      const routeName = pickField(row, 'RouteName');
      const patternName = pickField(row, 'PatternName');
      // RouteShortName is present directly on live vehicle rows (confirmed
      // 2026-07-22) — prefer it over pattern/name-based derivation, which
      // remains only as a fallback for rows that omit it.
      const routeID = pickField(row, 'RouteShortName') || deriveRouteId(patternName, routeName);
      const updated = normalizeEpochSeconds(pickField(row, 'LatestEvent'));

      // Direction/Speed ARE present on live GetCurrentBusInfo rows (confirmed
      // 2026-07-22 with buses running: Direction=76, Speed=0). Prefer them;
      // derive from movement only as a fallback for a row that omits them.
      const explicitHeading = toNumber(pickField(row, 'Heading', 'Direction', 'Bearing'));
      const explicitSpeed = toNumber(pickField(row, 'Speed', 'GroundSpeed'));

      const previous = positionCache.get(id);
      let heading = explicitHeading ?? previous?.heading ?? 0;
      let speed = explicitSpeed ?? 0;
      if (explicitHeading === undefined && previous) {
        const distance = haversineMeters(previous.lat, previous.lng, lat, lng);
        if (distance > MIN_MOVE_METERS) {
          heading = bearingDegrees(previous.lat, previous.lng, lat, lng);
          const dt = updated - previous.t;
          if (explicitSpeed === undefined && dt > 0) speed = distance / dt; // meters/second
        }
      }
      positionCache.set(id, { lat, lng, t: updated, heading });

      const vehicle: BtVehicle = {
        id,
        routeID,
        routeName: routeName || patternName || routeID,
        heading,
        lat,
        lng,
        speed,
        updated,
      };

      const passengers = toNumber(pickField(row, 'TotalCount', 'PassengerLoad'));
      if (passengers !== undefined) vehicle.passengers = passengers;

      const occupancy = toNumber(pickField(row, 'PercentOfCapacity'));
      if (occupancy !== undefined) vehicle.percentOfCapacity = occupancy;

      const lastStopCode = pickField(row, 'LastStopCode', 'StopCode');
      if (lastStopCode) vehicle.stopID = lastStopCode;

      const isBusAtStopRaw = pickField(row, 'IsBusAtStop');
      if (isBusAtStopRaw === 'Y') vehicle.isBusAtStop = true;
      else if (isBusAtStopRaw === 'N') vehicle.isBusAtStop = false;

      return vehicle;
    })
    .filter((vehicle): vehicle is BtVehicle => vehicle !== null);
};

const mapRouteRow = (row: XmlRow): BtRoute | null => {
  const shortName = pickField(row, 'RouteShortName');
  if (!shortName) return null;
  return {
    id: shortName,
    name: pickField(row, 'RouteName') || shortName,
    shortName,
    color: ensureHex(pickField(row, 'RouteColor')),
    textColor: ensureHex(pickField(row, 'RouteTextColor')),
    isActive: true,
    type: pickField(row, 'ServiceLevel'),
  };
};

const fetchRoutes = async (): Promise<BtRoute[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchRoutes();

  try {
    // GetScheduledRoutes with an empty stopCode returns EVERY route scheduled for
    // the service date, with full metadata (colors, service level). This works
    // day or night — unlike GetCurrentRoutes, which only lists routes with buses
    // actively running and is empty overnight. STATIC_ROUTES is a last resort if
    // the network fails entirely.
    const rows = await bt4uRequest('GetScheduledRoutes', {
      stopCode: '',
      serviceDate: formatServiceDate(),
    });
    const routes = rows.map(mapRouteRow).filter((route): route is BtRoute => route !== null);
    return routes.length > 0 ? routes : STATIC_ROUTES;
  } catch {
    return STATIC_ROUTES;
  }
};

const fetchRoutePatterns = async (): Promise<BtPattern[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchRoutePatterns();

  const serviceDate = formatServiceDate();

  // GetPatternNamesForDate accepts an EMPTY routeShortName to return patterns
  // for every route in a single call (confirmed 2026-07-22) — no need to fan
  // out one request per known route. This matters beyond tidiness: firing ~20
  // parallel requests through a shared web CORS proxy is exactly the kind of
  // burst that gets a free public proxy rate-limited (observed against
  // cors.eu.org the same day), so collapsing this to one call meaningfully
  // reduces load on whatever proxy is fronting the web build.
  const rows = await bt4uRequest('GetPatternNamesForDate', { routeShortName: '', serviceDate });

  const seen = new Set<string>();
  const patterns: BtPattern[] = [];

  rows.forEach((row) => {
    const name = pickField(row, 'PatternName');
    if (!name) return;
    const routeId = pickField(row, 'RouteShortName') || deriveRouteId(name);
    const key = `${routeId}::${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    patterns.push({ routeId, name, points: null });
  });

  return patterns;
};

const fetchPatternPoints = async (patternName: string): Promise<BtPatternPoint[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchPatternPoints(patternName);

  const rows = await bt4uRequest('GetScheduledPatternPoints', { patternName });
  const routeShortName = deriveRouteId(patternName);

  return rows
    .map((row): BtPatternPoint | null => {
      const latitude = pickField(row, 'Latitude');
      const longitude = pickField(row, 'Longitude');
      if (latitude === undefined || longitude === undefined) return null;

      return {
        routeShortName,
        patternPointName: pickField(row, 'PatternPointName') ?? '',
        isBusStop: pickField(row, 'IsBusStop') === 'Y' ? 'Y' : 'N',
        isTimePoint: pickField(row, 'IsTimePoint') === 'Y' ? 'Y' : 'N',
        stopCode: pickField(row, 'StopCode') ?? '',
        latitude,
        longitude,
      };
    })
    .filter((point): point is BtPatternPoint => point !== null);
};

const fetchNextDeparturesForStop = async (
  stopCode: string,
  numOfTrips = 3
): Promise<BtDeparture[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchNextDeparturesForStop(stopCode, numOfTrips);

  const rows = await bt4uRequest('GetNextDeparturesForStop', {
    routeShortName: '',
    noOfTrips: numOfTrips,
    stopCode,
  });

  const departures: BtDeparture[] = [];

  rows.forEach((row) => {
    // Confirmed live shape (2026-07-22, buses running): one row per departure,
    // with RouteShortName + PatternName + StopName + a direct AdjustedDeparture-
    // Time (ISO datetime) — no CSV bundling. RouteShortName is read directly
    // rather than derived, since (unlike the classic LiveMap.aspx consumer this
    // was originally inferred from) it is present on the row.
    const routeShortName = pickField(row, 'RouteShortName') || deriveRouteId(pickField(row, 'PatternName'));
    const patternName = pickField(row, 'PatternName') || routeShortName;
    const stopName = pickField(row, 'StopName') ?? '';

    const directTime = pickField(row, 'AdjustedDepartureTime');
    if (directTime) {
      const adjustedDepartureTime = normalizeDepartureTime(directTime);
      if (adjustedDepartureTime) {
        departures.push({ routeShortName, patternName, stopName, adjustedDepartureTime });
      }
      return;
    }

    // Defensive fallback: some deployments/older calls may bundle multiple
    // departures into a single CSV of alternating time,tripNote pairs (this is
    // the shape the classic LiveMap.aspx JS parses for its own display).
    const csv = pickField(row, 'AdjustedDepartureTime_TripNotes');
    if (!csv) return;

    const parts = csv.split(',');
    for (let index = 0; index < parts.length; index += 2) {
      const rawTime = parts[index]?.trim();
      if (!rawTime) continue;
      const adjustedDepartureTime = normalizeDepartureTime(rawTime);
      if (!adjustedDepartureTime) continue;
      departures.push({ routeShortName, patternName, stopName, adjustedDepartureTime });
    }
  });

  return departures;
};

// Upper bound on trips to request for a full route timetable. GetArrivalAnd-
// DepartureTimesForRoutes returns upcoming trips for the service date; this cap
// is generous enough to cover a full service day.
const TIMETABLE_NO_OF_TRIPS = 500;

/**
 * Builds the same `ROUTE_SCHEDULES_BY_STOP` structure the timetable hook
 * consumes — but from the official GetArrivalAndDepartureTimesForRoutes feed
 * instead of scraping ridebt.org HTML. The feed carries TripID + Rank +
 * Calculated arrival/departure times, so cycle-aligned timetables are fully
 * supported (no HTML scraping, no fallback needed under normal service).
 */
const fetchRouteTripsPageEmbeddedJson = async (
  routeShortName: string
): Promise<Record<string, unknown>> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchRouteTripsPageEmbeddedJson(routeShortName);

  let rows: XmlRow[];
  try {
    rows = await bt4uRequest('GetArrivalAndDepartureTimesForRoutes', {
      routeShortNames: routeShortName,
      noOfTrips: TIMETABLE_NO_OF_TRIPS,
      serviceDate: formatServiceDate(),
    });
  } catch {
    // On failure the hook falls back to per-stop GetNextDeparturesForStop.
    return { ROUTE_SCHEDULES_BY_STOP: {} };
  }

  // Group DeparturesForRoute rows by stop code into the shape the timetable
  // hook expects (camelCase keys matching EmbeddedStopScheduleEntry).
  const byStop: Record<string, Record<string, string | undefined>[]> = {};
  for (const row of rows) {
    const stopCode = pickField(row, 'StopCode');
    if (!stopCode) continue;
    (byStop[stopCode] ??= []).push({
      blockId: pickField(row, 'BlockID'),
      tripId: pickField(row, 'TripID'),
      startTime: pickField(row, 'StartTime'),
      patternName: pickField(row, 'PatternName'),
      stopName: pickField(row, 'StopName'),
      stopCode,
      rank: pickField(row, 'Rank'),
      isTimePoint: pickField(row, 'IsTimePoint'),
      calculatedArrivalTime: pickField(row, 'CalculatedArrivalTime'),
      calculatedDepartureTime: pickField(row, 'CalculatedDepartureTime'),
      routeNotes: pickField(row, 'RouteNotes'),
    });
  }

  return { ROUTE_SCHEDULES_BY_STOP: byStop };
};

const mapStopInfoRow = (row: XmlRow): BtStop | null => {
  const code = pickField(row, 'StopCode');
  const lat = toNumber(pickField(row, 'Latitude'));
  const lng = toNumber(pickField(row, 'Longitude'));
  if (!code || lat === undefined || lng === undefined) return null;
  return {
    id: code,
    code,
    name: pickField(row, 'StopName') ?? code,
    lat,
    lng,
  };
};

const fetchStops = async (): Promise<BtStop[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchStops();

  const serviceDate = formatServiceDate();

  // GetScheduledStopInfo accepts an EMPTY routeShortName to return every
  // scheduled stop system-wide in one call (confirmed 2026-07-22, 284 stops) —
  // no per-route fan-out needed. See fetchRoutePatterns for why avoiding a
  // ~20-request burst matters for the shared web CORS proxy.
  const rows = await bt4uRequest('GetScheduledStopInfo', { routeShortName: '', serviceDate });

  const byCode = new Map<string, BtStop>();
  rows.forEach((row) => {
    const stop = mapStopInfoRow(row);
    if (stop && !byCode.has(stop.id)) byCode.set(stop.id, stop);
  });

  return Array.from(byCode.values());
};

const fetchArrivals = async (stopId: string): Promise<BtArrival[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchArrivals(stopId);

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
};

const fetchAlerts = async (): Promise<BtAlert[]> => {
  if (DEBUG_USE_MOCK_API) return mockApi.fetchAlerts();

  const rows = await bt4uRequest('GetActiveAlerts', {
    alertTypes: '',
    alertCauses: '',
    alertEffects: '',
  });

  return rows.map((row) => ({
    id: pickField(row, 'AlertID') ?? '',
    title: pickField(row, 'AlertTitle') ?? '',
    body: pickField(row, 'AlertMessage') ?? '',
    severity: deriveSeverity(row),
    affectedRoutes: parseAffectedRoutes(pickField(row, 'AffectedRoutesTripsStops')),
    effectiveFrom: normalizeEpochSeconds(pickField(row, 'StartDate')),
    effectiveUntil: normalizeEpochSeconds(pickField(row, 'EndDate')),
  }));
};

// ---------------------------------------------------------------------------
// Extended capabilities (official feed only; not part of the legacy surface)
// ---------------------------------------------------------------------------

const fetchNearestStops = async (
  latitude: number,
  longitude: number,
  count = 5
): Promise<BtNearestStop[]> => {
  const rows = await bt4uRequest('GetNearestStops', {
    latitude,
    longitude,
    noOfStops: count,
    serviceDate: formatServiceDate(),
  });

  return rows
    .map((row): BtNearestStop | null => {
      const stop = mapStopInfoRow(row);
      if (!stop) return null;
      return {
        stop,
        distanceFeet: toNumber(pickField(row, 'Feet')) ?? 0,
        distanceMiles: toNumber(pickField(row, 'Miles')) ?? 0,
      };
    })
    .filter((entry): entry is BtNearestStop => entry !== null);
};

// Maps a raw BT4U ServiceLevel string (e.g. "Reduced Service", "Regular
// Service") to the app's ServiceLevel enum. Matching is keyword-based so new
// wordings ("Game Day", "Holiday", etc.) degrade sensibly instead of throwing.
const mapServiceLevel = (raw: string): ServiceLevel => {
  const text = raw.toLowerCase();
  if (text.includes('no service') || text.includes('no-service')) return ServiceLevel.NO_SERVICE;
  if (text.includes('reduced')) return ServiceLevel.REDUCED_SERVICE;
  if (text.includes('game')) return ServiceLevel.GAME_DAY;
  if (text.includes('full') || text.includes('regular')) return ServiceLevel.FULL_SERVICE;
  return ServiceLevel.SPECIAL_SCHEDULE;
};

const fetchServiceStatus = async (): Promise<ServiceStatus> => {
  // Schedule-based (GetScheduledRoutes, empty stopCode) rather than the live-only
  // GetCurrentRoutes, so it reports the day's service level day OR night. Each
  // route carries its own ServiceLevel; on a given day these are usually uniform
  // but a few year-round routes can differ, so we report the dominant one.
  const rows = await bt4uRequest('GetScheduledRoutes', {
    stopCode: '',
    serviceDate: formatServiceDate(),
  });

  const levels = rows
    .map((row) => pickField(row, 'ServiceLevel')?.trim())
    .filter((value): value is string => Boolean(value));

  if (levels.length === 0) {
    // No scheduled routes today = genuinely no service (e.g. a holiday).
    return {
      level: ServiceLevel.NO_SERVICE,
      description: 'No service scheduled today',
      effectiveDate: new Date(),
    };
  }

  const counts = new Map<string, number>();
  for (const level of levels) counts.set(level, (counts.get(level) ?? 0) + 1);

  let dominantRaw = levels[0];
  let dominantCount = 0;
  for (const [level, count] of counts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantRaw = level;
    }
  }

  return {
    level: mapServiceLevel(dominantRaw),
    description: dominantRaw, // BT's own wording, e.g. "Reduced Service"
    notes: counts.size > 1 ? `${dominantCount}/${levels.length} routes` : undefined,
    effectiveDate: new Date(),
  };
};

export const bt4uProvider: TransitApiProvider = {
  id: 'bt4u',
  fetchVehicles,
  fetchRoutes,
  fetchRoutePatterns,
  fetchPatternPoints,
  fetchNextDeparturesForStop,
  fetchRouteTripsPageEmbeddedJson,
  fetchStops,
  fetchArrivals,
  fetchAlerts,
  fetchNearestStops,
  fetchServiceStatus,
};
