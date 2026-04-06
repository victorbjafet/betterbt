import { STALE_TIMES } from '@/constants/config';
import { loadRouteStops } from '@/services/transit/queryLoaders';
import { RouteStopCycle } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useRouteStops(routeId?: string | null) {
  return useQuery({
    queryKey: ['route-stops', routeId],
    enabled: Boolean(routeId),
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
    queryFn: async (): Promise<RouteStopCycle[]> => {
      if (!routeId) return [];
      return loadRouteStops(routeId);
    },
    meta: { priority: 'high' },
  });
}
