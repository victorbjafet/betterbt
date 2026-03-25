/**
 * MapView (Native Implementation)
 * Uses react-native-maps for iOS (Apple Maps) and Android (Google Maps)
 * Platform-specific: file loaded on native platforms via Expo Router
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Bus, Stop } from '@/types/transit';
import { MAP_CONFIG } from '@/constants/config';

interface MapViewProps {
  buses: Bus[];
  stops?: Stop[];
  selectedRouteId?: string;
  onBusPress?: (bus: Bus) => void;
  onStopPress?: (stop: Stop) => void;
}

export default function TransitMapView({
  buses,
  stops = [],
  selectedRouteId: _selectedRouteId,
  onBusPress,
  onStopPress,
}: MapViewProps) {
  const initialRegion = {
    latitude: MAP_CONFIG.INITIAL_LATITUDE,
    longitude: MAP_CONFIG.INITIAL_LONGITUDE,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        {/* Bus Markers */}
        {buses.map((bus) => (
          <Marker
            key={bus.id}
            coordinate={{
              latitude: bus.latitude,
              longitude: bus.longitude,
            }}
            title={bus.routeName}
            description={`Heading: ${bus.heading}°`}
            onPress={() => onBusPress?.(bus)}
          >
            {/* TODO: Replace with BusMarker component */}
          </Marker>
        ))}

        {/* Stop Markers */}
        {stops.map((stop) => (
          <Marker
            key={stop.id}
            coordinate={{
              latitude: stop.latitude,
              longitude: stop.longitude,
            }}
            title={stop.name}
            onPress={() => onStopPress?.(stop)}
          >
            {/* TODO: Replace with StopMarker component */}
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
