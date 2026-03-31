/**
 * Routes Screen
 * Split view route list + route-focused map
 */

import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import MapView from '@/components/map/MapView';
import { RouteChip } from '@/components/ui/RouteChip';
import { useBusPositions } from '@/hooks/useBuses';
import { useRouteStops } from '@/hooks/useRouteStops';
import { useRoutes } from '@/hooks/useRoutes';
import { useTheme } from '@/hooks/useTheme';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

export default function RoutesScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { data: buses = [] } = useBusPositions();
  const { data: routes = [], isLoading, error } = useRoutes();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);

  const isWideLayout = width >= 900;

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId]
  );

  const activeRouteIds = useMemo(() => new Set(buses.map((bus) => bus.routeId)), [buses]);
  const selectedRouteBuses = useMemo(
    () => (selectedRouteId ? buses.filter((bus) => bus.routeId === selectedRouteId) : []),
    [buses, selectedRouteId]
  );
  const { data: selectedRouteStops = [], isLoading: stopsLoading } = useRouteStops(selectedRouteId);
  const focusedStop = useMemo(
    () => selectedRouteStops.find((stop) => stop.id === focusedStopId) ?? null,
    [focusedStopId, selectedRouteStops]
  );

  const busesByRoute = useMemo(() => {
    return buses.reduce<Record<string, number>>((acc, bus) => {
      acc[bus.routeId] = (acc[bus.routeId] ?? 0) + 1;
      return acc;
    }, {});
  }, [buses]);

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
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.ERROR }}>Failed to load routes</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={[styles.container, isWideLayout ? styles.containerWide : styles.containerStack]}>
        {isWideLayout ? (
          <>
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
                <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Routes</Text>
                <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a route to focus the map</Text>
              </View>

              <FlatList
                data={routes}
                keyExtractor={(item) => item.id}
                renderItem={({ item: route }) => {
                  const isSelected = selectedRouteId === route.id;
                  const activeBusCount = busesByRoute[route.id] ?? 0;

                  return (
                    <Pressable
                      onPress={() => {
                        setFocusedStopId(null);
                        setSelectedRouteId((current) => (current === route.id ? null : route.id));
                      }}
                      style={[
                        styles.routeItem,
                        {
                          borderBottomColor: theme.BORDER,
                          backgroundColor: isSelected ? theme.SURFACE_2 : 'transparent',
                        },
                      ]}
                    >
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
                }}
                ListEmptyComponent={
                  <View style={styles.centerContainer}>
                    <Text style={{ color: theme.TEXT_SECONDARY }}>No routes available</Text>
                  </View>
                }
              />
            </View>

            <View style={styles.mapColumn}>
              <View style={[styles.mapPanel, { borderColor: theme.BORDER }]}>
                <MapView
                  buses={buses}
                  stops={selectedRouteStops}
                  selectedRouteId={selectedRouteId || undefined}
                  focusedStop={focusedStop}
                  onStopPress={(stop) => setFocusedStopId(stop.id)}
                />
                <View style={[styles.mapOverlay, { backgroundColor: theme.SURFACE }]}>
                  <Text style={[styles.overlayTitle, { color: theme.TEXT }]}>
                    {selectedRoute ? `${selectedRoute.shortName} • ${selectedRoute.name}` : 'All routes'}
                  </Text>
                  <Text style={[styles.overlaySubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a bus marker for details</Text>
                </View>
              </View>

              <View style={[styles.stopsPanel, { backgroundColor: theme.SURFACE, borderColor: theme.BORDER }]}>
                <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}>
                  <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Stops</Text>
                  <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>
                    {selectedRoute
                      ? `${selectedRouteStops.length} stops from pattern points`
                      : 'Select a route to view stops'}
                  </Text>
                </View>
                {selectedRoute ? (
                  <>
                    <View style={[styles.busInfoSection, { borderBottomColor: theme.BORDER }]}> 
                      <Text style={[styles.busInfoHeader, { color: theme.TEXT }]}>Active buses on route</Text>
                      {selectedRouteBuses.length === 0 ? (
                        <Text style={[styles.busInfoText, { color: theme.TEXT_SECONDARY }]}>No active buses on this route.</Text>
                      ) : (
                        selectedRouteBuses.map((bus) => (
                          <Text key={bus.id} style={[styles.busInfoText, { color: theme.TEXT_SECONDARY }]}>
                            #{bus.id} • {Math.round(bus.speed)} mph • stop {bus.currentStopId || 'N/A'}
                          </Text>
                        ))
                      )}
                    </View>

                    <ScrollView style={styles.stopsScroll} contentContainerStyle={styles.stopsListContent}>
                      {stopsLoading ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Loading stops...</Text>
                      ) : selectedRouteStops.length === 0 ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>No stops returned for this route.</Text>
                      ) : (
                        selectedRouteStops.map((stop) => (
                          <Pressable
                            key={stop.id}
                            onPress={() => setFocusedStopId(stop.id)}
                            style={[
                              styles.stopRow,
                              {
                                borderBottomColor: theme.BORDER,
                                backgroundColor: focusedStopId === stop.id ? theme.SURFACE_2 : 'transparent',
                              },
                            ]}
                          >
                            <Text style={[styles.stopRowText, { color: theme.TEXT }]}>
                              {stop.name} ({stop.id})
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </>
                ) : (
                  <View style={styles.stopsContent}>
                    <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Select a route to view stops here.</Text>
                  </View>
                )}
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.mapColumn}>
              <View style={[styles.mapPanel, { borderColor: theme.BORDER }]}>
                <MapView
                  buses={buses}
                  stops={selectedRouteStops}
                  selectedRouteId={selectedRouteId || undefined}
                  focusedStop={focusedStop}
                  onStopPress={(stop) => setFocusedStopId(stop.id)}
                />
                <View style={[styles.mapOverlay, { backgroundColor: theme.SURFACE }]}>
                  <Text style={[styles.overlayTitle, { color: theme.TEXT }]}>
                    {selectedRoute ? `${selectedRoute.shortName} • ${selectedRoute.name}` : 'All routes'}
                  </Text>
                  <Text style={[styles.overlaySubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a bus marker for details</Text>
                </View>
              </View>

              <View style={[styles.stopsPanel, { backgroundColor: theme.SURFACE, borderColor: theme.BORDER }]}>
                <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}>
                  <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Stops</Text>
                  <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}> 
                    {selectedRoute
                      ? `${selectedRouteStops.length} stops from pattern points`
                      : 'Select a route to view stops'}
                  </Text>
                </View>
                {selectedRoute ? (
                  <>
                    <View style={[styles.busInfoSection, { borderBottomColor: theme.BORDER }]}> 
                      <Text style={[styles.busInfoHeader, { color: theme.TEXT }]}>Active buses on route</Text>
                      {selectedRouteBuses.length === 0 ? (
                        <Text style={[styles.busInfoText, { color: theme.TEXT_SECONDARY }]}>No active buses on this route.</Text>
                      ) : (
                        selectedRouteBuses.map((bus) => (
                          <Text key={bus.id} style={[styles.busInfoText, { color: theme.TEXT_SECONDARY }]}>
                            #{bus.id} • {Math.round(bus.speed)} mph • stop {bus.currentStopId || 'N/A'}
                          </Text>
                        ))
                      )}
                    </View>

                    <ScrollView style={styles.stopsScroll} contentContainerStyle={styles.stopsListContent}>
                      {stopsLoading ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Loading stops...</Text>
                      ) : selectedRouteStops.length === 0 ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>No stops returned for this route.</Text>
                      ) : (
                        selectedRouteStops.map((stop) => (
                          <Pressable
                            key={stop.id}
                            onPress={() => setFocusedStopId(stop.id)}
                            style={[
                              styles.stopRow,
                              {
                                borderBottomColor: theme.BORDER,
                                backgroundColor: focusedStopId === stop.id ? theme.SURFACE_2 : 'transparent',
                              },
                            ]}
                          >
                            <Text style={[styles.stopRowText, { color: theme.TEXT }]}>
                              {stop.name} ({stop.id})
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </>
                ) : (
                  <View style={styles.stopsContent}>
                    <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Select a route to view stops here.</Text>
                  </View>
                )}
              </View>
            </View>

            <View
              style={[
                styles.listPanel,
                {
                  backgroundColor: theme.SURFACE,
                  borderColor: theme.BORDER,
                },
                styles.listPanelStack,
              ]}
            >
              <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}> 
                <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Routes</Text>
                <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a route to focus the map</Text>
              </View>

              <FlatList
                data={routes}
                keyExtractor={(item) => item.id}
                renderItem={({ item: route }) => {
                  const isSelected = selectedRouteId === route.id;
                  const activeBusCount = busesByRoute[route.id] ?? 0;

                  return (
                    <Pressable
                      onPress={() => {
                        setFocusedStopId(null);
                        setSelectedRouteId((current) => (current === route.id ? null : route.id));
                      }}
                      style={[
                        styles.routeItem,
                        {
                          borderBottomColor: theme.BORDER,
                          backgroundColor: isSelected ? theme.SURFACE_2 : 'transparent',
                        },
                      ]}
                    >
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
                }}
                ListEmptyComponent={
                  <View style={styles.centerContainer}>
                    <Text style={{ color: theme.TEXT_SECONDARY }}>No routes available</Text>
                  </View>
                }
              />
            </View>
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
    padding: 12,
  },
  containerWide: {
    flexDirection: 'row',
  },
  containerStack: {
    flexDirection: 'column',
  },
  mapColumn: {
    flex: 1,
    gap: 12,
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
  stopsPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 220,
    maxHeight: 220,
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
    paddingVertical: 9,
  },
  stopRowText: {
    fontSize: 13,
  },
  busInfoSection: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  busInfoHeader: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  busInfoText: {
    fontSize: 12,
    marginTop: 2,
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
  panelSubtitle: {
    marginTop: 2,
    fontSize: 12,
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
  mapOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    opacity: 0.94,
  },
  overlayTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  overlaySubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
});
