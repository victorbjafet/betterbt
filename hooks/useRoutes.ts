/**
 * useRoutes Hook
 * Fetches and manages all routes
 */

import { STALE_TIMES } from '@/constants/config';
import { trackEvent } from '@/services/telemetry';
import { loadRoutes } from '@/services/transit/queryLoaders';
import { Route } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: async (): Promise<Route[]> => {
      const start = Date.now();

      try {
        const result = await loadRoutes();
        trackEvent('api.query.routes.success', {
          durationMs: Date.now() - start,
          count: result.length,
        });
        return result;
      } catch (error) {
        trackEvent('api.query.routes.failure', {
          durationMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
    meta: { priority: 'high' },
  });
}
