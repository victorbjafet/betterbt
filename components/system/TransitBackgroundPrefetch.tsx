import { useTransitWarmCacheStore } from '@/store/transitWarmCacheStore';
import { Route, RouteStopCycle, Stop } from '@/types/transit';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

type BgTask =
  | { kind: 'routes' }
  | { kind: 'route-stops'; routeId: string }
  | { kind: 'stops' };

const BG_QUERY_PREFIX = ['bg-prefetch'] as const;
const PREFETCH_TICK_MS = 900;

const hasLoadedRouteStops = (queryClient: ReturnType<typeof useQueryClient>, routeId: string): boolean => {
  const queryState = queryClient.getQueryState<RouteStopCycle[]>(['route-stops', routeId]);
  return queryState?.status === 'success';
};

const computeProgress = (queryClient: ReturnType<typeof useQueryClient>) => {
  const routes = queryClient.getQueryData<Route[]>(['routes']) ?? [];
  const stopsData = queryClient.getQueryData<Stop[]>(['stops']) ?? [];
  const routesState = queryClient.getQueryState<Route[]>(['routes']);
  const stopsState = queryClient.getQueryState<Stop[]>(['stops']);
  const routesLoaded = routesState?.status === 'success';
  const stopsLoaded = stopsState?.status === 'success';

  const loadedRouteStopCacheCount = routes.reduce((count, route) => {
    return hasLoadedRouteStops(queryClient, route.id) ? count + 1 : count;
  }, 0);

  // Display progress as actual loaded entities (routes + stops), not cache task count.
  const loadedEntityCount =
    (routesLoaded ? routes.length : 0) +
    (stopsLoaded ? stopsData.length : 0);

  // Total entities becomes known once both datasets are loaded.
  const totalEntityCount =
    routesLoaded && stopsLoaded
      ? routes.length + stopsData.length
      : 0;

  return {
    loaded: loadedEntityCount,
    total: totalEntityCount,
    routeCount: routes.length,
    loadedRouteStopCacheCount,
  };
};

const chooseNextTask = (queryClient: ReturnType<typeof useQueryClient>): BgTask | null => {
  const routes = queryClient.getQueryData<Route[]>(['routes']);
  const routesState = queryClient.getQueryState<Route[]>(['routes']);
  if (!routes || routes.length === 0) {
    if (routesState?.status === 'pending') return null;
    return { kind: 'routes' };
  }

  const stopsState = queryClient.getQueryState<Stop[]>(['stops']);
  const stopsData = queryClient.getQueryData<Stop[]>(['stops']);
  const stopsLoaded = stopsState?.status === 'success' && Array.isArray(stopsData) && stopsData.length > 0;

  if (!stopsLoaded && stopsState?.status !== 'pending') {
    return { kind: 'stops' };
  }

  const nextRoute = routes.find((route) => !hasLoadedRouteStops(queryClient, route.id));
  if (nextRoute) {
    return { kind: 'route-stops', routeId: nextRoute.id };
  }

  return null;
};

export function TransitBackgroundPrefetch() {
  const queryClient = useQueryClient();
  const setProgress = useTransitWarmCacheStore((state) => state.setProgress);
  const setPrefetching = useTransitWarmCacheStore((state) => state.setPrefetching);
  const runningRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const runTask = async (task: BgTask) => {
      setPrefetching(true);

      try {
        if (task.kind === 'routes') {
          const data = await queryClient.fetchQuery({
            queryKey: [...BG_QUERY_PREFIX, 'routes'],
            queryFn: async () => {
              const module = await import('@/services/transit/queryLoaders');
              return module.loadRoutes();
            },
            staleTime: 60_000,
            gcTime: 120_000,
            retry: 1,
            meta: { priority: 'background' },
          });
          queryClient.setQueryData<Route[]>(['routes'], data);
          return;
        }

        if (task.kind === 'route-stops') {
          const data = await queryClient.fetchQuery({
            queryKey: [...BG_QUERY_PREFIX, 'route-stops', task.routeId],
            queryFn: async () => {
              const module = await import('@/services/transit/queryLoaders');
              return module.loadRouteStops(task.routeId);
            },
            staleTime: 60_000,
            gcTime: 120_000,
            retry: 1,
            meta: { priority: 'background' },
          });
          queryClient.setQueryData<RouteStopCycle[]>(['route-stops', task.routeId], data);
          return;
        }

        const data = await queryClient.fetchQuery({
          queryKey: [...BG_QUERY_PREFIX, 'stops'],
          queryFn: async () => {
            const module = await import('@/services/transit/queryLoaders');
            return module.loadStops();
          },
          staleTime: 60_000,
          gcTime: 120_000,
          retry: 1,
          meta: { priority: 'background' },
        });
        queryClient.setQueryData<Stop[]>(['stops'], data);
      } catch {
        // Background prefetch failures should stay silent and never block foreground UX.
      } finally {
        if (aliveRef.current) {
          setPrefetching(false);
        }
      }
    };

    const tick = async () => {
      if (runningRef.current) return;
      runningRef.current = true;

      try {
        const highPriorityForegroundRequests = queryClient.isFetching({
          predicate: (query) => {
            const firstKey = query.queryKey[0];
            const isBackgroundQuery = firstKey === BG_QUERY_PREFIX[0];
            const priority = (query.meta as { priority?: string } | undefined)?.priority;
            return !isBackgroundQuery && priority === 'high';
          },
        });

        const progress = computeProgress(queryClient);
        setProgress(progress.loaded, progress.total);

        // Foreground, user-visible data always has priority over background warming.
        if (highPriorityForegroundRequests > 0) {
          setPrefetching(false);
          return;
        }

        const bgFetching = queryClient.isFetching({ queryKey: BG_QUERY_PREFIX });
        if (bgFetching > 0) {
          return;
        }

        const nextTask = chooseNextTask(queryClient);
        if (!nextTask) {
          setPrefetching(false);
          return;
        }

        await runTask(nextTask);

        const updatedProgress = computeProgress(queryClient);
        setProgress(updatedProgress.loaded, updatedProgress.total);
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, PREFETCH_TICK_MS);

    return () => {
      aliveRef.current = false;
      clearInterval(timer);
      setPrefetching(false);
    };
  }, [queryClient, setPrefetching, setProgress]);

  return null;
}
