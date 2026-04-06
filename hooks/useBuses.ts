/**
 * useBuses Hook
 * Manages live vehicle position fetching with TanStack Query
 */

import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { getStaticRouteDisplayName } from '@/constants/staticTransitData';
import { fetchVehicles } from '@/services/api/btApi';
import { getBusColorKey, getBusColors, resolveBusColor } from '@/services/busColorRegistry';
import { Bus } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useBuses() {
  return useQuery({
    queryKey: ['buses'],
    queryFn: async (): Promise<Bus[]> => {
      const data = await fetchVehicles();

      const colorMap = await getBusColors();
      
      const buses = data.map((vehicle) => ({
        id: vehicle.id,
        routeId: vehicle.routeID,
        routeName:
          vehicle.routeName && vehicle.routeName !== vehicle.routeID
            ? vehicle.routeName
            : getStaticRouteDisplayName(vehicle.routeID),
        routeColor:
          colorMap[getBusColorKey(vehicle.routeName, vehicle.routeID)] ??
          resolveBusColor(vehicle.routeName, vehicle.routeID),
        heading: vehicle.heading,
        latitude: vehicle.lat,
        longitude: vehicle.lng,
        speed: vehicle.speed,
        lastUpdated: new Date(vehicle.updated * 1000),
        currentStopId: vehicle.stopID,
        capacity: vehicle.capacity,
        occupancyPercent: vehicle.percentOfCapacity,
        passengers: vehicle.passengers,
        isAtStop: vehicle.isBusAtStop,
      }));
      
      return buses;
    },
    refetchInterval: REFRESH_INTERVALS.VEHICLES,
    refetchIntervalInBackground: false,
    staleTime: STALE_TIMES.VEHICLES,
    retry: 1,
    meta: { priority: 'high' },
  });
}

/**
 * useBusPositions Hook
 * Smart hook that returns live data or falls back to predicted (Phase 2)
 */
export function useBusPositions() {
  const live = useBuses();

  if (live.isPending) {
    return {
      data: [],
      source: 'loading' as const,
      lastUpdate: null,
      isLoading: true,
      isFetching: live.isFetching,
      isError: false,
    };
  }

  // Check if data is stale (older than 1 minute)
  const isStale = live.dataUpdatedAt > 0 && Date.now() - live.dataUpdatedAt > 60_000;

  if (live.isError) {
    // Phase 2: Return predicted positions
    // For now: return empty + show unavailable banner
    return {
      data: [],
      source: 'offline' as const,
      lastUpdate: live.dataUpdatedAt || null,
      isLoading: false,
      isFetching: live.isFetching,
      isError: true,
    };
  }

  if (isStale) {
    return {
      data: live.data || [],
      source: 'offline' as const,
      lastUpdate: live.dataUpdatedAt || null,
      isLoading: false,
      isFetching: live.isFetching,
      isError: false,
    };
  }

  return {
    data: live.data || [],
    source: 'live' as const,
    lastUpdate: live.dataUpdatedAt || null,
    isLoading: false,
    isFetching: live.isFetching,
    isError: false,
  };
}
