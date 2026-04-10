import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.TELEMETRY_PORT || 4318);
const BIND_HOST = process.env.TELEMETRY_BIND_HOST?.trim() || '127.0.0.1';
const RAW_RETENTION_DAYS = Number(process.env.TELEMETRY_RAW_RETENTION_DAYS || 0);
const AGG_RETENTION_DAYS = Number(process.env.TELEMETRY_AGG_RETENTION_DAYS || 0);
const BODY_LIMIT_BYTES = 1024 * 1024;
const ACTIVE_SESSION_WINDOW_MS = 2 * 60 * 1000;
const DASHBOARD_PATH = process.env.TELEMETRY_DASHBOARD_PATH?.trim() || '/telemetry/dev-dashboard';
const DASHBOARD_REALM = process.env.TELEMETRY_DASHBOARD_REALM?.trim() || 'BetterBT Telemetry Admin';
const DASHBOARD_USER = process.env.TELEMETRY_DASHBOARD_USER?.trim() || '';
const DASHBOARD_PASSWORD = process.env.TELEMETRY_DASHBOARD_PASSWORD || '';
const DASHBOARD_RATE_LIMIT_WINDOW_MS = Number(process.env.TELEMETRY_DASHBOARD_RATE_LIMIT_WINDOW_MS || 60_000);
const DASHBOARD_RATE_LIMIT_MAX_REQUESTS = Number(process.env.TELEMETRY_DASHBOARD_RATE_LIMIT_MAX_REQUESTS || 120);
const DASHBOARD_AUTH_FAIL_WINDOW_MS = Number(process.env.TELEMETRY_DASHBOARD_AUTH_FAIL_WINDOW_MS || 600_000);
const DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS = Number(process.env.TELEMETRY_DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS || 20);
const DASHBOARD_API_TOKEN_TTL_MS = Number(process.env.TELEMETRY_DASHBOARD_API_TOKEN_TTL_MS || 10 * 60 * 1000);
const dashboardRequestLog = new Map();
const dashboardAuthFailureLog = new Map();
const dashboardApiTokenStore = new Map();

const dataDir = process.env.TELEMETRY_DATA_DIR?.trim() || path.join(__dirname, 'data');
const rawEventsFile = path.join(dataDir, 'events.ndjson');
const aggregateFile = path.join(dataDir, 'aggregates.json');

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(rawEventsFile)) {
    fs.writeFileSync(rawEventsFile, '', 'utf8');
  }

  if (!fs.existsSync(aggregateFile)) {
    const initial = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalEventsReceived: 0,
      invalidEventsDropped: 0,
      sessionLastSeen: {},
      daily: {},
    };

    fs.writeFileSync(aggregateFile, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readAggregates() {
  try {
    const raw = fs.readFileSync(aggregateFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid aggregate format');
    return parsed;
  } catch {
    return {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalEventsReceived: 0,
      invalidEventsDropped: 0,
      sessionLastSeen: {},
      daily: {},
    };
  }
}

function writeAggregates(aggregates) {
  aggregates.updatedAt = new Date().toISOString();
  fs.writeFileSync(aggregateFile, JSON.stringify(aggregates, null, 2), 'utf8');
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > BODY_LIMIT_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      resolve(body);
    });

    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const body = await parseRequestBody(req);
  if (!body) return {};
  return JSON.parse(body);
}

async function parseDashboardLoginBody(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  const raw = await parseRequestBody(req);

  if (!raw) return { username: '', password: '' };

  if (contentType.includes('application/json')) {
    const parsed = JSON.parse(raw);
    return {
      username: String(parsed.username || '').trim(),
      password: String(parsed.password || ''),
    };
  }

  const form = new URLSearchParams(raw);
  return {
    username: String(form.get('username') || '').trim(),
    password: String(form.get('password') || ''),
  };
}

function cleanScalar(value) {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 400);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  return null;
}

function sanitizeEvent(input) {
  if (!input || typeof input !== 'object') return null;

  const event = typeof input.event === 'string' ? input.event.slice(0, 120) : '';
  const timestamp = typeof input.timestamp === 'string' ? input.timestamp : '';

  if (!event || !timestamp) return null;

  const payload = {};
  const rawPayload = input.payload;
  if (rawPayload && typeof rawPayload === 'object') {
    for (const [key, value] of Object.entries(rawPayload)) {
      if (key.length > 80) continue;
      payload[key] = cleanScalar(value);
    }
  }

  return {
    event,
    timestamp,
    payload,
  };
}

function appendRawEvents(events) {
  if (events.length === 0) return;
  const lines = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  fs.appendFileSync(rawEventsFile, lines, 'utf8');
}

function dayKeyFromIso(iso) {
  return iso.slice(0, 10);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0].trim()) {
    return forwarded[0].split(',')[0].trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function pruneWindow(logMap, key, windowMs, now) {
  const existing = logMap.get(key);
  if (!existing) return [];

  const threshold = now - windowMs;
  const pruned = existing.filter((timestamp) => timestamp >= threshold);

  if (pruned.length === 0) {
    logMap.delete(key);
    return [];
  }

  logMap.set(key, pruned);
  return pruned;
}

function rateLimitDashboardRequest(req, res) {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `req:${ip}`;
  const recent = pruneWindow(dashboardRequestLog, key, DASHBOARD_RATE_LIMIT_WINDOW_MS, now);

  if (recent.length >= DASHBOARD_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil(DASHBOARD_RATE_LIMIT_WINDOW_MS / 1000));
    res.writeHead(429, {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': String(retryAfterSeconds),
    });
    res.end(
      JSON.stringify({
        error: 'rate limit exceeded',
        scope: 'dashboard',
        retryAfterSeconds,
      })
    );
    return false;
  }

  recent.push(now);
  dashboardRequestLog.set(key, recent);
  return true;
}

function isAuthFailureLocked(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `auth:${ip}`;
  const recent = pruneWindow(dashboardAuthFailureLog, key, DASHBOARD_AUTH_FAIL_WINDOW_MS, now);

  if (recent.length < DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  const oldestRelevantFailure = recent[0] || now;
  const retryAfterMs = Math.max(1_000, DASHBOARD_AUTH_FAIL_WINDOW_MS - (now - oldestRelevantFailure));
  return {
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

function registerAuthFailure(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `auth:${ip}`;
  const recent = pruneWindow(dashboardAuthFailureLog, key, DASHBOARD_AUTH_FAIL_WINDOW_MS, now);
  recent.push(now);
  dashboardAuthFailureLog.set(key, recent);
}

function clearAuthFailures(req) {
  const ip = getClientIp(req);
  const key = `auth:${ip}`;
  dashboardAuthFailureLog.delete(key);
}

function isRetentionEnabled(days) {
  return Number.isFinite(days) && days > 0;
}

function isDashboardAuthConfigured() {
  return Boolean(DASHBOARD_USER) && Boolean(DASHBOARD_PASSWORD);
}

function createDashboardApiToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  dashboardApiTokenStore.set(token, {
    expiresAt: Date.now() + DASHBOARD_API_TOKEN_TTL_MS,
  });
  return token;
}

function pruneDashboardApiTokens() {
  const now = Date.now();
  for (const [token, meta] of dashboardApiTokenStore.entries()) {
    if (!meta || !Number.isFinite(meta.expiresAt) || meta.expiresAt <= now) {
      dashboardApiTokenStore.delete(token);
    }
  }
}

function readDashboardApiToken(req, requestUrl) {
  const fromHeader = String(req.headers['x-dashboard-api-token'] || '').trim();
  if (fromHeader) return fromHeader;

  const fromQuery = String(requestUrl.searchParams.get('token') || '').trim();
  if (fromQuery) return fromQuery;

  return '';
}

function authorizeDashboardApiRequest(req, res, requestUrl) {
  if (!isDashboardAuthConfigured()) {
    sendJson(res, 404, { error: 'not found' });
    return false;
  }

  pruneDashboardApiTokens();

  const token = readDashboardApiToken(req, requestUrl);
  if (!token) {
    sendJson(res, 401, { error: 'authentication required' });
    return false;
  }

  const tokenMeta = dashboardApiTokenStore.get(token);
  if (!tokenMeta || tokenMeta.expiresAt <= Date.now()) {
    dashboardApiTokenStore.delete(token);
    sendJson(res, 401, { error: 'authentication required' });
    return false;
  }

  return true;
}

function authorizeDashboardLoginAttempt(req, res, username, password) {
  if (!isDashboardAuthConfigured()) {
    sendJson(res, 404, { error: 'not found' });
    return false;
  }

  const authLock = isAuthFailureLocked(req);
  if (authLock.locked) {
    sendHtml(
      res,
      429,
      getDashboardLoginHtml(
        DASHBOARD_PATH,
        `Too many failed attempts. Retry in ${authLock.retryAfterSeconds} seconds.`
      )
    );
    return false;
  }

  if (!username || !password) {
    registerAuthFailure(req);
    sendHtml(res, 401, getDashboardLoginHtml(DASHBOARD_PATH, 'Missing username or password.'));
    return false;
  }

  if (username !== DASHBOARD_USER || password !== DASHBOARD_PASSWORD) {
    registerAuthFailure(req);
    sendHtml(res, 401, getDashboardLoginHtml(DASHBOARD_PATH, 'Invalid credentials.'));
    return false;
  }

  clearAuthFailures(req);
  return true;
}

function loadRawEvents() {
  try {
    const lines = fs.readFileSync(rawEventsFile, 'utf8').split('\n').filter(Boolean);

    return lines
      .map((line, index) => {
        try {
          return {
            id: index,
            ...JSON.parse(line),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildRawEventsResponse(searchParams) {
  const limit = Math.min(500, parsePositiveInteger(searchParams.get('limit'), 100));
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));
  const eventFilter = (searchParams.get('event') || '').trim();
  const textFilter = (searchParams.get('q') || '').trim().toLowerCase();
  const fromFilter = (searchParams.get('from') || '').trim();
  const toFilter = (searchParams.get('to') || '').trim();

  const fromEpoch = fromFilter ? Date.parse(fromFilter) : null;
  const toEpoch = toFilter ? Date.parse(toFilter) : null;

  const events = loadRawEvents()
    .filter((event) => {
      if (eventFilter && event.event !== eventFilter) return false;

      const eventEpoch = Date.parse(String(event.timestamp));
      if (Number.isFinite(fromEpoch) && Number.isFinite(eventEpoch) && eventEpoch < fromEpoch) return false;
      if (Number.isFinite(toEpoch) && Number.isFinite(eventEpoch) && eventEpoch > toEpoch) return false;

      if (!textFilter) return true;
      const payloadText = JSON.stringify(event.payload || {}).toLowerCase();
      return event.event.toLowerCase().includes(textFilter) || payloadText.includes(textFilter);
    })
    .sort((a, b) => Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)));

  const page = events.slice(offset, offset + limit);

  return {
    total: events.length,
    offset,
    limit,
    hasMore: offset + page.length < events.length,
    filters: {
      event: eventFilter || null,
      q: textFilter || null,
      from: fromFilter || null,
      to: toFilter || null,
    },
    events: page,
  };
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function getDashboardLoginHtml(dashboardPath, message = '') {
  const escapedMessage = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${DASHBOARD_REALM}</title>
  <style>
    body { font-family: ui-sans-serif, -apple-system, Segoe UI, sans-serif; margin: 0; background: #0b1220; color: #e2e8f0; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
    .panel { width: 100%; max-width: 420px; background: #111827; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    p { margin: 0 0 14px; color: #94a3b8; }
    label { display: block; margin: 10px 0 6px; color: #cbd5e1; font-size: 13px; }
    input { width: 100%; box-sizing: border-box; background: #0b1220; color: #e2e8f0; border: 1px solid #334155; border-radius: 8px; padding: 10px; }
    button { margin-top: 14px; width: 100%; border: 1px solid #334155; border-radius: 8px; background: #1d4ed8; color: #fff; padding: 10px; cursor: pointer; }
    .msg { margin-top: 12px; color: #fca5a5; min-height: 18px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="wrap">
    <form class="panel" method="post" action="${dashboardPath}/login" autocomplete="off">
      <h1>Telemetry Dashboard</h1>
      <p>Enter dashboard credentials.</p>
      <label for="username">Username</label>
      <input id="username" name="username" type="text" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required />
      <button type="submit">Sign In</button>
      <div class="msg">${escapedMessage}</div>
    </form>
  </div>
</body>
</html>`;
}

function getDashboardHtml(dashboardPath, apiToken) {
  const apiBase = `${dashboardPath}/api`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BetterBT Telemetry Dashboard</title>
  <style>
    body { font-family: ui-sans-serif, -apple-system, Segoe UI, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 24px; }
    .panel { background: #111827; border: 1px solid #334155; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    h1, h2 { margin: 0 0 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .card { background: #1e293b; border-radius: 8px; padding: 10px; }
    input, select, button { background: #0b1220; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 8px; }
    button { cursor: pointer; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #334155; text-align: left; padding: 8px; vertical-align: top; }
    code { white-space: pre-wrap; word-break: break-word; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .muted { color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>BetterBT Telemetry Dashboard</h1>
    <p class="muted">Developer-only dashboard. Do not link publicly.</p>

    <div class="panel">
      <h2>Summary</h2>
      <div id="summary" class="grid"></div>
    </div>

    <div class="panel">
      <h2>Raw Events</h2>
      <div class="row" style="margin-bottom: 10px;">
        <input id="q" placeholder="Search payload or event" />
        <input id="event" placeholder="Event name exact match" />
        <input id="from" placeholder="From ISO timestamp" />
        <input id="to" placeholder="To ISO timestamp" />
        <select id="limit">
          <option value="50">50</option>
          <option value="100" selected>100</option>
          <option value="250">250</option>
          <option value="500">500</option>
        </select>
        <button id="apply">Apply</button>
      </div>
      <div class="row" style="margin-bottom: 10px;">
        <button id="prev">Prev</button>
        <button id="next">Next</button>
        <a href="${apiBase}/raw/export" target="_blank" rel="noreferrer">Download NDJSON</a>
        <span id="pageInfo" class="muted"></span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Event</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

  <script>
    const apiBase = '${apiBase}';
    const apiToken = '${apiToken}';
    let offset = 0;

    function authHeaders() {
      return {
        'X-Dashboard-Api-Token': apiToken,
      };
    }

    function logoutOnLeave() {
      try {
        navigator.sendBeacon('${dashboardPath}/logout?token=' + encodeURIComponent(apiToken), '');
      } catch {
        // ignore
      }
    }

    window.addEventListener('beforeunload', logoutOnLeave);
    window.addEventListener('pagehide', logoutOnLeave);

    function card(label, value) {
      return '<div class="card"><div class="muted">' + label + '</div><div>' + value + '</div></div>';
    }

    async function loadSummary() {
      const res = await fetch(apiBase + '/summary', { headers: authHeaders(), cache: 'no-store' });
      if (res.status === 401) {
        location.reload();
        return;
      }
      const data = await res.json();
      const el = document.getElementById('summary');
      el.innerHTML = [
        card('Updated', data.updatedAt || '--'),
        card('Total Events', String(data.totalEventsReceived || 0)),
        card('Invalid Dropped', String(data.invalidEventsDropped || 0)),
        card('Active Sessions (Approx)', String(data.activeSessionsApprox || 0)),
        card('Raw Retention', data.retention.rawDays === null ? 'Permanent' : data.retention.rawDays + ' days'),
        card('Aggregate Retention', data.retention.aggregateDays === null ? 'Permanent' : data.retention.aggregateDays + ' days'),
        card('Raw File Size', String(data.rawFileBytes || 0) + ' bytes'),
        card('Raw Event Rows', String(data.rawEventRows || 0))
      ].join('');
    }

    async function loadRaw() {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: document.getElementById('limit').value,
        q: document.getElementById('q').value,
        event: document.getElementById('event').value,
        from: document.getElementById('from').value,
        to: document.getElementById('to').value,
      });

      const res = await fetch(apiBase + '/raw?' + params.toString(), { headers: authHeaders(), cache: 'no-store' });
      if (res.status === 401) {
        location.reload();
        return;
      }
      const data = await res.json();

      const rows = document.getElementById('rows');
      rows.innerHTML = data.events.map((event) => {
        const payload = JSON.stringify(event.payload || {}, null, 2)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
        return '<tr>' +
          '<td>' + (event.timestamp || '--') + '</td>' +
          '<td>' + (event.event || '--') + '</td>' +
          '<td><code>' + payload + '</code></td>' +
        '</tr>';
      }).join('');

      document.getElementById('pageInfo').textContent =
        'Showing ' + data.events.length + ' of ' + data.total + ' (offset ' + data.offset + ')';

      document.getElementById('prev').disabled = data.offset <= 0;
      document.getElementById('next').disabled = !data.hasMore;
      window.__last = data;
    }

    document.getElementById('apply').addEventListener('click', () => {
      offset = 0;
      loadRaw();
    });

    document.getElementById('prev').addEventListener('click', () => {
      const pageSize = Number(document.getElementById('limit').value);
      offset = Math.max(0, offset - pageSize);
      loadRaw();
    });

    document.getElementById('next').addEventListener('click', () => {
      const pageSize = Number(document.getElementById('limit').value);
      offset = offset + pageSize;
      loadRaw();
    });

    const exportLink = document.querySelector('a[href$="/raw/export"]');
    if (exportLink) {
      exportLink.href = apiBase + '/raw/export?token=' + encodeURIComponent(apiToken);
    }

    loadSummary();
    loadRaw();
  </script>
</body>
</html>`;
}

function applyRetention(aggregates) {
  if (isRetentionEnabled(RAW_RETENTION_DAYS)) {
    const rawCutoff = Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    try {
      const lines = fs.readFileSync(rawEventsFile, 'utf8').split('\n').filter(Boolean);
      const retainedLines = lines.filter((line) => {
        try {
          const parsed = JSON.parse(line);
          const ts = Date.parse(parsed.timestamp);
          return Number.isFinite(ts) && ts >= rawCutoff;
        } catch {
          return false;
        }
      });

      fs.writeFileSync(rawEventsFile, retainedLines.length > 0 ? `${retainedLines.join('\n')}\n` : '', 'utf8');
    } catch {
      // Ignore malformed raw data issues; keep the server running.
    }
  }

  if (isRetentionEnabled(AGG_RETENTION_DAYS)) {
    const aggCutoff = Date.now() - AGG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const day of Object.keys(aggregates.daily)) {
      const dayTs = Date.parse(`${day}T00:00:00.000Z`);
      if (!Number.isFinite(dayTs) || dayTs < aggCutoff) {
        delete aggregates.daily[day];
      }
    }
  }

  for (const [sessionId, timestamp] of Object.entries(aggregates.sessionLastSeen)) {
    const ts = Date.parse(String(timestamp));
    if (!Number.isFinite(ts) || Date.now() - ts > 24 * 60 * 60 * 1000) {
      delete aggregates.sessionLastSeen[sessionId];
    }
  }
}

function updateAggregates(aggregates, events, droppedCount) {
  aggregates.totalEventsReceived += events.length;
  aggregates.invalidEventsDropped += droppedCount;

  for (const event of events) {
    const day = dayKeyFromIso(event.timestamp);
    if (!aggregates.daily[day]) {
      aggregates.daily[day] = {
        totalEvents: 0,
        eventsByName: {},
        platforms: {},
        visits: 0,
        uniqueSessionIds: {},
      };
    }

    const bucket = aggregates.daily[day];
    const payload = event.payload || {};
    const platform = typeof payload.platform === 'string' ? payload.platform : 'unknown';
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;

    bucket.totalEvents += 1;
    bucket.eventsByName[event.event] = (bucket.eventsByName[event.event] || 0) + 1;
    bucket.platforms[platform] = (bucket.platforms[platform] || 0) + 1;

    if (event.event === 'app.session_started') {
      bucket.visits += 1;
    }

    if (sessionId) {
      bucket.uniqueSessionIds[sessionId] = true;
      aggregates.sessionLastSeen[sessionId] = event.timestamp;
    }
  }
}

function getActiveSessionCount(aggregates) {
  const now = Date.now();

  return Object.values(aggregates.sessionLastSeen).reduce((count, timestamp) => {
    const ts = Date.parse(String(timestamp));
    if (!Number.isFinite(ts)) return count;
    return now - ts <= ACTIVE_SESSION_WINDOW_MS ? count + 1 : count;
  }, 0);
}

function serializeAggregateSummary(aggregates) {
  const daily = {};

  for (const [day, bucket] of Object.entries(aggregates.daily)) {
    daily[day] = {
      totalEvents: bucket.totalEvents,
      visits: bucket.visits,
      uniqueSessions: Object.keys(bucket.uniqueSessionIds || {}).length,
      platforms: bucket.platforms,
      eventsByName: bucket.eventsByName,
    };
  }

  return {
    updatedAt: aggregates.updatedAt,
    totalEventsReceived: aggregates.totalEventsReceived,
    invalidEventsDropped: aggregates.invalidEventsDropped,
    activeSessionsApprox: getActiveSessionCount(aggregates),
    daily,
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  res.end(JSON.stringify(data));
}

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.headers.host) {
    sendJson(res, 400, { error: 'missing url' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`)) {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Vary', 'X-Dashboard-Api-Token');

    if (!rateLimitDashboardRequest(req, res)) return;
  }

  if (req.method === 'GET' && pathname === DASHBOARD_PATH) {
    if (!isDashboardAuthConfigured()) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    sendHtml(res, 200, getDashboardLoginHtml(DASHBOARD_PATH));
    return;
  }

  if (req.method === 'POST' && pathname === `${DASHBOARD_PATH}/login`) {
    try {
      const { username, password } = await parseDashboardLoginBody(req);
      if (!authorizeDashboardLoginAttempt(req, res, username, password)) return;

      const apiToken = createDashboardApiToken();
      sendHtml(res, 200, getDashboardHtml(DASHBOARD_PATH, apiToken));
    } catch {
      sendHtml(res, 400, getDashboardLoginHtml(DASHBOARD_PATH, 'Invalid login request.'));
    }
    return;
  }

  if (req.method === 'POST' && pathname === `${DASHBOARD_PATH}/logout`) {
    const token = readDashboardApiToken(req, requestUrl);
    if (token) dashboardApiTokenStore.delete(token);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === `${DASHBOARD_PATH}/api/summary`) {
    if (!authorizeDashboardApiRequest(req, res, requestUrl)) return;

    const aggregates = readAggregates();
    applyRetention(aggregates);
    writeAggregates(aggregates);

    let rawFileBytes = 0;
    try {
      rawFileBytes = fs.statSync(rawEventsFile).size;
    } catch {
      rawFileBytes = 0;
    }

    sendJson(res, 200, {
      ...serializeAggregateSummary(aggregates),
      rawFileBytes,
      rawEventRows: loadRawEvents().length,
      retention: {
        rawDays: isRetentionEnabled(RAW_RETENTION_DAYS) ? RAW_RETENTION_DAYS : null,
        aggregateDays: isRetentionEnabled(AGG_RETENTION_DAYS) ? AGG_RETENTION_DAYS : null,
      },
      dashboardPath: DASHBOARD_PATH,
    });
    return;
  }

  if (req.method === 'GET' && pathname === `${DASHBOARD_PATH}/api/raw`) {
    if (!authorizeDashboardApiRequest(req, res, requestUrl)) return;
    sendJson(res, 200, buildRawEventsResponse(requestUrl.searchParams));
    return;
  }

  if (req.method === 'GET' && pathname === `${DASHBOARD_PATH}/api/raw/export`) {
    if (!authorizeDashboardApiRequest(req, res, requestUrl)) return;

    let raw = '';
    try {
      raw = fs.readFileSync(rawEventsFile, 'utf8');
    } catch {
      raw = '';
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="telemetry-events.ndjson"',
      'Cache-Control': 'no-store',
    });
    res.end(raw);
    return;
  }

  if (req.method === 'GET' && pathname === '/telemetry/health') {
    const aggregates = readAggregates();
    applyRetention(aggregates);
    writeAggregates(aggregates);

    sendJson(res, 200, {
      ok: true,
      activeSessionsApprox: getActiveSessionCount(aggregates),
      updatedAt: aggregates.updatedAt,
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/telemetry/aggregates') {
    const aggregates = readAggregates();
    applyRetention(aggregates);
    writeAggregates(aggregates);

    sendJson(res, 200, serializeAggregateSummary(aggregates));
    return;
  }

  if (req.method === 'POST' && pathname === '/telemetry/events') {
    try {
      const body = await parseJsonBody(req);
      const inputEvents = Array.isArray(body.events) ? body.events : [];

      let droppedCount = 0;
      const sanitized = inputEvents
        .map((event) => {
          const normalized = sanitizeEvent(event);
          if (!normalized) {
            droppedCount += 1;
          }
          return normalized;
        })
        .filter(Boolean);

      appendRawEvents(sanitized);

      const aggregates = readAggregates();
      updateAggregates(aggregates, sanitized, droppedCount);
      applyRetention(aggregates);
      writeAggregates(aggregates);

      sendJson(res, 202, {
        accepted: sanitized.length,
        dropped: droppedCount,
        activeSessionsApprox: getActiveSessionCount(aggregates),
      });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : 'bad request',
      });
    }
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, BIND_HOST, () => {
  console.log(`[telemetry-server] listening on http://${BIND_HOST}:${PORT}`);
  console.log('[telemetry-server] POST /telemetry/events');
  console.log('[telemetry-server] GET  /telemetry/health');
  console.log('[telemetry-server] GET  /telemetry/aggregates');
  console.log(`[telemetry-server] DEV  ${DASHBOARD_PATH} (auth required)`);
});
