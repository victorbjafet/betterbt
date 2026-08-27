/**
 * Application Configuration
 * API endpoints, intervals, and system settings
 */

// Optional self-hosted BT4U web proxy (e.g. a Cloudflare Worker). When set, it
// is used as the primary web proxy. A trailing slash is enforced so the target
// URL appends cleanly (`<proxy>/<full BT4U url>`).
const rawSelfHostedProxy = process.env.EXPO_PUBLIC_BT4U_PROXY?.trim();
const SELF_HOSTED_BT4U_PROXY = rawSelfHostedProxy
  ? rawSelfHostedProxy.endsWith("/")
    ? rawSelfHostedProxy
    : `${rawSelfHostedProxy}/`
  : undefined;

export const API_ENDPOINTS = {
  // --- Legacy reverse-engineered RideBT (Joomla AJAX) endpoints ---
  // Used by the `ridebt` provider. See API_DOCUMENTATION_LEGACY.md.
  BT_AJAX_BASE:
    "https://ridebt.org/index.php?option=com_ajax&module=bt_map&format=json&Itemid=101",
  BT_ROUTES_AJAX_BASE:
    "https://ridebt.org/index.php?option=com_ajax&module=bt_routes&format=json&Itemid=134",
  BT_WEB_PROXY_BASE: "https://api.codetabs.com/v1/proxy/?quest=",
  BT_WEB_POST_PROXY_BASE: "https://cors.eu.org/",
  BT_CALENDAR: "https://ridebt.org/index.php?option=com_zcalendar&...",
  BT_WEBSITE: "https://ridebt.org",

  // --- Official Blacksburg Transit BT4U web service ---
  // Used by the `bt4u` provider. All operations are simple HTTP GET requests
  // that return ADO.NET DataSet XML. See API_DOCUMENTATION.md.
  BT4U_WEBSERVICE_BASE:
    "https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx",
  // Web-only CORS proxies, tried in order. The official service pins
  // Access-Control-Allow-Origin to an unrelated origin, so browsers cannot call
  // it directly. Native apps (iOS/Android) are not subject to CORS and bypass
  // these entirely. Public proxies fail individually and independently of each
  // other — as of 2026-07-22: codetabs returned HTTP 522 at night AND timed out
  // outright during the day (consistently dead both times, kept last-resort
  // here); cors.eu.org worked well at night but was rate-limited (HTTP 429)
  // during a daytime burst of ~20 concurrent requests; proxy.cors.sh worked
  // reliably during that same daytime burst. None of these are guaranteed
  // long-term — they are free, unaffiliated third-party services — which is
  // why the client tries this whole chain and fails fast. `encode` = URL-encode
  // the target before appending.
  //
  // Self-hosters should prepend their own reliable proxy by setting
  // EXPO_PUBLIC_BT4U_PROXY (see cloudflare-worker/README.md) rather than
  // depending on this public chain long-term. When set, it is tried first and
  // the public proxies remain as fallbacks.
  BT4U_WEB_PROXIES: [
    ...(SELF_HOSTED_BT4U_PROXY ? [{ base: SELF_HOSTED_BT4U_PROXY, encode: false }] : []),
    { base: "https://cors.eu.org/", encode: false },
    { base: "https://proxy.cors.sh/", encode: false },
    { base: "https://api.codetabs.com/v1/proxy/?quest=", encode: true },
  ] as { base: string; encode: boolean }[],
};

/**
 * Selects which transit data provider backs the app's API layer.
 * - `bt4u`:  official Blacksburg Transit BT4U ASMX web service (default since
 *   2026-07-22, after validating live against real daytime data with buses
 *   running and a working web CORS proxy — see API_DOCUMENTATION.md).
 * - `ridebt`: legacy reverse-engineered RideBT Joomla AJAX endpoints. Kept
 *   available as a fallback option; see API_DOCUMENTATION_LEGACY.md.
 *
 * Override at build/runtime with EXPO_PUBLIC_API_PROVIDER=ridebt to switch back.
 * Nothing about the provider is hard-coded into consumers — swapping this value
 * re-points the entire API layer. Both providers return the identical
 * normalized `Bt*` types.
 */
export type ApiProviderId = "ridebt" | "bt4u";

export const API_PROVIDER: ApiProviderId =
  process.env.EXPO_PUBLIC_API_PROVIDER?.trim().toLowerCase() === "ridebt"
    ? "ridebt"
    : "bt4u";

// Version format: YYYY.MM.DD.N where N starts at 0 each day and increments per same-day release.
export const APP_VERSION_DATE = "2026.08.27.0";
export const APP_RELEASE_CHANNEL = "alpha";
export const APP_VERSION_LABEL = `(${APP_RELEASE_CHANNEL}) ${APP_VERSION_DATE}`;

// Data refresh intervals (in milliseconds)
export const REFRESH_INTERVALS = {
  VEHICLES: 5_000, // Bus positions: 5 seconds
  ARRIVALS: 20_000, // ETAs at stop: 20 seconds
  ROUTES: 3_600_000, // Route list: 1 hour (cached for session)
  STOPS: 3_600_000, // Stop list: 1 hour (cached for session)
  ALERTS: 300_000, // Alerts: 5 minutes
  CALENDAR: 3_600_000, // Service calendar: 1 hour (cached for session)
};

// Stale time thresholds (data older than this is considered stale)
export const STALE_TIMES = {
  VEHICLES: 10_000, // 10 seconds
  ARRIVALS: 15_000, // 15 seconds
  ROUTES: 600_000, // 10 minutes
  STOPS: 600_000, // 10 minutes
  ALERTS: 60_000, // 1 minute
};

// Map settings
export const MAP_CONFIG = {
  INITIAL_LATITUDE: 37.2297, // Blacksburg, VA (approx)
  INITIAL_LONGITUDE: -80.4139,
  INITIAL_ZOOM: 15,
  MARKER_ANIMATION_DURATION: 500,
};

// CORS handling
export const CORS_PROXY = null; // Set to proxy URL if RideBT API fails with CORS

// Self-hosted telemetry is intentionally separate from RideBT API endpoints.
export const TELEMETRY_CONFIG = {
  ENDPOINT: process.env.EXPO_PUBLIC_TELEMETRY_ENDPOINT?.trim() || "",
  ENABLE_IN_DEV: false,
};
