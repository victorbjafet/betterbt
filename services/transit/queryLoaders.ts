import { fetchPatternPoints, fetchRoutePatterns, fetchRoutes } from '@/services/api/btApi';
import { Route, RouteStopCycle, Stop } from '@/types/transit';

const formatOriginLabel = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return 'Origin';

  return trimmed
    .replace(/\s+Bay\s+\d+$/i, '')
    .replace(/\s+Bay$/i, '')
    .replace(/\s+Platform\s+\d+$/i, '');
};

const buildCycleLabel = (patternName: string, stops: Stop[]): string => {
  const originStopName = stops[0]?.name?.trim();
  if (originStopName) {
    return `From ${formatOriginLabel(originStopName)}`;
  }

  const toMatch = patternName.match(/\bto\s+(.+)$/i);
  if (toMatch?.[1]) {
    return `To ${toMatch[1].trim()}`;
  }

  return patternName;
};

const collapseDuplicateLabels = (cycles: RouteStopCycle[]): RouteStopCycle[] => {
  const byLabel = new Map<string, RouteStopCycle>();

  cycles.forEach((cycle) => {
    const existing = byLabel.get(cycle.label);
    if (!existing) {
      byLabel.set(cycle.label, cycle);
      return;
    }

    if (cycle.stops.length > existing.stops.length) {
      byLabel.set(cycle.label, cycle);
    }
  });

  return Array.from(byLabel.values());
};

const normalizeStopCode = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const loadRoutes = async (): Promise<Route[]> => {
  const data = await fetchRoutes();

  return data.map((route) => ({
    id: route.id,
    name: route.name,
    shortName: route.shortName,
    color: route.color,
    textColor: route.textColor,
    isActive: route.isActive,
    stops: [],
    description: undefined,
  }));
};

export const loadRouteStops = async (routeId: string): Promise<RouteStopCycle[]> => {
  const patterns = await fetchRoutePatterns();
  const routePatterns = patterns.filter((pattern) => pattern.routeId === routeId);

  const pointLists = await Promise.all(routePatterns.map((pattern) => fetchPatternPoints(pattern.name)));

  const cycles = pointLists
    .map((points, index) => {
      const pattern = routePatterns[index];
      const stopById = new Map<string, Stop>();

      points.forEach((point) => {
        if (point.isBusStop !== 'Y') return;

        const latitude = Number(point.latitude);
        const longitude = Number(point.longitude);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;

        const stopId = point.stopCode?.trim() || `${routeId}-${pattern.name}-${point.patternPointName}`;
        if (stopById.has(stopId)) return;

        stopById.set(stopId, {
          id: stopId,
          code: point.stopCode?.trim() || undefined,
          name: point.patternPointName,
          latitude,
          longitude,
          routes: [routeId],
        });
      });

      const stops = Array.from(stopById.values());
      if (stops.length === 0) return null;

      return {
        id: `${routeId}-${pattern.name}`,
        routeId,
        patternName: pattern.name,
        label: buildCycleLabel(pattern.name, stops),
        stops,
      } satisfies RouteStopCycle;
    })
    .filter((cycle): cycle is RouteStopCycle => cycle !== null);

  return collapseDuplicateLabels(cycles);
};

export const loadStops = async (): Promise<Stop[]> => {
  const patterns = await fetchRoutePatterns();
  const pointLists = await Promise.all(patterns.map((pattern) => fetchPatternPoints(pattern.name)));
  const stopById = new Map<string, Stop>();

  pointLists.forEach((points, index) => {
    const pattern = patterns[index];

    points.forEach((point) => {
      if (point.isBusStop !== 'Y') return;

      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;

      const normalizedStopCode = normalizeStopCode(point.stopCode);
      const stopId = normalizedStopCode ?? `${pattern.routeId}-${point.patternPointName}`;
      const existing = stopById.get(stopId);

      if (existing) {
        if (!existing.routes.includes(pattern.routeId)) {
          existing.routes.push(pattern.routeId);
        }
        return;
      }

      stopById.set(stopId, {
        id: stopId,
        code: normalizedStopCode ?? undefined,
        name: point.patternPointName,
        latitude,
        longitude,
        routes: [pattern.routeId],
      });
    });
  });

  return Array.from(stopById.values()).sort((a, b) => {
    const aCode = a.code ?? a.id;
    const bCode = b.code ?? b.id;

    const aNumeric = Number(aCode);
    const bNumeric = Number(bCode);
    if (!Number.isNaN(aNumeric) && !Number.isNaN(bNumeric) && aNumeric !== bNumeric) {
      return aNumeric - bNumeric;
    }

    const codeDelta = aCode.localeCompare(bCode, undefined, { numeric: true });
    if (codeDelta !== 0) return codeDelta;

    return a.name.localeCompare(b.name);
  });
};
