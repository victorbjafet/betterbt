# BetterBT API Documentation

Last updated: 2026-04-02

## Overview

The app integrates with the RideBT Joomla AJAX API using a single base endpoint plus a method query parameter.

Related discovery:
- The routes-schedules page also exposes a separate bt_routes AJAX module for stop departure timing.
- Some route schedule detail is embedded directly in the HTML for the trips view, rather than exposed as a standalone JSON endpoint.

Base endpoint:
- https://ridebt.org/index.php?option=com_ajax&module=bt_map&format=json&Itemid=101

Method pattern:
- Add method as a query parameter: &method=<methodName>
- Some methods also require additional query params (for example patternName, stopCode, numOfTrips)

Transport behavior in this app:
- Native (iOS/Android): POST request to the method URL
- Web: GET request through proxy for standard bt_map methods
- Web proxy base: https://api.codetabs.com/v1/proxy/?quest=
- Web POST proxy (for form POST methods like getNextDeparturesForStop): https://cors.eu.org/

Source of truth in repo:
- services/api/btApi.ts
- types/btApi.ts
- testing/api_probe/*.json
- testing/api_probe/api_probe_report.json

## Common Response Envelope

Most API responses follow this wrapper:

```json
{
  "success": true,
  "message": null,
  "messages": null,
  "data": ...
}
```

The app reads only data when success is true.

## Endpoint Status Summary

Used by current app runtime:
- getBuses
- getRoutePatterns
- getPatternPoints
- getActiveAlerts

Implemented in API service but not currently called by hooks/screens:
- None

Implemented in API service and currently called by hooks/screens:
- getNextDeparturesForStop (fallback path in route stop timetable hook)

Known and confirmed from probe artifacts, but not currently used at runtime:
- getRoutes

Not implemented yet in app service layer (placeholder logic only):
- Stops endpoint (unknown)
- Arrivals endpoint (unknown)
- Calendar/service-level endpoint (unknown)

## Endpoints

### 1) getBuses

URL:
- <BASE>&method=getBuses

Params:
- None

Used by app:
- Yes (live vehicle map updates)

Raw data return type:
- data: Array<BusVehicleRaw>

Important raw fields per vehicle:
- id: string
- routeId: string
- stopId: string (optional)
- patternName: string (optional)
- capacity: string (optional)
- percentOfCapacity: string (optional)
- tripStartOn: number (ms epoch in probe sample)
- states: Array<VehicleState>

Important raw fields in states[0]:
- direction: string
- speed: string
- passengers: string (optional)
- isBusAtStop: "Y" | "N" (optional)
- latitude: number
- longitude: number
- realtimeLatitude: number (optional)
- realtimeLongitude: number (optional)
- version: number (ms epoch in probe sample)

App-level normalized return (BtVehicle):
- id: string
- routeID: string
- routeName: string
- heading: number
- lat: number
- lng: number
- speed: number
- updated: number (seconds epoch)
- stopID?: string
- capacity?: number
- percentOfCapacity?: number
- passengers?: number
- isBusAtStop?: boolean
- tripStartOn?: number (seconds epoch)

Example probe file:
- testing/api_probe/getBuses.json

### 2) getRoutePatterns

URL:
- <BASE>&method=getRoutePatterns

Params:
- None

Used by app:
- Yes (route geometry and route stop cycle construction)

Raw data return type:
- data: Array<RoutePattern>

Fields:
- routeId: string
- name: string (pattern name passed into getPatternPoints)
- points: null | Array (typically null in this response)

App-level return (BtPattern):
- routeId: string
- name: string
- points: BtPatternPoint[] | null

Example probe file:
- testing/api_probe/getRoutePatterns.json

### 3) getPatternPoints

URL:
- <BASE>&method=getPatternPoints&patternName=<patternName>

Params:
- patternName: string (required)

Used by app:
- Yes (map polylines and stop extraction for selected/favorite routes)

Raw data return type:
- data: Array<PatternPoint>

Fields:
- routeShortName: string
- patternPointName: string
- isBusStop: "Y" | "N"
- isTimePoint: "Y" | "N"
- stopCode: string
- latitude: string
- longitude: string

App handling notes:
- latitude/longitude are converted from string to number
- only points with isBusStop = "Y" are converted into stop objects in route stop cycle hook

Example probe files:
- testing/api_probe/getPatternPoints.json
- testing/api_probe/getPatternPoints_CAS_to_Orange.json
- testing/api_probe/getPatternPoints_PRG.json
- testing/api_probe/getPatternPoints_CRC_OB.json
- testing/api_probe/getPatternPoints_HXP_FR.json

### 4) getActiveAlerts

URL:
- <BASE>&method=getActiveAlerts

Params:
- None

Used by app:
- Yes (alert banner and service alerts)

Raw data return type:
- data: Array<AlertRaw>

Important raw fields:
- id: string
- typeName: string
- causeTypeName: string
- effectTypeName: string
- title: string
- message: string
- affected: string | string[] | null
- url: string
- startOn: string (epoch seconds string)
- endOn: string (epoch seconds string)
- version: string (ISO date-time)

App-level normalized return (BtAlert):
- id: string
- title: string
- body: string
- severity: "info" | "warning" | "critical"
- affectedRoutes?: string[]
- effectiveFrom: number (seconds epoch)
- effectiveUntil: number (seconds epoch)

Severity mapping used by app:
- critical if text includes detour, closure, or cancel
- warning if text includes technical, delay, or problem
- info otherwise

Example probe file:
- testing/api_probe/getActiveAlerts.json

### 5) getNextDeparturesForStop

URL:
- <BASE>&method=getNextDeparturesForStop&stopCode=<stopCode>&numOfTrips=<numOfTrips>
- The routes-schedules page uses a related live endpoint at:
  - https://ridebt.org/index.php?option=com_ajax&module=bt_routes&method=getNextDeparturesForStop&format=json&Itemid=134

Params:
- stopCode: string (required)
- numOfTrips: number (optional in concept, app defaults to 3)

Used by app:
- Yes, as fallback path in route stop timetable flow

Raw data return type:
- data: Array<Departure>

Fields:
- routeShortName: string
- patternName: string
- stopName: string
- adjustedDepartureTime: string (datetime)

App-level return (BtDeparture):
- routeShortName: string
- patternName: string
- stopName: string
- adjustedDepartureTime: string

Probe notes:
- GET requests to the com_ajax endpoint returned empty arrays in testing.
- POST requests with form data returned populated next-departure JSON.
- This response is narrower than the trips page's embedded schedule JSON.
- This endpoint does not include tripId or stop rank, so it cannot by itself fully align
  repeated-stop loops across concurrent buses.

Example probe files:
- testing/api_probe/getNextDeparturesForStop.json
- testing/api_probe/getNextDeparturesForStop_1143.json
- testing/api_probe/getNextDeparturesForStop_1204.json
- testing/api_probe/getNextDeparturesForStop_1303.json

### 6) getRoutes

URL:
- <BASE>&method=getRoutes

Params:
- None

Used by app:
- No (current app returns static route metadata from constants/staticTransitData.ts)

Known from probe/testing artifacts:
- Confirmed endpoint and valid response

Raw data return type:
- data: object keyed by routeShortName
- each key maps to an array containing one route record

Important fields in each route record:
- routeName: string
- routeShortName: string
- routeColor: string (hex without #)
- routeTextColor: string
- routeColorAdjusted: string
- routeUrl: string
- routeServiceLevel: string

Example probe file:
- testing/api_probe/getRoutes.json

## Trips Page Embedded Schedule Data (routes-schedules?route=<route>&routeView=trips)

Status:
- Confirmed source of richer stop schedule data used by route stop timetable logic.
- Parsed from embedded JS objects in the HTML, not from a dedicated standalone JSON endpoint.

Relevant page URL pattern:
- https://ridebt.org/index.php/routes-schedules?route=<routeShortName>&routeView=trips

Confirmed embedded variables:
- BUSES
- PATTERNS
- ROUTE
- ROUTES
- ROUTE_SCHEDULES
- ROUTE_SCHEDULES_BY_STOP
- STOPS

Most important object for stop times:
- ROUTE_SCHEDULES_BY_STOP
- Shape: object keyed by stopCode -> array of entries

Confirmed fields per schedule entry:
- blockId: string
- tripId: string
- startTime: string
- patternName: string
- stopName: string
- stopCode: string
- rank: string (sortable order along pattern)
- isTimePoint: string
- calculatedArrivalTime: string (ISO datetime)
- calculatedDepartureTime: string (ISO datetime)
- stopNotes: string | null
- routeNotes: string | null

New implementation notes:
- Route stop timetable now primarily uses this embedded schedule structure.
- Rows are grouped by tripId and ordered by an anchor stop time to keep cycle columns
  chronological when multiple buses run the same route.
- Duplicate stop visits on loop routes are disambiguated using rank selection along the
  selected stop traversal order.
- If embedded schedule extraction fails or returns empty, the app falls back to
  getNextDeparturesForStop.

## Known Invalid/Unavailable Methods (Probe)

The probe file testing/api_probe/extra_method_probe.txt shows many guessed methods returning:
- success: false
- message: Method <Name>Ajax does not exist.

Examples include:
- getTrips
- getTrip
- getArrivals
- getCalendar
- getServiceCalendar
- getStopPredictions

These are not available on the current RideBT bt_map AJAX module.

## App-Level API Gaps

The following app functions are placeholders and currently do not hit a backend endpoint:
- fetchStops(): returns []
- fetchArrivals(stopId): returns []
- fetchServiceStatus() in btCalendar.ts: default full service, no remote parse yet

## Quick Reference Table

| Method | Params | Used By Runtime | Returns (data) |
|---|---|---|---|
| getBuses | none | Yes | Array of vehicle objects with nested states |
| getRoutePatterns | none | Yes | Array of route/pattern name pairs |
| getPatternPoints | patternName (required) | Yes | Array of pattern points/stops |
| getActiveAlerts | none | Yes | Array of active alert records |
| getNextDeparturesForStop | stopCode (required), numOfTrips (optional/default 3) | Yes (fallback path) | Array of departures |
| getRoutes | none | No (known only) | Object keyed by route short name |
| routes-schedules embedded JS | route (required), routeView=trips | Yes (primary for timetable alignment) | Objects including ROUTE_SCHEDULES_BY_STOP |

## Notes For Future API Work

- If route metadata should become fully live, switch fetchRoutes() from static data to getRoutes.
- A confirmed stops endpoint is still needed to replace derived stop lists from pattern points.
- A confirmed arrivals/ETA endpoint is still needed to power stop detail arrivals in real time.
- Calendar/service-level integration is pending endpoint discovery or page scraping strategy.
- If the app only needs next few departures, the direct bt_routes getNextDeparturesForStop endpoint is enough.
- If the app needs full cycle-consistent stop timing (especially loop/repeated-stop routes),
  the trips page embedded ROUTE_SCHEDULES_BY_STOP data is the most complete source currently known.
