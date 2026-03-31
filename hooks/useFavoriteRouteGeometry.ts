import { STALE_TIMES } from '@/constants/config';
import { fetchPatternPoints, fetchRoutePatterns } from '@/services/api/btApi';
import { RouteGeometryPath } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useFavoriteRouteGeometry(
  routeIds: string[],
  routeColorById: Record<string, string>
) {
  const normalizedRouteIds = Array.from(new Set(routeIds)).sort();

  return useQuery({
    queryKey: ['favorite-route-geometry', normalizedRouteIds],
    enabled: normalizedRouteIds.length > 0,
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
    queryFn: async (): Promise<RouteGeometryPath[]> => {
      if (normalizedRouteIds.length === 0) return [];

      const routeIdSet = new Set(normalizedRouteIds);
      const patterns = await fetchRoutePatterns();
      const favoritePatterns = patterns.filter((pattern) => routeIdSet.has(pattern.routeId));

      const pointLists = await Promise.all(
        favoritePatterns.map((pattern) => fetchPatternPoints(pattern.name))
      );

      return favoritePatterns
        .map((pattern, index) => {
          const points = pointLists[index] || [];
          const coordinates = points
            .map((point) => ({
              latitude: Number(point.latitude),
              longitude: Number(point.longitude),
            }))
            .filter((point) => !Number.isNaN(point.latitude) && !Number.isNaN(point.longitude));

          return {
            id: `${pattern.routeId}-${pattern.name}`,
            routeId: pattern.routeId,
            patternName: pattern.name,
            color: routeColorById[pattern.routeId] || '#2563EB',
            coordinates,
          } satisfies RouteGeometryPath;
        })
        .filter((path) => path.coordinates.length > 1);
    },
  });
}
