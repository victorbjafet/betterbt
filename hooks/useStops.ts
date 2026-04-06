/**
 * useStops Hook
 * Derives a global stop list from route patterns and pattern points.
 */

import { STALE_TIMES } from '@/constants/config';
import { loadStops } from '@/services/transit/queryLoaders';
import { Stop } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useStops() {
  return useQuery({
    queryKey: ['stops'],
    staleTime: STALE_TIMES.STOPS,
    retry: 2,
    queryFn: async (): Promise<Stop[]> => loadStops(),
    meta: { priority: 'high' },
  });
}
