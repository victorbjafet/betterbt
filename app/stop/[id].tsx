/**
 * Stop detail deep-link bridge.
 * Stops details live in the Stops tab for Phase 1.
 */

import { useSelectedStopStore } from '@/store/selectedStopStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

const normalizeParam = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    const first = value[0]?.trim();
    return first ? first : null;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export default function StopDetailScreen() {
  const router = useRouter();
  const setSelectedStopId = useSelectedStopStore((state) => state.setSelectedStopId);
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const stopId = normalizeParam(id);

  useEffect(() => {
    if (stopId) {
      setSelectedStopId(stopId);
    }

    router.replace('/(tabs)/stops');
  }, [router, setSelectedStopId, stopId]);

  return null;
}
