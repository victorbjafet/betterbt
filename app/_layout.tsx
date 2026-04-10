import { TransitBackgroundPrefetch } from '@/components/system/TransitBackgroundPrefetch';
import { initializeTelemetry } from '@/services/telemetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      gcTime: 5 * 60 * 1000,
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    initializeTelemetry();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TransitBackgroundPrefetch />
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            title: 'BetterBT',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ title: 'Routes' }} />
          <Stack.Screen name="route/[id]" options={{ title: 'Route Detail' }} />
          <Stack.Screen name="stop/[id]" options={{ title: 'Stop Detail' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
