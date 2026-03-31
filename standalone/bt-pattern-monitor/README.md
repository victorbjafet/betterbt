# BT Pattern Monitor (Standalone)

Independent long-running data collector for RideBT endpoint analysis.

## What It Collects

Every 5 seconds:
- `getBuses`
- Writes structured snapshots to JSONL for long-term pattern analysis

Every hour:
- `getRoutes`
- `getRoutePatterns`
- `getActiveAlerts`
- Derived stops snapshot by calling `getPatternPoints` for each pattern

This keeps lower-churn data separate from high-frequency bus snapshots.

## Anti-Failure Features

- Request retries with exponential backoff + jitter
- Per-request timeout
- Top-level loop catches errors and continues running
- Atomic JSON writes for latest/hourly files
- Signal handling (`Ctrl+C`, `SIGTERM`) for graceful shutdown
- Daily log file in JSON-lines format

## Folder Structure

When running, output is written under `data/`:

- `data/live/buses-YYYY-MM-DD.jsonl` high-frequency structured bus snapshots
- `data/live/latest-buses.json` latest bus snapshot
- `data/hourly/YYYYMMDDTHHMMSSZ/` hourly static snapshots
- `data/hourly/latest/` latest static snapshots
- `data/debug/monitor-YYYY-MM-DD.log` monitor logs

## Run

From this folder:

```bash
python3 monitor.py
```

Optional flags:

```bash
python3 monitor.py \
  --output-dir data \
  --bus-interval-sec 5 \
  --hourly-interval-sec 3600 \
  --timeout-sec 20 \
  --retries 4 \
  --retry-base-sec 1.25
```

## Data Shape Notes

`buses-YYYY-MM-DD.jsonl` entries include:
- `timestampUtc`
- `busCount`
- `routeCount`
- `byRoute` aggregate metrics (count, atStopCount, avgSpeed, vehicleIds, patterns)
- `buses` normalized per-vehicle records (route, pattern, stop, location, speed, capacity, occupancy, timestamps)

`stops_derived_from_patterns.json` includes:
- de-duplicated stops by `stopCode`
- route/pattern membership per stop
- any per-pattern fetch errors for debugging

## Notes

- This script intentionally does not import app code and has no external dependencies.
- The RideBT API currently has no confirmed direct stops endpoint in this codebase, so hourly stops are derived from pattern points.
