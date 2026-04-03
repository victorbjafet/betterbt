import { STATIC_ROUTE_DEFINITIONS, STATIC_ROUTES } from '@/constants/staticTransitData';
import { BtAlert, BtArrival, BtDeparture, BtPattern, BtPatternPoint, BtRoute, BtStop, BtVehicle } from '@/types/btApi';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const asIsoAtOffsetMinutes = (offsetMinutes: number): string => {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const buildPatternPoints = (routeId: string, patternName: string): BtPatternPoint[] => {
  const seed = hashString(`${routeId}:${patternName}`);
  const latBase = 37.2297 + ((seed % 40) - 20) * 0.0005;
  const lngBase = -80.4139 + (((seed >> 4) % 40) - 20) * 0.0005;

  return Array.from({ length: 8 }, (_, index) => {
    const isBusStop = index % 2 === 0 ? 'Y' : 'N';
    const latitude = latBase + index * 0.0018;
    const longitude = lngBase + (index % 2 === 0 ? 1 : -1) * 0.0014;

    return {
      routeShortName: routeId,
      patternPointName:
        isBusStop === 'Y'
          ? `${routeId} Stop ${Math.floor(index / 2) + 1}`
          : `${routeId} Segment ${index + 1}`,
      isBusStop,
      isTimePoint: index % 4 === 0 ? 'Y' : 'N',
      stopCode: `${routeId}${100 + index}`,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    } satisfies BtPatternPoint;
  });
};

const ALL_PATTERNS: BtPattern[] = STATIC_ROUTE_DEFINITIONS.flatMap((route) =>
  route.patterns.map((patternName) => ({
    routeId: route.id,
    name: patternName,
    points: null,
  }))
);

const PATTERN_POINTS_BY_NAME = ALL_PATTERNS.reduce<Record<string, BtPatternPoint[]>>((acc, pattern) => {
  acc[pattern.name] = buildPatternPoints(pattern.routeId, pattern.name);
  return acc;
}, {});

const STOP_LOOKUP: BtStop[] = Object.values(PATTERN_POINTS_BY_NAME)
  .flat()
  .filter((point) => point.isBusStop === 'Y')
  .reduce<BtStop[]>((acc, point) => {
    const existing = acc.find((stop) => stop.id === point.stopCode);
    if (existing) return acc;

    acc.push({
      id: point.stopCode,
      code: point.stopCode,
      name: point.patternPointName,
      lat: Number(point.latitude),
      lng: Number(point.longitude),
    });

    return acc;
  }, []);

export const fetchVehicles = async (): Promise<BtVehicle[]> => {
  const baseTime = nowSeconds();

  return STATIC_ROUTES.slice(0, 8).map((route, index) => {
    const heading = (index * 42 + (baseTime % 360)) % 360;
    const lat = 37.22 + index * 0.008 + ((baseTime + index) % 10) * 0.0001;
    const lng = -80.43 + index * 0.006 + ((baseTime + index * 2) % 10) * 0.0001;

    return {
      id: `showcase-bus-${route.id}-${index + 1}`,
      routeID: route.id,
      routeName: route.name,
      heading,
      lat,
      lng,
      speed: 11 + (index % 5) * 2,
      updated: baseTime,
      stopID: `${route.id}${100 + index * 2}`,
      capacity: 40,
      percentOfCapacity: 25 + (index * 9) % 70,
      passengers: 8 + (index * 4) % 24,
      isBusAtStop: index % 3 === 0,
      tripStartOn: baseTime - 15 * 60,
    } satisfies BtVehicle;
  });
};

export const fetchRoutes = async (): Promise<BtRoute[]> => {
  return STATIC_ROUTES;
};

export const fetchRoutePatterns = async (): Promise<BtPattern[]> => {
  return ALL_PATTERNS;
};

export const fetchPatternPoints = async (patternName: string): Promise<BtPatternPoint[]> => {
  return PATTERN_POINTS_BY_NAME[patternName] ?? [];
};

export const fetchNextDeparturesForStop = async (
  stopCode: string,
  numOfTrips = 3
): Promise<BtDeparture[]> => {
  const count = Math.max(1, Math.min(numOfTrips, 30));

  return Array.from({ length: count }, (_, index) => {
    const route = STATIC_ROUTES[index % STATIC_ROUTES.length];
    const preferredPattern = STATIC_ROUTE_DEFINITIONS.find((candidate) => candidate.id === route.id)?.patterns[0] ?? route.id;

    return {
      routeShortName: route.shortName,
      patternName: preferredPattern,
      stopName: `Stop ${stopCode}`,
      adjustedDepartureTime: asIsoAtOffsetMinutes((index + 1) * 6),
    } satisfies BtDeparture;
  });
};

export const fetchRouteTripsPageEmbeddedJson = async (_routeShortName: string): Promise<Record<string, unknown>> => {
  return {
    ROUTE_SCHEDULES_BY_STOP: {},
  };
};

export const fetchStops = async (): Promise<BtStop[]> => {
  return STOP_LOOKUP;
};

export const fetchArrivals = async (stopId: string): Promise<BtArrival[]> => {
  return STATIC_ROUTES.slice(0, 4).map((route, index) => ({
    routeID: route.id,
    routeName: route.name,
    stopID: stopId,
    arrivalTime: nowSeconds() + (index + 1) * 5 * 60,
    isScheduled: true,
    isLive: index % 2 === 0,
  }));
};

export const fetchAlerts = async (): Promise<BtAlert[]> => {
  const current = nowSeconds();

  return [
    {
      id: 'showcase-alert-1',
      title: 'Demo: Minor Delay on CAS',
      body: 'Showcase mode is active. CAS trips may display a simulated 5-minute delay.',
      severity: 'warning',
      affectedRoutes: ['CAS'],
      effectiveFrom: current - 30 * 60,
      effectiveUntil: current + 2 * 60 * 60,
    },
    {
      id: 'showcase-alert-2',
      title: 'Demo: Weekend Explorer Service',
      body: 'Explorer routes are simulated at reduced frequency in showcase mode.',
      severity: 'info',
      affectedRoutes: ['BLU', 'GRN'],
      effectiveFrom: current - 60 * 60,
      effectiveUntil: current + 4 * 60 * 60,
    },
  ];
};