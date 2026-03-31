/**
 * MapView (Native Implementation)
 * Uses react-native-maps for iOS (Apple Maps) and Android (Google Maps)
 * Platform-specific: file loaded on native platforms via Expo Router
 */

import { MAP_CONFIG } from '@/constants/config';
import { Bus, Stop } from '@/types/transit';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { BusMarker } from './BusMarker';
import { StopMarker } from './StopMarker';

interface MapViewProps {
  buses: Bus[];
  stops?: Stop[];
  selectedRouteId?: string;
  focusedStop?: Stop | null;
  onBusPress?: (bus: Bus) => void;
  onStopPress?: (stop: Stop) => void;
}

export default function TransitMapView({
  buses,
  stops = [],
  selectedRouteId,
  focusedStop,
  onBusPress,
  onStopPress,
}: MapViewProps) {
  const mapRef = useRef<MapView>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const lastAutoFocusedRouteId = useRef<string | null>(null);
  const didAutoFitAllBuses = useRef(false);

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
    () => (selectedRouteId ? buses.filter((bus) => bus.routeId === selectedRouteId) : buses),
    [buses, selectedRouteId]
  );

  const filteredStops = useMemo(
    () =>
      selectedRouteId
        ? stops.filter((stop) => stop.routes.includes(selectedRouteId))
        : stops,
    [selectedRouteId, stops]
  );

  useEffect(() => {
    if (!isMapReady) return;

    if (!selectedRouteId) {
      lastAutoFocusedRouteId.current = null;
      if (didAutoFitAllBuses.current) return;

      const allBusCoordinates = filteredBuses.map((bus) => ({
        latitude: bus.latitude,
        longitude: bus.longitude,
      }));

      if (allBusCoordinates.length === 0) return;

      fitToBusCoordinates(allBusCoordinates);
      didAutoFitAllBuses.current = true;
      return;
    }

    didAutoFitAllBuses.current = false;

    if (lastAutoFocusedRouteId.current === selectedRouteId) return;

    const busCoordinates = filteredBuses.map((bus) => ({
      latitude: bus.latitude,
      longitude: bus.longitude,
    }));

    fitToBusCoordinates(busCoordinates);
    lastAutoFocusedRouteId.current = selectedRouteId;
  }, [filteredBuses, isMapReady, selectedRouteId]);

  useEffect(() => {
    if (!focusedStop || !isMapReady) return;

    mapRef.current?.animateToRegion(
      {
        latitude: focusedStop.latitude,
        longitude: focusedStop.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      500
    );
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
      >
        {/* Bus Markers */}
        {filteredBuses.map((bus) => (
          <Marker
            key={bus.id}
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
