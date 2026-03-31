/**
 * useAlerts Hook
 * Fetches current service alerts
 */

import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { fetchAlerts } from '@/services/api/btApi';
import { ServiceAlert } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async (): Promise<ServiceAlert[]> => {
      const data = await fetchAlerts();
      return data.map((alert) => ({
        id: alert.id,
        title: alert.title,
        message: alert.body,
        severity: alert.severity,
        affectedRoutes: alert.affectedRoutes,
        validFrom: new Date(alert.effectiveFrom * 1000),
        validUntil: new Date(alert.effectiveUntil * 1000),
      }));
    },
    refetchInterval: REFRESH_INTERVALS.ALERTS,
    refetchIntervalInBackground: true,
    staleTime: STALE_TIMES.ALERTS,
    retry: 2,
  });
}
