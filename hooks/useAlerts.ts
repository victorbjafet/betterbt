/**
 * useAlerts Hook
 * Fetches current service alerts
 */

import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { fetchAlerts } from '@/services/api/btApi';
import { trackEvent } from '@/services/telemetry';
import { ServiceAlert } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async (): Promise<ServiceAlert[]> => {
      const start = Date.now();

      try {
        const data = await fetchAlerts();
        const result = data.map((alert) => ({
          id: alert.id,
          title: alert.title,
          message: alert.body,
          severity: alert.severity,
          affectedRoutes: alert.affectedRoutes,
          validFrom: new Date(alert.effectiveFrom * 1000),
          validUntil: new Date(alert.effectiveUntil * 1000),
        }));

        trackEvent('api.query.alerts.success', {
          durationMs: Date.now() - start,
          count: result.length,
        });

        return result;
      } catch (error) {
        trackEvent('api.query.alerts.failure', {
          durationMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    refetchInterval: REFRESH_INTERVALS.ALERTS,
    refetchIntervalInBackground: true,
    staleTime: STALE_TIMES.ALERTS,
    retry: 2,
  });
}
