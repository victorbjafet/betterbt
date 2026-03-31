/**
 * BusMarker Component
 * Renders animated bus icon on map with heading rotation
 */

import { useTheme } from '@/hooks/useTheme';
import { Bus } from '@/types/transit';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
        <View style={styles.directionArrow} />
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
  directionArrow: {
    position: 'absolute',
    top: 3,
    left: '50%',
    marginLeft: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  routeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
