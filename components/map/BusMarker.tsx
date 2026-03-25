/**
 * BusMarker Component
 * Renders animated bus icon on map with heading rotation
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Bus } from '@/types/transit';
import { useTheme } from '@/hooks/useTheme';

interface BusMarkerProps {
  bus: Bus;
}

export const BusMarker: React.FC<BusMarkerProps> = ({ bus }) => {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { transform: [{ rotate: `${bus.heading}deg` }] },
      ]}
    >
      <View
        style={[
          styles.busIcon,
          { backgroundColor: bus.routeColor, borderColor: theme.BACKGROUND },
        ]}
      >
        <Text style={styles.routeText}>{bus.routeName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  busIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  routeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
