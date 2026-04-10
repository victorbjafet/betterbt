/**
 * useStops Hook
 * Derives a global stop list from route patterns and pattern points.
 */

import { STALE_TIMES } from '@/constants/config';
import { trackEvent } from '@/services/telemetry';
import { loadStops } from '@/services/transit/queryLoaders';
import { Stop } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useStops() {
  return useQuery({
    queryKey: ['stops'],
    staleTime: STALE_TIMES.STOPS,
    retry: 2,
    queryFn: async (): Promise<Stop[]> => {
      const start = Date.now();

      try {
        const result = await loadStops();
        trackEvent('api.query.stops.success', {
          durationMs: Date.now() - start,
          count: result.length,
        });
        return result;
      } catch (error) {
        trackEvent('api.query.stops.failure', {
          durationMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    meta: { priority: 'high' },
  });
}
