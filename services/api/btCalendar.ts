/**
 * Blacksburg Transit Calendar Service
 *
 * Today's service level. When the active provider exposes a native service-level
 * source (the official BT4U provider derives it from GetScheduledRoutes), this
 * delegates to it. Otherwise (e.g. the legacy RideBT provider, which has no
 * calendar endpoint) it falls back to a safe default.
 */

import { transitApiProvider } from '@/services/api/btApi';
import { ServiceLevel, ServiceStatus } from '@/types/serviceLevel';

/**
 * Fetch today's service level. Called on app load (and refetched periodically).
 */
export const fetchServiceStatus = async (): Promise<ServiceStatus> => {
  try {
    if (transitApiProvider.fetchServiceStatus) {
      return await transitApiProvider.fetchServiceStatus();
    }

    // No provider-native source (legacy provider): default to full service.
    return {
      level: ServiceLevel.FULL_SERVICE,
      description: 'Full Service',
      notes: 'No service-level source for the active provider',
      effectiveDate: new Date(),
    };
  } catch (error) {
    console.error('Failed to fetch service status:', error);
    // Default to full service on error so the UI never blocks on this.
    return {
      level: ServiceLevel.FULL_SERVICE,
      description: 'Unknown (unavailable)',
      notes: 'Defaulting to full service',
      effectiveDate: new Date(),
    };
  }
};

/**
 * Check if there's service on a specific date
 */
export const hasServiceOnDate = async (date: Date): Promise<boolean> => {
  try {
    const status = await fetchServiceStatus();
    return status.level !== ServiceLevel.NO_SERVICE;
  } catch {
    return true; // Default to true on error
  }
};
