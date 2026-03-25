/**
 * Blacksburg Transit Calendar Service
 * Parses service calendar from ridebt.org
 * TODO: Implement once calendar API/webpage is audited
 */

import { ServiceLevel, ServiceStatus } from '@/types/serviceLevel';
import { API_ENDPOINTS } from '@/constants/config';

/**
 * Fetch today's service level from BT calendar
 * Called once on app load
 */
export const fetchServiceStatus = async (): Promise<ServiceStatus> => {
  try {
    console.log('Fetching service status from:', API_ENDPOINTS.BT_CALENDAR);

    // TODO: Inspect ridebt.org network tab to find calendar API endpoint
    // and implement the fetch + parsing logic

    // For now, return full service as default
    return {
      level: ServiceLevel.FULL_SERVICE,
      description: 'Full service',
      notes: 'API not yet implemented',
      effectiveDate: new Date(),
    };
  } catch (error) {
    console.error('Failed to fetch service status:', error);
    // Default to full service on error
    return {
      level: ServiceLevel.FULL_SERVICE,
      description: 'Unknown (API unavailable)',
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
