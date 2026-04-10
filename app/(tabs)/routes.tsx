/**
 * Routes Screen
 * Split view route list + route-focused map
 */

import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary';
import MapView from '@/components/map/MapView';
import { InlineErrorState } from '@/components/ui/InlineErrorState';
import { RouteChip } from '@/components/ui/RouteChip';
import { getRouteColor } from '@/constants/colors';
import { useBusPositions } from '@/hooks/useBuses';
import { useFavoriteRouteGeometry } from '@/hooks/useFavoriteRouteGeometry';
import { useRouteGeometry } from '@/hooks/useRouteGeometry';
import { useRoutes } from '@/hooks/useRoutes';
import { useRouteStops } from '@/hooks/useRouteStops';
import { useRouteStopTimetable } from '@/hooks/useRouteStopTimetable';
import { useTheme } from '@/hooks/useTheme';
import { trackEvent, trackScreenView } from '@/services/telemetry';
import { useSelectedRouteStore } from '@/store/selectedRouteStore';
import { useSelectedStopStore } from '@/store/selectedStopStore';
import { Bus, Stop } from '@/types/transit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const API_REQUEST_ROUTE_ORDER = [
  'CAS',
  'BMR',
  'PRG',
  'SME',
  'HDG',
  'SMA',
  'HWA',
  'HWC',
  'HWB',
  'BLU',
  'PHD',
  'HXP',
  'PHB',
  'UCB',
  'CRB',
  'CRC',
  'TCP',
  'NMG',
  'TCR',
  'SMS',
  'TTT',
  'GRN',
] as const;

// Derived from the current probe snapshot for deterministic no-service ordering.
const NIGHT_PRIORITY_ROUTE_ORDER = [
  'HWC',
  'TCP',
  'CAS',
  'SMA',
  'PHD',
  'UCB',
  'NMG',
  'BMR',
  'HDG',
  'BLU',
  'HXP',
  'PHB',
  'CRC',
  'SMS',
  'TTT',
  'GRN',
  'PRG',
  'SME',
  'HWA',
  'HWB',
  'CRB',
  'TCR',
] as const;

const FAVORITE_ROUTE_IDS_STORAGE_KEY = 'betterbt.favoriteRouteIds.v1';
// Ask for a large window so UI can show the full remaining service span when the API provides it.
const MAX_UPCOMING_CYCLES = 240;
const VISIBLE_CYCLE_COLUMNS = 1;
const MIN_VISIBLE_CYCLE_COVERAGE_RATIO = 0.55;

const formatClockTime = (isoDateString: string): string => {
  const parsed = new Date(isoDateString);
  if (Number.isNaN(parsed.getTime())) return '--';

  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizePatternKey = (value: string): string => value.trim().toLowerCase();

const readPersistedFavoriteRouteIds = async (): Promise<string[]> => {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(FAVORITE_ROUTE_IDS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [];
    }

    const raw = await SecureStore.getItemAsync(FAVORITE_ROUTE_IDS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch (error) {
    console.warn('Failed to read persisted favorite routes:', error);
    return [];
  }
};

const writePersistedFavoriteRouteIds = async (favoriteRouteIds: string[]): Promise<void> => {
  try {
    const payload = JSON.stringify(favoriteRouteIds);

    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(FAVORITE_ROUTE_IDS_STORAGE_KEY, payload);
      return;
    }

    await SecureStore.setItemAsync(FAVORITE_ROUTE_IDS_STORAGE_KEY, payload);
  } catch (error) {
    console.warn('Failed to persist favorite routes:', error);
  }
};

export default function RoutesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const pendingRouteId = useSelectedRouteStore((state) => state.pendingRouteId);
  const clearPendingRouteId = useSelectedRouteStore((state) => state.clearPendingRouteId);
  const selectedStopId = useSelectedStopStore((state) => state.selectedStopId);
  const selectedStopSource = useSelectedStopStore((state) => state.selectedStopSource);
  const setSelectedStopId = useSelectedStopStore((state) => state.setSelectedStopId);
  const clearSelectedStop = useSelectedStopStore((state) => state.clearSelectedStop);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { data: buses = [], isLoading: isBusesLoading, isError: isBusesError } = useBusPositions();
  const { data: routes = [], isLoading, error, refetch: refetchRoutes } = useRoutes();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedTimeCycleIndex, setSelectedTimeCycleIndex] = useState(0);
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedStopSource, setFocusedStopSource] = useState<'list' | 'map' | 'bus' | null>(null);
  const [focusedBusId, setFocusedBusId] = useState<string | null>(null);
  const [favoriteRouteIds, setFavoriteRouteIds] = useState<string[]>([]);
  const [favoritesViewEnabled, setFavoritesViewEnabled] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [resetViewToken, setResetViewToken] = useState(0);
  const [fullscreenViewToken, setFullscreenViewToken] = useState(0);
  const [mapRenderNonce, setMapRenderNonce] = useState(0);
  const [mapLayoutVersion, setMapLayoutVersion] = useState(0);
  const [pendingLayoutRecenter, setPendingLayoutRecenter] = useState(false);
  const mapLayoutRef = useRef<{ width: number; height: number } | null>(null);
  const stopsScrollRef = useRef<ScrollView | null>(null);
  const stopRowOffsetByIdRef = useRef<Record<string, number>>({});
  const pendingStopScrollIdRef = useRef<string | null>(null);
  const hasHydratedFavoritesRef = useRef(false);
  const lastTrackedRouteIdRef = useRef<string | null>(null);
  const lastTrackedFavoriteCountRef = useRef<number>(0);

  const isWideLayout = width >= 900;
  const isPortrait = height >= width;
  const adaptiveVerticalPadding = useMemo(() => {
    const shortestSide = Math.min(width, height);
    const baseSpacing = isPortrait ? height * 0.013 : height * 0.01;
    const compactBoost = shortestSide < 700 ? 1 : shortestSide > 1000 ? 3 : 2;

    return Math.max(8, Math.min(18, Math.round(baseSpacing) + compactBoost));
  }, [height, isPortrait, width]);
  const topContentPadding = useMemo(
    () => Math.max(8, Math.min(22, adaptiveVerticalPadding + Math.round(insets.top * 0.35))),
    [adaptiveVerticalPadding, insets.top]
  );
  const bottomContentPadding = useMemo(
    () => Math.max(8, Math.min(24, adaptiveVerticalPadding + Math.round(insets.bottom * 0.45))),
    [adaptiveVerticalPadding, insets.bottom]
  );

  const handleMapLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    const previous = mapLayoutRef.current;

    if (
      previous &&
      Math.abs(previous.width - nextWidth) < 1 &&
      Math.abs(previous.height - nextHeight) < 1
    ) {
      return;
    }

    mapLayoutRef.current = { width: nextWidth, height: nextHeight };

    if (!pendingLayoutRecenter) {
      return;
    }

    setMapLayoutVersion((current) => current + 1);
    setPendingLayoutRecenter(false);
  };

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId]
  );

  useEffect(() => {
    if (!pendingRouteId) {
      return;
    }

    const routeExists = routes.some((route) => route.id === pendingRouteId);
    if (!routeExists) {
      return;
    }

    setFavoritesViewEnabled(false);
    setFocusedStopId(null);
    setFocusedStopSource(null);
    setFocusedBusId(null);
    setSelectedCycleId(null);
    setSelectedRouteId(pendingRouteId);
    clearPendingRouteId();
  }, [clearPendingRouteId, pendingRouteId, routes]);

  const favoriteRouteSet = useMemo(() => new Set(favoriteRouteIds), [favoriteRouteIds]);
  const hasFavorites = favoriteRouteIds.length > 0;
  const isFavoritesMode = favoritesViewEnabled;
  const isFavoritesAggregateView = isFavoritesMode && !selectedRouteId;

  useEffect(() => {
    trackScreenView('routes');
  }, []);

  const visibleRoutes = useMemo(
    () => (isFavoritesMode ? routes.filter((route) => favoriteRouteSet.has(route.id)) : routes),
    [favoriteRouteSet, isFavoritesMode, routes]
  );
  const displayedBuses = useMemo(
    () => (isFavoritesMode ? buses.filter((bus) => favoriteRouteSet.has(bus.routeId)) : buses),
    [buses, favoriteRouteSet, isFavoritesMode]
  );
  const routeShortNameById = useMemo(
    () => routes.reduce<Record<string, string>>((acc, route) => {
      acc[route.id] = route.shortName;
      return acc;
    }, {}),
    [routes]
  );
  const routeColorById = useMemo(
    () => routes.reduce<Record<string, string>>((acc, route) => {
      acc[route.id] = route.color;
      return acc;
    }, {}),
    [routes]
  );
  const fallbackRouteChipColors = useMemo(() => getRouteColor('__fallback__'), []);
  const apiOrderIndexById = useMemo(
    () => API_REQUEST_ROUTE_ORDER.reduce<Record<string, number>>((acc, routeId, index) => {
      acc[routeId] = index;
      return acc;
    }, {}),
    []
  );
  const nightPriorityIndexById = useMemo(
    () => NIGHT_PRIORITY_ROUTE_ORDER.reduce<Record<string, number>>((acc, routeId, index) => {
      acc[routeId] = index;
      return acc;
    }, {}),
    []
  );
  const isSelectedRouteFavorite = selectedRoute ? favoriteRouteSet.has(selectedRoute.id) : false;

  const activeRouteIds = useMemo(() => new Set(displayedBuses.map((bus) => bus.routeId)), [displayedBuses]);
  const selectedRouteBuses = useMemo(
    () => {
      if (selectedRouteId) return buses.filter((bus) => bus.routeId === selectedRouteId);
      if (isFavoritesMode) return displayedBuses;
      return [];
    },
    [buses, displayedBuses, isFavoritesMode, selectedRouteId]
  );
  const { data: selectedRouteCycles = [], isLoading: stopsLoading } = useRouteStops(selectedRouteId);
  const selectedCycle = useMemo(
    () => selectedRouteCycles.find((cycle) => cycle.id === selectedCycleId) ?? selectedRouteCycles[0] ?? null,
    [selectedCycleId, selectedRouteCycles]
  );
  const selectedRouteStops = useMemo(() => selectedCycle?.stops ?? [], [selectedCycle]);
  const {
    data: stopTimetableResult,
    isLoading: timetableLoading,
  } = useRouteStopTimetable({
    routeId: selectedRouteId,
    selectedPatternName: selectedCycle?.patternName ?? null,
    stops: selectedRouteStops,
    numOfTrips: MAX_UPCOMING_CYCLES,
  });
  const stopTimetableRows = useMemo(() => stopTimetableResult?.rows ?? [], [stopTimetableResult?.rows]);
  const alignedStopTimetableRows = stopTimetableRows;
  const isUsingTimetableFallback = stopTimetableResult?.source === 'fallback-html';
  const { data: selectedRouteGeometry = [] } = useRouteGeometry(selectedRouteId, selectedRoute?.color || '#2563EB');
  const favoriteRouteIdsForGeometry = isFavoritesMode ? favoriteRouteIds : [];
  const { data: favoriteRouteGeometry = [] } = useFavoriteRouteGeometry(favoriteRouteIdsForGeometry, routeColorById);
  const selectedCycleGeometry = useMemo(() => {
    if (!selectedRouteId) return [];
    if (!selectedCycle) return selectedRouteGeometry;

    const exactMatch = selectedRouteGeometry.filter((path) => path.id === selectedCycle.id);
    if (exactMatch.length > 0) return exactMatch;

    const selectedPatternKey = normalizePatternKey(selectedCycle.patternName);
    return selectedRouteGeometry.filter((path) => normalizePatternKey(path.patternName) === selectedPatternKey);
  }, [selectedCycle, selectedRouteGeometry, selectedRouteId]);
  const displayedRouteGeometry = isFavoritesAggregateView ? favoriteRouteGeometry : selectedCycleGeometry;
  const activeDisplayedRouteIds = useMemo(
    () => Array.from(new Set(displayedBuses.map((bus) => bus.routeId))),
    [displayedBuses]
  );
  const { data: predictionRouteGeometry = [] } = useFavoriteRouteGeometry(activeDisplayedRouteIds, routeColorById);
  const displayedPredictionRouteGeometry = useMemo(() => {
    if (!selectedRouteId) return predictionRouteGeometry;

    if (!selectedCycle) {
      return predictionRouteGeometry.filter((path) => path.routeId === selectedRouteId);
    }

    const exactMatch = predictionRouteGeometry.filter((path) => path.id === selectedCycle.id);
    if (exactMatch.length > 0) return exactMatch;

    const selectedPatternKey = normalizePatternKey(selectedCycle.patternName);
    return predictionRouteGeometry.filter(
      (path) => path.routeId === selectedRouteId && normalizePatternKey(path.patternName) === selectedPatternKey
    );
  }, [predictionRouteGeometry, selectedCycle, selectedRouteId]);
  const showNoActiveBusesNotice =
    !isFavoritesMode && !isBusesLoading && !isBusesError && displayedBuses.length === 0;

  useEffect(() => {
    if (!selectedRouteId) {
      setSelectedCycleId(null);
      return;
    }

    if (selectedRouteCycles.length === 0) {
      setSelectedCycleId(null);
      return;
    }

    const hasSelectedCycle = selectedRouteCycles.some((cycle) => cycle.id === selectedCycleId);
    if (!hasSelectedCycle) {
      setSelectedCycleId(selectedRouteCycles[0].id);
    }
  }, [selectedCycleId, selectedRouteCycles, selectedRouteId]);

  useEffect(() => {
    if (!selectedStopId) return;
    if (selectedStopSource !== 'stops-to-routes-handoff') return;
    if (!selectedRouteId) return;
    if (selectedRouteStops.length === 0) return;

    const normalizedSelectedStopId = selectedStopId.trim();
    if (!normalizedSelectedStopId) return;

    const matchingStop = selectedRouteStops.find((stop) => {
      const stopId = stop.id?.trim();
      const stopCode = stop.code?.trim();
      return stopId === normalizedSelectedStopId || stopCode === normalizedSelectedStopId;
    });

    if (!matchingStop) return;

    const focusStopId = matchingStop.code?.trim() || matchingStop.id;
    if (!focusStopId) return;

    if (focusedStopId !== focusStopId || focusedStopSource !== 'list') {
      setFocusedBusId(null);
      setFocusedStopId(focusStopId);
      setFocusedStopSource('list');
    }

    // Consume cross-tab stop handoff once so manual stop selection is not overridden.
    clearSelectedStop();
  }, [
    clearSelectedStop,
    focusedStopId,
    focusedStopSource,
    selectedRouteId,
    selectedRouteStops,
    selectedStopId,
    selectedStopSource,
  ]);

  const focusedBus = useMemo(
    () => displayedBuses.find((bus) => bus.id === focusedBusId) ?? null,
    [displayedBuses, focusedBusId]
  );

  const focusedStop = useMemo(
    () => selectedRouteStops.find((stop) => stop.id === focusedStopId) ?? null,
    [focusedStopId, selectedRouteStops]
  );
  const focusedStopForMap = useMemo(() => {
    if (focusedStopSource !== 'list' && focusedStopSource !== 'map') return null;
    return focusedStop;
  }, [focusedStop, focusedStopSource]);

  const resolveStopFocusForBus = useCallback((bus: Bus): { focusStopId: string | null; cycleId: string | null } => {
    const rawStopId = bus.currentStopId?.trim();
    if (!rawStopId) return { focusStopId: null, cycleId: null };

    const matchingCycle = selectedRouteCycles.find((cycle) =>
      cycle.stops.some((stop) => {
        const stopId = stop.id?.trim();
        const stopCode = stop.code?.trim();
        return stopId === rawStopId || stopCode === rawStopId;
      })
    );

    const stopsToSearch = matchingCycle?.stops ?? selectedRouteStops;
    const matchingStop = stopsToSearch.find((stop) => {
      const stopId = stop.id?.trim();
      const stopCode = stop.code?.trim();
      return stopId === rawStopId || stopCode === rawStopId;
    });

    if (matchingStop) {
      return {
        focusStopId: matchingStop.code?.trim() || matchingStop.id,
        cycleId: matchingCycle?.id ?? selectedCycle?.id ?? null,
      };
    }

    return {
      focusStopId: rawStopId,
      cycleId: matchingCycle?.id ?? null,
    };
  }, [selectedCycle?.id, selectedRouteCycles, selectedRouteStops]);

  const focusBusAndStop = (bus: Bus, allowToggleOff = false) => {
    const isAlreadyFocused = focusedBusId === bus.id;
    if (allowToggleOff && isAlreadyFocused) {
      setFocusedBusId(null);
      setFocusedStopId(null);
      setFocusedStopSource(null);
      return;
    }

    if (selectedRouteId !== bus.routeId) {
      setFavoritesViewEnabled(false);
      setSelectedCycleId(null);
      setSelectedRouteId(bus.routeId);
    }

    const { focusStopId, cycleId } = resolveStopFocusForBus(bus);
    if (cycleId && cycleId !== selectedCycleId) {
      setSelectedCycleId(cycleId);
    }

    setFocusedBusId(bus.id);
    setFocusedStopId(focusStopId);
    setFocusedStopSource(focusStopId ? 'bus' : null);
  };

  const currentBusStopFocusId = useMemo(() => {
    if (!focusedBus) return null;
    return resolveStopFocusForBus(focusedBus).focusStopId;
  }, [focusedBus, resolveStopFocusForBus]);

  useEffect(() => {
    if (!focusedBus) return;
    if (selectedRouteId !== focusedBus.routeId) return;

    const { focusStopId, cycleId } = resolveStopFocusForBus(focusedBus);
    if (cycleId && cycleId !== selectedCycleId) {
      setSelectedCycleId(cycleId);
    }

    if (focusStopId !== focusedStopId || focusedStopSource !== 'bus') {
      setFocusedStopId(focusStopId);
      setFocusedStopSource(focusStopId ? 'bus' : null);
    }
  }, [
    focusedBus,
    focusedStopId,
    focusedStopSource,
    selectedCycleId,
    selectedRouteCycles,
    selectedRouteId,
    selectedRouteStops,
    resolveStopFocusForBus,
  ]);

  const timeCycleOptions = useMemo(() => {
    const firstSelectedStopRow = selectedRouteStops
      .map((stop) => alignedStopTimetableRows.find((row) => row.stopCode === (stop.code?.trim() || stop.id?.trim() || '')) ?? null)
      .find((row): row is typeof alignedStopTimetableRows[number] => Boolean(row && row.departures.length > 0));

    const rowWithMostDepartures =
      firstSelectedStopRow ??
      alignedStopTimetableRows.reduce<typeof alignedStopTimetableRows[number] | null>((best, row) => {
        if (!best) return row;
        return row.departures.length > best.departures.length ? row : best;
      }, null);

    if (!rowWithMostDepartures) return [];

    const maxDepartureColumns = alignedStopTimetableRows.reduce((max, row) => Math.max(max, row.departures.length), 0);
    const requiredCoverage = Math.max(
      2,
      Math.min(alignedStopTimetableRows.length, Math.ceil(alignedStopTimetableRows.length * MIN_VISIBLE_CYCLE_COVERAGE_RATIO))
    );

    const acceptedIndices: number[] = [];
    let consecutiveIncompleteCycles = 0;

    for (let index = 0; index < maxDepartureColumns; index += 1) {
      const populatedRows = alignedStopTimetableRows.reduce((count, row) => {
        const departure = row.departures[index];
        if (!departure) return count;
        const parsed = Date.parse(departure.adjustedDepartureTime);
        return Number.isNaN(parsed) ? count : count + 1;
      }, 0);

      if (populatedRows >= requiredCoverage) {
        acceptedIndices.push(index);
        consecutiveIncompleteCycles = 0;
      } else {
        consecutiveIncompleteCycles += 1;
      }

      // Stop showing farther-out cycles after repeated incomplete columns.
      if (consecutiveIncompleteCycles >= 2 && acceptedIndices.length > 0) {
        break;
      }
    }

    if (acceptedIndices.length === 0) {
      return rowWithMostDepartures.departures
        .map((departure, index) => ({
          index,
          label: formatClockTime(departure.adjustedDepartureTime),
        }))
        .filter((option) => option.label !== '--');
    }

    return acceptedIndices
      .map((index) => {
        const departure = rowWithMostDepartures.departures[index];
        const label = departure ? formatClockTime(departure.adjustedDepartureTime) : '--';
        return {
          index,
          label,
        };
      })
      .filter((option) => option.label !== '--');
  }, [alignedStopTimetableRows, selectedRouteStops]);
  const showPatternCycleSelector = selectedRouteCycles.length > 1;
  const selectedCycleStopLabel = useMemo(() => {
    const fromLabel = selectedCycle?.label?.trim();
    if (fromLabel?.toLowerCase().startsWith('from ')) {
      return fromLabel.slice(5).trim();
    }

    const firstStopName = selectedCycle?.stops?.[0]?.name?.trim();
    if (firstStopName) {
      return firstStopName
        .replace(/\s+Bay\s+\d+$/i, '')
        .replace(/\s+Bay$/i, '');
    }

    return selectedRoute?.shortName ?? 'Selected';
  }, [selectedCycle, selectedRoute?.shortName]);

  const visibleCycleIndices = useMemo(() => {
    if (timeCycleOptions.length === 0) return [];

    const selectedOptionIndex = Math.max(0, timeCycleOptions.findIndex((option) => option.index === selectedTimeCycleIndex));
    const maxStart = Math.max(0, timeCycleOptions.length - VISIBLE_CYCLE_COLUMNS);
    const startIndex = Math.min(selectedOptionIndex, maxStart);
    const endIndex = Math.min(timeCycleOptions.length, startIndex + VISIBLE_CYCLE_COLUMNS);

    return timeCycleOptions.slice(startIndex, endIndex).map((option) => option.index);
  }, [selectedTimeCycleIndex, timeCycleOptions]);

  const inferTimeCycleIndexForFocusedBus = useCallback((): number | null => {
    if (!focusedBus) return null;

    const rawStopId = focusedBus.currentStopId?.trim() || '';
    const stopCode = currentBusStopFocusId?.trim() || rawStopId;
    if (!stopCode) return null;

    const row = alignedStopTimetableRows.find((candidate) => candidate.stopCode === stopCode);
    if (!row || row.departures.length === 0) return null;

    const candidateIndices = timeCycleOptions.length > 0
      ? timeCycleOptions.map((option) => option.index)
      : Array.from({ length: row.departures.length }, (_, index) => index);

    const now = Date.now();
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    candidateIndices.forEach((index) => {
      const departure = row.departures[index];
      if (!departure) return;

      const timestamp = Date.parse(departure.adjustedDepartureTime);
      if (Number.isNaN(timestamp)) return;

      const distance = Math.abs(timestamp - now);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }, [alignedStopTimetableRows, currentBusStopFocusId, focusedBus, timeCycleOptions]);

  const stopDeparturesById = useMemo(() => {
    return alignedStopTimetableRows.reduce<Record<string, string[]>>((acc, row) => {
      acc[row.stopCode] = row.departures.slice(0, 3).map((departure) => formatClockTime(departure.adjustedDepartureTime));
      return acc;
    }, {});
  }, [alignedStopTimetableRows]);

  useEffect(() => {
    if (!focusedBus || focusedStopSource !== 'bus') return;

    const inferredIndex = inferTimeCycleIndexForFocusedBus();
    if (inferredIndex === null || inferredIndex === selectedTimeCycleIndex) return;

    setSelectedTimeCycleIndex(inferredIndex);
  }, [
    focusedBus,
    focusedStopSource,
    inferTimeCycleIndexForFocusedBus,
    selectedTimeCycleIndex,
  ]);

  useEffect(() => {
    if (timeCycleOptions.length === 0) {
      setSelectedTimeCycleIndex(0);
      return;
    }

    const hasSelectedOption = timeCycleOptions.some((option) => option.index === selectedTimeCycleIndex);
    if (!hasSelectedOption) {
      setSelectedTimeCycleIndex(timeCycleOptions[0].index);
    }
  }, [selectedTimeCycleIndex, timeCycleOptions]);

  const busesByRoute = useMemo(() => {
    return displayedBuses.reduce<Record<string, number>>((acc, bus) => {
      acc[bus.routeId] = (acc[bus.routeId] ?? 0) + 1;
      return acc;
    }, {});
  }, [displayedBuses]);

  const sortedVisibleRoutes = useMemo(() => {
    const apiFallbackStart = API_REQUEST_ROUTE_ORDER.length;
    const nightFallbackStart = NIGHT_PRIORITY_ROUTE_ORDER.length;
    const routesWithoutService = visibleRoutes.every((route) => (busesByRoute[route.id] ?? 0) === 0);

    return [...visibleRoutes].sort((a, b) => {
      if (!routesWithoutService) {
        const busCountDelta = (busesByRoute[b.id] ?? 0) - (busesByRoute[a.id] ?? 0);
        if (busCountDelta !== 0) return busCountDelta;
      }

      const apiOrderDelta =
        (apiOrderIndexById[a.id] ?? apiFallbackStart) -
        (apiOrderIndexById[b.id] ?? apiFallbackStart);
      if (apiOrderDelta !== 0) return apiOrderDelta;

      const nightPriorityDelta =
        (nightPriorityIndexById[a.id] ?? nightFallbackStart) -
        (nightPriorityIndexById[b.id] ?? nightFallbackStart);
      if (nightPriorityDelta !== 0) return nightPriorityDelta;

      return a.shortName.localeCompare(b.shortName);
    });
  }, [apiOrderIndexById, busesByRoute, nightPriorityIndexById, visibleRoutes]);

  const routeListData = sortedVisibleRoutes;
  const routesMenuCount = routeListData.length;
  const stopsMenuCount = alignedStopTimetableRows.length;
  const stopsPanelTitle = selectedRoute
    ? `Stops • ${selectedRoute.shortName}`
    : isFavoritesMode
      ? 'Stops • Favorites'
      : 'Stops';

  useEffect(() => {
    let isMounted = true;

    const hydrateFavorites = async () => {
      const persistedFavoriteRouteIds = await readPersistedFavoriteRouteIds();
      if (!isMounted) return;

      setFavoriteRouteIds(persistedFavoriteRouteIds);
      hasHydratedFavoritesRef.current = true;
    };

    void hydrateFavorites();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedFavoritesRef.current) return;
    void writePersistedFavoriteRouteIds(favoriteRouteIds);
  }, [favoriteRouteIds]);

  useEffect(() => {
    if (selectedRouteId === lastTrackedRouteIdRef.current) return;
    lastTrackedRouteIdRef.current = selectedRouteId;

    trackEvent('routes.route_selected', {
      routeId: selectedRouteId,
      isFavoritesMode,
    });
  }, [isFavoritesMode, selectedRouteId]);

  useEffect(() => {
    if (favoriteRouteIds.length === lastTrackedFavoriteCountRef.current) return;
    lastTrackedFavoriteCountRef.current = favoriteRouteIds.length;

    trackEvent('routes.favorite_count_changed', {
      count: favoriteRouteIds.length,
    });
  }, [favoriteRouteIds]);

  // Show currently fetched alerts from the shared alerts query.

  const renderActiveBusPill = (bus: (typeof selectedRouteBuses)[number]) => {
    const stopAbbreviation = bus.currentStopId?.trim() || '--';
    const occupancyValue = typeof bus.occupancyPercent === 'number' ? `${Math.round(bus.occupancyPercent)}%` : '--';
    const showOccupancy = bus.capacity !== 0;
    const routeLabel = routeShortNameById[bus.routeId] ?? bus.routeId;

    return (
      <Pressable
        key={bus.id}
        onPress={() => {
          focusBusAndStop(bus, true);
        }}
        style={[
          styles.busPill,
          {
            borderColor: theme.BORDER,
            backgroundColor: focusedBusId === bus.id ? theme.SURFACE_2 : theme.SURFACE,
          },
        ]}
      >
        <Text style={[styles.busPillText, { color: theme.TEXT }]}>
          {isFavoritesMode ? `#${bus.id} ${routeLabel}` : `#${bus.id}`}
        </Text>
        <Text style={[styles.busPillMeta, { color: theme.TEXT_SECONDARY }]}> 
          S:{stopAbbreviation}{showOccupancy ? ` O:${occupancyValue}` : ''}
        </Text>
      </Pressable>
    );
  };

  const handleRoutePress = useCallback((routeId: string) => {
    setFocusedStopId(null);
    setFocusedBusId(null);
    setSelectedCycleId(null);
    setSelectedRouteId((current) => (current === routeId ? null : routeId));
  }, []);

  const renderRouteItem = useCallback(({ item: route }: { item: (typeof routes)[number] }) => {
    const isSelected = selectedRouteId === route.id;
    const activeBusCount = busesByRoute[route.id] ?? 0;

    return (
      <Pressable
        onPress={() => {
          handleRoutePress(route.id);
        }}
        style={[
          styles.routeItem,
          {
            borderBottomColor: theme.BORDER,
            backgroundColor: isSelected ? theme.SURFACE_2 : 'transparent',
          },
        ]}
      >
        <Text
          style={[
            styles.routeFavoriteIndicator,
            { color: favoriteRouteSet.has(route.id) ? '#DC2626' : theme.BORDER },
          ]}
        >
          {favoriteRouteSet.has(route.id) ? '♥' : '♡'}
        </Text>
        <RouteChip routeName={route.shortName} size="medium" />

        <View style={styles.routeInfo}>
          <Text style={[styles.routeName, { color: theme.TEXT }]} numberOfLines={1}>
            {route.name}
          </Text>
          <Text style={[styles.routeStatus, { color: theme.TEXT_SECONDARY }]}> 
            {activeRouteIds.has(route.id)
              ? `${activeBusCount} live bus${activeBusCount === 1 ? '' : 'es'}`
              : 'No live buses'}
          </Text>
        </View>
      </Pressable>
    );
  }, [activeRouteIds, busesByRoute, favoriteRouteSet, handleRoutePress, selectedRouteId, theme.BORDER, theme.SURFACE_2, theme.TEXT, theme.TEXT_SECONDARY]);

  const toggleFavoriteForSelectedRoute = () => {
    if (!selectedRoute) return;

    setFavoriteRouteIds((current) =>
      current.includes(selectedRoute.id)
        ? current.filter((id) => id !== selectedRoute.id)
        : [...current, selectedRoute.id]
    );
  };

  const toggleFavoritesView = () => {
    setFavoritesViewEnabled((current) => {
      const nextValue = !current;
      trackEvent('routes.favorites_view_toggled', {
        enabled: nextValue,
      });
      return nextValue;
    });
    setSelectedRouteId(null);
    setSelectedCycleId(null);
    setFocusedBusId(null);
    setFocusedStopId(null);
    setFocusedStopSource(null);
  };

  const resetToAllBuses = () => {
    trackEvent('routes.reset_to_all_pressed');
    setFavoritesViewEnabled(false);
    setSelectedRouteId(null);
    setSelectedCycleId(null);
    setFocusedBusId(null);
    setFocusedStopId(null);
    setFocusedStopSource(null);
    setResetViewToken((current) => current + 1);
  };

  const toggleMapExpanded = () => {
    setPendingLayoutRecenter(true);
    setIsMapExpanded((current) => {
      const nextValue = !current;
      trackEvent('routes.map_fullscreen_toggled', {
        expanded: nextValue,
        isWideLayout,
      });
      return nextValue;
    });
    setFullscreenViewToken((current) => current + 1);

    // iOS can drop the native map surface after aggressive layout changes.
    // Force a remount so collapse/expand always redraws correctly.
    if (Platform.OS === 'ios') {
      setMapRenderNonce((current) => current + 1);
    }
  };

  const focusStopTemporarily = (stopId: string) => {
    setFocusedBusId(null);
    setFocusedStopId(stopId);
    setFocusedStopSource('list');
  };

  const openStopDetail = useCallback((rawStopId: string) => {
    const stopId = rawStopId.trim();
    if (!stopId) return;

    setSelectedStopId(stopId, 'routes-to-stops-handoff');

    router.push({
      pathname: '/(tabs)/stops',
    });
  }, [router, setSelectedStopId]);

  const focusStopFromMap = (stopId: string) => {
    setFocusedBusId(null);
    setFocusedStopId(stopId);
    setFocusedStopSource('map');
  };

  const handleMapBusPress = (bus: Bus) => {
    focusBusAndStop(bus);
  };

  const scrollToStopRow = (stopId: string) => {
    const offsetY = stopRowOffsetByIdRef.current[stopId];

    if (offsetY === undefined) {
      pendingStopScrollIdRef.current = stopId;
      return;
    }

    pendingStopScrollIdRef.current = null;
    stopsScrollRef.current?.scrollTo({
      y: Math.max(offsetY - 8, 0),
      animated: true,
    });
  };

  const registerStopRowLayout = (stopId: string, offsetY: number) => {
    stopRowOffsetByIdRef.current[stopId] = offsetY;

    if (pendingStopScrollIdRef.current === stopId) {
      scrollToStopRow(stopId);
    }
  };

  useEffect(() => {
    stopRowOffsetByIdRef.current = {};
    pendingStopScrollIdRef.current = null;
  }, [selectedCycle?.id, selectedRouteId]);

  useEffect(() => {
    if (!focusedStopId) return;
    scrollToStopRow(focusedStopId);
  }, [focusedStopId, selectedCycle?.id]);

  const renderStopsPanelBody = () => {
    if (isFavoritesAggregateView) {
      return (
        <View style={styles.stopsContent}>
          <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Favorites mode is active. Stops list is hidden.</Text>
        </View>
      );
    }

    if (!selectedRoute) {
      return (
        <View style={styles.stopsContent}>
          <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Select a route to view stops here.</Text>
        </View>
      );
    }

    return (
      <>
        {timeCycleOptions.length > 0 ? (
          <View style={[styles.cycleSelectorRow, { borderBottomColor: theme.BORDER }]}> 
            <Text style={[styles.cycleContextLabel, { color: theme.TEXT_SECONDARY }]}>{`${selectedCycleStopLabel} stops:`}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.cycleSelectorScroll}
              contentContainerStyle={styles.cycleSelectorContent}
            >
              {timeCycleOptions.map((cycle) => (
                <Pressable
                  key={`${selectedRoute.id}-${cycle.index}`}
                  onPress={() => {
                    setFocusedBusId(null);
                    setSelectedTimeCycleIndex(cycle.index);
                  }}
                  style={[
                    styles.cyclePill,
                    {
                      borderColor: theme.BORDER,
                      backgroundColor: selectedTimeCycleIndex === cycle.index ? theme.SURFACE_2 : theme.SURFACE,
                    },
                  ]}
                >
                  <Text style={[styles.cyclePillText, { color: theme.TEXT }]}>{cycle.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {isUsingTimetableFallback ? (
              <View style={[styles.cycleFallbackBadge, { borderColor: theme.WARNING, backgroundColor: theme.SURFACE }]}> 
                <Text style={[styles.cycleFallbackText, { color: theme.WARNING }]}>HTML fallback active</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <ScrollView
          ref={stopsScrollRef}
          style={styles.stopsScroll}
          contentContainerStyle={styles.stopsListContent}
        >
          {stopsLoading || timetableLoading ? (
            <View style={styles.stopsContent}>
              <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Loading route schedule...</Text>
            </View>
          ) : alignedStopTimetableRows.length === 0 ? (
            <View style={styles.stopsContent}>
              <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>No stop timings returned for this route.</Text>
            </View>
          ) : (
            alignedStopTimetableRows.map((row) => {
              const stopKey = row.stopCode || row.stopName;
              const isCurrentBusStop = Boolean(focusedBusId && currentBusStopFocusId && row.stopCode === currentBusStopFocusId);
              const isSelectedStop = focusedStopId === row.stopCode;

              return (
                <Pressable
                  key={stopKey}
                  onPress={() => focusStopTemporarily(row.stopCode)}
                  onLayout={(event) => {
                    registerStopRowLayout(row.stopCode, event.nativeEvent.layout.y);
                  }}
                  style={[
                    styles.stopRow,
                    {
                      borderBottomColor: theme.BORDER,
                      backgroundColor: isSelectedStop ? theme.SURFACE_2 : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.stopRowInner}>
                    <View style={styles.stopNameWrap}>
                      <View style={styles.stopNameHeaderRow}>
                        <View style={[styles.stopNameLabelRow, styles.stopNameCell]}>
                          <View
                            style={[
                              styles.stopCodePill,
                              {
                                borderColor: fallbackRouteChipColors.bg,
                                backgroundColor: fallbackRouteChipColors.bg,
                              },
                            ]}
                          >
                            <Text style={[styles.stopCodePillText, { color: fallbackRouteChipColors.text }]}>{row.stopCode}</Text>
                          </View>
                          <Text style={[styles.stopRowText, styles.stopNameText, { color: theme.TEXT }]} numberOfLines={1}>
                            {row.stopName}
                          </Text>
                        </View>
                        {isSelectedStop ? (
                          <Pressable
                            onPress={(event) => {
                              event.stopPropagation();
                              openStopDetail(row.stopCode);
                            }}
                            style={[styles.stopInfoButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE }]}
                          >
                            <Text style={[styles.stopInfoButtonText, { color: theme.TEXT }]}>See stop info</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {isCurrentBusStop ? (
                        <Text style={[styles.currentBusStopText, { color: theme.INFO }]} numberOfLines={1}>
                          Current stop bus #{focusedBusId}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.stopTimesRow}>
                      {(() => {
                        const nextTimes = visibleCycleIndices
                          .map((timeIndex) => {
                            const departure = row.departures[timeIndex];
                            if (!departure) return null;

                            const timeText = formatClockTime(departure.adjustedDepartureTime);
                            if (timeText === '--') return null;

                            return {
                              timeIndex,
                              timeText,
                            };
                          })
                          .filter((value): value is { timeIndex: number; timeText: string } => value !== null);

                        if (nextTimes.length === 0) {
                          return (
                            <View
                              style={[
                                styles.stopTimeCell,
                                {
                                  borderColor: theme.BORDER,
                                  backgroundColor: theme.SURFACE,
                                },
                              ]}
                            >
                              <Text style={[styles.stopTimeText, { color: theme.TEXT_SECONDARY }]}>--</Text>
                            </View>
                          );
                        }

                        return nextTimes.map(({ timeIndex, timeText }) => (
                          <View
                            key={`${stopKey}-${timeIndex}`}
                            style={[
                              styles.stopTimeCell,
                              {
                                borderColor: theme.BORDER,
                                backgroundColor: selectedTimeCycleIndex === timeIndex ? theme.SURFACE_2 : theme.SURFACE,
                              },
                            ]}
                          >
                            <Text style={[styles.stopTimeText, { color: theme.TEXT }]}>{timeText}</Text>
                          </View>
                        ));
                      })()}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </>
    );
  };

  const renderInlinePatternCycleButtons = () => {
    if (!selectedRoute || !showPatternCycleSelector) return null;

    return (
      <View style={styles.inlineCycleButtonsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.inlineCycleButtonsScroll}
          contentContainerStyle={styles.inlineCycleButtonsContent}
        >
          {selectedRouteCycles.map((cycle) => {
            const isSelected = selectedCycleId === cycle.id;

            return (
              <Pressable
                key={`inline-${cycle.id}`}
                onPress={() => {
                  setFocusedBusId(null);
                  setFocusedStopSource(null);
                  setSelectedCycleId(cycle.id);
                }}
                style={[
                  styles.cyclePill,
                  {
                    borderColor: theme.BORDER,
                    backgroundColor: isSelected ? theme.SURFACE_2 : theme.SURFACE,
                  },
                ]}
              >
                <Text style={[styles.cyclePillText, { color: theme.TEXT }]} numberOfLines={1}>
                  {cycle.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.TEXT_SECONDARY }}>Loading routes...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <InlineErrorState
          title="Failed to load routes"
          message="The routes endpoint is unreachable right now."
          retryLabel="Retry routes"
          onRetry={() => {
            trackEvent('routes.retry_pressed');
            void refetchRoutes();
          }}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper includeTopInset={false} includeBottomInset={false}>
      <View
        style={[
          styles.container,
          isWideLayout ? styles.containerWide : styles.containerStack,
          {
            paddingTop: topContentPadding,
            paddingBottom: bottomContentPadding,
          },
        ]}
      >
        {isBusesError ? (
          <InlineErrorState
            title="Live buses are unavailable"
            message="Showing fallback behavior until the live feed recovers."
          />
        ) : null}
        {isWideLayout ? (
          <>
            {!isMapExpanded ? (
              <View
                style={[
                  styles.listPanel,
                  {
                    backgroundColor: theme.SURFACE,
                    borderColor: theme.BORDER,
                  },
                  styles.listPanelWide,
                ]}
              >
              <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}>
                <View style={styles.routesHeaderRow}>
                  <View style={styles.panelTitleMetaRow}>
                    <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Routes</Text>
                    <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>•</Text>
                    <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>{routesMenuCount}</Text>
                  </View>
                  <Pressable
                    onPress={toggleFavoritesView}
                    style={[
                      styles.favoritesToggle,
                      {
                        borderColor: isFavoritesMode ? '#FACC15' : theme.BORDER,
                        backgroundColor: isFavoritesMode ? '#FACC15' : theme.SURFACE,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.favoritesToggleText, { color: isFavoritesMode ? '#3F3100' : theme.TEXT }]}
                    >
                      Favorites
                    </Text>
                  </Pressable>
                </View>
                {showNoActiveBusesNotice ? (
                  <View
                    style={[
                      styles.noServiceNotice,
                      {
                        borderColor: theme.WARNING,
                        backgroundColor: theme.SURFACE_2,
                      },
                    ]}
                  >
                    <Text style={[styles.noServiceNoticeText, { color: theme.WARNING }]}>No active buses right now. Routes and schedules are still available.</Text>
                  </View>
                ) : null}
              </View>

              <FlatList
                data={routeListData}
                keyExtractor={(item) => item.id}
                renderItem={renderRouteItem}
                ListEmptyComponent={
                  <View style={styles.listEmptyContainer}>
                    <Text style={{ color: theme.TEXT_SECONDARY }}>
                      {isFavoritesMode && !hasFavorites
                        ? 'No favorites :('
                        : isLoading
                          ? 'Loading routes...'
                          : 'No routes available'}
                    </Text>
                  </View>
                }
              />
              </View>
            ) : null}

            <View style={[styles.mapColumn, isMapExpanded && styles.mapColumnExpanded]}>
              <View style={[styles.mapPanelContainer, styles.mapPanelContainerWide]} onLayout={handleMapLayout}>
                <View style={[styles.mapPanel, { borderColor: theme.BORDER }]}> 
                  <MapErrorBoundary>
                    <MapView
                      key={`wide-map-${mapRenderNonce}`}
                      buses={displayedBuses}
                      stops={selectedRouteStops}
                      stopDeparturesById={stopDeparturesById}
                      routePaths={displayedRouteGeometry}
                      predictionRoutePaths={displayedPredictionRouteGeometry}
                      selectedRouteId={isFavoritesAggregateView ? undefined : selectedRouteId || undefined}
                      resetViewToken={resetViewToken}
                      fullscreenViewToken={fullscreenViewToken}
                      layoutVersion={mapLayoutVersion}
                      focusedBus={focusedBus}
                      focusedStop={focusedStopForMap}
                      onBusPress={handleMapBusPress}
                      onStopPress={(stop: Stop) => focusStopFromMap(stop.code?.trim() || stop.id)}
                      onStopInfoPress={(stop: Stop) => openStopDetail(stop.code?.trim() || stop.id)}
                      onMapPress={() => {
                        setFocusedBusId(null);
                        setFocusedStopId(null);
                        setFocusedStopSource(null);
                      }}
                    />
                  </MapErrorBoundary>
                </View>
                <Pressable
                  onPress={resetToAllBuses}
                  style={[styles.resetMapButton, { backgroundColor: theme.SURFACE }]}
                >
                  <MaterialCommunityIcons name="backup-restore" size={16} color={theme.TEXT} />
                </Pressable>
                <Pressable
                  onPress={toggleMapExpanded}
                  style={[styles.expandMapButton, { backgroundColor: theme.SURFACE }]}
                >
                  <MaterialCommunityIcons
                    name={isMapExpanded ? 'fullscreen-exit' : 'fullscreen'}
                    size={16}
                    color={theme.TEXT}
                  />
                </Pressable>
              </View>

              {!isMapExpanded ? (
                <View
                  style={[
                    styles.stopsPanel,
                    styles.stopsPanelWide,
                    { backgroundColor: theme.SURFACE, borderColor: theme.BORDER },
                  ]}
                > 
                <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}>
                  <View style={styles.stopsHeaderRow}>
                    <View style={styles.panelTitleMetaRow}>
                      <Text style={[styles.panelTitle, { color: theme.TEXT }]}> 
                        {stopsPanelTitle}
                      </Text>
                      <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>•</Text>
                      <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>{stopsMenuCount}</Text>
                    </View>
                    <View style={styles.stopsHeaderActions}>
                      {selectedRoute ? (
                        <Pressable
                          onPress={toggleFavoriteForSelectedRoute}
                          style={[
                            styles.favoriteRouteButton,
                            {
                              borderColor: theme.BORDER,
                              backgroundColor: theme.SURFACE,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.favoriteRouteButtonText,
                              { color: isSelectedRouteFavorite ? '#DC2626' : theme.TEXT_SECONDARY },
                            ]}
                          >
                            {isSelectedRouteFavorite ? '♥' : '♡'}
                          </Text>
                        </Pressable>
                      ) : null}

                      {selectedRoute || isFavoritesMode ? (
                        <View style={styles.headerBusControls}>
                          <Text style={[styles.headerBusLabel, { color: theme.TEXT_SECONDARY }]}>Active buses</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.headerBusButtons}
                          >
                            {selectedRouteBuses.length === 0 ? (
                              <Text style={[styles.headerBusEmptyText, { color: theme.TEXT_SECONDARY }]}>None</Text>
                            ) : (
                              selectedRouteBuses.map(renderActiveBusPill)
                            )}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {renderInlinePatternCycleButtons()}
                </View>
                {renderStopsPanelBody()}
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.stackLayout}>
            <View style={[styles.stackMapSection, isMapExpanded && styles.stackMapSectionExpanded]}>
              <View style={styles.mapPanelContainer} onLayout={handleMapLayout}>
                <View style={[styles.mapPanel, styles.mapPanelStack, { borderColor: theme.BORDER }]}> 
                  <MapErrorBoundary>
                    <MapView
                      key={`stack-map-${mapRenderNonce}`}
                      buses={displayedBuses}
                      stops={selectedRouteStops}
                      stopDeparturesById={stopDeparturesById}
                      routePaths={displayedRouteGeometry}
                      predictionRoutePaths={displayedPredictionRouteGeometry}
                      selectedRouteId={isFavoritesAggregateView ? undefined : selectedRouteId || undefined}
                      resetViewToken={resetViewToken}
                      fullscreenViewToken={fullscreenViewToken}
                      layoutVersion={mapLayoutVersion}
                      focusedBus={focusedBus}
                      focusedStop={focusedStopForMap}
                      onBusPress={handleMapBusPress}
                      onStopPress={(stop: Stop) => focusStopFromMap(stop.code?.trim() || stop.id)}
                      onStopInfoPress={(stop: Stop) => openStopDetail(stop.code?.trim() || stop.id)}
                      onMapPress={() => {
                        setFocusedBusId(null);
                        setFocusedStopId(null);
                        setFocusedStopSource(null);
                      }}
                    />
                  </MapErrorBoundary>
                </View>
                <Pressable
                  onPress={resetToAllBuses}
                  style={[styles.resetMapButton, { backgroundColor: theme.SURFACE }]}
                >
                  <MaterialCommunityIcons name="backup-restore" size={16} color={theme.TEXT} />
                </Pressable>
                <Pressable
                  onPress={toggleMapExpanded}
                  style={[styles.expandMapButton, { backgroundColor: theme.SURFACE }]}
                >
                  <MaterialCommunityIcons
                    name={isMapExpanded ? 'fullscreen-exit' : 'fullscreen'}
                    size={16}
                    color={theme.TEXT}
                  />
                </Pressable>
              </View>
            </View>

            {!isMapExpanded ? (
              <View style={styles.stackBottomSection}>
                <View
                  style={[
                    styles.stopsPanel,
                    styles.stackStopsPanel,
                    {
                      minHeight: 0,
                      maxHeight: undefined,
                      backgroundColor: theme.SURFACE,
                      borderColor: theme.BORDER,
                    },
                  ]}
                >
                  <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}> 
                    <View style={styles.stopsHeaderRow}>
                      <View style={styles.panelTitleMetaRow}>
                        <Text style={[styles.panelTitle, { color: theme.TEXT }]}> 
                          {stopsPanelTitle}
                        </Text>
                        <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>•</Text>
                        <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>{stopsMenuCount}</Text>
                      </View>
                      <View style={styles.stopsHeaderActions}>
                        {selectedRoute ? (
                          <Pressable
                            onPress={toggleFavoriteForSelectedRoute}
                            style={[
                              styles.favoriteRouteButton,
                              {
                                borderColor: theme.BORDER,
                                backgroundColor: theme.SURFACE,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.favoriteRouteButtonText,
                                { color: isSelectedRouteFavorite ? '#DC2626' : theme.TEXT_SECONDARY },
                              ]}
                            >
                              {isSelectedRouteFavorite ? '♥' : '♡'}
                            </Text>
                          </Pressable>
                        ) : null}

                        {selectedRoute || isFavoritesMode ? (
                          <View style={styles.headerBusControls}>
                            <Text style={[styles.headerBusLabel, { color: theme.TEXT_SECONDARY }]}>Active buses</Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={styles.headerBusButtons}
                            >
                              {selectedRouteBuses.length === 0 ? (
                                <Text style={[styles.headerBusEmptyText, { color: theme.TEXT_SECONDARY }]}>None</Text>
                              ) : (
                                selectedRouteBuses.map(renderActiveBusPill)
                              )}
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    {renderInlinePatternCycleButtons()}
                  </View>
                  {renderStopsPanelBody()}
                </View>

                <View
                  style={[
                    styles.listPanel,
                    styles.listPanelStack,
                    styles.stackRoutesPanel,
                    {
                      minHeight: 0,
                      maxHeight: undefined,
                      backgroundColor: theme.SURFACE,
                      borderColor: theme.BORDER,
                    },
                  ]}
                >
                  <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}> 
                    <View style={styles.routesHeaderRow}>
                      <View style={styles.panelTitleMetaRow}>
                        <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Routes</Text>
                        <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>•</Text>
                        <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>{routesMenuCount}</Text>
                      </View>
                      <Pressable
                        onPress={toggleFavoritesView}
                        style={[
                          styles.favoritesToggle,
                          {
                            borderColor: isFavoritesMode ? '#FACC15' : theme.BORDER,
                            backgroundColor: isFavoritesMode ? '#FACC15' : theme.SURFACE,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.favoritesToggleText, { color: isFavoritesMode ? '#3F3100' : theme.TEXT }]}
                        >
                          Favorites
                        </Text>
                      </Pressable>
                    </View>
                    {showNoActiveBusesNotice ? (
                      <View
                        style={[
                          styles.noServiceNotice,
                          {
                            borderColor: theme.WARNING,
                            backgroundColor: theme.SURFACE_2,
                          },
                        ]}
                      >
                        <Text style={[styles.noServiceNoticeText, { color: theme.WARNING }]}>No active buses right now. Routes and schedules are still available.</Text>
                      </View>
                    ) : null}
                  </View>

                  <FlatList
                    data={routeListData}
                    keyExtractor={(item) => item.id}
                    renderItem={renderRouteItem}
                    ListEmptyComponent={
                      <View style={styles.listEmptyContainer}>
                        <Text style={{ color: theme.TEXT_SECONDARY }}>
                          {isFavoritesMode && !hasFavorites
                            ? 'No favorites :('
                            : isLoading
                              ? 'Loading routes...'
                              : 'No routes available'}
                        </Text>
                      </View>
                    }
                  />
                </View>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  containerWide: {
    flexDirection: 'row',
  },
  containerStack: {
    flexDirection: 'column',
  },
  stackLayout: {
    flex: 1,
    gap: 12,
  },
  stackMapSection: {
    flexBasis: '40%',
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
  },
  stackMapSectionExpanded: {
    flexBasis: 'auto',
    flexGrow: 1,
    flexShrink: 1,
  },
  stackBottomSection: {
    flexBasis: '60%',
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'column',
    gap: 12,
    minHeight: 0,
  },
  stackStopsPanel: {
    flex: 1,
    minHeight: 0,
  },
  stackRoutesPanel: {
    flex: 1,
    minHeight: 0,
  },
  mapColumn: {
    flex: 1,
    gap: 12,
    minHeight: 0,
  },
  mapColumnExpanded: {
    gap: 0,
  },
  mapPanelContainer: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  mapPanelContainerWide: {
    flex: 3,
  },
  listPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  listPanelWide: {
    width: 360,
  },
  listPanelStack: {
    flex: 1,
  },
  mapPanel: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 320,
  },
  mapPanelStack: {
    minHeight: 0,
  },
  listEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  stopsPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 0,
  },
  stopsPanelWide: {
    flex: 2,
    minHeight: 0,
  },
  stopsContent: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stopsText: {
    fontSize: 13,
  },
  stopsScroll: {
    flex: 1,
  },
  stopsListContent: {
    paddingVertical: 4,
  },
  stopRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stopRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  stopNameHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopNameCell: {
    flex: 1,
  },
  stopNameLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  stopNameText: {
    flexShrink: 1,
  },
  stopCodePill: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stopCodePillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  currentBusStopText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  stopInfoButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stopInfoButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stopRowText: {
    fontSize: 13,
    fontWeight: '600',
  },
  stopTimesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  stopTimeCell: {
    borderWidth: 1,
    borderRadius: 6,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stopTimeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cycleSelectorRow: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    maxHeight: 48,
  },
  cycleSelectorScroll: {
    flex: 1,
  },
  cycleSelectorContent: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cyclePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cyclePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cycleContextLabel: {
    marginLeft: 12,
    marginRight: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  cycleFallbackBadge: {
    borderWidth: 1,
    borderRadius: 999,
    marginRight: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cycleFallbackText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stopsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  routesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  favoritesToggle: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  favoritesToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stopsHeaderActions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  favoriteRouteButton: {
    borderWidth: 1,
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteRouteButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  headerBusControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  headerBusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerBusButtons: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  headerBusEmptyText: {
    fontSize: 12,
  },
  busPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  busPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  busPillMeta: {
    fontSize: 9,
    fontWeight: '600',
  },
  panelHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  panelTitleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  panelMetaText: {
    fontSize: 18,
    fontWeight: '600',
  },
  panelSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  noServiceNotice: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noServiceNoticeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inlineCycleButtonsContainer: {
    marginTop: 6,
    marginBottom: 2,
    alignItems: 'flex-start',
  },
  inlineCycleButtonsScroll: {
    flexGrow: 0,
    alignSelf: 'flex-start',
  },
  inlineCycleButtonsContent: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  routeFavoriteIndicator: {
    fontSize: 16,
    marginRight: 10,
    width: 16,
    textAlign: 'center',
  },
  routeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  routeName: {
    fontSize: 16,
    fontWeight: '600',
  },
  routeStatus: {
    fontSize: 12,
    marginTop: 4,
  },
  resetMapButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    borderWidth: 0,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 120,
    elevation: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.36,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  expandMapButton: {
    position: 'absolute',
    top: 54,
    right: 14,
    borderWidth: 0,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 120,
    elevation: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.36,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
});
