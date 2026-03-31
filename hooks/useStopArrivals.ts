/**
 * useStopArrivals Hook
 * Fetches upcoming ETAs for a specific stop
 */

import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { fetchArrivals } from '@/services/api/btApi';
import { Arrival } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useStopArrivals(stopId: string) {
  return useQuery({
    queryKey: ['arrivals', stopId],
    queryFn: async (): Promise<Arrival[]> => {
      const data = await fetchArrivals(stopId);
      return data.map((arrival) => ({
        routeId: arrival.routeID,
        routeName: arrival.routeName,
        routeColor: '#666', // Default color until route metadata API is available
        stopId: arrival.stopID,
        arrivalTime: new Date(arrival.arrivalTime * 1000),
        minutesUntilArrival: Math.round(
          (arrival.arrivalTime * 1000 - Date.now()) / 60_000
        ),
        isScheduled: arrival.isScheduled,
        isLive: arrival.isLive,
        source: arrival.isLive ? 'live' : 'scheduled' as const,
      }));
    },
    enabled: !!stopId,
    refetchInterval: REFRESH_INTERVALS.ARRIVALS,
    refetchIntervalInBackground: false,
    staleTime: STALE_TIMES.ARRIVALS,
    retry: 2,
  });
}
