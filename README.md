# [BetterBT](https://betterbt.vbjfr.xyz)

This project is live at betterbt.vbjfr.xyz

BetterBT is a real-time bus tracking app for Blacksburg Transit (BT).

It helps riders quickly answer three questions:
1. Where is my bus right now?
2. When will it reach my stop?
3. Are there service alerts I should know about?

## Project Goal

The goal of BetterBT is to make BT travel easier and less stressful by giving riders fast, reliable, and easy-to-read transit information in one place.

## Features

- Live bus locations on a map
- Route browsing with route-specific details
- Stop pages with next arrival predictions
- Service alerts and status indicators
- Route and stop views with map overlays
- Saved/favorite route support for quick access
- Fallback scheduling logic for better resilience when data is limited
- Map crash boundary with graceful fallback and retry actions
- Lightweight telemetry hooks for route/favorite usage and error events
- Mobile-first experience built with Expo and React Native

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Run the app

```bash
npx expo start
```

3. Open on your target platform

- iOS simulator
- Android emulator
- Expo Go
- Web

## Tech Stack

- Expo
- React Native
- TypeScript
- Expo Router

## Notes

- API behavior and probe details are documented in `API_DOCUMENTATION.md`.
- Planning notes are in `bt-app-plan.md`.

## Versioning

BetterBT uses a date-based app version format:
- `YYYY.MM.DD.N`
- `N` starts at `0` for the first release of a given date
- `N` increments (`.1`, `.2`, etc.) for additional releases on that same date

## Showcase Mock API Mode

BetterBT includes a file-gated mock API mode for demos when the RideBT API is unavailable.

How it works:
- If the file `debug/mock-api.enabled` exists at project root, app startup enables mock mode.
- If the file is missing, BetterBT uses the live RideBT API.

Enable mock mode:

```bash
mkdir -p debug && touch debug/mock-api.enabled
npx expo start -c
```

Disable mock mode:

```bash
rm -f debug/mock-api.enabled
npx expo start -c
```

Mock responses mirror the documented endpoint shapes for:
- `getBuses`
- `getRoutePatterns`
- `getPatternPoints`
- `getNextDeparturesForStop`
- `getActiveAlerts`
