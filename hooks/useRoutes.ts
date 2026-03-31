/**
 * useRoutes Hook
 * Fetches and manages all routes
 */

import { STALE_TIMES } from '@/constants/config';
import { fetchRoutes } from '@/services/api/btApi';
import { Route } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: async (): Promise<Route[]> => {
      // Transformation implemented; returns empty until route metadata API is confirmed
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
