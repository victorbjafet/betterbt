/**
 * Routes List Screen
 * Displays all available routes with status
 */

import React from 'react';
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import { RouteChip } from '@/components/ui/RouteChip';
import { useRoutes } from '@/hooks/useRoutes';
import { useTheme } from '@/hooks/useTheme';

export default function RoutesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: routes = [], isLoading, error } = useRoutes();

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.TEXT_SECONDARY }}>Loading routes...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.ERROR }}>Failed to load routes</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable>
      <FlatList
        data={routes}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item: route }) => (
          <Pressable
            onPress={() => router.push(`/route/${route.id}`)}
            style={[styles.routeItem, { borderBottomColor: theme.BORDER }]}
          >
            <RouteChip routeName={route.shortName} size="medium" />
            <View style={styles.routeInfo}>
              <Text style={[styles.routeName, { color: theme.TEXT }]}>{route.name}</Text>
              <Text style={[styles.routeStatus, { color: theme.TEXT_SECONDARY }]}>
                {route.isActive ? '🟢 Active' : '⚫ Inactive'}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={{ color: theme.TEXT_SECONDARY }}>No routes available</Text>
          </View>
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  routeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  routeName: {
    fontSize: 16,
    fontWeight: '600',
  },
  routeStatus: {
    fontSize: 12,
    marginTop: 4,
  },
});
