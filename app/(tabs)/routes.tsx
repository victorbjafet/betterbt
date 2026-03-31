/**
 * Routes Screen
 * Split view route list + route-focused map
 */

import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import MapView from '@/components/map/MapView';
import { RouteChip } from '@/components/ui/RouteChip';
import { useBusPositions } from '@/hooks/useBuses';
import { useFavoriteRouteGeometry } from '@/hooks/useFavoriteRouteGeometry';
import { useRouteGeometry } from '@/hooks/useRouteGeometry';
import { useRouteStops } from '@/hooks/useRouteStops';
import { useRoutes } from '@/hooks/useRoutes';
import { useTheme } from '@/hooks/useTheme';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

export default function RoutesScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { data: buses = [] } = useBusPositions();
  const { data: routes = [], isLoading, error } = useRoutes();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedBusId, setFocusedBusId] = useState<string | null>(null);
  const [favoriteRouteIds, setFavoriteRouteIds] = useState<string[]>([]);
  const [favoritesViewEnabled, setFavoritesViewEnabled] = useState(false);
  const stopFocusReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isWideLayout = width >= 900;

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId]
  );

  const favoriteRouteSet = useMemo(() => new Set(favoriteRouteIds), [favoriteRouteIds]);
  const isFavoritesView = favoritesViewEnabled && favoriteRouteIds.length > 0;
  const visibleRoutes = useMemo(
    () => (isFavoritesView ? routes.filter((route) => favoriteRouteSet.has(route.id)) : routes),
    [favoriteRouteSet, isFavoritesView, routes]
  );
  const displayedBuses = useMemo(
    () => (isFavoritesView ? buses.filter((bus) => favoriteRouteSet.has(bus.routeId)) : buses),
    [buses, favoriteRouteSet, isFavoritesView]
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
  const isSelectedRouteFavorite = selectedRoute ? favoriteRouteSet.has(selectedRoute.id) : false;

  const activeRouteIds = useMemo(() => new Set(displayedBuses.map((bus) => bus.routeId)), [displayedBuses]);
  const selectedRouteBuses = useMemo(
    () => {
      if (selectedRouteId) return buses.filter((bus) => bus.routeId === selectedRouteId);
      if (isFavoritesView) return displayedBuses;
      return [];
    },
    [buses, displayedBuses, isFavoritesView, selectedRouteId]
  );
  const { data: selectedRouteCycles = [], isLoading: stopsLoading } = useRouteStops(selectedRouteId);
  const selectedCycle = useMemo(
    () => selectedRouteCycles.find((cycle) => cycle.id === selectedCycleId) ?? selectedRouteCycles[0] ?? null,
    [selectedCycleId, selectedRouteCycles]
  );
  const cycleOptions = useMemo(() => selectedRouteCycles.slice(0, 4), [selectedRouteCycles]);
  const selectedRouteStops = selectedCycle?.stops ?? [];
  const { data: selectedRouteGeometry = [] } = useRouteGeometry(selectedRouteId, selectedRoute?.color || '#2563EB');
  const { data: favoriteRouteGeometry = [] } = useFavoriteRouteGeometry(favoriteRouteIds, routeColorById);
  const selectedCycleGeometry = useMemo(() => {
    if (!selectedCycle) return selectedRouteGeometry;
    return selectedRouteGeometry.filter((path) => path.patternName === selectedCycle.patternName);
  }, [selectedCycle, selectedRouteGeometry]);
  const displayedRouteGeometry = isFavoritesView ? favoriteRouteGeometry : selectedCycleGeometry;

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

  const focusedBus = useMemo(
    () => displayedBuses.find((bus) => bus.id === focusedBusId) ?? null,
    [displayedBuses, focusedBusId]
  );

  const focusedStop = useMemo(
    () => selectedRouteStops.find((stop) => stop.id === focusedStopId) ?? null,
    [focusedStopId, selectedRouteStops]
  );

  const busesByRoute = useMemo(() => {
    return displayedBuses.reduce<Record<string, number>>((acc, bus) => {
      acc[bus.routeId] = (acc[bus.routeId] ?? 0) + 1;
      return acc;
    }, {});
  }, [displayedBuses]);

  const renderActiveBusPill = (bus: (typeof selectedRouteBuses)[number]) => {
    const stopAbbreviation = bus.currentStopId?.trim() || '--';
    const occupancyValue = typeof bus.occupancyPercent === 'number' ? `${Math.round(bus.occupancyPercent)}%` : '--';
    const showOccupancy = bus.capacity !== 0;
    const routeLabel = routeShortNameById[bus.routeId] ?? bus.routeId;

    return (
      <Pressable
        key={bus.id}
        onPress={() => {
          setFocusedBusId((current) => (current === bus.id ? null : bus.id));
          setFocusedStopId(null);
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
          {isFavoritesView ? `#${bus.id} ${routeLabel}` : `#${bus.id}`}
        </Text>
        <Text style={[styles.busPillMeta, { color: theme.TEXT_SECONDARY }]}> 
          S:{stopAbbreviation}{showOccupancy ? ` O:${occupancyValue}` : ''}
        </Text>
      </Pressable>
    );
  };

  const toggleFavoriteForSelectedRoute = () => {
    if (!selectedRoute) return;

    setFavoriteRouteIds((current) =>
      current.includes(selectedRoute.id)
        ? current.filter((id) => id !== selectedRoute.id)
        : [...current, selectedRoute.id]
    );
  };

  const toggleFavoritesView = () => {
    setFavoritesViewEnabled((current) => !current);
    setSelectedRouteId(null);
    setSelectedCycleId(null);
    setFocusedBusId(null);
    setFocusedStopId(null);
  };

  const resetToAllBuses = () => {
    setFavoritesViewEnabled(false);
    setSelectedRouteId(null);
    setSelectedCycleId(null);
    setFocusedBusId(null);
    setFocusedStopId(null);
  };

  const focusStopTemporarily = (stopId: string) => {
    setFocusedBusId(null);
    setFocusedStopId(stopId);

    if (stopFocusReleaseTimerRef.current) {
      clearTimeout(stopFocusReleaseTimerRef.current);
    }

    stopFocusReleaseTimerRef.current = setTimeout(() => {
      setFocusedStopId((current) => (current === stopId ? null : current));
      stopFocusReleaseTimerRef.current = null;
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (stopFocusReleaseTimerRef.current) {
        clearTimeout(stopFocusReleaseTimerRef.current);
      }
    };
  }, []);

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
                <View style={styles.routesHeaderRow}>
                  <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Routes</Text>
                  <Pressable
                    onPress={toggleFavoritesView}
                    style={[
                      styles.favoritesToggle,
                      {
                        borderColor: theme.BORDER,
                        backgroundColor: isFavoritesView ? theme.SURFACE_2 : theme.SURFACE,
                      },
                    ]}
                  >
                    <Text style={[styles.favoritesToggleText, { color: theme.TEXT }]}> 
                      {isFavoritesView ? 'All' : 'Favorites'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a route to focus the map</Text>
              </View>

              <FlatList
                data={visibleRoutes}
                keyExtractor={(item) => item.id}
                renderItem={({ item: route }) => {
                  const isSelected = selectedRouteId === route.id;
                  const activeBusCount = busesByRoute[route.id] ?? 0;

                  return (
                    <Pressable
                      onPress={() => {
                        setFavoritesViewEnabled(false);
                        setFocusedStopId(null);
                        setFocusedBusId(null);
                        setSelectedCycleId(null);
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
                }}
                ListEmptyComponent={
                  <View style={styles.centerContainer}>
                    <Text style={{ color: theme.TEXT_SECONDARY }}>No routes available</Text>
                  </View>
                }
              />
            </View>

            <View style={styles.mapColumn}>
              <View style={styles.mapPanelContainer}>
                <View style={[styles.mapPanel, { borderColor: theme.BORDER }]}> 
                  <MapView
                    buses={displayedBuses}
                    stops={selectedRouteStops}
                    routePaths={displayedRouteGeometry}
                    selectedRouteId={isFavoritesView ? undefined : selectedRouteId || undefined}
                    focusedBus={focusedBus}
                    focusedStop={focusedStop}
                    onBusPress={(bus) => {
                      setFocusedBusId(bus.id);
                      setFocusedStopId(null);
                    }}
                    onStopPress={(stop) => focusStopTemporarily(stop.id)}
                    onMapPress={() => {
                      setFocusedBusId(null);
                      setFocusedStopId(null);
                    }}
                  />
                  <View style={[styles.mapOverlay, { backgroundColor: theme.SURFACE }]}> 
                    <Text style={[styles.overlayTitle, { color: theme.TEXT }]}> 
                      {selectedRoute
                        ? `${selectedRoute.shortName} • ${selectedRoute.name}`
                        : isFavoritesView
                          ? 'Favorite routes'
                          : 'All routes'}
                    </Text>
                    <Text style={[styles.overlaySubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a bus marker for details</Text>
                  </View>
                </View>
                <Pressable
                  onPress={resetToAllBuses}
                  style={[styles.resetMapButton, { backgroundColor: theme.SURFACE }]}
                >
                  <Text style={[styles.resetMapButtonText, { color: theme.TEXT }]}>Reset</Text>
                </Pressable>
              </View>

              <View style={[styles.stopsPanel, { backgroundColor: theme.SURFACE, borderColor: theme.BORDER }]}>
                <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}>
                  <View style={styles.stopsHeaderRow}>
                    <Text style={[styles.panelTitle, { color: theme.TEXT }]}> 
                      {selectedRoute
                        ? `Stops • ${selectedRoute.shortName}`
                        : isFavoritesView
                          ? 'Stops • Favorites'
                          : 'Stops'}
                    </Text>
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

                      {selectedRoute || isFavoritesView ? (
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
                  <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>
                    {isFavoritesView
                      ? `${selectedRouteBuses.length} live buses across ${favoriteRouteIds.length} favorites`
                      : selectedRoute
                      ? `${selectedRouteStops.length} stops in ${selectedCycle?.label ?? 'current cycle'}`
                      : 'Select a route to view stops'}
                  </Text>
                </View>
                {isFavoritesView ? (
                  <View style={styles.stopsContent}>
                    <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Favorites mode is active. Stops list is hidden.</Text>
                  </View>
                ) : selectedRoute ? (
                  <>
                    {cycleOptions.length > 1 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={[styles.cycleSelectorRow, { borderBottomColor: theme.BORDER }]}
                        contentContainerStyle={styles.cycleSelectorContent}
                      >
                        {cycleOptions.map((cycle) => (
                          <Pressable
                            key={cycle.id}
                            onPress={() => {
                              setSelectedCycleId(cycle.id);
                              setFocusedStopId(null);
                            }}
                            style={[
                              styles.cyclePill,
                              {
                                borderColor: theme.BORDER,
                                backgroundColor: selectedCycle?.id === cycle.id ? theme.SURFACE_2 : theme.SURFACE,
                              },
                            ]}
                          >
                            <Text style={[styles.cyclePillText, { color: theme.TEXT }]}>{cycle.label}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}

                    <ScrollView style={styles.stopsScroll} contentContainerStyle={styles.stopsListContent}>
                      {stopsLoading ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Loading stops...</Text>
                      ) : selectedRouteStops.length === 0 ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>No stops returned for this route.</Text>
                      ) : (
                        selectedRouteStops.map((stop) => (
                          <Pressable
                            key={stop.id}
                            onPress={() => focusStopTemporarily(stop.id)}
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
              <View style={styles.mapPanelContainer}>
                <View style={[styles.mapPanel, { borderColor: theme.BORDER }]}> 
                  <MapView
                    buses={displayedBuses}
                    stops={selectedRouteStops}
                    routePaths={displayedRouteGeometry}
                    selectedRouteId={isFavoritesView ? undefined : selectedRouteId || undefined}
                    focusedBus={focusedBus}
                    focusedStop={focusedStop}
                    onBusPress={(bus) => {
                      setFocusedBusId(bus.id);
                      setFocusedStopId(null);
                    }}
                    onStopPress={(stop) => focusStopTemporarily(stop.id)}
                    onMapPress={() => {
                      setFocusedBusId(null);
                      setFocusedStopId(null);
                    }}
                  />
                  <View style={[styles.mapOverlay, { backgroundColor: theme.SURFACE }]}> 
                    <Text style={[styles.overlayTitle, { color: theme.TEXT }]}> 
                      {selectedRoute
                        ? `${selectedRoute.shortName} • ${selectedRoute.name}`
                        : isFavoritesView
                          ? 'Favorite routes'
                          : 'All routes'}
                    </Text>
                    <Text style={[styles.overlaySubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a bus marker for details</Text>
                  </View>
                </View>
                <Pressable
                  onPress={resetToAllBuses}
                  style={[styles.resetMapButton, { backgroundColor: theme.SURFACE }]}
                >
                  <Text style={[styles.resetMapButtonText, { color: theme.TEXT }]}>Reset</Text>
                </Pressable>
              </View>

              <View style={[styles.stopsPanel, { backgroundColor: theme.SURFACE, borderColor: theme.BORDER }]}>
                <View style={[styles.panelHeader, { borderBottomColor: theme.BORDER }]}>
                  <View style={styles.stopsHeaderRow}>
                    <Text style={[styles.panelTitle, { color: theme.TEXT }]}> 
                      {selectedRoute
                        ? `Stops • ${selectedRoute.shortName}`
                        : isFavoritesView
                          ? 'Stops • Favorites'
                          : 'Stops'}
                    </Text>
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

                      {selectedRoute || isFavoritesView ? (
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
                  <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}> 
                    {isFavoritesView
                      ? `${selectedRouteBuses.length} live buses across ${favoriteRouteIds.length} favorites`
                      : selectedRoute
                      ? `${selectedRouteStops.length} stops in ${selectedCycle?.label ?? 'current cycle'}`
                      : 'Select a route to view stops'}
                  </Text>
                </View>
                {isFavoritesView ? (
                  <View style={styles.stopsContent}>
                    <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Favorites mode is active. Stops list is hidden.</Text>
                  </View>
                ) : selectedRoute ? (
                  <>
                    {cycleOptions.length > 1 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={[styles.cycleSelectorRow, { borderBottomColor: theme.BORDER }]}
                        contentContainerStyle={styles.cycleSelectorContent}
                      >
                        {cycleOptions.map((cycle) => (
                          <Pressable
                            key={cycle.id}
                            onPress={() => {
                              setSelectedCycleId(cycle.id);
                              setFocusedStopId(null);
                            }}
                            style={[
                              styles.cyclePill,
                              {
                                borderColor: theme.BORDER,
                                backgroundColor: selectedCycle?.id === cycle.id ? theme.SURFACE_2 : theme.SURFACE,
                              },
                            ]}
                          >
                            <Text style={[styles.cyclePillText, { color: theme.TEXT }]}>{cycle.label}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}

                    <ScrollView style={styles.stopsScroll} contentContainerStyle={styles.stopsListContent}>
                      {stopsLoading ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>Loading stops...</Text>
                      ) : selectedRouteStops.length === 0 ? (
                        <Text style={[styles.stopsText, { color: theme.TEXT_SECONDARY }]}>No stops returned for this route.</Text>
                      ) : (
                        selectedRouteStops.map((stop) => (
                          <Pressable
                            key={stop.id}
                            onPress={() => focusStopTemporarily(stop.id)}
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
                <View style={styles.routesHeaderRow}>
                  <Text style={[styles.panelTitle, { color: theme.TEXT }]}>Routes</Text>
                  <Pressable
                    onPress={toggleFavoritesView}
                    style={[
                      styles.favoritesToggle,
                      {
                        borderColor: theme.BORDER,
                        backgroundColor: isFavoritesView ? theme.SURFACE_2 : theme.SURFACE,
                      },
                    ]}
                  >
                    <Text style={[styles.favoritesToggleText, { color: theme.TEXT }]}> 
                      {isFavoritesView ? 'All' : 'Favorites'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={[styles.panelSubtitle, { color: theme.TEXT_SECONDARY }]}>Tap a route to focus the map</Text>
              </View>

              <FlatList
                data={visibleRoutes}
                keyExtractor={(item) => item.id}
                renderItem={({ item: route }) => {
                  const isSelected = selectedRouteId === route.id;
                  const activeBusCount = busesByRoute[route.id] ?? 0;

                  return (
                    <Pressable
                      onPress={() => {
                        setFavoritesViewEnabled(false);
                        setFocusedStopId(null);
                        setFocusedBusId(null);
                        setSelectedCycleId(null);
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
  mapPanelContainer: {
    flex: 1,
    position: 'relative',
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
  cycleSelectorRow: {
    borderBottomWidth: 1,
    maxHeight: 44,
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
  resetMapButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
