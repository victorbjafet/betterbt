/**
 * Route detail deep-link bridge.
 * Phase 1 keeps route detail UX in the routes tab.
 */

import { useSelectedRouteStore } from '@/store/selectedRouteStore';
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

export default function RouteDetailScreen() {
  const router = useRouter();
  const setPendingRouteId = useSelectedRouteStore((state) => state.setPendingRouteId);
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = normalizeParam(id);

  useEffect(() => {
    if (routeId) {
      setPendingRouteId(routeId);
    }

    router.replace('/(tabs)/routes');
  }, [routeId, router, setPendingRouteId]);

  return null;
}
