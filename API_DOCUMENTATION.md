# BetterBT API Documentation

Last updated: 2026-03-31

## Overview

The app integrates with the RideBT Joomla AJAX API using a single base endpoint plus a method query parameter.

Base endpoint:
- https://ridebt.org/index.php?option=com_ajax&module=bt_map&format=json&Itemid=101

Method pattern:
- Add method as a query parameter: &method=<methodName>
- Some methods also require additional query params (for example patternName, stopCode, numOfTrips)

Transport behavior in this app:
- Native (iOS/Android): POST request to the method URL
- Web: GET request through proxy
- Web proxy base: https://api.codetabs.com/v1/proxy/?quest=

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
- getNextDeparturesForStop

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

Params:
- stopCode: string (required)
- numOfTrips: number (optional in concept, app defaults to 3)

Used by app:
- Not currently called by hooks/screens, but implemented in API service

Raw data return type:
- data: Array<Departure>

Fields:
- routeShortName: string
- adjustedDepartureTime: string (datetime)

App-level return (BtDeparture):
- routeShortName: string
- adjustedDepartureTime: string

Probe notes:
- Multiple probe captures currently returned empty arrays for tested stops

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
| getNextDeparturesForStop | stopCode (required), numOfTrips (optional/default 3) | Service only (not currently invoked) | Array of departures |
| getRoutes | none | No (known only) | Object keyed by route short name |

## Notes For Future API Work

- If route metadata should become fully live, switch fetchRoutes() from static data to getRoutes.
- A confirmed stops endpoint is still needed to replace derived stop lists from pattern points.
- A confirmed arrivals/ETA endpoint is still needed to power stop detail arrivals in real time.
- Calendar/service-level integration is pending endpoint discovery or page scraping strategy.
