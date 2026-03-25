/**
 * PassioGO API Service
 * Wrapper for all PassioGO API calls
 * TODO: Replace with actual API calls once system ID is discovered
 */

import { PASSIOGO_SYSTEM_ID, API_ENDPOINTS, CORS_PROXY } from '@/constants/config';
import { PassioVehicle, PassioRoute, PassioStop, PassioArrival, PassioAlert } from '@/types/passioGO';

const BASE = API_ENDPOINTS.PASSIOGO_BASE;
const SYSTEM_ID = PASSIOGO_SYSTEM_ID;

/**
 * Fetch all active bus positions
 * Called every 15 seconds
 */
export const fetchVehicles = async (): Promise<PassioVehicle[]> => {
  try {
    const url = new URL(BASE);
    url.searchParams.append('systemID', SYSTEM_ID);
    url.searchParams.append('vehicles', '1');

    // Mock: Replace with actual fetch once API is confirmed
    console.log('Fetching vehicles from:', url.toString());
    
    // TODO: Implement actual fetch
    // const response = await fetch(url.toString());
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return response.json();

    // Return empty array for now
    return [];
  } catch (error) {
    console.error('Failed to fetch vehicles:', error);
    throw error;
  }
};

/**
 * Fetch all routes and their metadata
 * Called once on app load, cached for session
 */
export const fetchRoutes = async (): Promise<PassioRoute[]> => {
  try {
    const url = new URL(BASE);
    url.searchParams.append('systemID', SYSTEM_ID);
    url.searchParams.append('routeList', '1');

    console.log('Fetching routes from:', url.toString());

    // TODO: Implement actual fetch
    // const response = await fetch(url.toString());
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return response.json();

    return [];
  } catch (error) {
    console.error('Failed to fetch routes:', error);
    throw error;
  }
};

/**
 * Fetch all stops in the system
 * Called once on app load, cached for session
 */
export const fetchStops = async (): Promise<PassioStop[]> => {
  try {
    const url = new URL(BASE);
    url.searchParams.append('systemID', SYSTEM_ID);
    url.searchParams.append('stopList', '1');

    console.log('Fetching stops from:', url.toString());

    // TODO: Implement actual fetch
    // const response = await fetch(url.toString());
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return response.json();

    return [];
  } catch (error) {
    console.error('Failed to fetch stops:', error);
    throw error;
  }
};

/**
 * Fetch upcoming arrivals for a specific stop
 * Called when user views a stop detail screen
 */
export const fetchArrivals = async (stopId: string): Promise<PassioArrival[]> => {
  try {
    const url = new URL(BASE);
    url.searchParams.append('systemID', SYSTEM_ID);
    url.searchParams.append('arrivals', '1');
    url.searchParams.append('stopID', stopId);

    console.log('Fetching arrivals for stop', stopId, 'from:', url.toString());

    // TODO: Implement actual fetch
    // const response = await fetch(url.toString());
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return response.json();

    return [];
  } catch (error) {
    console.error(`Failed to fetch arrivals for stop ${stopId}:`, error);
    throw error;
  }
};

/**
 * Fetch current service alerts
 * Called on app load and periodically (5 minute interval)
 */
export const fetchAlerts = async (): Promise<PassioAlert[]> => {
  try {
    const url = new URL(BASE);
    url.searchParams.append('systemID', SYSTEM_ID);
    url.searchParams.append('alerts', '1');

    console.log('Fetching alerts from:', url.toString());

    // TODO: Implement actual fetch
    // const response = await fetch(url.toString());
    // if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // return response.json();

    return [];
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    throw error;
  }
};
