/**
 * Stop detail deep-link bridge.
 * Stops details live in the Stops tab for Phase 1.
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

export default function StopDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const stopId = normalizeParam(id);

  if (!stopId) {
    return <Redirect href="/(tabs)/stops" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/(tabs)/stops/[id]',
        params: { id: stopId },
      }}
    />
  );
}
