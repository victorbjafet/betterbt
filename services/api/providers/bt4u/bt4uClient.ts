/**
 * HTTP client for the official BT4U ASMX web service.
 *
 * The service exposes every operation as a plain HTTP GET whose query string
 * carries the parameters and whose body is ADO.NET DataSet XML. There is no SOAP
 * envelope to build and no JSON variant ([ScriptService] is not enabled).
 *
 * Proxy policy (this is the "reconsider the proxy" answer):
 *   - Native (iOS/Android): CORS does not apply — call the service directly.
 *     No proxy. This removes the free-public-proxy dependency on device.
 *   - Web: the service returns Access-Control-Allow-Origin pinned to a single
 *     unrelated origin, so browsers block a direct call. A GET proxy is still
 *     required on web only. Public proxies are individually unreliable (codetabs
 *     was down with HTTP 522 on 2026-07-22), so the client tries a short,
 *     configurable chain (`BT4U_WEB_PROXIES`) and fails fast rather than hanging.
 */

import { API_ENDPOINTS } from '@/constants/config';
import { Platform } from 'react-native';
import { parseDataSetRows, XmlRow } from './xml';

const BASE = API_ENDPOINTS.BT4U_WEBSERVICE_BASE;

// Per-attempt timeout so a dead/slow proxy fails fast instead of hanging ~20s.
const REQUEST_TIMEOUT_MS = 10_000;

export type Bt4uParams = Record<string, string | number | undefined | null>;

const buildOperationUrl = (operation: string, params?: Bt4uParams): string => {
  const url = new URL(`${BASE}/${operation}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/xml, application/xml, text/plain, */*' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

// Guard against proxies that answer 200 with a challenge/HTML page instead of
// the actual XML (e.g. corsproxy.io). A valid response is XML or an empty
// DataSet (`<DocumentElement />`).
const looksLikeDataSet = (body: string): boolean =>
  body.slice(0, 256).trimStart().startsWith('<?xml') || body.includes('<DocumentElement');

/**
 * Calls a BT4U operation and returns the parsed DataSet rows.
 * An empty document yields `[]` (e.g. no buses running). Throws only if the
 * request cannot be completed (native error, or every web proxy failed).
 */
export const bt4uRequest = async (operation: string, params?: Bt4uParams): Promise<XmlRow[]> => {
  const targetUrl = buildOperationUrl(operation, params);

  // Native has no CORS restriction — call the official service directly.
  if (Platform.OS !== 'web') {
    const response = await fetchWithTimeout(targetUrl, REQUEST_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`BT4U ${operation} failed with HTTP ${response.status}`);
    }
    return parseDataSetRows(await response.text());
  }

  // Web: try each proxy in order, failing fast, until one returns valid XML.
  let lastError: unknown = new Error('no proxies configured');
  for (const proxy of API_ENDPOINTS.BT4U_WEB_PROXIES) {
    const url = `${proxy.base}${proxy.encode ? encodeURIComponent(targetUrl) : targetUrl}`;
    try {
      const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} via ${proxy.base}`);
        continue;
      }
      const body = await response.text();
      if (!looksLikeDataSet(body)) {
        lastError = new Error(`non-XML response via ${proxy.base}`);
        continue;
      }
      return parseDataSetRows(body);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `BT4U ${operation} failed via all web proxies: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
};

/** Formats a Date as MM/DD/YYYY, the `serviceDate` format the service expects. */
export const formatServiceDate = (date: Date = new Date()): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
};
