# BetterBT Data Collection Policy

Last updated: April 9, 2026

## Purpose

BetterBT collects a minimal set of anonymous usage telemetry to monitor app reliability, understand feature usage at a high level, and prioritize improvements.

This telemetry is self-hosted by the BetterBT project and is separate from BT API traffic.

## What Is Collected

The app sends anonymous events with a timestamp and small metadata payload.

Common event metadata included on all events:
- `timestamp` (ISO time)
- `appVersion`
- `platform` (`ios`, `android`, or `web`)
- `platformVersion`
- `sessionId` (random, app-generated, non-account identifier)

Usage and reliability events currently collected:
- `app.session_started` (visit start timestamp)
- `app.session_heartbeat` (uptime snapshot, used for active session estimates)
- `app.lifecycle_state_changed` (active/background transitions)
- `app.session_ended` (web page close/hide)
- `screen.view` (screen name only)
- `routes.route_selected`
- `routes.favorite_count_changed`
- `routes.favorites_view_toggled`
- `routes.map_fullscreen_toggled`
- `routes.reset_to_all_pressed`
- `routes.retry_pressed`
- `alerts.retry_pressed`
- `alerts.loaded` (count only)
- `stops.stop_selected` (stop id/code and route count)
- `stops.arrivals_loaded` (stop id/code and count only)
- `stops.route_chip_opened` (route id and stop id/code)
- `settings.open_source_repo_pressed`
- `settings.open_data_policy_pressed`
- `api.query.routes.success` / `api.query.routes.failure`
- `api.query.buses.success` / `api.query.buses.failure`
- `api.query.stops.success` / `api.query.stops.failure`
- `api.query.route_stops.success` / `api.query.route_stops.failure`
- `api.query.arrivals.success` / `api.query.arrivals.failure`
- `api.query.alerts.success` / `api.query.alerts.failure`
- `error.*` (lightweight app error events)

## What Is Not Collected

BetterBT telemetry does not collect:
- Names, email addresses, phone numbers, or account credentials
- Contact lists
- Message contents
- Precise GPS traces of a user device
- Advertising identifiers
- Device fingerprints for cross-app tracking

## How Data Is Used

Telemetry is used for:
- Aggregate active session estimation
- Visit timestamp trends
- Basic platform distribution (web/iOS/Android)
- Endpoint reliability and latency monitoring
- Feature usage prioritization

## Retention

Current self-hosted retention configuration:
- Raw event log: permanent
- Daily aggregates: permanent

Projects self-hosting BetterBT telemetry can configure day-based pruning in the local telemetry server if needed.

## Storage and Transport

- Telemetry is sent in small batched POST requests.
- Requests are retried with backoff on transient failures.
- Telemetry submission is non-blocking and does not interrupt app UI.
- In development builds, telemetry sending is disabled by default.

## Self-Hosted Endpoint

The app only sends telemetry when `EXPO_PUBLIC_TELEMETRY_ENDPOINT` is configured.

Recommended local ingestion endpoint:
- `http://localhost:4318/telemetry/events`

## Contact

Questions about telemetry behavior can be filed in the BetterBT repository issues.
