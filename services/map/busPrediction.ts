import { Bus, RouteGeometryPath, Stop } from '@/types/transit';

interface Coordinate {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;
const SNAP_DISTANCE_METERS = 120;
const STOP_SLOWDOWN_RADIUS_METERS = 15.24; // 50 feet

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeHeading = (heading: number) => {
  if (!Number.isFinite(heading)) return 0;
  const normalized = heading % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const projectByHeading = (
  origin: Coordinate,
  headingDegrees: number,
  distanceMeters: number
): Coordinate => {
  if (distanceMeters <= 0) return origin;

  const heading = toRadians(normalizeHeading(headingDegrees));
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const lat1 = toRadians(origin.latitude);
  const lng1 = toRadians(origin.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(heading)
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(heading) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lng2 * 180) / Math.PI,
  };
};

export const distanceMeters = (a: Coordinate, b: Coordinate) => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
};

const nearestPointOnSegment = (
  point: Coordinate,
  segStart: Coordinate,
  segEnd: Coordinate
): Coordinate => {
  const midLatRad = toRadians((segStart.latitude + segEnd.latitude) / 2);
  const scaleX = METERS_PER_DEGREE_LAT * Math.cos(midLatRad);

  const startX = segStart.longitude * scaleX;
  const startY = segStart.latitude * METERS_PER_DEGREE_LAT;
  const endX = segEnd.longitude * scaleX;
  const endY = segEnd.latitude * METERS_PER_DEGREE_LAT;
  const pointX = point.longitude * scaleX;
  const pointY = point.latitude * METERS_PER_DEGREE_LAT;

  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) return segStart;

  const t = clamp(((pointX - startX) * dx + (pointY - startY) * dy) / lengthSq, 0, 1);

  const nearestX = startX + t * dx;
  const nearestY = startY + t * dy;

  return {
    latitude: nearestY / METERS_PER_DEGREE_LAT,
    longitude: nearestX / scaleX,
  };
};

const findNearestPathPoint = (
  point: Coordinate,
  routePaths: RouteGeometryPath[]
): { point: Coordinate; distance: number } | null => {
  let best: { point: Coordinate; distance: number } | null = null;

  routePaths.forEach((path) => {
    if (path.coordinates.length < 2) return;

    for (let index = 0; index < path.coordinates.length - 1; index += 1) {
      const segStart = path.coordinates[index];
      const segEnd = path.coordinates[index + 1];
      const nearest = nearestPointOnSegment(point, segStart, segEnd);
      const meters = distanceMeters(point, nearest);

      if (!best || meters < best.distance) {
        best = { point: nearest, distance: meters };
      }
    }
  });

  return best;
};

export const blendCoordinates = (from: Coordinate, to: Coordinate, factor: number): Coordinate => {
  const t = clamp(factor, 0, 1);
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  };
};

export const predictBusCoordinate = (
  bus: Bus,
  nowMs: number,
  routePaths: RouteGeometryPath[] = [],
  options?: {
    stops?: Stop[];
    horizonSeconds?: number;
  }
): Coordinate => {
  const fallbackElapsed = Math.max((nowMs - bus.lastUpdated.getTime()) / 1000, 0);
  const horizonSeconds = options?.horizonSeconds ?? fallbackElapsed;

  const nearestStopDistance = (options?.stops ?? []).reduce<number>((closest, stop) => {
    const meters = distanceMeters(
      { latitude: bus.latitude, longitude: bus.longitude },
      { latitude: stop.latitude, longitude: stop.longitude }
    );
    return Math.min(closest, meters);
  }, Infinity);

  const slowdownFactor =
    nearestStopDistance <= STOP_SLOWDOWN_RADIUS_METERS
      ? 0.25 + 0.75 * clamp(nearestStopDistance / STOP_SLOWDOWN_RADIUS_METERS, 0, 1)
      : 1;

  const speedMetersPerSecond = Math.max(bus.speed, 0) * 0.44704 * slowdownFactor;
  const distance = speedMetersPerSecond * horizonSeconds;

  let projected = projectByHeading(
    {
      latitude: bus.latitude,
      longitude: bus.longitude,
    },
    bus.heading,
    distance
  );

  if (routePaths.length > 0) {
    const nearest = findNearestPathPoint(projected, routePaths);
    if (nearest && nearest.distance <= SNAP_DISTANCE_METERS) {
      projected = blendCoordinates(projected, nearest.point, 0.65);
    }
  }

  return projected;
};

export const smoothCoordinate = (
  previous: Coordinate | null,
  target: Coordinate,
  alpha = 0.3
): Coordinate => {
  if (!previous) return target;
  return blendCoordinates(previous, target, alpha);
};

export const interpolateCoordinate = (
  start: Coordinate,
  end: Coordinate,
  progress: number
): Coordinate => blendCoordinates(start, end, progress);
