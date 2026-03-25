/**
 * StopMarker Component
 * Renders bus stop pin on map
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stop } from '@/types/transit';
import { useTheme } from '@/hooks/useTheme';

interface StopMarkerProps {
  stop: Stop;
}

export const StopMarker: React.FC<StopMarkerProps> = ({ stop }) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.pin, { backgroundColor: theme.SECONDARY, borderColor: theme.BACKGROUND }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
});
