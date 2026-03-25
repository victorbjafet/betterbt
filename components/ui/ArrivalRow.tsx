/**
 * ArrivalRow Component
 * Single ETA row in stop detail
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Arrival } from '@/types/transit';
import { RouteChip } from './RouteChip';
import { StatusBadge } from './StatusBadge';
import { useTheme } from '@/hooks/useTheme';

interface ArrivalRowProps {
  arrival: Arrival;
}

export const ArrivalRow: React.FC<ArrivalRowProps> = ({ arrival }) => {
  const theme = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: theme.BORDER }]}>
      <View style={styles.leftContent}>
        <RouteChip routeName={arrival.routeName} size="small" />
        <Text style={[styles.routeName, { color: theme.TEXT }]}>{arrival.routeName}</Text>
      </View>

      <View style={styles.rightContent}>
        <StatusBadge status={arrival.source} />
        <Text style={[styles.time, { color: theme.TEXT }]}>
          {arrival.minutesUntilArrival <= 0
            ? 'Now'
            : `${arrival.minutesUntilArrival} min`}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeName: {
    fontSize: 16,
    fontWeight: '500',
  },
  rightContent: {
    alignItems: 'flex-end',
    gap: 8,
  },
  time: {
    fontSize: 14,
    fontWeight: '600',
  },
});
