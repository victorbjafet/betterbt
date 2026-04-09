/**
 * ArrivalRow Component
 * Single ETA row in stop detail
 */

import { useTheme } from '@/hooks/useTheme';
import { Arrival } from '@/types/transit';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteChip } from './RouteChip';
import { StatusBadge } from './StatusBadge';

interface ArrivalRowProps {
  arrival: Arrival;
}

const formatClockTime = (date: Date): string => {
  if (Number.isNaN(date.getTime())) return '--';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const ArrivalRow: React.FC<ArrivalRowProps> = ({ arrival }) => {
  const theme = useTheme();
  const departureTime = formatClockTime(arrival.arrivalTime);
  const relativeTime = arrival.minutesUntilArrival <= 0
    ? 'Now'
    : `${arrival.minutesUntilArrival} min`;

  return (
    <View style={[styles.container, { borderBottomColor: theme.BORDER }]}>
      <View style={styles.leftContent}>
        <RouteChip routeName={arrival.routeId} size="small" />
        <Text style={[styles.routeName, { color: theme.TEXT }]}>{arrival.routeName}</Text>
      </View>

      <View style={styles.rightContent}>
        <View
          style={[
            styles.timeBox,
            {
              borderColor: theme.BORDER,
              backgroundColor: theme.SURFACE_2,
            },
          ]}
        >
          <Text style={[styles.time, { color: theme.TEXT }]}> 
            {`${departureTime} • ${relativeTime}`}
          </Text>
        </View>
        <StatusBadge status={arrival.source} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeName: {
    fontSize: 13,
    fontWeight: '600',
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  timeBox: {
    borderWidth: 1,
    borderRadius: 6,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
});
