/**
 * useRoutes Hook
 * Fetches and manages all routes
 */

import { useQuery } from '@tanstack/react-query';
import { fetchRoutes } from '@/services/api/passioGO';
import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { Route } from '@/types/transit';

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: async (): Promise<Route[]> => {
      // TODO: Implement transformation from PassioRoute to Route
      const data = await fetchRoutes();
      return data.map((route) => ({
        id: route.id,
        name: route.name,
        shortName: route.shortName,
        color: route.color,
        textColor: route.textColor,
        isActive: route.isActive,
        stops: [], // Will be populated separately or from static data
        description: undefined,
      }));
    },
    staleTime: STALE_TIMES.ROUTES,
    retry: 2,
  });
}
