/**
 * useStopArrivals Hook
 * Fetches upcoming ETAs for a specific stop
 */

import { useQuery } from '@tanstack/react-query';
import { fetchArrivals } from '@/services/api/passioGO';
import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { Arrival } from '@/types/transit';

export function useStopArrivals(stopId: string) {
  return useQuery({
    queryKey: ['arrivals', stopId],
    queryFn: async (): Promise<Arrival[]> => {
      // TODO: Implement transformation from PassioArrival to Arrival
      const data = await fetchArrivals(stopId);
      return data.map((arrival) => ({
        routeId: arrival.routeID,
        routeName: arrival.routeName,
        routeColor: '#666', // TODO: Get from route store
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
