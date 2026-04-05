import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAlerts } from '@/hooks/useAlerts';
import { useTheme } from '@/hooks/useTheme';

export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const { data: alerts = [] } = useAlerts();
  const highestSeverity = alerts.some((alert) => alert.severity === 'critical')
    ? 'critical'
    : alerts.some((alert) => alert.severity === 'warning')
      ? 'warning'
      : 'info';

  return (
    <Tabs
      initialRouteName="routes"
      screenOptions={{
        tabBarActiveTintColor: theme.PRIMARY,
        tabBarInactiveTintColor: theme.TEXT_SECONDARY,
        tabBarStyle: {
          backgroundColor: theme.TAB_BG,
          borderTopColor: theme.BORDER,
        },
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.HEADER_BG,
        },
        headerTitleStyle: {
          color: theme.TEXT,
          fontSize: 18,
          fontWeight: 'bold',
        },
        headerTintColor: theme.TEXT,
      }}
    >
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          headerTitle: () => (
            <View style={styles.headerTitleRow}>
              <Text style={[styles.headerTitleText, { color: theme.TEXT }]}>All Routes</Text>
              {alerts.length > 0 ? (
                <Pressable
                  onPress={() => router.push('/(tabs)/alerts')}
                  style={[
                    styles.headerAlertPill,
                    {
                      borderColor:
                        highestSeverity === 'critical'
                          ? theme.ERROR
                          : highestSeverity === 'warning'
                            ? theme.WARNING
                            : theme.INFO,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="bell-alert-outline"
                        size={14}
                    color={
                      highestSeverity === 'critical'
                        ? theme.ERROR
                        : highestSeverity === 'warning'
                          ? theme.WARNING
                          : theme.INFO
                    }
                  />
                      <Text style={[styles.headerAlertText, { color: theme.TEXT }]}>Alerts {alerts.length}</Text>
                    </Pressable>
              ) : null}
            </View>
          ),
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="bus" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stops"
        options={{
          title: 'Stops',
          tabBarLabel: 'Stops',
          headerTitle: 'Stops',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="map-marker" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          headerTitle: 'Service Alerts',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="bell" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerAlertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerAlertText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
