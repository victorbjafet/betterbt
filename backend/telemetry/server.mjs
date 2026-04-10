import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.TELEMETRY_PORT || 4318);
const RAW_RETENTION_DAYS = Number(process.env.TELEMETRY_RAW_RETENTION_DAYS || 30);
const AGG_RETENTION_DAYS = Number(process.env.TELEMETRY_AGG_RETENTION_DAYS || 180);
const BODY_LIMIT_BYTES = 1024 * 1024;
const ACTIVE_SESSION_WINDOW_MS = 2 * 60 * 1000;

const dataDir = path.join(__dirname, 'data');
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

function parseJsonBody(req) {
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
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
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

function applyRetention(aggregates) {
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

  const aggCutoff = Date.now() - AGG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const day of Object.keys(aggregates.daily)) {
    const dayTs = Date.parse(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(dayTs) || dayTs < aggCutoff) {
      delete aggregates.daily[day];
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
  if (!req.url) {
    sendJson(res, 400, { error: 'missing url' });
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && req.url === '/telemetry/health') {
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

  if (req.method === 'GET' && req.url === '/telemetry/aggregates') {
    const aggregates = readAggregates();
    applyRetention(aggregates);
    writeAggregates(aggregates);

    sendJson(res, 200, serializeAggregateSummary(aggregates));
    return;
  }

  if (req.method === 'POST' && req.url === '/telemetry/events') {
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

server.listen(PORT, () => {
  console.log(`[telemetry-server] listening on http://localhost:${PORT}`);
  console.log('[telemetry-server] POST /telemetry/events');
  console.log('[telemetry-server] GET  /telemetry/health');
  console.log('[telemetry-server] GET  /telemetry/aggregates');
});
