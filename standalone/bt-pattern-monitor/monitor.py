#!/usr/bin/env python3
"""
Standalone RideBT monitor for long-running bus pattern analysis.

What it does:
- Polls getBuses every 5 seconds and writes structured snapshots to JSONL.
- Polls lower-churn endpoints every hour and stores full snapshots separately.
- Never exits on transient API or file errors (unless interrupted).
- Uses only Python standard library so it is independent from the app.
"""

from __future__ import annotations

import argparse
import json
import random
import signal
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "https://ridebt.org/index.php"
BASE_QUERY = {
    "option": "com_ajax",
    "module": "bt_map",
    "format": "json",
    "Itemid": "101",
}

DEFAULT_BUS_INTERVAL_SEC = 5
DEFAULT_HOURLY_INTERVAL_SEC = 3600
DEFAULT_TIMEOUT_SEC = 20
DEFAULT_RETRIES = 4
DEFAULT_RETRY_BASE_SEC = 1.25


class Monitor:
    def __init__(
        self,
        output_dir: Path,
        bus_interval_sec: int,
        hourly_interval_sec: int,
        timeout_sec: int,
        retries: int,
        retry_base_sec: float,
    ) -> None:
        self.output_dir = output_dir
        self.bus_interval_sec = bus_interval_sec
        self.hourly_interval_sec = hourly_interval_sec
        self.timeout_sec = timeout_sec
        self.retries = retries
        self.retry_base_sec = retry_base_sec
        self.running = True

        self.live_dir = output_dir / "live"
        self.hourly_dir = output_dir / "hourly"
        self.debug_dir = output_dir / "debug"
        for p in (self.live_dir, self.hourly_dir, self.debug_dir):
            p.mkdir(parents=True, exist_ok=True)

    def stop(self, *_: Any) -> None:
        self.log("stop", "Received signal, shutting down after current cycle.")
        self.running = False

    def now_utc(self) -> datetime:
        return datetime.now(timezone.utc)

    def iso_now(self) -> str:
        return self.now_utc().isoformat()

    def log(self, level: str, message: str, extra: dict[str, Any] | None = None) -> None:
        entry: dict[str, Any] = {
            "ts": self.iso_now(),
            "level": level,
            "message": message,
        }
        if extra:
            entry["extra"] = extra

        line = json.dumps(entry, separators=(",", ":"), ensure_ascii=True)
        print(line, flush=True)

        log_path = self.debug_dir / f"monitor-{self.now_utc().strftime('%Y-%m-%d')}.log"
        with log_path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")

    def build_url(self, method: str, params: dict[str, Any] | None = None) -> str:
        query = dict(BASE_QUERY)
        query["method"] = method
        if params:
            for key, value in params.items():
                query[key] = str(value)
        return f"{BASE_URL}?{urlencode(query)}"

    def request_json(self, method: str, params: dict[str, Any] | None = None) -> Any:
        url = self.build_url(method, params)
        req = Request(url, headers={"User-Agent": "bt-pattern-monitor/1.0"}, method="POST")

        with urlopen(req, timeout=self.timeout_sec) as response:  # nosec B310
            payload = json.loads(response.read().decode("utf-8"))

        if isinstance(payload, dict) and "success" in payload:
            if not payload.get("success"):
                raise RuntimeError(payload.get("message") or f"{method} returned success=false")
            return payload.get("data")

        if isinstance(payload, dict) and "data" in payload:
            return payload["data"]

        raise RuntimeError(f"Unexpected response shape for {method}")

    def request_with_retry(self, method: str, params: dict[str, Any] | None = None) -> Any:
        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            try:
                return self.request_json(method, params)
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as err:
                last_error = err
                if attempt >= self.retries:
                    break

                sleep_sec = (self.retry_base_sec * (2 ** (attempt - 1))) + random.uniform(0.0, 0.6)
                self.log(
                    "warn",
                    f"Request failed for {method}, will retry",
                    {
                        "attempt": attempt,
                        "max_attempts": self.retries,
                        "sleep_sec": round(sleep_sec, 2),
                        "error": str(err),
                    },
                )
                time.sleep(sleep_sec)

        raise RuntimeError(f"Failed {method} after {self.retries} attempts: {last_error}")

    def append_jsonl(self, path: Path, obj: dict[str, Any]) -> None:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=True) + "\n")

    def write_json(self, path: Path, obj: Any) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2, ensure_ascii=True)
        tmp.replace(path)

    def normalize_bus_snapshot(self, buses: list[dict[str, Any]]) -> dict[str, Any]:
        by_route: dict[str, dict[str, Any]] = {}
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)

        normalized_buses: list[dict[str, Any]] = []
        for bus in buses:
            state = (bus.get("states") or [{}])[0] if isinstance(bus.get("states"), list) else {}
            lat = state.get("realtimeLatitude", state.get("latitude"))
            lng = state.get("realtimeLongitude", state.get("longitude"))

            norm_bus = {
                "id": bus.get("id"),
                "routeId": bus.get("routeId"),
                "patternName": bus.get("patternName"),
                "stopId": bus.get("stopId"),
                "lat": lat,
                "lng": lng,
                "heading": self._to_number(state.get("direction")),
                "speed": self._to_number(state.get("speed")),
                "passengers": self._to_number(state.get("passengers")),
                "capacity": self._to_number(bus.get("capacity")),
                "occupancyPct": self._to_number(bus.get("percentOfCapacity")),
                "isAtStop": self._to_flag(state.get("isBusAtStop")),
                "tripStartOn": self._epoch_to_seconds(bus.get("tripStartOn")),
                "stateVersion": self._epoch_to_seconds(state.get("version")),
            }
            normalized_buses.append(norm_bus)

            route_id = str(norm_bus.get("routeId") or "UNKNOWN")
            grouped[route_id].append(norm_bus)

        for route_id, items in grouped.items():
            speeds = [x["speed"] for x in items if isinstance(x.get("speed"), (int, float))]
            by_route[route_id] = {
                "count": len(items),
                "atStopCount": sum(1 for x in items if x.get("isAtStop") is True),
                "avgSpeed": round(sum(speeds) / len(speeds), 2) if speeds else None,
                "vehicleIds": [x.get("id") for x in items],
                "patterns": sorted({str(x.get("patternName")) for x in items if x.get("patternName")}),
            }

        return {
            "timestampUtc": self.iso_now(),
            "busCount": len(normalized_buses),
            "routeCount": len(by_route),
            "byRoute": by_route,
            "buses": normalized_buses,
        }

    def _to_number(self, value: Any) -> int | float | None:
        if value is None or value == "":
            return None
        try:
            num = float(value)
        except (TypeError, ValueError):
            return None
        return int(num) if num.is_integer() else num

    def _to_flag(self, value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        if not isinstance(value, str):
            return None
        v = value.strip().upper()
        if v == "Y":
            return True
        if v == "N":
            return False
        return None

    def _epoch_to_seconds(self, value: Any) -> int | None:
        num = self._to_number(value)
        if num is None:
            return None
        n = int(num)
        return n // 1000 if n > 1_000_000_000_000 else n

    def poll_buses(self) -> None:
        buses = self.request_with_retry("getBuses")
        if not isinstance(buses, list):
            raise RuntimeError("getBuses returned non-list data")

        snapshot = self.normalize_bus_snapshot(buses)
        day_file = self.live_dir / f"buses-{self.now_utc().strftime('%Y-%m-%d')}.jsonl"
        self.append_jsonl(day_file, snapshot)

        latest_file = self.live_dir / "latest-buses.json"
        self.write_json(latest_file, snapshot)

        self.log(
            "info",
            "bus snapshot captured",
            {
                "busCount": snapshot["busCount"],
                "routeCount": snapshot["routeCount"],
                "file": str(day_file),
            },
        )

    def collect_hourly_static(self) -> None:
        ts = self.now_utc().strftime("%Y%m%dT%H%M%SZ")
        bucket_dir = self.hourly_dir / ts
        bucket_dir.mkdir(parents=True, exist_ok=True)

        routes = self.request_with_retry("getRoutes")
        patterns = self.request_with_retry("getRoutePatterns")
        alerts = self.request_with_retry("getActiveAlerts")

        route_stops = self.build_stops_snapshot(patterns)

        self.write_json(bucket_dir / "routes.json", routes)
        self.write_json(bucket_dir / "route_patterns.json", patterns)
        self.write_json(bucket_dir / "alerts.json", alerts)
        self.write_json(bucket_dir / "stops_derived_from_patterns.json", route_stops)

        latest_dir = self.hourly_dir / "latest"
        latest_dir.mkdir(parents=True, exist_ok=True)
        self.write_json(latest_dir / "routes.json", routes)
        self.write_json(latest_dir / "route_patterns.json", patterns)
        self.write_json(latest_dir / "alerts.json", alerts)
        self.write_json(latest_dir / "stops_derived_from_patterns.json", route_stops)

        self.log(
            "info",
            "hourly static snapshots captured",
            {
                "bucket": str(bucket_dir),
                "routePatterns": len(patterns) if isinstance(patterns, list) else None,
                "alertCount": len(alerts) if isinstance(alerts, list) else None,
                "derivedStopCount": route_stops.get("totalStops"),
            },
        )

    def build_stops_snapshot(self, patterns: Any) -> dict[str, Any]:
        if not isinstance(patterns, list):
            raise RuntimeError("getRoutePatterns returned non-list data")

        stops_by_code: dict[str, dict[str, Any]] = {}
        pattern_errors: list[dict[str, Any]] = []

        for pattern in patterns:
            pattern_name = pattern.get("name") if isinstance(pattern, dict) else None
            route_id = pattern.get("routeId") if isinstance(pattern, dict) else None
            if not pattern_name:
                continue

            try:
                points = self.request_with_retry("getPatternPoints", {"patternName": pattern_name})
            except Exception as err:  # noqa: BLE001
                pattern_errors.append(
                    {
                        "patternName": pattern_name,
                        "routeId": route_id,
                        "error": str(err),
                    }
                )
                continue

            if not isinstance(points, list):
                continue

            for point in points:
                if not isinstance(point, dict):
                    continue
                if point.get("isBusStop") != "Y":
                    continue

                stop_code = str(point.get("stopCode") or "").strip()
                if not stop_code:
                    continue

                lat = self._to_number(point.get("latitude"))
                lng = self._to_number(point.get("longitude"))

                existing = stops_by_code.get(stop_code)
                if existing is None:
                    stops_by_code[stop_code] = {
                        "stopCode": stop_code,
                        "name": point.get("patternPointName"),
                        "latitude": lat,
                        "longitude": lng,
                        "routes": sorted({str(route_id)}) if route_id else [],
                        "patterns": sorted({str(pattern_name)}),
                    }
                else:
                    if route_id:
                        existing["routes"] = sorted(set(existing["routes"]) | {str(route_id)})
                    existing["patterns"] = sorted(set(existing["patterns"]) | {str(pattern_name)})
                    if not existing.get("name") and point.get("patternPointName"):
                        existing["name"] = point.get("patternPointName")
                    if existing.get("latitude") is None and lat is not None:
                        existing["latitude"] = lat
                    if existing.get("longitude") is None and lng is not None:
                        existing["longitude"] = lng

        stops_list = sorted(stops_by_code.values(), key=lambda s: s["stopCode"])
        return {
            "timestampUtc": self.iso_now(),
            "totalStops": len(stops_list),
            "patternErrorCount": len(pattern_errors),
            "patternErrors": pattern_errors,
            "stops": stops_list,
        }

    def run(self) -> None:
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)

        self.log(
            "info",
            "monitor starting",
            {
                "busIntervalSec": self.bus_interval_sec,
                "hourlyIntervalSec": self.hourly_interval_sec,
                "outputDir": str(self.output_dir),
            },
        )

        # Start by capturing static datasets once, then begin loops.
        try:
            self.collect_hourly_static()
        except Exception as err:  # noqa: BLE001
            self.log("error", "initial hourly capture failed (continuing)", {"error": str(err)})

        next_bus = time.monotonic()
        next_hourly = time.monotonic() + self.hourly_interval_sec

        while self.running:
            now = time.monotonic()

            if now >= next_bus:
                try:
                    self.poll_buses()
                except Exception as err:  # noqa: BLE001
                    self.log("error", "bus poll failed (continuing)", {"error": str(err)})
                finally:
                    # Avoid runaway catch-up loops if machine sleeps; jump forward from now.
                    next_bus = now + self.bus_interval_sec

            now = time.monotonic()
            if now >= next_hourly:
                try:
                    self.collect_hourly_static()
                except Exception as err:  # noqa: BLE001
                    self.log("error", "hourly capture failed (continuing)", {"error": str(err)})
                finally:
                    next_hourly = now + self.hourly_interval_sec

            sleep_for = min(max(next_bus - time.monotonic(), 0.2), 1.0)
            time.sleep(sleep_for)

        self.log("info", "monitor stopped")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Long-running RideBT monitor")
    parser.add_argument(
        "--output-dir",
        default="data",
        help="Directory for monitor outputs (default: data next to monitor.py)",
    )
    parser.add_argument(
        "--bus-interval-sec",
        type=int,
        default=DEFAULT_BUS_INTERVAL_SEC,
        help=f"Bus polling interval in seconds (default: {DEFAULT_BUS_INTERVAL_SEC})",
    )
    parser.add_argument(
        "--hourly-interval-sec",
        type=int,
        default=DEFAULT_HOURLY_INTERVAL_SEC,
        help=f"Static snapshot interval in seconds (default: {DEFAULT_HOURLY_INTERVAL_SEC})",
    )
    parser.add_argument(
        "--timeout-sec",
        type=int,
        default=DEFAULT_TIMEOUT_SEC,
        help=f"HTTP timeout per request in seconds (default: {DEFAULT_TIMEOUT_SEC})",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=DEFAULT_RETRIES,
        help=f"Attempts per request before failure (default: {DEFAULT_RETRIES})",
    )
    parser.add_argument(
        "--retry-base-sec",
        type=float,
        default=DEFAULT_RETRY_BASE_SEC,
        help=f"Base backoff delay in seconds (default: {DEFAULT_RETRY_BASE_SEC})",
    )

    args = parser.parse_args(argv)

    if args.bus_interval_sec < 1:
        parser.error("--bus-interval-sec must be >= 1")
    if args.hourly_interval_sec < 60:
        parser.error("--hourly-interval-sec must be >= 60")
    if args.timeout_sec < 1:
        parser.error("--timeout-sec must be >= 1")
    if args.retries < 1:
        parser.error("--retries must be >= 1")
    if args.retry_base_sec <= 0:
        parser.error("--retry-base-sec must be > 0")

    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    base_dir = Path(__file__).resolve().parent
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = (base_dir / output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    monitor = Monitor(
        output_dir=output_dir,
        bus_interval_sec=args.bus_interval_sec,
        hourly_interval_sec=args.hourly_interval_sec,
        timeout_sec=args.timeout_sec,
        retries=args.retries,
        retry_base_sec=args.retry_base_sec,
    )
    monitor.run()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
