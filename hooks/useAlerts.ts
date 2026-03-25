/**
 * useAlerts Hook
 * Fetches current service alerts
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAlerts } from '@/services/api/passioGO';
import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { ServiceAlert } from '@/types/transit';

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async (): Promise<ServiceAlert[]> => {
      // TODO: Implement transformation from PassioAlert to ServiceAlert
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
