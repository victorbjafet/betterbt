# BetterBT Local Telemetry Server

This is a minimal self-hosted telemetry ingestion service for BetterBT.

It is intentionally separate from the BT API services.

## Endpoints

- `POST /telemetry/events` (ingest batched events)
- `GET /telemetry/health` (quick health + active sessions estimate)
- `GET /telemetry/aggregates` (daily aggregate metrics)

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

## Retention

Default retention windows:
- Raw event log: 30 days
- Daily aggregate summary: 180 days

Optional overrides:
- `TELEMETRY_RAW_RETENTION_DAYS`
- `TELEMETRY_AGG_RETENTION_DAYS`

## Stored Files

- `backend/telemetry/data/events.ndjson`
- `backend/telemetry/data/aggregates.json`

The data directory is ignored by git.
