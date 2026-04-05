/**
 * useStops Hook
 * Derives a global stop list from route patterns and pattern points.
 */

import { STALE_TIMES } from '@/constants/config';
import { fetchPatternPoints, fetchRoutePatterns } from '@/services/api/btApi';
import { Stop } from '@/types/transit';
import { useQuery } from '@tanstack/react-query';

const normalizeStopCode = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function useStops() {
  return useQuery({
    queryKey: ['stops'],
    staleTime: STALE_TIMES.STOPS,
    retry: 2,
    queryFn: async (): Promise<Stop[]> => {
      const patterns = await fetchRoutePatterns();
      const pointLists = await Promise.all(patterns.map((pattern) => fetchPatternPoints(pattern.name)));
      const stopById = new Map<string, Stop>();

      pointLists.forEach((points, index) => {
        const pattern = patterns[index];

        points.forEach((point) => {
          if (point.isBusStop !== 'Y') return;

          const latitude = Number(point.latitude);
          const longitude = Number(point.longitude);
          if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;

          const normalizedStopCode = normalizeStopCode(point.stopCode);
          const stopId = normalizedStopCode ?? `${pattern.routeId}-${point.patternPointName}`;
          const existing = stopById.get(stopId);

          if (existing) {
            if (!existing.routes.includes(pattern.routeId)) {
              existing.routes.push(pattern.routeId);
            }
            return;
          }

          stopById.set(stopId, {
            id: stopId,
            code: normalizedStopCode ?? undefined,
            name: point.patternPointName,
            latitude,
            longitude,
            routes: [pattern.routeId],
          });
        });
      });

      return Array.from(stopById.values()).sort((a, b) => {
        const aCode = a.code ?? a.id;
        const bCode = b.code ?? b.id;

        const aNumeric = Number(aCode);
        const bNumeric = Number(bCode);
        if (!Number.isNaN(aNumeric) && !Number.isNaN(bNumeric) && aNumeric !== bNumeric) {
          return aNumeric - bNumeric;
        }

        const codeDelta = aCode.localeCompare(bCode, undefined, { numeric: true });
        if (codeDelta !== 0) return codeDelta;

        return a.name.localeCompare(b.name);
      });
    },
  });
}
