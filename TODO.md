# BetterBT Development Roadmap

## Push Preparation (Apr 2026)

- [x] Update `.gitignore` for local env files and temp artifacts
- [ ] Review `git status` and keep only intended feature changes in this push
- [ ] Run lint and type checks before pushing (`npm run lint`)
- [ ] Verify routes tab flow after live map consolidation
- [ ] Update `README.md` with current tab/screen behavior changes

## Phase 1: Foundation (Core Features)

### 1. Screen & Navigation Implementation

#### Route Detail Screen
- [ ] Implement full route detail screen (`app/route/[id].tsx`)
  - [ ] Display route name, color-coded badge
  - [ ] Show list of stops with upcoming arrival times
  - [ ] Display live buses currently on route (animate their positions)
  - [ ] Add link/button to view in map
  - [ ] Wire navigation from routes tab to this screen
  - **Tech**: React Query (`useRouteStops`), TanStack Query caching, route geometry from `useRouteGeometry`

#### Stop Detail Screen - Complete Implementation
- [ ] The screen exists but `fetchArrivals()` currently returns empty
  - [ ] **Discovery**: Find correct BT API endpoint for stop arrivals (via network inspection of ridebt.org)
  - [ ] Once endpoint discovered, update `services/api/btApi.ts` → `fetchArrivals(stopId)`
  - [ ] Normalize stop identifiers (`stopId` vs `stopCode`) across map stops and arrivals API
  - [ ] Add ETA countdown timer (minutes until arrival, "Now" if ≤0)
  - [ ] Show route color badges with route names
  - [ ] Color-code by source: "Live" (green) vs "Scheduled" (gray)
  - **Tech**: React Query with 20s refetch, `useStopArrivals` hook, `ArrivalRow` component

#### Navigation Wiring
- [ ] Make route chip / route list items tap to open route detail
- [ ] Make stop list items tap to open stop detail
- [ ] Ensure back button / dismissal works correctly
- **Tech**: `expo-router` dynamic routes `route/[id]` and `stop/[id]`

---

### 2. Data Persistence & Settings

#### Favorites Storage
- [ ] Move from local `useState` (routes screen) to persistent storage
  - [ ] Wire `settingsStore` (Zustand) to `expo-secure-store` for favorites
  - [ ] Save/load `favoriteRouteIds` and `favoriteStopIds` on app launch
  - [ ] Persist changes whenever user toggles favorite heart icon
  - **Tech**: `expo-secure-store` (installed but unused), Zustand store, useEffect on mount

#### Service Level UI Integration
- [ ] `useServiceLevel` hook exists but is not displayed anywhere
  - [ ] **Critical**: Discover ridebt.org calendar API endpoint (inspect network tab)
  - [ ] Once endpoint found, implement `fetchServiceStatus()` in `services/api/btCalendar.ts`
  - [ ] Parse response to determine: FULL_SERVICE | REDUCED_SERVICE | NO_SERVICE
  - [ ] Display banner/indicator on home screen: "⚠️ Reduced Service Today" or "🟢 Full Service"
  - **Tech**: Custom calendar scraper or API parser, React Query caching

#### Settings Screen & Store Usage
- [ ] Add a settings screen and expose user preferences already in `settingsStore`
  - [ ] Theme mode selector (`light` / `dark` / `auto`)
  - [ ] Map type selector (`map` / `satellite` / `hybrid`) where supported
  - [ ] Notifications preference toggle
  - [ ] Replace remaining local state in feature screens with store-backed state where applicable

---

### 3. User Location & Proximity

#### User Location Hook
- [ ] `useUserLocation` exists but `useNearestStops` is stubbed (returns `[]`)
  - [ ] Implement distance calculation using haversine formula
  - [ ] Find nearest N stops to user's current location within radius
  - [ ] Provide "Nearest Stops" quick-access feature (UI TBD)
  - **Tech**: `expo-location` (installed), haversine distance math, stop coordinates from `fetchStops`

#### Stop Coordinates Data Source
- [ ] Currently `fetchStops()` returns empty (no endpoint confirmed yet)
  - [ ] **Discovery**: Inspect ridebt.org or BT API for stop metadata endpoint
  - [ ] Need: stop ID, name, latitude, longitude, routes served
  - [ ] Update `services/api/btApi.ts` → `fetchStops()`
  - **Tech**: RideBT AJAX API or similar

---

## Phase 1.5: Critical Bug Fixes & UX Polish

### 4. Map & Bus Tracking Refinements

#### Reset Button Crash When Bus Selected
- [x] Currently breaks if user had a bus focused and clicks reset
  - [x] Add null check in reset handler before clearing `focusedBusId`
  - [x] Test: select bus → click reset → verify no crash
  - **Files**: `app/(tabs)/routes.tsx` `resetToAllBuses()` function

#### Map Zoom on Bus Deselection
- [x] Map jumps to random point when user deselects a bus
  - [x] Fix auto-fit logic in `MapView.native.tsx` and `MapView.web.tsx`
  - [x] When `focusedBus` becomes null, preserve current map region
  - [x] Only auto-fit if it's the first load or route was changed
  - **Files**: `components/map/MapView.native.tsx` (line ~170), `MapView.web.tsx` (line ~340)

#### Bus Smoothing Improvements
- [x] Current interpolation doesn't account for GPS jitter or traffic
  - [x] **Change 1**: Detect when bus lat/lng haven't meaningfully changed → apply slower interpolation
    - Only interpolate if distance > X meters from previous
  - [x] **Change 2**: Add "traffic aware" slowdown near intersections/turns
    - Use route geometry to detect sharp turns, reduce speed 20-50% within turn radius
  - [x] **Change 3**: Tune refresh interval for smoothness (currently 5s)
  - **Files**: `services/map/busPrediction.ts`, `constants/config.ts` (REFRESH_INTERVALS.VEHICLES), `MapView.native.tsx` + `.web.tsx`
  - **Tech**: Haversine distance calc, polyline snap adjustment already exists

#### Bus Heading Arrow Visibility
- [x] Currently only shows on routes screen; should show on live map too
  - [x] Consolidated live map into routes; `BusMarker` rotation now applies in the single map experience
  - **Files**: `components/map/BusMarker.tsx`

#### Map Stop Click Selection + Zoom
- [x] Make clicking a stop visible on route geometry select that stop in the stops list and zoom into it
  - [x] Wire stop marker click handler to set selected stop state
  - [x] Scroll/focus matching stop row in stops list UI
  - [x] Animate map camera to clicked stop with tighter zoom
  - **Files**: `components/map/MapView.native.tsx`, `components/map/MapView.web.tsx`, `app/(tabs)/routes.tsx`

---

### 5. Live Map vs. Routes Tab (Consolidation)

#### Evaluate Live Map Necessity
- [x] Routes tab already shows map + bus list + stops + favorites
- [x] Live map tab is a subset of features
  - [x] **Decision**: Remove live map tab and consolidate into routes screen
  - [x] Removed `app/(tabs)/index.tsx` route wiring and tab reference; routes is the canonical live map
  - [x] Added collapsible full-screen map mode within routes screen

#### Optional: Collapsible Routes/Stops List
- [x] Add toggle to hide route list + stops list, show map full-width
  - [x] Button to collapse/expand sidebar (like split-view toggle)
  - [x] Saves space on mobile, shows more map
  - **Tech**: State toggle + conditional rendering, responsive layout

---

## Phase 2: Advanced Features & Data Completeness

### 6. Filtering & Discovery

#### Filtering System Beyond Favorites
- [ ] Current favorites are basic binary saved routes
  - [ ] Add filter UI: by active routes only, by service type (full/reduced)
  - [ ] Search routes by name or short code (search box)
  - [ ] Sort: alphabetical, by distance to user, by bus count
  - **Tech**: React state for active filters, useMemo to compute filtered arrays

#### Filter by Stop
- [ ] Rare use case: show only routes that serve a particular stop
  - [ ] Intent: user selects stop → see all routes via that stop
  - [ ] Implementation: reverse map from stops → routes in data structure
  - **Data needed**: Relationship between stops and routes (from `useRouteStops` + `useStops`)

#### View Location on Map
- [ ] Show user's current GPS position as blue dot on map
  - [ ] Already have `useUserLocation` location data
  - [ ] Add blue marker at user's lat/lng (native: Marker, web: CircleMarker)
  - [ ] Allow user to tap blue dot → center map on location
  - **Tech**: `expo-location`, map marker from `react-native-maps` / `react-leaflet`

---

### 7. Bus Schedule & Arrivals Enhancement

#### Discover Stop Arrivals Endpoint
- [ ] Currently returns empty from `fetchArrivals(stopId)`
  - [ ] **Must do**: Network inspection of ridebt.org → find correct method/endpoint
  - [ ] Expected response: array of upcoming departures with times
  - [ ] Once found, implement in `services/api/btApi.ts`

#### Bus Cycles & Estimated Stop Times
- [ ] Once stop arrivals endpoint is found and working
  - [ ] Each arrival should show: route, scheduled arrival time, live vs. scheduled source
  - [ ] Stretch: Show which bus (vehicle ID) is assigned to that trip
  - [ ] Stretch: Show capacity if available
  - **Tech**: `useStopArrivals` hook, `ArrivalRow` component with countdown timer

#### On-Time / Delayed Status
- [ ] After discovering live bus position + scheduled timetable
  - [ ] Compare actual vs. scheduled arrival at each stop
  - [ ] Show badge: "On Time", "Delayed +5 min", "Early -2 min"
  - [ ] **Prerequisite**: Scheduled timetable data (Phase 2 static JSON from route PDFs)

#### Time-Check Stop Specification
- [ ] Some stops are timing points (exact schedule adherence checked)
- [ ] Others are estimated (pass through within window)
  - [ ] Add metadata to stop data: `isTimingPoint: boolean`
  - [ ] Only show delay/early status at timing points
  - [ ] Non-timing points show estimated range instead
  - **Data source**: Route pattern metadata from BT

#### Service Day Specification
- [ ] Routes run different schedules on weekday vs. weekend vs. special days
  - [ ] Already have `useServiceLevel()` (FULL_SERVICE, REDUCED_SERVICE, NO_SERVICE)
  - [ ] Wire this to show: "Weekday Schedule", "Weekend Schedule", "Holiday - No Service"
  - [ ] Arrivals should show schedule for actual service level of today
  - **Tech**: Service calendar from `btCalendar.ts`, condition arrival queries on service level

#### Smart Route Selection → Nearest Stop Arrival
- [ ] When user selects a route, intelligently show next arrival at their nearest stop
  - [ ] **Intent**: Predict why user opened the route (likely want to catch next bus)
  - [ ] Find user's nearest stop via `useUserLocation` + `useNearestStops`
  - [ ] Query `useStopArrivals` for that stop filtered to selected route
  - [ ] Show: route, next arrival time, current delay status
  - [ ] **UX Polish**: Display "Recommended Boarding Time" = arrival time - 2-3 min buffer
    - Alerts user: if next bus in <5 min, show urgency ("Arriving in X min")
  - [ ] Show delay in real-time: "On time" / "+5 min delay" / "Early by 2 min"
  - **Prerequisite**: User location + stop arrivals endpoint + delay calculation
  - **Tech**: Combined use of `useUserLocation`, `useNearestStops`, `useStopArrivals`, delay comparison logic

#### Bus Schedule Adherence Tracking
- [ ] Calculate real-time deviation from published schedule (once timing API confirmed)
  - [ ] Compare: scheduled arrival/departure vs. actual GPS-derived ETA at each stop
  - [ ] Track running time vs. expected time elapsed since last timing point
  - [ ] Account for: traffic, passenger boarding time, stops skipped
  - [ ] Display status badge: **"On Time ✓"** / **"Delayed +8 min ⚠️"** / **"Running Early -3 min"**
  - [ ] Show confidence: gray if prediction, green if live GPS confirms
  - [ ] Store historical delays per route/day for predictive adjustments
  - **Prerequisite**: 
    - Live GPS positions + vehicle state (location, time)
    - Stop timing point metadata (which stops are hard time checks)
    - Route timetable with dwell times + segment durations
  - **Tech**: Time delta calculation, ETA interpolation along route, historical aggregation

---

### 8. Offline Fallback (Phase 2 Core)

#### Schedule-Based Prediction Engine
- [ ] `services/fallback/scheduler.ts` is currently stubbed (returns `[]`)
  - [ ] **Prerequisite 1**: Obtain static timetable JSON for all routes (parse route PDFs → JSON)
  - [ ] **Prerequisite 2**: Host JSON on GitHub or embed in app
  - [ ] Figure out caching routes in the page and/or hardcoding them to prepare for fallback and reduce repeated route fetching
  - [ ] Implement: given current time + route ID + service level → find active trip
  - [ ] Calculate elapsed time on route → interpolate bus position along path
  - [ ] Account for: service day schedule, trip start time, stop dwell times
  - **Output**: Array of predicted Bus positions with `source: 'offline'` badge
  - **Tech**: Static JSON data, timetable parser, route geometry from `useRouteGeometry`

#### Fallback Integration
- [ ] Currently `useBusPositions` returns empty when live fails
  - [ ] Modify to call `getPredictedBusPositions()` when `useBuses` errors or stales
  - [ ] Show "Predicted" badge instead of "Live" when offline
  - [ ] Keep prediction updated every 10s (follow same cadence as live)
  - **Files**: `hooks/useBuses.ts` useBusPositions function

---

### 9. News & Alerts (Extend Beyond Current)

#### Separate News from Alerts Tab
- [ ] Current "Alerts" tab shows only service disruption alerts
  - [ ] Expand to include news items: route changes, new routes, service improvements
  - [ ] Restructure tab as "News & Alerts" with two sections
  - [ ] Add filtering: show alerts only, news only, or all
  - [ ] Persist "dismissed" state for each item
  - **Tech**: New hook `useNews()` + similar to `useAlerts()`, extend `ServiceAlert` type

#### News Data Source
- [ ] Determine if BT API has news endpoint or if manual updates needed
  - [ ] Stretch: RSS feed from BT website?
  - [ ] Fallback: Static JSON updated periodically

---

## Phase 3: Trip Planning

### 10. Trip Planning Engine

**Scope**: Point A → Point B routing across multiple routes

#### Geocoding
- [ ] Convert user's two tap points to coordinates (or text search to coordinates)
  - [ ] Use OpenStreetMap Nominatim API (free, no key required)
  - [ ] `services/trip-planning/geocoding.ts`
  - **Tech**: Fetch to Nominatim, cache results

#### Stop Proximity Search
- [ ] Find nearest stops within 5-min walk of start/end points
  - [ ] Reuse `useNearestStops` logic
  - [ ] Return top 3-5 candidates per point
  - **Tech**: Haversine distance, walking speed ~1.4 m/s

#### Route Graph & Transfer Routing
- [ ] Build graph: nodes = stops, edges = direct route connections
  - [ ] Compute shortest paths (fewest transfers first, then shortest time)
  - [ ] Dijkstra or BFS to find all viable itineraries
  - [ ] Rank by: total time, # transfers, walking distance
  - **Data needed**: Full stop/route matrix from static data
  - **Tech**: Graph data structure, pathfinding algorithm

#### Multi-Leg Itinerary Display
- [ ] Show trip as segments: "Walk 3 min → HXP bus → Walk 2 min"
  - [ ] Display: route, stops, est. duration, arrival time
  - [ ] Color-code by route
  - [ ] Show on map: walking path + bus route path
  - **Tech**: Directions API (can use mapbox or OSRM for walking paths)

#### Live Adjustments
- [ ] Once live bus data is available
  - [ ] If predicted next bus is delayed, suggest next departure
  - [ ] Show "may miss connection if delayed" warning
  - **Tech**: Run prediction logic against proposed itinerary

---

## Phase 3.5: iOS Widgets

### 11. iPhone Widgets

#### Home Screen Widgets (Small/Medium/Large)
- [ ] Add iPhone Home Screen widgets for quick transit glance
  - [ ] Small widget: show one favorite route with next arrival
  - [ ] Medium widget: show top 2-3 upcoming arrivals across favorites
  - [ ] Large widget: show arrivals + active alert summary
  - [ ] Add tap targets/deep links into specific route/stop screens (`route/[id]`, `stop/[id]`)
  - **Tech**: Expo widget support (or native WidgetKit integration), shared data store/app group, periodic timeline refresh

#### Widget Data Pipeline
- [ ] Provide widget-safe cached data snapshot from app state/API responses
  - [ ] Persist latest arrivals for favorite routes/stops
  - [ ] Include timestamp + staleness indicator in widget UI
  - [ ] Fallback gracefully when network is unavailable
  - **Tech**: Shared storage bridge, lightweight serialization, background refresh constraints

#### Widget Configuration & UX
- [ ] Allow users to configure widget content (favorite route/stop)
  - [ ] Add in-app widget setup helper from settings screen
  - [ ] Support lock screen-safe text truncation and accessibility labels
  - [ ] Validate dark/light appearance and dynamic type sizing

---

## Testing & Deployment

### 11. Platform Testing

#### iOS Testing
- [ ] Test on iPhone simulator and real device
  - [ ] Map rendering (Apple Maps via `react-native-maps`)
  - [ ] Location services permissions & accuracy
  - [ ] Haptic feedback on interactions
  - [ ] Notifications delivery + tapping
  - [ ] Dark mode colors and SafeArea handling
  - [ ] Performance with 50+ buses on screen

#### Android Testing
- [ ] Test on Android emulator and real device
  - [ ] Map rendering (Google Maps via `react-native-maps`)
  - [ ] Location services permissions
  - [ ] Notification sound + vibration
  - [ ] System dark mode theme inheritance
  - [ ] Back button behavior
  - [ ] Network switching (WiFi → cellular)

#### Web Testing
- [ ] Test static web build on multiple browsers
  - [ ] Chrome, Firefox, Safari desktop
  - [ ] Mobile web (Safari iOS, Chrome Android)
  - [ ] Leaflet map responsive
  - [ ] Keyboard navigation (tab through buttons)
  - [ ] Screen reader compatibility (ARIA labels)

---

## Technical Debt & Future Refinement

### 12. Code Quality

#### Dead Code & Structure Cleanup
- [ ] Remove or integrate currently unused files/components
  - [ ] `components/map/RoutePolyline.tsx` (unused placeholder)
  - [ ] `components/ui/AlertBanner.tsx` (implemented but not rendered)
  - [ ] `store/busStore.ts` and `store/routeStore.ts` (unused alongside React Query)
  - [ ] `app/(tabs)/explore.tsx` (template screen not in tab layout)
- [ ] Keep roadmap/docs aligned with implementation status (`README.md`, `API_DOCUMENTATION.md`, `TODO.md`)

#### Error Boundaries & Fallback UI
- [ ] Add React error boundary for map crashes
- [ ] Add retry buttons on API errors
- [ ] Graceful degradation if maps don't load

#### TypeScript Strictness
- [ ] Enable strict mode in `tsconfig.json`
- [ ] Fix any `any` types in transit data models

#### Performance Optimization
- [ ] Memoize heavy list renders (routes, stops)
- [ ] Lazy-load route geometry (only on selection)
- [ ] Limit map marker rendering at high zoom out

#### Analytics & Logging
- [ ] Add basic usage telemetry (route views, favorite counts)
- [ ] Error tracking (Sentry or similar)

---

## Summary Table (Priority)

| Category | Item | Blocking | Est. Effort | Prerequisites |
|----------|------|----------|-------------|---------------|
| **Phase 1 - Critical** | Route detail screen | No | Medium | Navigation wiring |
| **Phase 1 - Critical** | Stop arrivals endpoint | Yes | Low | API discovery |
| **Phase 1 - Critical** | Stop ID/code normalization | Yes | Small | Arrivals + stops endpoint behavior |
| **Phase 1 - Critical** | Service level UI | No | Low | Calendar API discovery |
| **Phase 1 - Critical** | Favorites persistence | No | Low | Zustand + SecureStore |
| **Phase 1 - Critical** | Settings screen + store usage | No | Medium | settingsStore actions |
| **Phase 2 - Core** | Offline fallback | No | Large | Static timetable JSON |
| **Phase 2 - Data** | Filter system | No | Medium | UI + state |
| **Phase 2 - Data** | View location on map | No | Small | Marker UI |
| **Tech Debt** | Dead code cleanup | No | Small | Usage audit |
| **Phase 3** | Trip planning | No | Large | Graph + routing |

---

**Last Updated**: April 3, 2026
