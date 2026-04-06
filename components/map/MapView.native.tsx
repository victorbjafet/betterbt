/**
 * MapView (Native Implementation)
 * Uses react-native-maps for iOS (Apple Maps) and Android (Google Maps)
 * Platform-specific: file loaded on native platforms via Expo Router
 */

import { MAP_CONFIG, REFRESH_INTERVALS } from '@/constants/config';
import { blendCoordinates, distanceMeters, interpolateCoordinate, predictBusCoordinate } from '@/services/map/busPrediction';
import { Bus, Stop } from '@/types/transit';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BusMarker } from './BusMarker';
import { StopMarker } from './StopMarker';
import { TransitMapViewProps } from './types';

const INITIAL_REGION = {
  latitude: MAP_CONFIG.INITIAL_LATITUDE,
  longitude: MAP_CONFIG.INITIAL_LONGITUDE,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function TransitMapView({
  buses,
  stops = [],
  stopDeparturesById = {},
  routePaths = [],
  predictionRoutePaths,
  selectedRouteId,
  resetViewToken = 0,
  fullscreenViewToken = 0,
  layoutVersion = 0,
  focusedBus,
  focusedStop,
  onBusPress,
  onStopPress,
  onStopInfoPress,
  onMapPress,
}: TransitMapViewProps) {
  const SNAP_TO_REAL_POSITION_METERS = 28;
  const LOW_MOVEMENT_THRESHOLD_METERS = 8;
  const LOW_MOVEMENT_END_BLEND_FACTOR = 0.45;
  const LOW_MOVEMENT_DURATION_MULTIPLIER = 1.6;
  const STOP_SELECTION_RADIUS_METERS = 28;

  const mapRef = useRef<MapView>(null);
  const markerRefs = useRef<Record<string, React.ComponentRef<typeof Marker> | null>>({});
  const motionTrackRef = useRef<Record<string, {
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    startedAtMs: number;
    durationMs: number;
  }>>({});
  const predictedEndpointRef = useRef<Record<string, { latitude: number; longitude: number }>>({});
  const lastMarkerPressAtRef = useRef(0);
  const [isMapReady, setIsMapReady] = useState(false);
  const [displayBuses, setDisplayBuses] = useState<Bus[]>(buses);
  const [visibleLatitudeDelta, setVisibleLatitudeDelta] = useState(INITIAL_REGION.latitudeDelta);
  const lastAutoFocusedRouteKey = useRef<string | null>(null);
  const didAutoFitAllBuses = useRef(false);
  const lastFollowAtMs = useRef(0);
  const lastHandledFocusedStopId = useRef<string | null>(null);
  const lastHandledResetToken = useRef(-1);
  const lastHandledViewportToken = useRef('');
  const lastFocusedBusPayloadTimestamp = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();

    setDisplayBuses((previousDisplayBuses) => {
      const previousById = new Map(
        previousDisplayBuses.map((bus) => [bus.id, { latitude: bus.latitude, longitude: bus.longitude }])
      );

      const nextTrackById: Record<string, {
        start: { latitude: number; longitude: number };
        end: { latitude: number; longitude: number };
        startedAtMs: number;
        durationMs: number;
      }> = {};
      const nextPredictedEndpoints: Record<string, { latitude: number; longitude: number }> = {};

      const seeded = buses.map((bus) => {
        const realPosition = { latitude: bus.latitude, longitude: bus.longitude };
        const predictionPaths = (predictionRoutePaths ?? routePaths).filter((path) => path.routeId === bus.routeId);
        const predictedEnd = predictBusCoordinate(bus, now, predictionPaths, {
          stops,
          horizonSeconds: REFRESH_INTERVALS.VEHICLES / 1000,
        });

        const previousPredicted = predictedEndpointRef.current[bus.id];
        const shouldSnapToReal =
          Boolean(previousPredicted) &&
          distanceMeters(previousPredicted!, realPosition) > SNAP_TO_REAL_POSITION_METERS;

        const start = shouldSnapToReal
          ? realPosition
          : (previousById.get(bus.id) ?? realPosition);

        const movementMeters = distanceMeters(start, realPosition);
        const hasLowMovement = movementMeters > 0 && movementMeters <= LOW_MOVEMENT_THRESHOLD_METERS;
        const end = hasLowMovement
          ? blendCoordinates(start, predictedEnd, LOW_MOVEMENT_END_BLEND_FACTOR)
          : predictedEnd;
        const durationMs = hasLowMovement
          ? Math.round(REFRESH_INTERVALS.VEHICLES * LOW_MOVEMENT_DURATION_MULTIPLIER)
          : REFRESH_INTERVALS.VEHICLES;

        nextTrackById[bus.id] = {
          start,
          end,
          startedAtMs: now,
          durationMs,
        };
        nextPredictedEndpoints[bus.id] = end;

        return {
          ...bus,
          latitude: start.latitude,
          longitude: start.longitude,
        };
      });

      motionTrackRef.current = nextTrackById;
      predictedEndpointRef.current = nextPredictedEndpoints;

      return seeded;
    });
  }, [buses, predictionRoutePaths, routePaths, stops]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      setDisplayBuses((previousBuses) => {
        return previousBuses.map((bus) => {
          const track = motionTrackRef.current[bus.id];
          if (!track) return bus;

          const progress = Math.min(Math.max((now - track.startedAtMs) / track.durationMs, 0), 1);
          const interpolated = interpolateCoordinate(track.start, track.end, progress);

          return {
            ...bus,
            latitude: interpolated.latitude,
            longitude: interpolated.longitude,
          };
        });
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  const fitToBusCoordinates = (points: { latitude: number; longitude: number }[], animated = true) => {
    if (!mapRef.current || points.length === 0) return;

    if (points.length === 1) {
      const onlyPoint = points[0];
      mapRef.current.animateToRegion(
        {
          latitude: onlyPoint.latitude,
          longitude: onlyPoint.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        animated ? 550 : 0
      );
      return;
    }

    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 90, right: 90, bottom: 90, left: 90 },
      animated,
    });
  };

  const filteredBuses = useMemo(
    () => (selectedRouteId ? displayBuses.filter((bus) => bus.routeId === selectedRouteId) : displayBuses),
    [displayBuses, selectedRouteId]
  );

  const filteredStops = useMemo(
    () =>
      selectedRouteId
        ? stops.filter((stop) => stop.routes.includes(selectedRouteId))
        : stops,
    [selectedRouteId, stops]
  );
  const visibleStops = useMemo(() => {
    if (visibleLatitudeDelta > 0.2) return [];
    if (visibleLatitudeDelta > 0.1) return filteredStops.slice(0, 220);
    return filteredStops;
  }, [filteredStops, visibleLatitudeDelta]);

  const selectNearestStopFromPoint = (latitude: number, longitude: number) => {
    if (filteredStops.length === 0) return false;

    const tappedPoint = { latitude, longitude };
    let nearestStop: Stop | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const stop of filteredStops) {
      const stopPoint = { latitude: stop.latitude, longitude: stop.longitude };
      const meters = distanceMeters(tappedPoint, stopPoint);
      if (meters < nearestDistance) {
        nearestDistance = meters;
        nearestStop = stop;
      }
    }

    // Keep generous geometry snapping but avoid selecting distant nearby stops.
    if (!nearestStop || nearestDistance > STOP_SELECTION_RADIUS_METERS) return false;

    lastMarkerPressAtRef.current = Date.now();
    mapRef.current?.animateToRegion(
      {
        latitude: nearestStop.latitude,
        longitude: nearestStop.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      500
    );
    onStopPress?.(nearestStop);
    return true;
  };

  const focusedDisplayBus = useMemo(() => {
    if (!focusedBus) return null;
    return filteredBuses.find((bus) => bus.id === focusedBus.id) ?? null;
  }, [filteredBuses, focusedBus]);

  useEffect(() => {
    if (!isMapReady) return;

    if (!selectedRouteId) {
      lastAutoFocusedRouteKey.current = null;

      if (didAutoFitAllBuses.current) return;
      if (filteredBuses.length === 0) return;

      fitToBusCoordinates(
        filteredBuses.map((bus) => ({ latitude: bus.latitude, longitude: bus.longitude }))
      );
      didAutoFitAllBuses.current = true;
      return;
    }

    didAutoFitAllBuses.current = false;

    const routeFocusKey = `${selectedRouteId}:${routePaths.map((path) => path.id).join('|')}`;
    if (lastAutoFocusedRouteKey.current === routeFocusKey) return;

    const routeCoordinates = routePaths.flatMap((path) => path.coordinates);
    const busCoordinates = filteredBuses.map((bus) => ({ latitude: bus.latitude, longitude: bus.longitude }));
    const focusCoordinates = routeCoordinates.length > 0 ? routeCoordinates : busCoordinates;

    fitToBusCoordinates(focusCoordinates);
    lastAutoFocusedRouteKey.current = routeFocusKey;
  }, [filteredBuses, isMapReady, routePaths, selectedRouteId]);

  useEffect(() => {
    if (!focusedDisplayBus || !isMapReady) return;

    const now = Date.now();
    if (now - lastFollowAtMs.current < 700) return;

    mapRef.current?.animateToRegion(
      {
        latitude: focusedDisplayBus.latitude,
        longitude: focusedDisplayBus.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      650
    );

    markerRefs.current[focusedDisplayBus.id]?.showCallout?.();
    lastFollowAtMs.current = now;
  }, [focusedDisplayBus, isMapReady]);

  useEffect(() => {
    if (!focusedDisplayBus || !isMapReady) {
      lastFocusedBusPayloadTimestamp.current = null;
      return;
    }

    const payloadTimestamp = focusedDisplayBus.lastUpdated.getTime();
    if (lastFocusedBusPayloadTimestamp.current === payloadTimestamp) return;

    const marker = markerRefs.current[focusedDisplayBus.id];
    marker?.hideCallout?.();
    const timerId = setTimeout(() => {
      marker?.showCallout?.();
    }, 40);

    lastFocusedBusPayloadTimestamp.current = payloadTimestamp;

    return () => {
      clearTimeout(timerId);
    };
  }, [focusedDisplayBus, isMapReady]);

  useEffect(() => {
    if (!focusedStop) {
      lastHandledFocusedStopId.current = null;
      return;
    }

    if (!isMapReady) return;
    if (lastHandledFocusedStopId.current === focusedStop.id) return;

    mapRef.current?.animateToRegion(
      {
        latitude: focusedStop.latitude,
        longitude: focusedStop.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      500
    );
    lastHandledFocusedStopId.current = focusedStop.id;
  }, [focusedStop, isMapReady]);

  useEffect(() => {
    if (!isMapReady) return;
    if (resetViewToken <= 0) return;
    if (lastHandledResetToken.current === resetViewToken) return;

    const allBusCoordinates = filteredBuses.map((bus) => ({ latitude: bus.latitude, longitude: bus.longitude }));
    if (allBusCoordinates.length > 0) {
      fitToBusCoordinates(allBusCoordinates);
    } else {
      mapRef.current?.animateToRegion(INITIAL_REGION, 550);
    }

    lastAutoFocusedRouteKey.current = null;
    didAutoFitAllBuses.current = false;
    lastFollowAtMs.current = 0;
    lastHandledFocusedStopId.current = null;
    lastHandledResetToken.current = resetViewToken;
  }, [filteredBuses, isMapReady, resetViewToken]);

  useEffect(() => {
    if (!isMapReady) return;
    if (fullscreenViewToken <= 0 && layoutVersion <= 0) return;

    const viewportToken = `${fullscreenViewToken}:${layoutVersion}`;
    if (lastHandledViewportToken.current === viewportToken) return;

    if (focusedDisplayBus) {
      mapRef.current?.animateToRegion(
        {
          latitude: focusedDisplayBus.latitude,
          longitude: focusedDisplayBus.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        650
      );
      markerRefs.current[focusedDisplayBus.id]?.showCallout?.();
    } else if (selectedRouteId) {
      const routeCoordinates = routePaths.flatMap((path) => path.coordinates);
      const busCoordinates = filteredBuses.map((bus) => ({ latitude: bus.latitude, longitude: bus.longitude }));
      const focusCoordinates = routeCoordinates.length > 0 ? routeCoordinates : busCoordinates;

      if (focusCoordinates.length > 0) {
        fitToBusCoordinates(focusCoordinates);
      }
    } else {
      const allBusCoordinates = filteredBuses.map((bus) => ({ latitude: bus.latitude, longitude: bus.longitude }));
      if (allBusCoordinates.length > 0) {
        fitToBusCoordinates(allBusCoordinates);
      } else {
        mapRef.current?.animateToRegion(INITIAL_REGION, 550);
      }
    }

    lastHandledViewportToken.current = viewportToken;
  }, [filteredBuses, focusedDisplayBus, fullscreenViewToken, isMapReady, layoutVersion, routePaths, selectedRouteId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        onMapReady={() => setIsMapReady(true)}
        onRegionChangeComplete={(region) => {
          setVisibleLatitudeDelta(region.latitudeDelta);
        }}
        onPress={(event) => {
          const elapsedSinceMarkerPress = Date.now() - lastMarkerPressAtRef.current;
          if (elapsedSinceMarkerPress < 300) return;

          // Ignore marker-originated map press events so marker selection is preserved.
          if (event.nativeEvent.action === 'marker-press') return;

          const coordinate = event.nativeEvent.coordinate;
          if (
            coordinate &&
            selectNearestStopFromPoint(coordinate.latitude, coordinate.longitude)
          ) {
            return;
          }

          onMapPress?.();
        }}
      >
        {routePaths.map((path) => (
          <Polyline
            key={path.id}
            coordinates={path.coordinates}
            strokeColor={path.color}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            tappable
            onPress={(event) => {
              event.stopPropagation?.();
              const coordinate = event.nativeEvent.coordinate;
              if (!coordinate) return;
              selectNearestStopFromPoint(coordinate.latitude, coordinate.longitude);
            }}
          />
        ))}

        {/* Bus Markers */}
        {filteredBuses.map((bus) => (
          <Marker
            key={bus.id}
            ref={(ref) => {
              markerRefs.current[bus.id] = ref;
            }}
            coordinate={{
              latitude: bus.latitude,
              longitude: bus.longitude,
            }}
            title={bus.routeName}
            description={`Heading: ${bus.heading}°`}
            onPress={(event) => {
              lastMarkerPressAtRef.current = Date.now();
              event.stopPropagation?.();
              mapRef.current?.animateToRegion(
                {
                  latitude: bus.latitude,
                  longitude: bus.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                },
                500
              );
              onBusPress?.(bus);
            }}
          >
            <BusMarker bus={bus} />
          </Marker>
        ))}

        {/* Stop Markers */}
        {visibleStops.map((stop) => (
          <Marker
            key={stop.id}
            coordinate={{
              latitude: stop.latitude,
              longitude: stop.longitude,
            }}
            title={stop.name}
            description={
              (stopDeparturesById[stop.id] ?? []).length > 0
                ? `Next departures:\n${(stopDeparturesById[stop.id] ?? []).join('\n')}`
                : undefined
            }
            onPress={(event) => {
              lastMarkerPressAtRef.current = Date.now();
              event.stopPropagation?.();
              mapRef.current?.animateToRegion(
                {
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                },
                500
              );
              onStopPress?.(stop);
            }}
            onCalloutPress={(event) => {
              event.stopPropagation?.();
              onStopInfoPress?.(stop);
            }}
          >
            <StopMarker stop={stop} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
