import { STALE_TIMES } from '@/constants/config';
import { fetchPatternPoints, fetchRoutePatterns } from '@/services/api/btApi';
import { Stop } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useRouteStops(routeId?: string | null) {
  return useQuery({
    queryKey: ['route-stops', routeId],
    enabled: Boolean(routeId),
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
    queryFn: async (): Promise<Stop[]> => {
      if (!routeId) return [];

      const patterns = await fetchRoutePatterns();
      const routePatterns = patterns.filter((pattern) => pattern.routeId === routeId);

      const pointLists = await Promise.all(
        routePatterns.map((pattern) => fetchPatternPoints(pattern.name))
      );

      const stopById = new Map<string, Stop>();

      pointLists.forEach((points) => {
        points.forEach((point) => {
          if (point.isBusStop !== 'Y') return;

          const latitude = Number(point.latitude);
          const longitude = Number(point.longitude);
          if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;

          const stopId = point.stopCode?.trim() || `${routeId}-${point.patternPointName}`;
          const existing = stopById.get(stopId);

          if (existing) {
            if (!existing.routes.includes(routeId)) {
              existing.routes.push(routeId);
            }
            return;
          }

          stopById.set(stopId, {
            id: stopId,
            code: point.stopCode?.trim() || undefined,
            name: point.patternPointName,
            latitude,
            longitude,
            routes: [routeId],
          });
        });
      });

      return Array.from(stopById.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
