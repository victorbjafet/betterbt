# BetterBT API Documentation — Official Blacksburg Transit (BT4U) Web Service

Last updated: 2026-07-22

> This documents the **official** Blacksburg Transit data source and the `bt4u`
> provider that consumes it. For the older reverse-engineered RideBT endpoints,
> see **[API_DOCUMENTATION_LEGACY.md](API_DOCUMENTATION_LEGACY.md)** (`ridebt`
> provider).

---

## Overview

Blacksburg Transit publishes a public **SOAP/ASMX web service** — the same
backend that powers the classic BT4U site (`bt4uclassic.org`). Using it removes
the need to reverse-engineer ridebt.org, and it directly supplies data the
reverse-engineered layer could only work around (stop coordinates, nearest
stops, service level, alerts with structured cause/effect metadata).

Service endpoint:

```
https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx
```

Key facts (verified 2026-07-22):

- **Target namespace:** `http://www.bt4u.org/`
- **Transport:** every operation works as a plain **HTTP GET** whose query string
  carries the parameters. No SOAP envelope is needed.
- **Response format:** **XML only.** The service is not registered as a
  `[ScriptService]`, so there is no JSON variant. Each response is an ADO.NET
  DataSet document (see [Response shape](#response-shape)).
- **Liveness:** actively maintained. `GetSummary` shows fresh daily schedule
  loads and `GetActiveAlerts` returns current alerts.
- The two live-only feeds (`GetCurrentBusInfo`, `GetNextDeparturesForStop`) were
  initially inferred from the classic consumer pages (`LiveMap.aspx`,
  `Mobile.aspx`) while no buses were running, then **confirmed against live
  daytime data with buses running (2026-07-22)** — see endpoints 1 and 9 below.
  Both turned out to differ from the classic-JS inference in a couple of
  details (row element name, and `GetNextDeparturesForStop` being one row per
  departure rather than a bundled CSV) — the provider mapping has been
  corrected accordingly.

Source of truth in repo:

- `services/api/providers/bt4u/bt4uProvider.ts` — mapping to normalized types
- `services/api/providers/bt4u/bt4uClient.ts` — GET transport + proxy policy
- `services/api/providers/bt4u/xml.ts` — DataSet XML parser
- `services/api/providers/types.ts` — the `TransitApiProvider` contract
- `constants/config.ts` — `BT4U_WEBSERVICE_BASE`, `API_PROVIDER`

---

## Provider architecture (how it wires in)

The API layer is modular. A single facade preserves the historical function
surface; providers implement it; a config flag selects one.

```
hooks / screens
      │  import { fetchVehicles, fetchAlerts, ... } from '@/services/api/btApi'
      ▼
services/api/btApi.ts            ← facade: same 9 exports as before, delegates
      ▼
services/api/providers/index.ts  ← getTransitApiProvider() reads API_PROVIDER
      ├── bt4u/bt4uProvider.ts       (official, this document — default)
      └── ridebt/ridebtProvider.ts   (legacy, unchanged behavior)
```

- Every provider implements the same `TransitApiProvider` interface and returns
  the same normalized `Bt*` types. Consumers are provider-agnostic.
- **No consumer imports a provider directly and nothing is hard-coded** to one
  backend — swapping `API_PROVIDER` re-points the whole layer.
- Showcase mock mode (`debug/mock-api.enabled`) is honored by both providers.

### Selecting the provider

`constants/config.ts`:

```ts
export const API_PROVIDER: ApiProviderId =
  process.env.EXPO_PUBLIC_API_PROVIDER?.trim().toLowerCase() === 'ridebt'
    ? 'ridebt'
    : 'bt4u';
```

- Default is **`bt4u`** (since 2026-07-22, after live daytime validation with
  buses running and a working self-hosted web CORS proxy — see
  [Validating the live endpoints](#validating-the-live-endpoints) below).
- Switch back to the legacy service by setting `EXPO_PUBLIC_API_PROVIDER=ridebt`
  (env), or change the default in `config.ts`.

The extended, official-only capabilities are exposed on the provider object and
should be feature-detected:

```ts
import { transitApiProvider } from '@/services/api/btApi';
const nearest = await transitApiProvider.fetchNearestStops?.(lat, lng, 5);
const status  = await transitApiProvider.fetchServiceStatus?.();
```

---

## Proxy policy (the "do we still need the proxy?" answer)

The legacy layer needed **two** public proxies on web (a GET proxy for `bt_map`
methods and a POST proxy for form methods). The official service is all-GET, so:

| Platform | Proxy needed? | Why |
|---|---|---|
| **Native (iOS/Android)** | **No** | Native fetch is not subject to CORS. Calls go **directly** to the official endpoint. The public-proxy dependency is removed on device. |
| **Web** | **Yes — a proxy chain** | The service returns `Access-Control-Allow-Origin` pinned to a single unrelated origin (`https://kiosk.lib.vt.edu`), so a browser cannot call it directly. |

Because every official call is a GET, the legacy POST proxy is unnecessary.
**Public proxies are individually unreliable, and independently of each
other** — observed on 2026-07-22:

- `codetabs` — HTTP 522 with ~19s hangs at night; timed out outright (no
  response at all) during the day. Consistently dead both times checked.
- `cors.eu.org` — worked well at night (fast, correct data); returned HTTP 429
  ("temporarily rate limited") during a daytime burst of concurrent requests.
- `proxy.cors.sh` — worked reliably during that same daytime burst (added to
  the chain as a result).

None of these are guaranteed long-term; they're free, unaffiliated third-party
services with their own rate limits and uptime. The client therefore tries a
**configurable chain** (`API_ENDPOINTS.BT4U_WEB_PROXIES`) with a **10s
per-attempt timeout** and a content check (rejects proxies that answer with an
HTML challenge/rate-limit page instead of XML):

1. **Self-hosted proxy** (optional, preferred) — set `EXPO_PUBLIC_BT4U_PROXY` to
   your own endpoint and it is tried first. A ready-to-deploy, locked-down
   Cloudflare Worker + setup guide ships in
   [`cloudflare-worker/`](cloudflare-worker/README.md) (free, no server to run).
2. `https://cors.eu.org/` — raw URL appended
3. `https://proxy.cors.sh/` — raw URL appended
4. `https://api.codetabs.com/v1/proxy/?quest=` — URL-encoded (last resort —
   observed down on both a night and a day check)

If every proxy fails, the request throws and callers degrade gracefully (e.g.
`fetchRoutes` returns `STATIC_ROUTES`) instead of hanging.

> **The self-hosted Worker is the recommended production setup** — not just for
> reliability, but because a real user's first app load fires only ~7 requests
> total to BT4U (see the request-volume note below), and a shared public proxy
> serving many unrelated users can still be rate-limited by *someone else's*
> traffic, not just yours. A self-hosted Worker on Cloudflare's edge has no such
> risk at this scale. The public proxies remain as automatic fallbacks.

**Request volume:** `fetchRoutePatterns()` and `fetchStops()` originally issued
one request **per known route (~20 each)** to the official service, since it has
no "all patterns"/"all stops" call — up to ~40 concurrent requests through a
single shared proxy on first load. Both operations turned out to accept an
**empty `routeShortName`** to return system-wide data in one call, so both were
rewritten to issue a single request each. This is very likely what triggered the
`cors.eu.org` 429 above (heavy testing volume, not organic traffic) and is worth
knowing if a future endpoint doesn't offer an equivalent "all" query and a
per-item fan-out is the only option again.

---

## Response shape

Every operation returns a DataSet document. Row element names vary per operation;
fields are always flat scalar children:

```xml
<?xml version="1.0" encoding="utf-8"?>
<DocumentElement>
  <RowElement>
    <FieldA>value</FieldA>
    <FieldB>value</FieldB>
  </RowElement>
  ...
</DocumentElement>
```

An empty result is `<DocumentElement />` (e.g. no buses running). `xml.ts`
parses this structurally (by depth, not by tag name) into `Record<string,string>`
rows, so it handles every operation — including `GetScheduledPatternPoints`,
whose row element is the route short code itself (`<HXP>`).

---

## Endpoint reference

Legend: **Live** = real-time (empty when no service is running); **Schedule** =
static daily schedule data (available regardless of live status).

### 1) GetCurrentBusInfo — live vehicles → `fetchVehicles()`

- **Params:** none
- **Kind:** Live
- **Row element:** `LatestInfoTable` — **not** `CurrentBusInfo` as initially
  inferred from the classic JS (harmless: the parser here is depth-based and
  never relied on the row tag name). **Confirmed 2026-07-22 with buses running:**

```xml
<LatestInfoTable>
  <AgencyVehicleName>6306</AgencyVehicleName>
  <RouteShortName>CRC</RouteShortName>
  <BlockID>d6b019e8-…</BlockID>
  <TripID>76254426-…</TripID>
  <PatternName>CRC OB</PatternName>
  <TripStartTime>2026-07-22T17:24:00-04:00</TripStartTime>
  <LastStopName>Pratt/Kraft Ebnd</LastStopName>
  <StopCode>1702</StopCode>
  <Rank>74</Rank>
  <IsBusAtStop>N</IsBusAtStop>
  <IsTimePoint>N</IsTimePoint>
  <LatestEvent>2026-07-22T17:35:43-04:00</LatestEvent>
  <LatestRSAEvent>2026-07-22T17:35:22-04:00</LatestRSAEvent>
  <Latitude>37.2013615</Latitude>
  <Longitude>-80.4097085</Longitude>
  <Direction>76</Direction>
  <Speed>0</Speed>
  <TotalCount>1</TotalCount>
  <PercentOfCapacity>1</PercentOfCapacity>
</LatestInfoTable>
```

| Field | Meaning | Maps to `BtVehicle` |
|---|---|---|
| `AgencyVehicleName` | vehicle id | `id` |
| `RouteShortName` | route short code | `routeID` (read directly — no derivation needed) |
| `PatternName` | pattern (e.g. `CRC OB`) | `routeName` fallback |
| `LatestEvent` | last report time | `updated` |
| `LastStopName` | last stop name | — (display only) |
| `StopCode` | last stop **code** | `stopID` |
| `Latitude` / `Longitude` | position | `lat` / `lng` |
| `Direction` | heading, 0–359° | `heading` |
| `Speed` | ground speed | `speed` |
| `TotalCount` | passenger load | `passengers` |
| `PercentOfCapacity` | occupancy % | `percentOfCapacity` |
| `IsBusAtStop` | `Y`/`N` | `isBusAtStop` |
| `BlockID` / `TripID` / `Rank` / `IsTimePoint` / `LatestRSAEvent` / `TripStartTime` | trip/schedule metadata | not currently consumed |

> **Resolved, not a gap: heading & speed ARE provided.** The initial
> documentation (written before any buses were running) assumed `Direction`/
> `Speed` were absent, based on the classic `LiveMap.aspx` JS not reading them —
> that consumer simply computes its own heading rather than using the feed's.
> Confirmed live: `Direction=76`, `Speed=0` on a real vehicle. `bt4uProvider`
> reads these fields directly and only falls back to client-side derivation
> (haversine + bearing between polls) if a row is ever missing them.

### 2) GetScheduledRoutes — all routes → `fetchRoutes()`

- **Params:** `stopCode` (string — **pass empty to get every route**),
  `serviceDate` (`MM/DD/YYYY`)
- **Kind:** Schedule — **works day or night** (no buses required)
- **Row element:** `ScheduledRoutes`
- **Fields:** `RouteName`, `RouteShortName`, `RouteColor`, `RouteTextColor`,
  `RouteURL`, `ServiceLevel`. **Confirmed** sample:

```xml
<ScheduledRoutes>
  <RouteName>Hokie Express</RouteName>
  <RouteShortName>HXP</RouteShortName>
  <RouteColor>00A4A7</RouteColor>
  <RouteTextColor>FFFFFF</RouteTextColor>
  <RouteURL>http://www.bt4uclassic.org/schedules/hxp.pdf</RouteURL>
  <ServiceLevel>Reduced Service</ServiceLevel>
</ScheduledRoutes>
```

- **Mapping → `BtRoute`:** `id`/`shortName`←`RouteShortName`, `name`←`RouteName`,
  `color`←`#`+`RouteColor`, `textColor`←`#`+`RouteTextColor`, `type`←`ServiceLevel`.
- `fetchRoutes()` calls this with an **empty `stopCode`**, which returns all
  routes scheduled for the day (15 in summer). This is why routes load correctly
  overnight. `STATIC_ROUTES` is only a last resort if the network fails entirely.
- With a non-empty `stopCode` the same operation returns just the routes serving
  that stop.

### 3) GetCurrentRoutes — live/running routes only

- **Params:** none · **Kind:** Live — **empty overnight**
- **Row element:** assumed identical to `ScheduledRoutes` (empty at capture time).
- Not currently used by the provider: the route list uses `GetScheduledRoutes`
  (night-safe), and `fetchServiceStatus()` also uses `GetScheduledRoutes` so it
  reports a level day or night. `GetCurrentRoutes` remains available for a future
  "routes running right now" feature.

### 4) GetPatternNamesForDate — patterns per route → `fetchRoutePatterns()`

- **Params:** `routeShortName` (string), `serviceDate` (`MM/DD/YYYY`)
- **Kind:** Schedule
- **Row element:** `PatternNames` — fields `RouteShortName`, `RouteName`,
  `PatternName`. **Confirmed.**
- **Mapping → `BtPattern[]`:** `{ routeId: RouteShortName, name: PatternName,
  points: null }`.
- **Note:** the service has no "all patterns" call. `fetchRoutePatterns()`
  iterates the known route set and aggregates (React Query caches for 1 hour). A
  single route failing does not fail the whole set.

### 5) GetScheduledPatternPoints — geometry & stops → `fetchPatternPoints()`

- **Params:** `patternName` (string)
- **Kind:** Schedule
- **Row element:** the route short code (e.g. `<HXP>`)
- **Fields** (confirmed): `Rank`, `PatternPointName`, `IsBusStop` (`Y`/`N`),
  `IsTimePoint` (`Y`/`N`), `StopCode`, `Latitude`, `Longitude`
- **Mapping → `BtPatternPoint`:** near drop-in for the legacy `getPatternPoints`
  shape (`routeShortName` is derived from the pattern name; the extra `Rank`
  field is ignored). Downstream `queryLoaders` filters `isBusStop === 'Y'`.

### 6) GetScheduledStopInfo — stop metadata → `fetchStops()`

- **Params:** `routeShortName` (string), `serviceDate` (`MM/DD/YYYY`)
- **Kind:** Schedule
- **Row element:** `ScheduledStops` — fields `StopName`, `StopCode`, `Latitude`,
  `Longitude`. **Confirmed.**
- **Fills a legacy gap:** the legacy `fetchStops()` returned `[]` (no confirmed
  endpoint). The official provider aggregates this per route into a
  de-duplicated global stop list **with real coordinates**.

### 7) GetScheduledStopCodes / GetScheduledStopNames — lightweight stop lists

- **Params:** `routeShortName` (string)
- **Kind:** Schedule
- **Row element:** `ScheduledStops` — `StopCode`, `StopName` only (**no
  coordinates**; use `GetScheduledStopInfo` when coordinates are needed).

### 8) GetNearestStops — proximity search → `fetchNearestStops()` *(extended)*

- **Params:** `latitude`, `longitude`, `noOfStops`, `serviceDate` (`MM/DD/YYYY`)
- **Kind:** Schedule
- **Row element:** `StopDistances` — fields `StopName`, `StopCode`, `Feet`,
  `Miles`, `Latitude`, `Longitude`. **Confirmed:**

```xml
<StopDistances>
  <StopName>Main/Roanoke Sbnd</StopName>
  <StopCode>1600</StopCode>
  <Feet>116.195...</Feet>
  <Miles>0.0220...</Miles>
  <Latitude>37.2297</Latitude>
  <Longitude>-80.4143</Longitude>
</StopDistances>
```

- **Mapping → `BtNearestStop[]`** (new type). **Fills the `useNearestStops`
  TODO** (haversine/nearest-stops was stubbed). Exposed as an extended provider
  capability; not yet wired into UI.

### 9) GetNextDeparturesForStop — next departures → `fetchNextDeparturesForStop()` / `fetchArrivals()`

- **Params:** `routeShortName` (string, may be empty for all routes),
  `noOfTrips` (**int, required**), `stopCode` (string)
- **Kind:** Live/Schedule
- **Row element:** `NextDepartures` — **confirmed 2026-07-22 with buses
  running.** The real shape is simpler than initially inferred from
  `LiveMap.aspx`: **one row per departure**, with a direct field, not a bundled
  CSV:

```xml
<NextDepartures>
  <RouteShortName>CRC</RouteShortName>
  <PatternName>CRC OB</PatternName>
  <StopName>Pratt/Kraft Ebnd</StopName>
  <AdjustedDepartureTime>2026-07-22T17:57:34-04:00</AdjustedDepartureTime>
</NextDepartures>
```

- **Mapping → `BtDeparture[]`:** `routeShortName` and `patternName` are read
  **directly** from `RouteShortName`/`PatternName` (previously the code looked
  for a `RouteName` field that does not exist on this row, which silently
  produced `routeShortName: "UNKNOWN"` for every departure — fixed). Each
  `AdjustedDepartureTime` is normalized to an ISO string. A CSV-bundled
  `AdjustedDepartureTime_TripNotes` variant (the shape `LiveMap.aspx` itself
  renders from) is kept as a defensive fallback parse path in case some other
  call shape ever returns it, but the confirmed live shape does not use it.
- **`fetchArrivals(stopId)`** maps these into `BtArrival` exactly as the legacy
  provider does (scheduled, not live-ETA).

> **Parameter name differs from legacy:** official uses `noOfTrips`; the legacy
> RideBT endpoint used `numOfTrips`. The facade signature is unchanged.

### 10) GetActiveAlerts — service alerts → `fetchAlerts()`

- **Params:** `alertTypes`, `alertCauses`, `alertEffects` (all may be empty
  strings)
- **Kind:** Live
- **Row element:** alert record. **Confirmed fields with live data:**

| Field | Example | Maps to `BtAlert` |
|---|---|---|
| `AlertID` | `1476` | `id` |
| `AlertTitle` | `SMS and SME Detours...` | `title` |
| `AlertMessage` | `Due to construction, Stops #1607...` | `body` |
| `AlertTypeName` / `AlertCauseName` / `AlertEffectName` | `Route` / `Construction` / `Detour` | → `severity` |
| `AffectedRoutesTripsStops` | `SMS,SME,1608,1607,1648` | `affectedRoutes` (non-numeric tokens only) |
| `URL` | news link | — |
| `StartDate` / `EndDate` | epoch seconds | `effectiveFrom` / `effectiveUntil` |
| `Version` / `AlertRank` | ISO date / int | — |

- **Severity** uses the same keyword rules as the legacy provider (detour/closure/
  cancel → critical; technical/delay/problem → warning; else info), so alert
  styling is unchanged.

### 11) GetSummary — schedule health / service dates *(diagnostic)*

- **Params:** none · **Kind:** Schedule
- **Row element:** `ScheduleSummary` — `ServiceDate`, `NumberOfRoutes`,
  `NoOfTripPoints`, `StartedLoading`, `FinishedLoading`. Useful as a liveness/
  freshness probe.

### 12) GetArrivalAndDepartureTimesForRoutes — cycle-aligned timetable → `fetchRouteTripsPageEmbeddedJson()`

- **Params:** `routeShortNames` (string; a single short name works), `noOfTrips`
  (int), `serviceDate` (`MM/DD/YYYY`)
- **Kind:** Schedule, but **time-filtered to upcoming trips** for the service
  date (returns empty overnight once the day's trips are done — this is why an
  earlier "today" probe looked empty).
- **Row element:** `DeparturesForRoute` — **confirmed** fields: `BlockID`,
  `TripID`, `StartTime`, `PatternName`, `StopName`, `StopCode`, `Rank`,
  `IsTimePoint`, `CalculatedArrivalTime`, `CalculatedDepartureTime`,
  `RouteNotes`.

```xml
<DeparturesForRoute>
  <BlockID>c1d71a25-…</BlockID>
  <TripID>35cf9ce0-…</TripID>
  <StartTime>1980-01-01T07:00:00-05:00</StartTime>
  <PatternName>HXP FR</PatternName>
  <StopName>Oak Lane North</StopName>
  <StopCode>1118</StopCode>
  <Rank>0</Rank>
  <IsTimePoint>True</IsTimePoint>
  <CalculatedArrivalTime>2026-07-22T07:00:00-04:00</CalculatedArrivalTime>
  <CalculatedDepartureTime>2026-07-22T07:00:00-04:00</CalculatedDepartureTime>
</DeparturesForRoute>
```

- **This replaces an HTML-scraping workaround.** The legacy provider built the
  cycle-aligned timetable by scraping ridebt.org's trips page for an embedded
  `ROUTE_SCHEDULES_BY_STOP` blob. The official feed provides the same
  `TripID` + `Rank` + calculated-time structure as **clean structured XML**, so
  `bt4uProvider.fetchRouteTripsPageEmbeddedJson` groups `DeparturesForRoute`
  rows by `StopCode` into that exact shape (camelCase keys) with **no HTML
  scraping**. `useRouteStopTimetable` consumes it unchanged.

### Other operations (not currently mapped)

`GetArrivalAndDepartureTimesForTrip(tripID)`, `GetNextDepartures(routeShortName,
stopCode)`, `GetPatternPointsForPatternID(patternID, serviceDate)`, plus alert/
place admin methods (`AddAlert`, `AddPlace`, `GetPlaces`, …).

---

## Endpoint status summary

| App function | Official operation | Status |
|---|---|---|
| `fetchVehicles` | `GetCurrentBusInfo` | Wired · **confirmed live** with buses running (heading/speed read directly) |
| `fetchRoutes` | `GetScheduledRoutes` (empty `stopCode`; `STATIC_ROUTES` last resort) | Wired · confirmed · **night-safe** |
| `fetchRoutePatterns` | `GetPatternNamesForDate` (empty `routeShortName`, single call) | Wired · confirmed · **1 request, not ~20** |
| `fetchPatternPoints` | `GetScheduledPatternPoints` | Wired · confirmed |
| `fetchNextDeparturesForStop` | `GetNextDeparturesForStop` | Wired · **confirmed live** with buses running |
| `fetchArrivals` | `GetNextDeparturesForStop` | Wired · confirmed |
| `fetchStops` | `GetScheduledStopInfo` (empty `routeShortName`, single call) | Wired · confirmed · **fills legacy gap, 1 request, not ~20** |
| `fetchAlerts` | `GetActiveAlerts` | Wired · confirmed with live data |
| `fetchNearestStops` *(extended)* | `GetNearestStops` | Wired · confirmed · **fills TODO** |
| `fetchServiceStatus` *(extended)* | `GetScheduledRoutes` (dominant `ServiceLevel`) | Wired · day/night · **shown in header badge** |
| `fetchRouteTripsPageEmbeddedJson` | `GetArrivalAndDepartureTimesForRoutes` | Wired · confirmed · **replaces HTML scraping** |

---

## Feature gaps

**There are no remaining feature gaps as of 2026-07-22.** Bus heading/speed —
the one thing believed missing — was confirmed present once tested against live
daytime data with buses running. Everything the legacy provider did, including
the cycle-aligned timetable that previously required HTML scraping, is
supported by the official service.

### Not gaps — resolved caveats

- **Bus heading & speed — confirmed present, not derived.** The original
  assumption (written before any buses were running) was that `GetCurrentBusInfo`
  omits heading/speed, based on the classic `LiveMap.aspx` consumer not reading
  such a field. Tested live on 2026-07-22 with buses running: the feed **does**
  include `Direction` (heading, 0–359°) and `Speed` directly on each vehicle row.
  `bt4uProvider` reads them directly; client-side derivation (haversine + bearing
  between polls) remains only as a defensive fallback for a row that omits them.

- **Cycle-aligned timetable — supported.** Via
  `GetArrivalAndDepartureTimesForRoutes` (see endpoint 12), which carries
  `TripID` + `Rank` + calculated times. This **removes** the RideBT HTML-scraping
  workaround rather than falling back. Note the feed is time-filtered to upcoming
  trips, so it (correctly) returns nothing overnight.

- **`GetCurrentRoutes` exact schema.** Empty at capture time; assumed identical
  to `GetScheduledRoutes`. Fallback to `STATIC_ROUTES` keeps the route list
  populated regardless.

- **Service level — available and wired.** `fetchServiceStatus` derives today's
  level from `GetScheduledRoutes` (empty `stopCode`, today's date) and reports the
  dominant `ServiceLevel` across routes. Being schedule-based, it is correct day
  or night (the earlier `GetCurrentRoutes` approach was empty overnight).
  `btCalendar.fetchServiceStatus` delegates to it, `useServiceLevel` consumes it,
  and `components/ui/ServiceLevelBadge.tsx` renders it as a header pill.

- **True live-vs-scheduled ETAs.** Departures are scheduled times, not live
  predictions — same as the legacy provider and BT's own site.

---

## Validating the live endpoints

`GetCurrentBusInfo` and `GetNextDeparturesForStop` are empty when no buses are
running (evenings/late night/summer off-hours) — both have now been **confirmed
against live daytime data with buses running (2026-07-22)**, see endpoints 1 and
9 above, **and confirmed working end-to-end in the running app itself** (not
just via direct `curl`) against a self-hosted Cloudflare Worker CORS proxy on
web — see [`cloudflare-worker/README.md`](cloudflare-worker/README.md). This is
what `bt4u` becoming the default provider is based on. To re-verify the raw
schemas at any point (e.g. after a change on BT's end):

```bash
# Live buses
curl "https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx/GetCurrentBusInfo"

# Next departures at a stop (noOfTrips is required; use a real StopCode from
# GetCurrentBusInfo's StopCode field, or any from GetScheduledStopInfo)
curl "https://www.bt4uclassic.org/webservices/bt4u_webservice.asmx/GetNextDeparturesForStop?routeShortName=&noOfTrips=5&stopCode=1702"
```

If field names ever differ from this document, adjust the `pickField(...)`
lookups in `bt4uProvider.ts` — the mappings are centralized there.
