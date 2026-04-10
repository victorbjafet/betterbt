/**
 * useStopArrivals Hook
 * Fetches upcoming ETAs for a specific stop
 */

import { getRouteColor } from '@/constants/colors';
import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { getStaticRouteDisplayName } from '@/constants/staticTransitData';
import { fetchArrivals } from '@/services/api/btApi';
import { trackEvent } from '@/services/telemetry';
import { Arrival } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useStopArrivals(stopId: string) {
  return useQuery({
    queryKey: ['arrivals', stopId],
    queryFn: async (): Promise<Arrival[]> => {
      const start = Date.now();

      try {
        const data = await fetchArrivals(stopId);
        const result = data.map((arrival) => {
          const routeId = arrival.routeID;
          const routeNameFromApi = arrival.routeName?.trim() || '';
          const routeNameLooksLikeId = routeNameFromApi.toUpperCase() === routeId.toUpperCase();

          return {
            routeId,
            routeName: routeNameFromApi && !routeNameLooksLikeId
              ? routeNameFromApi
              : getStaticRouteDisplayName(routeId),
            routeColor: getRouteColor(routeId).bg,
            stopId: arrival.stopID,
            arrivalTime: new Date(arrival.arrivalTime * 1000),
            minutesUntilArrival: Math.round(
              (arrival.arrivalTime * 1000 - Date.now()) / 60_000
            ),
            isScheduled: arrival.isScheduled,
            isLive: arrival.isLive,
            source: arrival.isLive ? 'live' : 'scheduled' as const,
          };
        });

        trackEvent('api.query.arrivals.success', {
          stopId,
          durationMs: Date.now() - start,
          count: result.length,
        });

        return result;
      } catch (error) {
        trackEvent('api.query.arrivals.failure', {
          stopId,
          durationMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    enabled: !!stopId,
    refetchInterval: REFRESH_INTERVALS.ARRIVALS,
    refetchIntervalInBackground: false,
    staleTime: STALE_TIMES.ARRIVALS,
    retry: 2,
    meta: { priority: 'high' },
  });
}
