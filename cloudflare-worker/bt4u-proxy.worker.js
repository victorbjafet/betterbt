/**
 * BetterBT — BT4U CORS proxy (Cloudflare Worker)
 * ------------------------------------------------
 * The official Blacksburg Transit BT4U web service pins its CORS header
 * (Access-Control-Allow-Origin) to an unrelated origin, so a browser at your
 * site cannot read its responses directly. Native apps are unaffected (no CORS
 * off-browser) and do NOT use this. This Worker exists only for the web build.
 *
 * It fetches BT4U server-side (there is no CORS between servers) and re-serves
 * the response to the browser with an Access-Control-Allow-Origin your site is
 * allowed to read.
 *
 * It is deliberately NOT a generic open proxy:
 *   1. The upstream host + path are hardcoded — only the BT4U web service can
 *      ever be reached through it (no ?url=anything relay).
 *   2. Only known BT4U operations are forwarded (ALLOWED_OPERATIONS).
 *   3. CORS is granted only to origins you list (ALLOWED_ORIGINS).
 * See the "Security / abuse" section of README.md for the threat model.
 *
 * Calling convention (drop-in for the app's proxy chain — raw URL appended):
 *   https://<worker-host>/<full BT4U operation URL>
 * Example:
 *   https://betterbt-proxy.example.workers.dev/https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx/GetScheduledRoutes?stopCode=&serviceDate=07/22/2026
 */

// --- Edit these two for your deployment -----------------------------------

// Origins (your site + local dev) allowed to read responses in a browser.
const ALLOWED_ORIGINS = [
  "https://betterbt.vbjfr.xyz",
  "http://localhost:8081",
  "http://localhost:19006",
];

// --------------------------------------------------------------------------

// The ONLY upstream this proxy will ever call.
const UPSTREAM_PREFIX =
  "https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx/";

// BT4U operations this proxy is allowed to forward.
const ALLOWED_OPERATIONS = new Set([
  "GetCurrentBusInfo",
  "GetCurrentRoutes",
  "GetScheduledRoutes",
  "GetPatternNamesForDate",
  "GetScheduledPatternPoints",
  "GetScheduledStopInfo",
  "GetScheduledStopCodes",
  "GetScheduledStopNames",
  "GetNearestStops",
  "GetNextDeparturesForStop",
  "GetNextDepartures",
  "GetActiveAlerts",
  "GetArrivalAndDepartureTimesForRoutes",
  "GetArrivalAndDepartureTimesForTrip",
  "GetSummary",
]);

function corsHeaders(origin) {
  // Reflect the caller's origin only if it is allowed; otherwise fall back to
  // the first configured origin so a disallowed site gets a non-matching header
  // and its browser blocks the read.
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    // CORS preflight.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    // Reconstruct the requested upstream URL from "/<full url>" + query.
    const requestUrl = new URL(request.url);
    const target = requestUrl.pathname.slice(1) + requestUrl.search;

    // Hard lock #1: only the BT4U web service.
    if (!target.startsWith(UPSTREAM_PREFIX)) {
      return new Response(
        "Forbidden: this proxy only serves the BT4U web service.",
        {
          status: 403,
          headers: cors,
        },
      );
    }

    // Hard lock #2: only known operations.
    const operation = target.slice(UPSTREAM_PREFIX.length).split("?")[0];
    if (!ALLOWED_OPERATIONS.has(operation)) {
      return new Response(`Forbidden: unknown operation "${operation}".`, {
        status: 403,
        headers: cors,
      });
    }

    // Fetch BT4U server-side and pass the XML back. No edge caching: some
    // operations (buses, departures, alerts) are live and must not be stale.
    let upstream;
    try {
      upstream = await fetch(target, {
        method: "GET",
        headers: { Accept: "text/xml, application/xml, text/plain, */*" },
      });
    } catch (error) {
      return new Response(`Bad Gateway: upstream fetch failed (${error}).`, {
        status: 502,
        headers: cors,
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
