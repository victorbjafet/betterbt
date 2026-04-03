import { STALE_TIMES } from '@/constants/config';
import { fetchPatternPoints, fetchRoutePatterns } from '@/services/api/btApi';
import { RouteStopCycle, Stop } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

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

    // Keep the richer variant when duplicate labels exist.
    if (cycle.stops.length > existing.stops.length) {
      byLabel.set(cycle.label, cycle);
    }
  });

  return Array.from(byLabel.values());
};

export function useRouteStops(routeId?: string | null) {
  return useQuery({
    queryKey: ['route-stops', routeId],
    enabled: Boolean(routeId),
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
    queryFn: async (): Promise<RouteStopCycle[]> => {
      if (!routeId) return [];

      const patterns = await fetchRoutePatterns();
      const routePatterns = patterns.filter((pattern) => pattern.routeId === routeId);

      const pointLists = await Promise.all(
        routePatterns.map((pattern) => fetchPatternPoints(pattern.name))
      );

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
    },
  });
}
