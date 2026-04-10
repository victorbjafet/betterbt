# BetterBT Local Telemetry Server

This is a minimal self-hosted telemetry ingestion service for BetterBT.

It is intentionally separate from the BT API services.

## Endpoints

- `POST /telemetry/events` (ingest batched events)
- `GET /telemetry/health` (quick health + active sessions estimate)
- `GET /telemetry/aggregates` (daily aggregate metrics)

Developer-only endpoints (not linked publicly):
- `GET /telemetry/dev-dashboard` (HTML dashboard)
- `GET /telemetry/dev-dashboard/api/summary`
- `GET /telemetry/dev-dashboard/api/raw`
- `GET /telemetry/dev-dashboard/api/raw/export`

## Run

From project root:

```bash
npm run telemetry:server
```

Or directly:

```bash
node backend/telemetry/server.mjs
```

Server default:
- `http://localhost:4318`

## App Configuration

Set this environment variable for BetterBT app builds:

```bash
EXPO_PUBLIC_TELEMETRY_ENDPOINT=http://localhost:4318/telemetry/events
```

Telemetry sending is disabled in development by default in the app client.

## Developer Dashboard Auth

Dashboard access is protected using HTTP Basic Auth backed by environment variables.

Required server environment variables:

```bash
TELEMETRY_DASHBOARD_USER=your_username
TELEMETRY_DASHBOARD_PASSWORD=your_strong_password
```

Optional:

```bash
TELEMETRY_DASHBOARD_PATH=/telemetry/dev-dashboard
```

Dashboard rate limit and auth-throttle controls:

```bash
TELEMETRY_DASHBOARD_RATE_LIMIT_WINDOW_MS=60000
TELEMETRY_DASHBOARD_RATE_LIMIT_MAX_REQUESTS=120
TELEMETRY_DASHBOARD_AUTH_FAIL_WINDOW_MS=600000
TELEMETRY_DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS=20
```

- Requests over the dashboard limit return `429`.
- Excessive failed auth attempts from the same client are temporarily blocked with `429`.

If auth variables are not set, dashboard endpoints return `404`.

## Retention

Default retention windows:
- Raw event log: permanent
- Daily aggregate summary: permanent

Optional overrides:
- `TELEMETRY_RAW_RETENTION_DAYS`
- `TELEMETRY_AGG_RETENTION_DAYS`

Set either override to a positive integer (days) to enable pruning.

## Stored Files

- `backend/telemetry/data/events.ndjson`
- `backend/telemetry/data/aggregates.json`

The data directory is ignored by git.
