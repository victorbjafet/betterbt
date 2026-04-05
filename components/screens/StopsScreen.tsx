/**
 * Stops tab screen.
 * Routes-style layout with stop list, map, and departures panel.
 */

import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary';
import MapView from '@/components/map/MapView';
import { ArrivalRow } from '@/components/ui/ArrivalRow';
import { InlineErrorState } from '@/components/ui/InlineErrorState';
import { useStopArrivals } from '@/hooks/useStopArrivals';
import { useStops } from '@/hooks/useStops';
import { useTheme } from '@/hooks/useTheme';
import { Stop } from '@/types/transit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STOP_ROW_HEIGHT = 58;

const normalizeParam = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first ? first : null;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const routeStopId = useMemo(() => normalizeParam(id), [id]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWideLayout = width >= 900;
  const stopsListRef = useRef<FlatList<Stop> | null>(null);

  const { data: stops = [], isLoading: isStopsLoading, error: stopsError } = useStops();
  const [selectedStopId, setSelectedStopId] = useState<string | null>(routeStopId);

  useEffect(() => {
    setSelectedStopId(routeStopId);
  }, [routeStopId]);

  const selectedStop = useMemo(() => {
    if (!selectedStopId) return null;

    return (
      stops.find((stop) => {
        const stopCode = stop.code?.trim();
        return stop.id === selectedStopId || stopCode === selectedStopId;
      }) ?? null
    );
  }, [selectedStopId, stops]);

  const selectedStopIndex = useMemo(() => {
    if (!selectedStopId) return -1;

    return stops.findIndex((stop) => {
      const stopCode = stop.code?.trim();
      return stop.id === selectedStopId || stopCode === selectedStopId;
    });
  }, [selectedStopId, stops]);

  useEffect(() => {
    if (selectedStopIndex < 0) return;
    if (!stopsListRef.current) return;

    stopsListRef.current.scrollToIndex({
      index: selectedStopIndex,
      animated: true,
      viewPosition: 0.24,
    });
  }, [selectedStopIndex]);

  const stopIdForArrivals = selectedStop?.code?.trim() || selectedStop?.id || '';
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

    setSelectedStopId(stopId);
    router.replace({
      pathname: '/(tabs)/stops/[id]',
      params: { id: stopId },
    });
  }, [router]);

  const renderStopItem = useCallback(({ item }: { item: Stop }) => {
    const itemStopId = item.code?.trim() || item.id;
    const isSelected = selectedStopId === item.id || selectedStopId === item.code;

    return (
      <Pressable
        onPress={() => selectStop(itemStopId)}
        style={[
          styles.stopItem,
          {
            borderBottomColor: theme.BORDER,
            backgroundColor: isSelected ? theme.SURFACE_2 : 'transparent',
          },
        ]}
      >
        <Text style={[styles.stopItemTitle, { color: theme.TEXT }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.stopItemMeta, { color: theme.TEXT_SECONDARY }]} numberOfLines={1}>
          Stop #{itemStopId} • {item.routes.length} route{item.routes.length === 1 ? '' : 's'}
        </Text>
      </Pressable>
    );
  }, [selectStop, selectedStopId, theme.BORDER, theme.SURFACE_2, theme.TEXT, theme.TEXT_SECONDARY]);

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

  return (
    <ScreenWrapper includeTopInset={false} includeBottomInset={false}>
      <View style={[styles.container, isWideLayout ? styles.containerWide : styles.containerStack, { paddingTop: Math.max(8, insets.top * 0.35), paddingBottom: Math.max(8, insets.bottom * 0.45) }]}> 
        <View
          style={[
            styles.listPanel,
            !isWideLayout && styles.listPanelStack,
            { backgroundColor: theme.SURFACE, borderColor: theme.BORDER },
          ]}
        > 
          <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}> 
            <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Stops</Text>
            <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>Select a stop to view departures</Text>
          </View>

          <FlatList
            ref={stopsListRef}
            data={stops}
            keyExtractor={(item) => item.id}
            renderItem={renderStopItem}
            getItemLayout={(_, index) => ({
              length: STOP_ROW_HEIGHT,
              offset: STOP_ROW_HEIGHT * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              const fallbackOffset = Math.max(0, STOP_ROW_HEIGHT * index);
              stopsListRef.current?.scrollToOffset({
                offset: fallbackOffset,
                animated: true,
              });
            }}
            initialNumToRender={Math.max(40, stops.length)}
            maxToRenderPerBatch={Math.max(40, stops.length)}
            windowSize={21}
            removeClippedSubviews={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={{ color: theme.TEXT_SECONDARY }}>{isStopsLoading ? 'Loading stops...' : 'No stops found'}</Text>
              </View>
            }
          />
        </View>

        <View style={styles.rightColumn}>
          <View style={[styles.mapPanel, { borderColor: theme.BORDER }]}> 
            <MapErrorBoundary>
              <MapView
                buses={[]}
                stops={stops}
                stopDeparturesById={stopDeparturesById}
                focusedStop={selectedStop}
                onStopPress={(stop: Stop) => selectStop(stop.id)}
              />
            </MapErrorBoundary>
          </View>

          <View style={[styles.departuresPanel, { backgroundColor: theme.SURFACE, borderColor: theme.BORDER }]}> 
            <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}> 
              <Text style={[styles.panelTitle, { color: theme.TEXT }]}>
                {selectedStop ? `Departures • ${selectedStop.code?.trim() || selectedStop.id}` : 'Departures'}
              </Text>
              <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>Upcoming departures for the selected stop</Text>
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
        </View>
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
  listPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 0,
    width: 360,
  },
  listPanelStack: {
    width: '100%',
    maxHeight: 280,
  },
  rightColumn: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  mapPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 220,
    flex: 2,
  },
  departuresPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 0,
    flex: 3,
  },
  panelHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  panelSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  stopItem: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stopItemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  stopItemMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  emptyContainer: {
    minHeight: 90,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
