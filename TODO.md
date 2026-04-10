# BetterBT Development Roadmap

## Push Preparation (Apr 2026)

- [x] Update `.gitignore` for local env files and temp artifacts
- [x] Review `git status` and keep only intended feature changes in this push
- [x] Run lint and type checks before pushing (`npm run lint`)
- [x] Verify routes tab flow after live map consolidation
- [x] Update `README.md` with current tab/screen behavior changes

## Phase 1: Foundation (Core Features)

### 1. Screen & Navigation Implementation

#### Route Detail Ownership (Consolidation)
- [x] Designate routes tab (`app/(tabs)/routes.tsx`) as the canonical route-detail UX for Phase 1
- [x] Convert `app/route/[id].tsx` into a deep-link bridge that forwards to routes tab with `routeId`
- [ ] Later: extract shared route-detail module for a standalone stack screen (without duplicating logic)
  - [ ] Reuse shared components/hooks between routes tab and stack route screen
  - [ ] Revisit whether in-app taps should open standalone route detail vs. focus in-tab
  - **Tech**: shared route-detail view model + presentational components

#### Stop Detail Screen - Complete Implementation
- [x] Wire stop-detail arrivals to RideBT departures endpoint (`fetchArrivals(stopId)` no longer returns empty by default)
  - [x] **Discovery**: Found departures endpoint used by ridebt.org (`bt_routes:getNextDeparturesForStop`)
  - [x] Updated `services/api/btApi.ts` → `fetchArrivals(stopId)` to map departures into arrivals
  - [ ] Normalize stop identifiers (`stopId` vs `stopCode`) across map stops and arrivals API
  - [x] Add ETA countdown timer (minutes until arrival, "Now" if ≤0)
  - [x] Show route color badges with route names
  - [x] Color-code by source: "Live" (green) vs "Scheduled" (gray)
  - **Tech**: React Query with 20s refetch, `useStopArrivals` hook, `ArrivalRow` component

#### Navigation Wiring
- [ ] Decide and lock route tap behavior: in-tab focus (current) vs standalone detail screen (later)
- [x] Make "See stop info" action open stop detail in Stops tab path endpoint (`/stops`)
- [ ] Ensure back button / dismissal works correctly
- [x] Show the alerts header label/pill at the top of Stops tab the same way it appears on Routes tab
- **Tech**: `expo-router` dynamic routes `route/[id]` and `stop/[id]`

#### Background Route/Stop Preloading
- [ ] Placeholder stage: background route/stop cache warming is implemented but not reliably working yet
  - [ ] Counter should increase without manual page opens
  - [ ] Prefetch queue should continue while foreground queries are idle
  - [ ] Keep foreground-visible requests (live buses, active screen data) higher priority than background tasks
  - [ ] When user taps a route from a stop, Routes tab should auto-select and scroll to that same stop in the route stop list after route data loads
  - [ ] Fix broken stop deselect behavior after jumping from Stops tab into Routes tab (clicking off the stop should clear selection)
  - **Tech**: TanStack Query prefetch scheduler + shared cache progress state

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
- [x] Add a settings screen (route, navigation entry, version display, and support actions)
- [ ] Expose user preferences already in `settingsStore`
  - [ ] Theme mode selector (`light` / `dark` / `auto`)
  - [ ] Map type selector (`map` / `satellite` / `hybrid`) where supported
  - [ ] Notifications preference toggle
  - [ ] Add "Refresh interval" control above page zoom: slider + textbox (matching zoom control UI)
  - [ ] Constrain refresh interval setting to 3-10 seconds
  - [ ] Wire refresh interval setting into runtime fetch behavior (override default refresh constants)
  - [ ] Add persistent settings cache (survives reloads) for settings values including refresh interval
  - [x] Ensure settings back button falls back to Routes tab when no previous route/tab exists
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

#### Mobile Zoom Controls & Responsive Map Scaling
- [ ] Improve map usability on mobile with explicit zoom controls
  - [ ] Add visible zoom-in and zoom-out buttons over map (native + web)
  - [ ] Ensure controls are reachable with one-handed use and respect safe areas
  - [ ] Add tap targets sized for mobile accessibility (minimum 44x44)
  - [ ] Validate zoom interactions with clustered markers and selected bus/stop states
  - **Files**: `components/map/MapView.native.tsx`, `components/map/MapView.web.tsx`, `app/(tabs)/routes.tsx`
  - **Tech**: Camera/region delta updates, responsive control placement, touch target accessibility

#### Bus Label Scale Standardization
- [ ] Standardize bus label sizing to be proportional to the rest of map UI
  - [ ] Remove hard-coded label shrinking behavior currently used for readability
  - [ ] Define label sizing tokens relative to marker/base UI scale
  - [ ] Use map zoom level as the primary way labels appear smaller/larger
  - [ ] Verify readability at low zoom and overlap behavior at high bus density
  - **Files**: `components/map/BusMarker.tsx`, `components/map/MapView.native.tsx`, `components/map/MapView.web.tsx`, `constants/colors.ts`
  - **Tech**: Zoom-aware style interpolation, shared sizing constants, marker label layout tuning

#### Automatic Zoom by Window Size
- [ ] Auto-adjust default map zoom based on viewport/window dimensions
  - [ ] Define breakpoints for phone portrait, phone landscape, tablet, desktop web
  - [ ] Compute initial camera region/zoom from available map viewport
  - [ ] Recompute on orientation and window resize without jarring recenter behavior
  - [ ] Preserve user-selected zoom after manual interaction (do not fight user input)
  - **Files**: `components/map/MapView.native.tsx`, `components/map/MapView.web.tsx`, `app/(tabs)/routes.tsx`
  - **Tech**: window dimensions listeners, guarded auto-fit logic, first-load vs user-interaction state

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

#### Full-Screen Map Control Discoverability
- [ ] Make the full-screen map toggle more obvious and easier to discover
  - [ ] Replace ambiguous icon/text with clearer label and affordance
  - [ ] Improve contrast, spacing, and visual hierarchy over map background
  - [ ] Add first-run hint/coachmark explaining full-screen mode
  - [ ] Confirm placement does not conflict with zoom controls or stop/bus interactions
  - **Files**: `app/(tabs)/routes.tsx`, `components/ui/*` (new/updated map action button)
  - **Tech**: progressive disclosure, accessible color contrast, mobile-first control positioning

#### iOS App Support & Stability
- [ ] Add end-to-end iOS app support hardening
  - [ ] Verify app lifecycle behavior across foreground/background transitions on iOS
  - [ ] Validate navigation root state restore on resume/cold start
  - [ ] Confirm production build settings in `app.config.js` / Expo config for iOS
- [ ] Fix iOS "app disappearing" issue
  - [ ] Reproduce consistently (device + iOS version + steps)
  - [ ] Capture logs/crash diagnostics during disappearance event
  - [ ] Identify whether issue is crash, process kill, or navigation/state unmount bug
  - [ ] Implement fix and regression test across simulator + physical iPhone
- [x] Tune vertical safe-area spacing so rounded corners stay visible at all window sizes
  - [x] Add adaptive top and bottom padding in both portrait and landscape orientations
  - [x] Ensure padding scales by screen/window height (phone, tablet, split view)
  - [x] Cap minimum/maximum spacing to avoid excessive empty space
  - [x] Verify visually on iOS + Android and web responsive breakpoints

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

#### Route & Stop Search
- [ ] Add search feature for both routes and stops
  - [ ] Add shared search input with mode toggle (Routes / Stops) or unified results list
  - [ ] Support search by route name, short code, stop name, and stop ID/code
  - [ ] Debounce input and highlight matching text in result rows
  - [ ] Tapping a result should navigate directly to `route/[id]` or `stop/[id]`
  - [ ] Persist recent searches for quick re-use and clear history option
  - **Tech**: normalized searchable index, debounced query state, lightweight client-side ranking

#### View Location on Map
- [ ] Show user's current GPS position as blue dot on map
  - [ ] Already have `useUserLocation` location data
  - [ ] Add blue marker at user's lat/lng (native: Marker, web: CircleMarker)
  - [ ] Allow user to tap blue dot → center map on location
  - **Tech**: `expo-location`, map marker from `react-native-maps` / `react-leaflet`

---

### 7. Bus Schedule & Arrivals Enhancement

#### Discover Stop Arrivals Endpoint
- [x] Network inspection + endpoint integration completed for `fetchArrivals(stopId)`
  - [x] **Done**: Verified ridebt.org method/endpoint and request shape
  - [x] **Done**: Returns mapped upcoming departures in app arrival format
  - [x] **Done**: Implemented in `services/api/btApi.ts`

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

#### Terminal Stop Time Anomaly Fixes
- [ ] Fix inconsistent/looping time values at final stops in stop sequences
  - [ ] Reproduce known cases (e.g., HWC Orange Bay 11 showing time rollback after later stop)
  - [ ] Audit arrival ordering logic for terminal/loop routes where stop sequence wraps
  - [ ] Prevent non-monotonic time display in a single trip progression unless service-day boundary is crossed
  - [ ] Add route-specific guardrails/tests for cycle routes with repeated stop IDs
  - **Files**: `services/api/btApi.ts`, `hooks/useRouteStopTimetable.ts`, `hooks/useStopArrivals.ts`, `components/ui/ArrivalRow.tsx`
  - **Tech**: sequence index normalization, trip-instance grouping, time ordering validation

#### Bus Cycle Quality Review & Optimization
- [ ] Evaluate cycle definitions and remove/merge low-value or redundant cycles
  - [ ] Audit cycle usefulness for routes with questionable patterns (e.g., TT Hospital Cycle, Hethwood Square/HWC)
  - [ ] Compare cycle paths against live usage frequency and rider-facing clarity
  - [ ] Consolidate or de-prioritize cycles that add UI noise without meaningful routing value
  - [ ] Validate changes against map display, stop ordering, and schedule integrity
  - **Files**: `services/api/routeScheduleHtml.ts`, `services/api/btApi.ts`, `types/transit.ts`, `constants/staticTransitData.ts`
  - **Tech**: cycle scoring heuristics (usage + uniqueness), route pattern normalization, regression snapshots

#### Live Data Freshness Indicator
- [ ] Show clear "last updated" and "updating..." status for live data areas
  - [ ] Add global timestamp for latest successful live fetch (buses, arrivals, alerts where relevant)
  - [ ] Show "Updating..." while polling/refetch is active
  - [ ] Show stale warning if last update exceeds threshold (e.g., >60s)
  - [ ] Keep wording/source-specific ("Buses updated Xs ago", "Arrivals updating...")
  - **Tech**: React Query `isFetching`/`dataUpdatedAt`, relative-time formatter, stale-state thresholds in config

#### Bus "Current Stop" Accuracy Improvements
- [ ] Improve reliability of the "bus current stop" detection and label text
  - [ ] Refine nearest-stop matching using route geometry direction and stop sequence order
  - [ ] Distinguish between "at stop" vs "approaching" vs "between stops" states
  - [ ] Add confidence threshold to avoid flicker/jumping between adjacent stops
  - [ ] Cross-check against ETA feed when available and prefer authoritative stop state
  - **Files**: `services/map/busPrediction.ts`, `hooks/useBuses.ts`, `components/map/BusMarker.tsx`, `types/transit.ts`
  - **Tech**: snapped position + heading validation, stop-distance thresholding, hysteresis for stable labels

#### Always-Visible Bus Current Stop Text
- [ ] Show "current stop" text for buses even when no bus is selected
  - [ ] Render compact current-stop labels in default multi-bus map mode
  - [ ] Keep selected-bus mode richer, but do not hide baseline labels for unselected buses
  - [ ] Add collision/declutter strategy at dense zoom levels (priority by focused route or viewport center)
  - [ ] Confirm performance remains smooth with 50+ buses on screen
  - **Files**: `components/map/BusMarker.tsx`, `components/map/MapView.native.tsx`, `components/map/MapView.web.tsx`, `app/(tabs)/routes.tsx`
  - **Tech**: adaptive label density, zoom-level label rules, memoized marker rendering

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
  - [ ] Replace extra fallback side panel in Routes UI with a checkbox toggle at the top of the routes list
  - [ ] Add a dedicated fallback details screen explaining exactly what fallback estimation is using
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

#### Web Branding & Metadata
- [x] Add production web branding assets
  - [x] Add favicon set (ICO + PNG sizes) for browser tabs and bookmarks
  - [x] Add site logo assets for header/share previews
  - [x] Verify PWA/app icons are consistent with BetterBT branding
- [x] Set webpage names and document metadata
  - [x] Set default site title and per-page titles (Routes, Alerts, Route Detail, Stop Detail)
  - [x] Add clear meta description for search/share contexts
  - [x] Ensure canonical site name is consistent across app config and web head tags
- [x] Add share/embed metadata for link previews
  - [x] Configure Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`)
  - [x] Configure Twitter/X card tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
  - [x] Validate embeds in common preview tools before launch

#### App Logo & Visual Identity
- [ ] Create official BetterBT app logo and export platform-ready variants
  - [ ] Define logo system (app icon mark, wordmark, monochrome variant)
  - [ ] Produce required outputs for iOS, Android, and web (including high-res source)
  - [ ] Apply logo across app shell, splash/icon assets, and website header/footer
  - [ ] Validate legibility in light/dark themes and small icon sizes
  - **Tech**: Vector-first asset pipeline (SVG master), Expo app icon/splash integration, web asset optimization

#### Website Footer: GitHub + Credits
- [ ] Add persistent website footer with source link and project credits
  - [ ] Add GitHub repository link with external-link affordance
  - [ ] Add concise credits section (data provider, app creator/maintainers)
  - [ ] Include copyright/year and optional license reference
  - [ ] Verify footer responsiveness on mobile and desktop layouts
  - **Files**: `app/+html.tsx`, `app/(tabs)/_layout.tsx` or shared layout component
  - **Tech**: semantic footer markup, accessible links, responsive spacing

#### Release Engineering (CI/CD + Versioning)
- [ ] Define and document CI/CD strategy for web and app builds
  - [ ] Evaluate GitHub Actions workflow for lint, typecheck, tests, and Expo build steps
  - [ ] Add staging vs production deployment flow (branch/tag based)
  - [ ] Document required secrets, environment variables, and rollback process
  - [ ] Add release checklist aligned with this roadmap
- [ ] Enforce version numbers for every release
  - [ ] Adopt semantic versioning policy (`MAJOR.MINOR.PATCH`)
  - [ ] Require version bump before release publish (app + website)
  - [ ] Generate release notes from commits/issues and tag each release in GitHub
  - [x] Surface app version/build number in settings/about UI
  - **Tech**: GitHub Actions, release tags, changelog automation, Expo version/build config

---

## Technical Debt & Future Refinement

### 12. Code Quality

#### Dead Code & Structure Cleanup
- [x] Remove or integrate currently unused files/components
  - [x] `components/map/RoutePolyline.tsx` (unused placeholder)
  - [x] `components/ui/AlertBanner.tsx` (integrated into active screens)
  - [x] `store/busStore.ts` and `store/routeStore.ts` (removed; React Query remains source of truth)
  - [x] `app/(tabs)/explore.tsx` (removed template screen)
- [x] Keep roadmap/docs aligned with implementation status (`README.md`, `API_DOCUMENTATION.md`, `TODO.md`)

#### Error Boundaries & Fallback UI
- [x] Add React error boundary for map crashes
- [x] Add retry buttons on API errors
- [x] Graceful degradation if maps don't load

#### TypeScript Strictness
- [x] Enable strict mode in `tsconfig.json`
- [x] Fix any `any` types in transit data models

#### Performance Optimization
- [x] Memoize heavy list renders (routes, stops)
- [x] Lazy-load route geometry (only on selection)
- [x] Limit map marker rendering at high zoom out

#### Analytics & Logging
- [x] Add basic usage telemetry (route views, favorite counts)
- [x] Error tracking (Sentry or similar)
  - [x] Added lightweight in-app error event logging hooks; full external sink integration remains optional.

#### Self-Hosted Usage Telemetry
- [x] Add minimal, privacy-conscious telemetry to a locally hosted backend
  - [x] Track aggregate usage metrics only (active sessions, visit timestamps, basic platform)
  - [x] Build small local ingestion service endpoint for telemetry events
  - [x] Batch and retry events client-side; avoid blocking UI on network failures
  - [x] Add a settings button below the GitHub source link that opens the standalone data collection policy markdown file
  - [x] Keep telemetry endpoint separate from BT APIs and disable in development by default
  - **Files**: `services/telemetry.ts`, `app/settings.tsx`, `DATA_COLLECTION_POLICY.md`, backend folder (new)
  - **Tech**: lightweight HTTP event ingestion, anonymized payload schema, retention limits

#### README Refresh
- [ ] Improve GitHub README quality and maintainability
  - [ ] Rewrite top section with clear value proposition, screenshots/GIFs, and quick links
  - [ ] Add concise local setup, run, and deploy instructions for iOS/Android/web
  - [ ] Document current architecture (hooks, services, map components, store)
  - [ ] Add roadmap/status snapshot that stays in sync with `TODO.md`
  - [ ] Include contribution guidelines and issue/PR workflow expectations

---

## Summary Table (Priority)

| Category | Item | Blocking | Est. Effort | Prerequisites |
|----------|------|----------|-------------|---------------|
| **Phase 1 - Critical** | Stop ID/code normalization | Yes | Small | Arrivals + stops endpoint behavior |
| **Phase 1 - Critical** | Stops header alerts pill parity | No | Small | Header component reuse from Routes tab |
| **Phase 1 - Critical** | Cross-tab stop deselect fix | No | Small | Stable stop-focus state handoff |
| **Phase 1 - Critical** | Background route/stop preloading stabilization | No | Medium | Query prefetch scheduler validation |
| **Phase 1 - Critical** | Service level UI | No | Low | Calendar API discovery |
| **Phase 1 - Critical** | Favorites persistence | No | Low | Zustand + SecureStore |
| **Phase 1 - Critical** | Settings store wiring + persistence | No | Medium | settingsStore actions |
| **Phase 1 - Critical** | Refresh interval control + runtime override | No | Medium | Settings cache + polling hook integration |
| **Phase 2 - Core** | Offline fallback | No | Large | Static timetable JSON |
| **Phase 2 - Core** | Fallback UI redesign (checkbox + details screen) | No | Medium | Fallback state surface in Routes UI |
| **Phase 2 - Data** | Filter system | No | Medium | UI + state |
| **Phase 2 - Data** | Route + stop search | No | Medium | Search index + navigation wiring |
| **Phase 2 - Data** | View location on map | No | Small | Marker UI |
| **Phase 2 - Data** | Terminal stop time anomaly fixes | Yes | Medium | Trip/stop sequence normalization |
| **Phase 2 - Data** | Cycle quality review + optimization | No | Medium | Pattern usage analysis |
| **Phase 2 - Data** | Bus current-stop accuracy + always-visible text | No | Medium | Stable stop inference + label density rules |
| **Phase 1.5 - UX** | Mobile zoom controls + auto zoom | No | Medium | MapView camera control |
| **Testing/Deployment** | CI/CD strategy + release versioning | No | Medium | Build/test scripts, secrets setup |
| **Testing/Deployment** | App logo + website credits/footer | No | Small | Brand assets + shared layout |
| **Tech Debt** | Self-hosted minimal telemetry | No | Medium | Local backend endpoint |
| **Tech Debt** | README refresh | No | Small | Current feature inventory |
| **Phase 3** | Trip planning | No | Large | Graph + routing |

---

**Last Updated**: April 9, 2026
