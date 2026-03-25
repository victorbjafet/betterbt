/**
 * MapView (Web Implementation)
 * Uses react-leaflet with OpenStreetMap tiles for web
 * Platform-specific: file loaded on web via Expo Router
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Bus, Stop } from '@/types/transit';
import { useTheme } from '@/hooks/useTheme';

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
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.placeholder, { backgroundColor: theme.SURFACE_2 }]}>
        <Text style={[styles.title, { color: theme.TEXT }]}>Web Map Placeholder</Text>
        <Text style={[styles.subtitle, { color: theme.TEXT_SECONDARY }]}>Leaflet integration is scaffolded and will be wired next.</Text>
        <Text style={[styles.subtitle, { color: theme.TEXT_SECONDARY }]}>Buses loaded: {buses.length}</Text>
        <Text style={[styles.subtitle, { color: theme.TEXT_SECONDARY }]}>Stops loaded: {stops.length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
});
