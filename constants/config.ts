/**
 * Application Configuration
 * API endpoints, intervals, and system settings
 */

// TODO: Replace with actual PassioGO System ID discovered from ridebt.org
export const PASSIOGO_SYSTEM_ID = 'SYSTEM_ID_TBD';

export const API_ENDPOINTS = {
  PASSIOGO_BASE: 'https://passiogo.com/mapGetData.php',
  BT_CALENDAR: 'https://ridebt.org/index.php?option=com_zcalendar&...',
  BT_WEBSITE: 'https://ridebt.org',
};

// Data refresh intervals (in milliseconds)
export const REFRESH_INTERVALS = {
  VEHICLES: 15_000,        // Bus positions: 15 seconds
  ARRIVALS: 20_000,        // ETAs at stop: 20 seconds
  ROUTES: 3_600_000,       // Route list: 1 hour (cached for session)
  STOPS: 3_600_000,        // Stop list: 1 hour (cached for session)
  ALERTS: 300_000,         // Alerts: 5 minutes
  CALENDAR: 3_600_000,     // Service calendar: 1 hour (cached for session)
};

// Stale time thresholds (data older than this is considered stale)
export const STALE_TIMES = {
  VEHICLES: 10_000,        // 10 seconds
  ARRIVALS: 15_000,        // 15 seconds
  ROUTES: 600_000,         // 10 minutes
  STOPS: 600_000,          // 10 minutes
  ALERTS: 60_000,          // 1 minute
};

// Map settings
export const MAP_CONFIG = {
  INITIAL_LATITUDE: 37.2297,  // Blacksburg, VA (approx)
  INITIAL_LONGITUDE: -80.4139,
  INITIAL_ZOOM: 15,
  MARKER_ANIMATION_DURATION: 500,
};

// CORS handling
export const CORS_PROXY = null; // Set to proxy URL if PassioGO API fails with CORS
