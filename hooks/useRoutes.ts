/**
 * useRoutes Hook
 * Fetches and manages all routes
 */

import { STALE_TIMES } from '@/constants/config';
import { loadRoutes } from '@/services/transit/queryLoaders';
import { Route } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: async (): Promise<Route[]> => loadRoutes(),
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
    meta: { priority: 'high' },
  });
}
