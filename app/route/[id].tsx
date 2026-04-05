/**
 * Route detail deep-link bridge.
 * Phase 1 keeps route detail UX in the routes tab.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

const normalizeParam = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first ? first : null;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = normalizeParam(id);

  if (!routeId) {
    return <Redirect href="/(tabs)/routes" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/(tabs)/routes',
        params: { routeId },
      }}
    />
  );
}
