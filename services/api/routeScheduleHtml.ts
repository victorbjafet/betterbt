/**
 * Route schedule trips-page helpers.
 *
 * This file intentionally is not wired into app UI. It exposes utilities
 * for future use when we want to parse embedded trips JSON from HTML.
 */

import { API_ENDPOINTS, CORS_PROXY } from '@/constants/config';
import { Platform } from 'react-native';

const withProxyIfConfigured = (url: string): string => {
  if (!CORS_PROXY) return url;
  return `${CORS_PROXY}${url}`;
};

const buildTripsPageUrl = (routeShortName: string): string => {
  const url = new URL('/index.php/routes-schedules', API_ENDPOINTS.BT_WEBSITE);
  url.searchParams.set('route', routeShortName);
  url.searchParams.set('routeView', 'trips');
  return url.toString();
};

const decodeJsString = (value: string): string => {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
};

const safeJsonParse = <T>(candidate: string): T | null => {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
};

/**
 * Attempts to pull embedded JSON blobs from a route trips HTML page.
 *
 * Returns a map keyed by JS variable name to parsed JSON values.
 */
export const extractEmbeddedTripsJsonFromHtml = (html: string): Record<string, unknown> => {
  const extracted: Record<string, unknown> = {};

  const objectVarPattern = /var\s+([A-Za-z0-9_]+)\s*=\s*(\{[\s\S]*?\});/g;
  let objectMatch: RegExpExecArray | null;

  while ((objectMatch = objectVarPattern.exec(html)) !== null) {
    const variableName = objectMatch[1];
    const objectText = objectMatch[2];

    const parsed = safeJsonParse<unknown>(objectText);
    if (parsed !== null) {
      extracted[variableName] = parsed;
      continue;
    }

    const decoded = safeJsonParse<unknown>(decodeJsString(objectText));
    if (decoded !== null) {
      extracted[variableName] = decoded;
    }
  }

  const parsePattern = /var\s+([A-Za-z0-9_]+)\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\);/g;
  let parseMatch: RegExpExecArray | null;

  while ((parseMatch = parsePattern.exec(html)) !== null) {
    const variableName = parseMatch[1];
    const quotedPayload = parseMatch[2];
    const parsedQuoted = safeJsonParse<string>(quotedPayload);
    if (parsedQuoted === null) continue;

    const parsedValue = safeJsonParse<unknown>(decodeJsString(parsedQuoted));
    if (parsedValue !== null) {
      extracted[variableName] = parsedValue;
    }
  }

  return extracted;
};

/**
 * Fetches the trips HTML page for a route and extracts available JSON blobs.
 *
 * This is intentionally provided as a utility and is not wired into UI hooks.
 */
export const fetchTripsPageEmbeddedJson = async (routeShortName: string): Promise<Record<string, unknown>> => {
  const pageUrl = buildTripsPageUrl(routeShortName);
  const url = Platform.OS === 'web'
    ? `${API_ENDPOINTS.BT_WEB_PROXY_BASE}${encodeURIComponent(pageUrl)}`
    : withProxyIfConfigured(pageUrl);

  const response = await fetch(url, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`RideBT trips page request failed with HTTP ${response.status}`);
  }

  const html = await response.text();
  return extractEmbeddedTripsJsonFromHtml(html);
};
