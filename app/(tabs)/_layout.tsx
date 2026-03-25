import { Tabs } from 'expo-router';
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
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
        name="index"
        options={{
          title: 'Live Map',
          headerTitle: 'BetterBT',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="map" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          headerTitle: 'All Routes',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="bus" size={28} color={color} />
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
