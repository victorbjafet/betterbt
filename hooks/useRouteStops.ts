import { STALE_TIMES } from '@/constants/config';
import { trackEvent } from '@/services/telemetry';
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

      const start = Date.now();

      try {
        const result = await loadRouteStops(routeId);
        trackEvent('api.query.route_stops.success', {
          routeId,
          durationMs: Date.now() - start,
          count: result.length,
        });
        return result;
      } catch (error) {
        trackEvent('api.query.route_stops.failure', {
          routeId,
          durationMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    meta: { priority: 'high' },
  });
}
