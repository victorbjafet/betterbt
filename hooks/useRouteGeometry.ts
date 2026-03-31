import { STALE_TIMES } from '@/constants/config';
import { fetchPatternPoints, fetchRoutePatterns } from '@/services/api/btApi';
import { RouteGeometryPath } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useRouteGeometry(routeId?: string | null, routeColor = '#2563EB') {
  return useQuery({
    queryKey: ['route-geometry', routeId],
    enabled: Boolean(routeId),
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
    queryFn: async (): Promise<RouteGeometryPath[]> => {
      if (!routeId) return [];

      const patterns = await fetchRoutePatterns();
      const routePatterns = patterns.filter((pattern) => pattern.routeId === routeId);

      const pointLists = await Promise.all(
        routePatterns.map((pattern) => fetchPatternPoints(pattern.name))
      );

      return routePatterns
        .map((pattern, index) => {
          const points = pointLists[index] || [];
          const coordinates = points
            .map((point) => ({
              latitude: Number(point.latitude),
              longitude: Number(point.longitude),
            }))
            .filter((point) => !Number.isNaN(point.latitude) && !Number.isNaN(point.longitude));

          return {
            id: `${routeId}-${pattern.name}`,
            routeId,
            patternName: pattern.name,
            color: routeColor,
            coordinates,
          } satisfies RouteGeometryPath;
        })
        .filter((path) => path.coordinates.length > 1);
    },
  });
}
