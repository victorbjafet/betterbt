/**
 * Route Detail Screen
 * Shows route stops, live buses on route, and ETAs
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import { useTheme } from '@/hooks/useTheme';

export default function RouteDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ScreenWrapper scrollable>
      <View style={styles.container}>
        <Text style={[styles.heading, { color: theme.TEXT }]}>Route Detail: {id}</Text>
        <Text style={[styles.placeholder, { color: theme.TEXT_SECONDARY }]}>
          TODO: Implement route detail view
        </Text>
        <Text style={[styles.details, { color: theme.TEXT_MUTED }]}>
          - Route name and description{'\n'}
          - List of stops served by this route{'\n'}
          - Live buses currently on route{'\n'}
          - This route on map view{'\n'}
        </Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  placeholder: {
    fontSize: 14,
    marginBottom: 12,
  },
  details: {
    fontSize: 12,
    lineHeight: 20,
  },
});
