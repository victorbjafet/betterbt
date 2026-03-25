/**
 * useServiceLevel Hook
 * Fetches and manages current service level
 */

import { useQuery } from '@tanstack/react-query';
import { fetchServiceStatus } from '@/services/api/btCalendar';
import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { ServiceStatus } from '@/types/serviceLevel';

export function useServiceLevel() {
  return useQuery({
    queryKey: ['serviceLevel'],
    queryFn: fetchServiceStatus,
    staleTime: STALE_TIMES.ALERTS, // Same as alerts
    retry: 2,
  });
}
