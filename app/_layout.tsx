import { TransitBackgroundPrefetch } from '@/components/system/TransitBackgroundPrefetch';
import { initializeTelemetry } from '@/services/telemetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
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
      {/* Web only: expo-router always injects react-helmet's <title> as the
          first element of <head>, and it wins over the one in app/+html.tsx.
          Left unset it renders empty, so browsers show the URL in the tab. */}
      {Platform.OS === 'web' ? (
        <Head>
          <title>BetterBT</title>
        </Head>
      ) : null}
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
