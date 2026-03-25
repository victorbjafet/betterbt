/**
 * Route Store (Zustand)
 * Manages routes list and selected route state
 */

import { create } from 'zustand';
import { Route } from '@/types/transit';

interface RouteStore {
  routes: Route[];
  selectedRouteId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setRoutes: (routes: Route[]) => void;
  addRoute: (route: Route) => void;
  selectRoute: (routeId: string | null) => void;
  getSelectedRoute: () => Route | undefined;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useRouteStore = create<RouteStore>((set, get) => ({
  routes: [],
  selectedRouteId: null,
  isLoading: false,
  error: null,
  
  setRoutes: (routes) =>
    set({
      routes,
      error: null,
    }),
  
  addRoute: (route) =>
    set((state) => ({
      routes: [...state.routes, route],
    })),
  
  selectRoute: (routeId) =>
    set({
      selectedRouteId: routeId,
    }),
  
  getSelectedRoute: () => {
    const { routes, selectedRouteId } = get();
    return selectedRouteId
      ? routes.find((r) => r.id === selectedRouteId)
      : undefined;
  },
  
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ isLoading: loading }),
  
  clear: () => set({ routes: [], selectedRouteId: null, error: null }),
}));
