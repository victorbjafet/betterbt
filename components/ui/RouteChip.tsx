/**
 * RouteChip Component
 * Colored badge displaying route name
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getRouteColor } from '@/constants/colors';

interface RouteChipProps {
  routeName: string;
  size?: 'small' | 'medium' | 'large';
}

export const RouteChip: React.FC<RouteChipProps> = ({ routeName, size = 'medium' }) => {
  const { bg, text } = getRouteColor(routeName);
  const sizeStyle = size === 'small' ? styles.small : size === 'large' ? styles.large : styles.medium;

  return (
    <View style={[styles.chip, sizeStyle, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>
        {routeName}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  medium: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  large: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
