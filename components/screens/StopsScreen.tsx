/**
 * Stops tab screen.
 * Routes-style layout with stop list, map, and departures panel.
 */

import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary';
import MapView from '@/components/map/MapView';
import { ArrivalRow } from '@/components/ui/ArrivalRow';
import { InlineErrorState } from '@/components/ui/InlineErrorState';
import { RouteChip } from '@/components/ui/RouteChip';
import { useRoutes } from '@/hooks/useRoutes';
import { useStopArrivals } from '@/hooks/useStopArrivals';
import { useStops } from '@/hooks/useStops';
import { useTheme } from '@/hooks/useTheme';
import { useSelectedRouteStore } from '@/store/selectedRouteStore';
import { useSelectedStopStore } from '@/store/selectedStopStore';
import { Stop } from '@/types/transit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FAVORITE_STOP_IDS_STORAGE_KEY = 'betterbt.favoriteStopIds.v1';

const readPersistedFavoriteStopIds = async (): Promise<string[]> => {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(FAVORITE_STOP_IDS_STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [];
    }

    const raw = await SecureStore.getItemAsync(FAVORITE_STOP_IDS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch (error) {
    console.warn('Failed to read persisted favorite stops:', error);
    return [];
  }
};

const writePersistedFavoriteStopIds = async (favoriteStopIds: string[]): Promise<void> => {
  try {
    const payload = JSON.stringify(favoriteStopIds);

    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(FAVORITE_STOP_IDS_STORAGE_KEY, payload);
      return;
    }

    await SecureStore.setItemAsync(FAVORITE_STOP_IDS_STORAGE_KEY, payload);
  } catch (error) {
    console.warn('Failed to persist favorite stops:', error);
  }
};

const formatClockTime = (date: Date): string => {
  if (Number.isNaN(date.getTime())) return '--';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function StopsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const stopsListRef = useRef<FlatList<Stop> | null>(null);
  const pendingScrollIndexRef = useRef<number | null>(null);
  const hasInitializedMapViewportRef = useRef(false);
  const hasHydratedFavoriteStopsRef = useRef(false);
  const [isMapExpanded, setIsMapExpanded] = React.useState(false);
  const [favoriteStopIds, setFavoriteStopIds] = React.useState<string[]>([]);
  const [favoritesViewEnabled, setFavoritesViewEnabled] = React.useState(false);
  const [resetViewToken, setResetViewToken] = React.useState(0);
  const [fullscreenViewToken, setFullscreenViewToken] = React.useState(0);
  const [mapRenderNonce, setMapRenderNonce] = React.useState(0);
  const [mapLayoutVersion, setMapLayoutVersion] = React.useState(0);
  const [pendingLayoutRecenter, setPendingLayoutRecenter] = React.useState(false);
  const mapLayoutRef = useRef<{ width: number; height: number } | null>(null);
  const setPendingRouteId = useSelectedRouteStore((state) => state.setPendingRouteId);
  const selectedStopId = useSelectedStopStore((state) => state.selectedStopId);
  const setSelectedStopId = useSelectedStopStore((state) => state.setSelectedStopId);
  const clearSelectedStop = useSelectedStopStore((state) => state.clearSelectedStop);

  const { data: stops = [], isLoading: isStopsLoading, error: stopsError } = useStops();
  const { data: routes = [] } = useRoutes();

  const getStopPreferenceId = useCallback((stop: Stop): string => {
    return stop.code?.trim() || stop.id?.trim() || '';
  }, []);

  const favoriteStopSet = useMemo(() => new Set(favoriteStopIds), [favoriteStopIds]);
  const hasFavoriteStops = favoriteStopIds.length > 0;
  const isFavoritesMode = favoritesViewEnabled;
  const displayedStops = useMemo(() => {
    if (!isFavoritesMode) return stops;

    return stops.filter((stop) => {
      const preferenceId = getStopPreferenceId(stop);
      return preferenceId ? favoriteStopSet.has(preferenceId) : false;
    });
  }, [favoriteStopSet, getStopPreferenceId, isFavoritesMode, stops]);
  const stopsMenuCount = displayedStops.length;

  const routeShortNameById = useMemo(() => {
    return routes.reduce<Record<string, string>>((acc, route) => {
      acc[route.id] = route.shortName;
      return acc;
    }, {});
  }, [routes]);

  const normalizedSelectedStopId = useMemo(() => selectedStopId?.trim() || null, [selectedStopId]);

  const selectedStop = useMemo(() => {
    if (!normalizedSelectedStopId) return null;

    return (
      displayedStops.find((stop) => {
        const stopCode = stop.code?.trim();
        const stopId = stop.id?.trim();
        return stopId === normalizedSelectedStopId || stopCode === normalizedSelectedStopId;
      }) ?? null
    );
  }, [displayedStops, normalizedSelectedStopId]);

  const selectedStopIndex = useMemo(() => {
    if (!normalizedSelectedStopId) return -1;

    return displayedStops.findIndex((stop) => {
      const stopCode = stop.code?.trim();
      const stopId = stop.id?.trim();
      return stopId === normalizedSelectedStopId || stopCode === normalizedSelectedStopId;
    });
  }, [displayedStops, normalizedSelectedStopId]);

  useEffect(() => {
    if (hasInitializedMapViewportRef.current) return;
    if (displayedStops.length === 0) return;

    // Respect explicit cross-screen stop focus on first load.
    if (selectedStop) {
      hasInitializedMapViewportRef.current = true;
      return;
    }

    setResetViewToken((current) => current + 1);
    hasInitializedMapViewportRef.current = true;
  }, [displayedStops.length, selectedStop]);

  useEffect(() => {
    let isMounted = true;

    const hydrateFavorites = async () => {
      const persistedFavoriteStopIds = await readPersistedFavoriteStopIds();
      if (!isMounted) return;

      setFavoriteStopIds(persistedFavoriteStopIds);
      hasHydratedFavoriteStopsRef.current = true;
    };

    void hydrateFavorites();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedFavoriteStopsRef.current) return;
    void writePersistedFavoriteStopIds(favoriteStopIds);
  }, [favoriteStopIds]);

  useEffect(() => {
    if (!isFavoritesMode) return;
    if (!normalizedSelectedStopId) return;

    const selectedStopIsVisibleInFavorites = displayedStops.some((stop) => {
      const stopId = stop.id?.trim();
      const stopCode = stop.code?.trim();
      return stopId === normalizedSelectedStopId || stopCode === normalizedSelectedStopId;
    });
    if (selectedStopIsVisibleInFavorites) return;

    clearSelectedStop();
  }, [clearSelectedStop, displayedStops, isFavoritesMode, normalizedSelectedStopId]);

  useEffect(() => {
    if (selectedStopIndex < 0) return;
    if (!stopsListRef.current) return;

    stopsListRef.current.scrollToIndex({
      index: selectedStopIndex,
      animated: true,
      viewPosition: 0.24,
    });
  }, [selectedStopIndex]);

  const handleScrollToIndexFailed = useCallback(({ index }: { index: number }) => {
    if (!stopsListRef.current) return;

    pendingScrollIndexRef.current = index;

    // Wait for the list to measure additional rows, then retry using real layout data.
    setTimeout(() => {
      if (!stopsListRef.current) return;
      if (pendingScrollIndexRef.current !== index) return;

      stopsListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.24,
      });
    }, 80);
  }, []);

  const stopIdForArrivals = selectedStop?.code?.trim() || selectedStop?.id || '';
  const selectedStopPreferenceId = selectedStop ? getStopPreferenceId(selectedStop) : '';
  const selectedStopIsFavorite = selectedStopPreferenceId ? favoriteStopSet.has(selectedStopPreferenceId) : false;
  const {
    data: arrivals = [],
    isLoading: isArrivalsLoading,
    error: arrivalsError,
  } = useStopArrivals(stopIdForArrivals);

  const stopDeparturesById = useMemo(() => {
    if (!selectedStop) return {};

    const times = arrivals
      .slice(0, 3)
      .map((arrival) => formatClockTime(arrival.arrivalTime))
      .filter((value) => value !== '--');

    return {
      [selectedStop.id]: times,
      ...(selectedStop.code ? { [selectedStop.code]: times } : {}),
    };
  }, [arrivals, selectedStop]);

  const selectStop = useCallback((rawStopId: string) => {
    const stopId = rawStopId.trim();
    if (!stopId) return;

    setSelectedStopId(stopId, 'stops-selection');
  }, [setSelectedStopId]);

  const handleStopListPress = useCallback((stop: Stop) => {
    const stopCode = stop.code?.trim();
    const stopId = stop.id?.trim();
    const isCurrentlySelected = Boolean(
      normalizedSelectedStopId &&
      (normalizedSelectedStopId === stopId || normalizedSelectedStopId === stopCode)
    );

    if (isCurrentlySelected) {
      clearSelectedStop();
      return;
    }

    const nextStopId = stopCode || stopId;
    if (!nextStopId) return;

    setSelectedStopId(nextStopId, 'stops-selection');
  }, [clearSelectedStop, normalizedSelectedStopId, setSelectedStopId]);

  const openRouteForStop = useCallback((routeId: string) => {
    if (!selectedStop) return;

    const stopId = selectedStop.code?.trim() || selectedStop.id;
    if (!stopId) return;

    setSelectedStopId(stopId, 'stops-to-routes-handoff');
    setPendingRouteId(routeId);
    router.push({
      pathname: '/(tabs)/routes',
    });
  }, [router, selectedStop, setPendingRouteId, setSelectedStopId]);

  const renderStopItem = useCallback(({ item }: { item: Stop }) => {
    const itemStopId = item.code?.trim() || item.id;
    const itemCode = item.code?.trim();
    const itemId = item.id?.trim();
    const isSelected = normalizedSelectedStopId === itemId || normalizedSelectedStopId === itemCode;
    const isFavorite = favoriteStopSet.has(itemStopId);

    return (
      <Pressable
        onPress={() => handleStopListPress(item)}
        style={[
          styles.stopItem,
          {
            borderBottomColor: theme.BORDER,
            backgroundColor: isSelected ? theme.SURFACE_2 : 'transparent',
          },
        ]}
      >
        <View style={styles.stopItemTitleRow}>
          <Text
            style={[
              styles.favoriteStopIndicator,
              { color: isFavorite ? '#DC2626' : theme.BORDER },
            ]}
          >
            {isFavorite ? '♥' : '♡'}
          </Text>
          <Text style={[styles.stopItemTitle, { color: theme.TEXT }]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <Text style={[styles.stopItemMeta, { color: theme.TEXT_SECONDARY }]} numberOfLines={1}>
          Stop #{itemStopId} • {item.routes.length} route{item.routes.length === 1 ? '' : 's'}
        </Text>
      </Pressable>
    );
  }, [favoriteStopSet, handleStopListPress, normalizedSelectedStopId, theme.BORDER, theme.SURFACE_2, theme.TEXT, theme.TEXT_SECONDARY]);

  if (isStopsLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.TEXT_SECONDARY }}>Loading stops...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (stopsError) {
    return (
      <ScreenWrapper>
        <InlineErrorState
          title="Failed to load stops"
          message="Stop data is unavailable right now."
        />
      </ScreenWrapper>
    );
  }

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

  const resetMapView = () => {
    setFavoritesViewEnabled(false);
    clearSelectedStop();
    setResetViewToken((current) => current + 1);
  };

  const toggleMapExpanded = () => {
    setPendingLayoutRecenter(true);
    setIsMapExpanded((current) => !current);
    setFullscreenViewToken((current) => current + 1);

    // iOS can drop the native map surface after aggressive layout changes.
    // Force a remount so collapse/expand always redraws correctly.
    if (Platform.OS === 'ios') {
      setMapRenderNonce((current) => current + 1);
    }
  };

  const stopsListPanel = (
    <View
      style={[
        styles.listPanel,
        !isWideLayout && styles.listPanelStack,
        { backgroundColor: theme.SURFACE, borderColor: theme.BORDER },
      ]}
    >
      <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}> 
        <View style={styles.stopsListHeaderRow}>
          <View style={styles.panelTitleMetaRow}>
            <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Stops</Text>
            <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>•</Text>
            <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>{stopsMenuCount}</Text>
          </View>
          <Pressable
            onPress={() => {
              setFavoritesViewEnabled((current) => !current);
            }}
            style={[
              styles.favoritesToggle,
              {
                borderColor: isFavoritesMode ? '#FACC15' : theme.BORDER,
                backgroundColor: isFavoritesMode ? '#FACC15' : theme.SURFACE,
              },
            ]}
          >
            <Text
              style={[
                styles.favoritesToggleText,
                { color: isFavoritesMode ? '#3F3100' : theme.TEXT },
              ]}
            >
              Favorites
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={stopsListRef}
        data={displayedStops}
        keyExtractor={(item) => item.id}
        renderItem={renderStopItem}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        initialNumToRender={Math.max(40, displayedStops.length)}
        maxToRenderPerBatch={Math.max(40, displayedStops.length)}
        windowSize={21}
        removeClippedSubviews={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: theme.TEXT_SECONDARY }}>
              {isFavoritesMode && !hasFavoriteStops
                ? 'No favorite stops yet'
                : isStopsLoading
                  ? 'Loading stops...'
                  : 'No stops found'}
            </Text>
          </View>
        }
      />
    </View>
  );

  const mapPanelNode = (
    <View style={[styles.mapPanelContainer, isWideLayout && styles.mapPanelContainerWide]} onLayout={handleMapLayout}>
      <View style={[styles.mapPanel, !isWideLayout && styles.mapPanelStack, { borderColor: theme.BORDER }]}> 
        <MapErrorBoundary>
          <MapView
            key={`${isWideLayout ? 'wide' : 'stack'}-stops-map-${mapRenderNonce}`}
            buses={[]}
            stops={displayedStops}
            stopDeparturesById={stopDeparturesById}
            resetViewToken={resetViewToken}
            fullscreenViewToken={fullscreenViewToken}
            layoutVersion={mapLayoutVersion}
            focusedStop={selectedStop}
            onStopPress={(stop: Stop) => selectStop(stop.id)}
            onMapPress={clearSelectedStop}
          />
        </MapErrorBoundary>
      </View>
      <Pressable
        onPress={resetMapView}
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
  );

  const departuresPanelNode = (
    <View style={[styles.departuresPanel, !isWideLayout && styles.departuresPanelStack, { backgroundColor: theme.SURFACE, borderColor: theme.BORDER }]}> 
      <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}> 
        <View style={styles.departuresHeaderRow}>
          <View style={styles.departuresTitleMetaRow}>
            <Text style={[styles.panelTitle, { color: theme.TEXT }]}> 
              {selectedStop ? `Departures • ${selectedStop.code?.trim() || selectedStop.id}` : 'Departures'}
            </Text>
            {selectedStop ? (
              <>
                <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>•</Text>
                <Text style={[styles.panelMetaText, { color: theme.TEXT_SECONDARY }]}>{arrivals.length}</Text>
              </>
            ) : null}
          </View>
          {selectedStop ? (
            <Pressable
              onPress={() => {
                if (!selectedStopPreferenceId) return;
                setFavoriteStopIds((current) =>
                  selectedStopIsFavorite
                    ? current.filter((id) => id !== selectedStopPreferenceId)
                    : [...current, selectedStopPreferenceId]
                );
              }}
              style={[
                styles.favoriteStopHeaderButton,
                {
                  borderColor: theme.BORDER,
                  backgroundColor: theme.SURFACE,
                },
              ]}
            >
              <Text
                style={[
                  styles.favoriteStopHeaderButtonText,
                  { color: selectedStopIsFavorite ? '#DC2626' : theme.TEXT_SECONDARY },
                ]}
              >
                {selectedStopIsFavorite ? '♥' : '♡'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {selectedStop && selectedStop.routes.length > 0 ? (
          <View style={styles.routesForStopSection}>
            <Text style={[styles.routesForStopLabel, { color: theme.TEXT_SECONDARY }]}>Routes at this stop</Text>
            <View style={styles.routesForStopWrap}>
              {selectedStop.routes.map((routeId) => {
                const routeName = routeShortNameById[routeId] || routeId;

                return (
                  <Pressable
                    key={`${selectedStop.id}-${routeId}`}
                    onPress={() => openRouteForStop(routeId)}
                    style={styles.routeButtonPressable}
                  >
                    <RouteChip routeName={routeName} size="small" />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>

      {!selectedStop ? (
        <View style={styles.emptyContainer}>
          <Text style={{ color: theme.TEXT_SECONDARY }}>Select a stop from the list or map.</Text>
        </View>
      ) : isArrivalsLoading ? (
        <View style={styles.emptyContainer}>
          <Text style={{ color: theme.TEXT_SECONDARY }}>Loading departures...</Text>
        </View>
      ) : arrivalsError ? (
        <View style={styles.emptyContainer}>
          <Text style={{ color: theme.ERROR }}>Failed to load departures</Text>
        </View>
      ) : (
        <FlatList
          data={arrivals}
          keyExtractor={(item, idx) => `${item.routeId}-${item.arrivalTime.toISOString()}-${idx}`}
          renderItem={({ item }) => <ArrivalRow arrival={item} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ color: theme.TEXT_SECONDARY }}>No departures scheduled</Text>
            </View>
          }
        />
      )}
    </View>
  );

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
        {isWideLayout ? (
          <>
            {!isMapExpanded ? stopsListPanel : null}
            <View style={[styles.rightColumn, isMapExpanded && styles.rightColumnExpanded]}>
              {mapPanelNode}
              {!isMapExpanded ? departuresPanelNode : null}
            </View>
          </>
        ) : (
          <>
            <View style={[styles.stackMapSection, isMapExpanded && styles.stackMapSectionExpanded]}>{mapPanelNode}</View>
            {!isMapExpanded ? (
              <View style={styles.stackBottomSection}>
                {departuresPanelNode}
                {stopsListPanel}
              </View>
            ) : null}
          </>
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
  },
  containerWide: {
    flexDirection: 'row',
  },
  containerStack: {
    flexDirection: 'column',
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
  listPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 0,
    width: 360,
  },
  listPanelStack: {
    width: '100%',
    flex: 1,
  },
  rightColumn: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  rightColumnExpanded: {
    gap: 0,
  },
  mapPanelContainer: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  mapPanelContainerWide: {
    flex: 1,
  },
  mapPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 220,
    flex: 2,
  },
  mapPanelStack: {
    minHeight: 0,
    flex: 1,
  },
  departuresPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 0,
    flex: 1,
  },
  departuresPanelStack: {
    flex: 1,
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
  },
  stopsListHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelMetaText: {
    fontSize: 18,
    fontWeight: '600',
  },
  panelSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  routesForStopSection: {
    marginTop: 8,
    gap: 6,
  },
  departuresHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  departuresTitleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routesForStopLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  routesForStopWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeButtonPressable: {
    borderRadius: 999,
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
  stopItem: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stopItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  stopItemTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  favoriteStopIndicator: {
    width: 16,
    fontSize: 16,
    marginRight: 10,
    textAlign: 'center',
  },
  favoriteStopHeaderButton: {
    borderWidth: 1,
    borderRadius: 999,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteStopHeaderButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  stopItemMeta: {
    marginTop: 4,
    marginLeft: 34,
    fontSize: 12,
  },
  emptyContainer: {
    minHeight: 90,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
