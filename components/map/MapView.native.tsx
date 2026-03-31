/**
 * MapView (Native Implementation)
 * Uses react-native-maps for iOS (Apple Maps) and Android (Google Maps)
 * Platform-specific: file loaded on native platforms via Expo Router
 */

import { MAP_CONFIG, REFRESH_INTERVALS } from '@/constants/config';
import { distanceMeters, interpolateCoordinate, predictBusCoordinate } from '@/services/map/busPrediction';
import { Bus, RouteGeometryPath, Stop } from '@/types/transit';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BusMarker } from './BusMarker';
import { StopMarker } from './StopMarker';

interface MapViewProps {
  buses: Bus[];
  stops?: Stop[];
  routePaths?: RouteGeometryPath[];
  selectedRouteId?: string;
  focusedBus?: Bus | null;
  focusedStop?: Stop | null;
  onBusPress?: (bus: Bus) => void;
  onStopPress?: (stop: Stop) => void;
  onMapPress?: () => void;
}

export default function TransitMapView({
  buses,
  stops = [],
  routePaths = [],
  selectedRouteId,
  focusedBus,
  focusedStop,
  onBusPress,
  onStopPress,
  onMapPress,
}: MapViewProps) {
  const SNAP_TO_REAL_POSITION_METERS = 28;

  const mapRef = useRef<MapView>(null);
  const markerRefs = useRef<Record<string, any>>({});
  const motionTrackRef = useRef<Record<string, {
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    startedAtMs: number;
    durationMs: number;
  }>>({});
  const predictedEndpointRef = useRef<Record<string, { latitude: number; longitude: number }>>({});
  const [isMapReady, setIsMapReady] = useState(false);
  const [displayBuses, setDisplayBuses] = useState<Bus[]>(buses);
  const lastAutoFocusedRouteKey = useRef<string | null>(null);
  const didAutoFitAllBuses = useRef(false);
  const lastFollowAtMs = useRef(0);
  const lastHandledFocusedStopId = useRef<string | null>(null);

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
        const predictedEnd = predictBusCoordinate(bus, now, routePaths, {
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

        nextTrackById[bus.id] = {
          start,
          end: predictedEnd,
          startedAtMs: now,
          durationMs: REFRESH_INTERVALS.VEHICLES,
        };
        nextPredictedEndpoints[bus.id] = predictedEnd;

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
  }, [buses, routePaths, stops]);

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

  const getRegionForBuses = (points: { latitude: number; longitude: number }[]) => {
    if (points.length === 0) return null;

    if (points.length === 1) {
      return {
        latitude: points[0].latitude,
        longitude: points[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    const latitudes = points.map((point) => point.latitude);
    const longitudes = points.map((point) => point.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latitude = (minLat + maxLat) / 2;
    const longitude = (minLng + maxLng) / 2;
    const latitudeDelta = Math.max((maxLat - minLat) * 1.45, 0.01);
    const longitudeDelta = Math.max((maxLng - minLng) * 1.45, 0.01);

    return { latitude, longitude, latitudeDelta, longitudeDelta };
  };

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

  const initialRegion = {
    latitude: MAP_CONFIG.INITIAL_LATITUDE,
    longitude: MAP_CONFIG.INITIAL_LONGITUDE,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onMapReady={() => setIsMapReady(true)}
        onPress={() => onMapPress?.()}
        onPanDrag={() => onMapPress?.()}
      >
        {routePaths.map((path) => (
          <Polyline
            key={path.id}
            coordinates={path.coordinates}
            strokeColor={path.color}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
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
            onPress={() => {
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
        {filteredStops.map((stop) => (
          <Marker
            key={stop.id}
            coordinate={{
              latitude: stop.latitude,
              longitude: stop.longitude,
            }}
            title={stop.name}
            onPress={() => {
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
