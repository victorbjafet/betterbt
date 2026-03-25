# Hokie Transit — App Development Plan
### A Better Blacksburg Transit Experience

---

## 0. First: Understanding the Data Sources

Before writing a line of code, these three things need to be confirmed by inspecting the BT website's network traffic (browser DevTools → Network tab):

**1. The PassioGO System ID for Blacksburg Transit**
BT's live map is powered by PassioGO (confirmed from their app page and the map widget). Every PassioGO agency has a numeric `systemID`. The live API endpoints are:

```
GET https://passiogo.com/mapGetData.php?systemID=<ID>&vehicles=1
GET https://passiogo.com/mapGetData.php?systemID=<ID>&routeList=1
GET https://passiogo.com/mapGetData.php?systemID=<ID>&stopList=1
GET https://passiogo.com/mapGetData.php?systemID=<ID>&arrivals=1&stopID=<stopID>
```

To find BT's ID: open ridebt.org, open DevTools → Network → filter for `passiogo.com` requests while the map loads. The system ID will be in the query string. It can also be found in the unofficial PassioGO Python library's system list on GitHub.

**2. The BT Service Calendar (ridebt.org)**
The front page already renders calendar events (we saw "Reduced Service" entries for March 9-11 in the HTML). These come from a Joomla calendar component at:
```
https://ridebt.org/index.php?option=com_zcalendar&...
```
Step one: inspect what this returns and whether it can be parsed or scraped into JSON.

**3. Route/Schedule PDFs**
Located at `ridebt.org/routes-schedules`. These will later be converted into static JSON files and hosted on GitHub. For Phase 1, we won't need them — live tracking covers everything. They become essential for Phase 2 (offline fallback + prediction).

---

## 1. Technology Stack

### Core Framework: **Expo (React Native) + TypeScript**

This is the right call over Flutter or plain React Native Web for the following reasons:

| Concern | Expo | Flutter | Ionic/Capacitor |
|---|---|---|---|
| iOS native | ✅ True native | ✅ True native | ⚠️ WebView |
| Android native | ✅ True native | ✅ True native | ⚠️ WebView |
| Web support | ✅ React DOM | ⚠️ Canvas-based, heavy | ✅ Best web |
| Language | TypeScript (universal) | Dart (niche) | TypeScript |
| Map ecosystem | ✅ Excellent | ✅ Good | ✅ Good |
| Serverless fit | ✅ Yes | ✅ Yes | ✅ Yes |
| Community/hiring | ✅ Massive | Good but smaller | Moderate |
| Code reuse | ~85-90% shared | ~100% shared | ~100% shared |

Flutter's web output is a Skia/canvas renderer — it's essentially a bitmap, not real DOM. That's bad for accessibility, SEO, and general "web-ness." Expo's web output is real React DOM, which means it works as a proper website and can be deployed to Vercel/Netlify with zero changes.

Expo also has a mature ecosystem for everything this app needs: maps, location, notifications, storage, and deep links.

### Full Stack Breakdown

```
Language:         TypeScript (strict mode)
Framework:        Expo SDK 52 + Expo Router v4 (file-based routing)
Navigation:       Expo Router (maps directly to URL structure for web)
State:            Zustand (lightweight, zero boilerplate, works everywhere)
Data Fetching:    TanStack Query v5 (caching, background refetch, error states)
Maps (native):    react-native-maps (Apple Maps on iOS, Google Maps on Android)
Maps (web):       react-leaflet + OpenStreetMap tiles (no API key required)
Styling:          NativeWind v4 (Tailwind CSS syntax for React Native)
HTTP:             Native fetch API (built-in, no axios needed)
Local Storage:    expo-secure-store (sensitive) + AsyncStorage (general prefs)
Location:         expo-location (user GPS for nearest stop, future routing)
Icons:            @expo/vector-icons (built in) + custom SVGs for bus markers
```

**Why OpenStreetMap/Leaflet for web maps?**
It's free, has no API key requirement, has excellent coverage of Blacksburg/VT campus, and Leaflet is battle-tested for transit apps. On native, Apple Maps (iOS) and Google Maps (Android) are used via `react-native-maps` — both are free at the usage levels a transit app generates. This avoids the Mapbox pricing trap entirely.

---

## 2. Repository Structure

```
hokie-transit/
├── app/                          # Expo Router: all screens (file = route)
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab bar definition
│   │   ├── index.tsx             # 🗺️  Live Map (default tab)
│   │   ├── routes.tsx            # 📋 All Routes list
│   │   └── alerts.tsx            # 🚨 Service alerts
│   ├── route/
│   │   └── [id].tsx              # Route detail: stops, live ETAs, path on map
│   ├── stop/
│   │   └── [id].tsx              # Stop detail: upcoming arrivals, which routes serve it
│   └── _layout.tsx               # Root layout (providers, theme)
│
├── components/
│   ├── map/
│   │   ├── BusMarker.tsx         # Animated bus icon marker
│   │   ├── RoutePolyline.tsx     # Draws route path on map
│   │   ├── StopMarker.tsx        # Bus stop pin
│   │   └── MapView.native.tsx    # react-native-maps (iOS/Android)
│   │   └── MapView.web.tsx       # react-leaflet (web)
│   ├── ui/
│   │   ├── RouteChip.tsx         # Colored route badge (e.g. "HXP")
│   │   ├── ArrivalRow.tsx        # Single ETA row in stop detail
│   │   ├── StatusBadge.tsx       # "Live" / "Predicted" / "Offline"
│   │   └── AlertBanner.tsx       # Service alert dismissible banner
│   └── layout/
│       └── ScreenWrapper.tsx     # Safe area + scroll handling
│
├── hooks/
│   ├── useBuses.ts               # Live vehicle positions (TanStack Query)
│   ├── useRoutes.ts              # Route list + details
│   ├── useStopArrivals.ts        # ETAs for a stop
│   ├── useAlerts.ts              # Service alerts
│   ├── useServiceLevel.ts        # Today's service level (full/reduced/no service)
│   └── useUserLocation.ts        # User GPS, nearest stop
│
├── services/
│   ├── api/
│   │   ├── passioGO.ts           # All PassioGO API calls (raw fetch wrappers)
│   │   └── btCalendar.ts         # Parses BT service calendar from ridebt.org
│   └── fallback/
│       └── scheduler.ts          # (Phase 2) Schedule-based prediction engine
│
├── store/
│   ├── busStore.ts               # Zustand: live bus positions
│   ├── routeStore.ts             # Zustand: routes + selected route
│   └── settingsStore.ts          # Zustand: user prefs (theme, saved routes, etc.)
│
├── types/
│   ├── passioGO.ts               # API response types
│   ├── transit.ts                # App-level types (Bus, Route, Stop, Arrival)
│   └── serviceLevel.ts           # Enum: FULL | REDUCED | NO_SERVICE | GAME_DAY
│
├── constants/
│   ├── colors.ts                 # Route colors, theme tokens
│   └── config.ts                 # System ID, API base URLs, refresh intervals
│
└── data/                         # (Phase 2) Static JSON from GitHub
    ├── routes/                   # One JSON per route with path + stops
    ├── schedules/                # Timetables per service level
    └── calendar.json             # Service calendar (updated periodically)
```

The `.native.tsx` / `.web.tsx` suffix is an Expo platform extension — Expo Router automatically uses the right file based on platform. This is how we serve react-native-maps on device and react-leaflet on web without any `Platform.OS` conditionals cluttering the code.

---

## 3. Data Architecture & API Layer

### PassioGO API Calls (`services/api/passioGO.ts`)

```typescript
const BASE = "https://passiogo.com/mapGetData.php";
const SYSTEM_ID = 1234; // ← replace with actual BT system ID

// Called every 15 seconds for live bus positions
export const fetchVehicles = (): Promise<PassioVehicle[]>

// Called once on app load, cached for the session
export const fetchRoutes = (): Promise<PassioRoute[]>
export const fetchStops = (): Promise<PassioStop[]>

// Called when user views a stop (on demand)
export const fetchArrivals = (stopId: string): Promise<PassioArrival[]>

// Called once on app load
export const fetchAlerts = (): Promise<PassioAlert[]>
```

### TanStack Query Configuration (`hooks/useBuses.ts`)

```typescript
export function useBuses() {
  return useQuery({
    queryKey: ['buses'],
    queryFn: fetchVehicles,
    refetchInterval: 15_000,         // Poll every 15s while app is active
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: 2,
    // When this fails: TanStack Query exposes isError + dataUpdatedAt
    // UI will show "Last updated X min ago" + switch to predicted mode
  });
}
```

### The Fallback Pattern (future-ready from day one)

Even in Phase 1, the hook API is designed so the fallback slot is ready:

```typescript
// hooks/useBusPositions.ts (the "smart" hook the UI actually calls)
export function useBusPositions() {
  const live = useBuses();
  const isStale = Date.now() - live.dataUpdatedAt > 60_000;

  if (live.isError || isStale) {
    // Phase 2: return predicted positions from scheduler
    // Phase 1: return empty + show "tracking unavailable" banner
    return { data: [], source: 'offline', lastUpdate: live.dataUpdatedAt };
  }

  return { data: live.data, source: 'live', lastUpdate: live.dataUpdatedAt };
}
```

This means Phase 2's prediction engine plugs in without touching any UI code.

---

## 4. Phase Plan

### Phase 1 — Foundation (Build Now)
**Goal:** Match and beat the core functionality of the existing BT app.

- [ ] Project scaffolding: Expo + TypeScript + NativeWind + Expo Router
- [ ] Identify PassioGO system ID via network inspection
- [ ] `passioGO.ts` service with all API calls typed
- [ ] Live map tab: buses on map with route colors, auto-refreshing
- [ ] Bus markers: icon rotates to match heading, animates on position update
- [ ] Routes list tab: all routes, color-coded, active/inactive status
- [ ] Route detail screen: stop list, live buses on route, ETA countdown
- [ ] Stop detail screen: upcoming arrivals across all routes serving that stop
- [ ] Service alerts banner on home screen
- [ ] ServiceLevel hook: fetch today's calendar entry from ridebt.org, display "REDUCED SERVICE" indicator
- [ ] Basic settings: save favorite routes/stops
- [ ] Platform map split: react-native-maps (native) vs react-leaflet (web)

**Deliverable:** A working app installable on iOS/Android via Expo Go, and a deployable static web build.

### Phase 2 — Offline Fallback & Prediction
**Goal:** App works even when PassioGO is down.

- [ ] Convert all route PDFs → JSON (stops, paths, timetables) and host on GitHub
- [ ] Build schedule parser: given current time + service level → expected positions
- [ ] Wire into `useBusPositions` hook's fallback slot
- [ ] Show "Predicted" vs "Live" badge on each bus marker
- [ ] "Next run / Last run" for routes that aren't currently active
- [ ] Calendar JSON auto-update pipeline (periodic GitHub Action or manual update)

### Phase 3 — Trip Planning
**Goal:** Point A to Point B routing using BT.

- [ ] Geocoding: convert user's two points to lat/lng (OpenStreetMap Nominatim, free)
- [ ] Stop proximity: find nearest stops to each point
- [ ] Route graph: build adjacency from static stop/route data
- [ ] Dijkstra/BFS: find all viable paths from source stops to destination stops
- [ ] Multi-leg trips: walk to stop → ride route X → transfer to route Y → walk to dest
- [ ] Rank results by: total time, number of transfers, walking distance
- [ ] Turn-by-turn instructions: "Walk 3 min to Squires Student Center stop → Take HXP toward Hethwood → Exit at Main St"
- [ ] Live adjustments: if the predicted next bus is running late (from Phase 2 data), suggest the next departure

---

## 5. Critical Early Decisions

### Map Tiles (No API Key Required)
OpenStreetMap tiles via:
```
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```
These are free but have a usage policy — for a transit app serving a university community, this is perfectly appropriate. No key, no billing, no surprises.

### CORS on PassioGO API
The PassioGO API is called from browser contexts on the web build. If CORS is an issue (it may be, as the API was designed for app use), options are:
1. Use a CORS-anywhere proxy (bad for production)
2. Host a thin Cloudflare Worker as a proxy (free tier, serverless, ~10 lines of code)
3. Check if the API already allows `*` origins (many campus transit APIs do)

This needs to be verified on day one of development.

### State Refresh Strategy
| Data | Refresh Rate | Reason |
|---|---|---|
| Bus positions | 15 seconds | Matches PassioGO's internal update frequency |
| ETAs at stop | 20 seconds | Slightly slower, less critical |
| Route/stop list | On app launch only | Changes rarely (maybe semester-to-semester) |
| Service alerts | 5 minutes | Important but not real-time |
| Service calendar | On app launch only | Rarely changes mid-day |

### Handling "No Service" vs "Service Down"
These are two very different states that need distinct UI:
- **No service** (confirmed via calendar): "No buses running today. Next service: tomorrow at 6 AM."
- **Tracking down** (PassioGO error): "Live tracking unavailable. Showing scheduled positions." + gray "PREDICTED" badge on each bus
- **Partial outage** (some buses not transmitting, like the 3/6/26 incident BT tweeted about): Show confirmed buses as live, missing ones as predicted with reduced confidence

---

## 6. Project Kickoff Checklist

Before writing any app code:

1. **Discover PassioGO System ID** — open ridebt.org in browser, DevTools → Network → watch for `passiogo.com` calls while map loads. Record the `systemID` query parameter.

2. **Audit all API responses** — use curl or a REST client to hit:
   - `vehicles=1` — what does a vehicle object look like? What fields exist?
   - `routeList=1` — route colors, IDs, short names
   - `stopList=1` — stop coordinates, names, IDs
   Check if CORS headers are present on the response.

3. **Check Calendar API** — inspect ridebt.org homepage network traffic, find the calendar XHR call, verify it returns parseable data with service level strings.

4. **Scaffold Expo project:**
   ```bash
   npx create-expo-app hokie-transit --template tabs
   cd hokie-transit
   npx expo install nativewind tailwindcss
   npx expo install @tanstack/react-query zustand
   npx expo install react-native-maps
   npm install react-leaflet leaflet  # web only
   ```

5. **Set up GitHub repo with:**
   - `/app` — Expo project
   - `/data` — static JSON (empty for now, Phase 2)
   - `README.md` — PassioGO system ID, API docs, data format spec

6. **Verify the build pipeline:**
   - `npx expo start` → works on simulator
   - `npx expo export --platform web` → deployable static site
   - `eas build` → iOS/Android builds (when ready for distribution)

---

## 7. What This Foundation Enables

By building Phase 1 this way — with the API abstraction layer, the platform-split map components, and the hook structure already designed for fallback — every future feature has a clean insertion point:

- **Predictive tracking** → just fill in the fallback slot in `useBusPositions`
- **Trip planning** → add a new tab, reuse stop/route data already in Zustand
- **Notifications** → `expo-notifications` is already in the Expo SDK, fire from `useStopArrivals`
- **Widgets** (iOS/Android homescreen) → Expo 52 has WidgetKit/AppWidget support; the same data hooks can power them
- **Apple CarPlay / Android Auto** → longer term, but the data layer is already suited for it

The goal of Phase 1 isn't just to build a map with dots on it. It's to build an architecture that makes every subsequent feature feel like it was always part of the plan.
