/**
 * useBuses Hook
 * Manages live vehicle position fetching with TanStack Query
 */

import { useQuery } from '@tanstack/react-query';
import { fetchVehicles } from '@/services/api/passioGO';
import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { Bus } from '@/types/transit';

export function useBuses() {
  return useQuery({
    queryKey: ['buses'],
    queryFn: async (): Promise<Bus[]> => {
      // TODO: Implement transformation from PassioVehicle to Bus
      const data = await fetchVehicles();
      return data.map((vehicle) => ({
        id: vehicle.id,
        routeId: vehicle.routeID,
        routeName: vehicle.routeName,
        routeColor: '#666', // TODO: Get from route store
        heading: vehicle.heading,
        latitude: vehicle.lat,
        longitude: vehicle.lng,
        speed: vehicle.speed,
        lastUpdated: new Date(vehicle.updated * 1000),
      }));
    },
    refetchInterval: REFRESH_INTERVALS.VEHICLES,
    refetchIntervalInBackground: false,
    staleTime: STALE_TIMES.VEHICLES,
    retry: 2,
  });
}

/**
 * useBusPositions Hook
 * Smart hook that returns live data or falls back to predicted (Phase 2)
 */
export function useBusPositions() {
  const live = useBuses();

  // Check if data is stale (older than 1 minute)
  const isStale =
    live.dataUpdatedAt === undefined ||
    Date.now() - live.dataUpdatedAt > 60_000;

  if (live.isError || isStale) {
    // Phase 2: Return predicted positions
    // For now: return empty + show unavailable banner
    return {
      data: [],
      source: 'offline' as const,
      lastUpdate: live.dataUpdatedAt || null,
      isError: true,
    };
  }

  return {
    data: live.data || [],
    source: 'live' as const,
    lastUpdate: live.dataUpdatedAt || null,
    isError: false,
  };
}
