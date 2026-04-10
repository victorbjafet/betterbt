/**
 * Application Configuration
 * API endpoints, intervals, and system settings
 */

export const API_ENDPOINTS = {
  BT_AJAX_BASE: 'https://ridebt.org/index.php?option=com_ajax&module=bt_map&format=json&Itemid=101',
  BT_ROUTES_AJAX_BASE: 'https://ridebt.org/index.php?option=com_ajax&module=bt_routes&format=json&Itemid=134',
  BT_WEB_PROXY_BASE: 'https://api.codetabs.com/v1/proxy/?quest=',
  BT_WEB_POST_PROXY_BASE: 'https://cors.eu.org/',
  BT_CALENDAR: 'https://ridebt.org/index.php?option=com_zcalendar&...',
  BT_WEBSITE: 'https://ridebt.org',
};

// Version format: YYYY.MM.DD.N where N starts at 0 each day and increments per same-day release.
export const APP_VERSION_DATE = '2026.04.09.1';
export const APP_RELEASE_CHANNEL = 'alpha';
export const APP_VERSION_LABEL = `(${APP_RELEASE_CHANNEL}) ${APP_VERSION_DATE}`;

// Data refresh intervals (in milliseconds)
export const REFRESH_INTERVALS = {
  VEHICLES: 5_000,         // Bus positions: 5 seconds
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
export const CORS_PROXY = null; // Set to proxy URL if RideBT API fails with CORS

// Self-hosted telemetry is intentionally separate from RideBT API endpoints.
export const TELEMETRY_CONFIG = {
  ENDPOINT: process.env.EXPO_PUBLIC_TELEMETRY_ENDPOINT?.trim() || '',
  ENABLE_IN_DEV: false,
};