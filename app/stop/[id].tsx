/**
 * Stop Detail Screen
 * Shows upcoming arrivals for a stop
 */

import React from 'react';
import { StyleSheet, Text, View, FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import { useStopArrivals } from '@/hooks/useStopArrivals';
import { ArrivalRow } from '@/components/ui/ArrivalRow';
import { useTheme } from '@/hooks/useTheme';

export default function StopDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: arrivals = [], isLoading, error } = useStopArrivals(id);

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.TEXT_SECONDARY }}>Loading arrivals...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.ERROR }}>Failed to load arrivals</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={[styles.header, { borderBottomColor: theme.BORDER }]}>
        <Text style={[styles.stopName, { color: theme.TEXT }]}>Stop {id}</Text>
        <Text style={[styles.subtext, { color: theme.TEXT_SECONDARY }]}>Upcoming arrivals</Text>
      </View>

      <FlatList
        data={arrivals}
        keyExtractor={(item, idx) => `${item.routeId}-${idx}`}
        scrollEnabled={false}
        renderItem={({ item: arrival }) => (
          <ArrivalRow arrival={arrival} />
        )}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={{ color: theme.TEXT_SECONDARY }}>No arrivals scheduled</Text>
          </View>
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  stopName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtext: {
    fontSize: 14,
    marginTop: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 200,
  },
});
