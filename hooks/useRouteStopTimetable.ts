import { REFRESH_INTERVALS, STALE_TIMES } from '@/constants/config';
import { fetchNextDeparturesForStop, fetchRouteTripsPageEmbeddedJson } from '@/services/api/btApi';
import { BtStopDepartureRow } from '@/types/btApi';
import { Stop } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

const FALLBACK_OVERFETCH_FACTOR = 4;
const FALLBACK_MAX_REQUESTED_TRIPS = 500;
const MIN_CYCLE_COMPLETENESS_RATIO = 0.6;
const MAX_CONSECUTIVE_INCOMPLETE_CYCLES = 2;

interface EmbeddedStopScheduleEntry {
  tripId?: string;
  patternName?: string;
  stopName?: string;
  stopCode?: string;
  rank?: string | number;
  calculatedArrivalTime?: string;
  calculatedDepartureTime?: string;
}

const normalizePatternName = (value?: string | null): string => (value ?? '').trim().toLowerCase();

const parseTime = (value?: string): number => {
  if (!value) return Number.NaN;
  return Date.parse(value);
};

const readEntryTime = (entry: EmbeddedStopScheduleEntry): string | null => {
  const candidate = entry.calculatedDepartureTime ?? entry.calculatedArrivalTime;
  if (!candidate) return null;
  return Number.isNaN(parseTime(candidate)) ? null : candidate;
};

const readEntryRank = (entry: EmbeddedStopScheduleEntry): number | null => {
  const numeric = Number(entry.rank);
  return Number.isFinite(numeric) ? numeric : null;
};

const matchesRoutePatternName = (routeId: string, patternName?: string | null): boolean => {
  const normalizedPattern = normalizePatternName(patternName);
  if (!normalizedPattern) return false;

  const normalizedRoute = normalizePatternName(routeId);
  if (!normalizedRoute) return false;

  if (normalizedPattern.startsWith(normalizedRoute)) return true;
  return new RegExp(`\\b${normalizedRoute}\\b`, 'i').test(normalizedPattern);
};

const choosePreferredRankByStop = (
  stopCodesInOrder: string[],
  entriesByStopCode: Map<string, EmbeddedStopScheduleEntry[]>
): Map<string, number | null> => {
  const preferredRankByStop = new Map<string, number | null>();
  let previousRank = Number.NEGATIVE_INFINITY;

  stopCodesInOrder.forEach((stopCode) => {
    const ranks = Array.from(
      new Set(
        (entriesByStopCode.get(stopCode) ?? [])
          .map((entry) => readEntryRank(entry))
          .filter((rank): rank is number => rank !== null)
      )
    ).sort((a, b) => a - b);

    if (ranks.length === 0) {
      preferredRankByStop.set(stopCode, null);
      return;
    }

    const nextRank = ranks.find((rank) => rank >= previousRank) ?? ranks[0];
    preferredRankByStop.set(stopCode, nextRank);
    previousRank = nextRank;
  });

  return preferredRankByStop;
};

const sortTripsByAnchorTime = (
  tripIds: string[],
  departuresByTripAndStop: Map<string, Map<string, BtStopDepartureRow['departures'][number]>>,
  anchorStopCode: string
): string[] => {
  const now = Date.now();
  const graceWindowMs = 2 * 60 * 1000;
  const threshold = now - graceWindowMs;

  const scored = tripIds
    .map((tripId) => {
      const tripDepartures = departuresByTripAndStop.get(tripId);
      if (!tripDepartures) return null;

      const anchorDeparture = tripDepartures?.get(anchorStopCode);
      if (!anchorDeparture) return null;

      const timestamp = parseTime(anchorDeparture.adjustedDepartureTime);
      if (Number.isNaN(timestamp)) return null;

      const endTimestamp = Math.max(
        ...Array.from(tripDepartures.values())
          .map((departure) => parseTime(departure.adjustedDepartureTime))
          .filter((value) => !Number.isNaN(value))
      );

      if (Number.isNaN(endTimestamp)) return null;

      return {
        tripId,
        timestamp,
        endTimestamp,
      };
    })
    .filter((value): value is { tripId: string; timestamp: number; endTimestamp: number } => value !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  const upcoming = scored.filter((value) => value.timestamp >= threshold);
  if (upcoming.length === 0) {
    return scored.map((value) => value.tripId);
  }

  // Keep trips that are currently in progress even if their anchor stop already passed.
  const ongoing = scored.filter((value) => value.timestamp < threshold && value.endTimestamp >= threshold);
  return [...ongoing, ...upcoming]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((value) => value.tripId);
};

const isValidDepartureTime = (value: string): boolean => !Number.isNaN(parseTime(value));

const buildRowsFromEmbeddedSchedule = (
  routeId: string,
  selectedPatternName: string | null | undefined,
  stops: Stop[],
  numOfTrips: number,
  embedded: Record<string, unknown>
): BtStopDepartureRow[] => {
  const byStopRaw = embedded.ROUTE_SCHEDULES_BY_STOP;
  if (!byStopRaw || typeof byStopRaw !== 'object') {
    return stops.map((stop) => ({
      stopCode: stop.code?.trim() || stop.id,
      stopName: stop.name,
      departures: [],
    }));
  }

  const byStop = byStopRaw as Record<string, unknown>;
  const selectedPatternKey = normalizePatternName(selectedPatternName);
  const normalizedStopCodeByIndex = stops.map((stop) => stop.code?.trim() || stop.id?.trim() || stop.id);
  const entriesByStopCode = new Map<string, EmbeddedStopScheduleEntry[]>();

  normalizedStopCodeByIndex.forEach((stopCode) => {
    const rawEntries = byStop[stopCode];
    const entries = Array.isArray(rawEntries) ? (rawEntries as EmbeddedStopScheduleEntry[]) : [];

    const byRoute = entries.filter((entry) => matchesRoutePatternName(routeId, entry.patternName));
    const byPattern = selectedPatternKey
      ? entries.filter((entry) => normalizePatternName(entry.patternName) === selectedPatternKey)
      : [];

    entriesByStopCode.set(stopCode, byPattern.length > 0 ? byPattern : byRoute);
  });

  const preferredRankByStop = choosePreferredRankByStop(normalizedStopCodeByIndex, entriesByStopCode);
  const departuresByTripAndStop = new Map<string, Map<string, BtStopDepartureRow['departures'][number]>>();

  normalizedStopCodeByIndex.forEach((stopCode, stopIndex) => {
    const stopName = stops[stopIndex]?.name ?? stopCode;
    const preferredRank = preferredRankByStop.get(stopCode);

    (entriesByStopCode.get(stopCode) ?? []).forEach((entry) => {
      const tripId = entry.tripId?.trim();
      const adjustedDepartureTime = readEntryTime(entry);
      if (!tripId || !adjustedDepartureTime) return;

      const entryRank = readEntryRank(entry);
      if (preferredRank !== null && entryRank !== null && entryRank !== preferredRank) {
        return;
      }

      const nextDeparture = {
        routeShortName: routeId,
        patternName: (entry.patternName ?? routeId).trim(),
        stopName: (entry.stopName ?? stopName).trim(),
        adjustedDepartureTime,
      };

      const tripDepartures = departuresByTripAndStop.get(tripId) ?? new Map<string, typeof nextDeparture>();
      const existing = tripDepartures.get(stopCode);

      if (!existing) {
        tripDepartures.set(stopCode, nextDeparture);
      } else {
        const existingTime = parseTime(existing.adjustedDepartureTime);
        const nextTime = parseTime(nextDeparture.adjustedDepartureTime);

        if (!Number.isNaN(nextTime) && (Number.isNaN(existingTime) || nextTime < existingTime)) {
          tripDepartures.set(stopCode, nextDeparture);
        }
      }

      departuresByTripAndStop.set(tripId, tripDepartures);
    });
  });

  const anchorStopCode = normalizedStopCodeByIndex.find((stopCode) =>
    Array.from(departuresByTripAndStop.values()).some((tripDepartures) => tripDepartures.has(stopCode))
  );

  if (!anchorStopCode) {
    return stops.map((stop) => ({
      stopCode: stop.code?.trim() || stop.id,
      stopName: stop.name,
      departures: [],
    }));
  }

  const orderedTripIds = sortTripsByAnchorTime(Array.from(departuresByTripAndStop.keys()), departuresByTripAndStop, anchorStopCode)
    .slice(0, numOfTrips);

  const requiredCoveredStops = Math.max(
    2,
    Math.min(normalizedStopCodeByIndex.length, Math.ceil(normalizedStopCodeByIndex.length * MIN_CYCLE_COMPLETENESS_RATIO))
  );

  const stableTripIds: string[] = [];
  let consecutiveIncomplete = 0;

  for (const tripId of orderedTripIds) {
    const tripDepartures = departuresByTripAndStop.get(tripId);
    if (!tripDepartures) {
      consecutiveIncomplete += 1;
      if (consecutiveIncomplete >= MAX_CONSECUTIVE_INCOMPLETE_CYCLES) {
        break;
      }
      continue;
    }

    const coveredStops = normalizedStopCodeByIndex.reduce((count, stopCode) => {
      const departure = tripDepartures.get(stopCode);
      if (!departure) return count;
      return isValidDepartureTime(departure.adjustedDepartureTime) ? count + 1 : count;
    }, 0);

    if (coveredStops >= requiredCoveredStops) {
      stableTripIds.push(tripId);
      consecutiveIncomplete = 0;
      continue;
    }

    consecutiveIncomplete += 1;
    if (consecutiveIncomplete >= MAX_CONSECUTIVE_INCOMPLETE_CYCLES) {
      break;
    }
  }

  const selectedTripIds = stableTripIds.length > 0
    ? stableTripIds
    : orderedTripIds.slice(0, Math.min(3, orderedTripIds.length));

  return stops.map((stop, stopIndex) => {
    const stopCode = normalizedStopCodeByIndex[stopIndex];
    const departures = selectedTripIds
      .map((tripId) => {
        const existing = departuresByTripAndStop.get(tripId)?.get(stopCode);
        if (existing) return existing;

        return {
          routeShortName: routeId,
          patternName: selectedPatternName?.trim() || routeId,
          stopName: stop.name,
          adjustedDepartureTime: '',
        };
      });

    return {
      stopCode,
      stopName: stop.name,
      departures,
    } satisfies BtStopDepartureRow;
  });
};

const buildFallbackRowsFromEmbeddedTrips = (
  routeId: string,
  selectedPatternName: string | null | undefined,
  stops: Stop[],
  numOfTrips: number,
  embedded: Record<string, unknown>
): BtStopDepartureRow[] => {
  return buildRowsFromEmbeddedSchedule(routeId, selectedPatternName, stops, numOfTrips, embedded);
};

interface UseRouteStopTimetableOptions {
  routeId?: string | null;
  selectedPatternName?: string | null;
  stops: Stop[];
  numOfTrips?: number;
}

export interface RouteStopTimetableResult {
  rows: BtStopDepartureRow[];
  source: 'api' | 'fallback-html';
}

export function useRouteStopTimetable({
  routeId,
  selectedPatternName,
  stops,
  numOfTrips = 120,
}: UseRouteStopTimetableOptions) {
  const requestedTrips = Math.max(1, Math.floor(numOfTrips));
  const stopCodes = stops
    .map((stop) => stop.code?.trim() || stop.id?.trim())
    .filter((value): value is string => Boolean(value));

  return useQuery({
    queryKey: ['route-stop-timetable', routeId, selectedPatternName ?? '', stopCodes.join(','), requestedTrips],
    enabled: Boolean(routeId) && stopCodes.length > 0,
    staleTime: STALE_TIMES.ARRIVALS,
    refetchInterval: REFRESH_INTERVALS.ARRIVALS,
    refetchIntervalInBackground: false,
    retry: 1,
    queryFn: async (): Promise<RouteStopTimetableResult> => {
      if (!routeId) {
        return {
          rows: [],
          source: 'api',
        };
      }

      // Route schedules page includes tripId + rank metadata, which lets us keep
      // stop rows chronologically aligned across concurrent buses on the same route.
      const embedded = await fetchRouteTripsPageEmbeddedJson(routeId);
      const embeddedRows = buildRowsFromEmbeddedSchedule(routeId, selectedPatternName, stops, requestedTrips, embedded);
      if (embeddedRows.some((row) => row.departures.length > 0)) {
        return {
          rows: embeddedRows,
          source: 'api',
        };
      }

      const selectedPatternKey = normalizePatternName(selectedPatternName);
      const rows = await Promise.all(
        stops.map(async (stop) => {
          const stopCode = stop.code?.trim() || stop.id?.trim() || '';
          if (!stopCode) {
            return {
              stopCode: stop.id,
              stopName: stop.name,
              departures: [],
            } satisfies BtStopDepartureRow;
          }

          const fallbackFetchTrips = Math.min(
            FALLBACK_MAX_REQUESTED_TRIPS,
            Math.max(requestedTrips, requestedTrips * FALLBACK_OVERFETCH_FACTOR)
          );

          const departures = await fetchNextDeparturesForStop(stopCode, fallbackFetchTrips);
          const byRoute = departures.filter((departure) => departure.routeShortName === routeId);
          const byPattern = selectedPatternKey
            ? byRoute.filter((departure) => normalizePatternName(departure.patternName) === selectedPatternKey)
            : [];

          const filtered = (byPattern.length > 0 ? byPattern : byRoute).sort(
            (a, b) => Date.parse(a.adjustedDepartureTime) - Date.parse(b.adjustedDepartureTime)
          ).slice(0, requestedTrips);

          return {
            stopCode,
            stopName: stop.name,
            departures: filtered,
          } satisfies BtStopDepartureRow;
        })
      );

      const hasAnyDepartures = rows.some((row) => row.departures.length > 0);
      if (hasAnyDepartures) {
        return {
          rows,
          source: 'api',
        };
      }

      return {
        rows: buildFallbackRowsFromEmbeddedTrips(routeId, selectedPatternName, stops, requestedTrips, embedded),
        source: 'fallback-html',
      };

    },
  });
}
