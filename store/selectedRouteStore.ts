import { create } from 'zustand';

interface SelectedRouteStore {
  pendingRouteId: string | null;
  setPendingRouteId: (routeId: string | null) => void;
  clearPendingRouteId: () => void;
}

export const useSelectedRouteStore = create<SelectedRouteStore>((set) => ({
  pendingRouteId: null,
  setPendingRouteId: (routeId) => set({ pendingRouteId: routeId }),
  clearPendingRouteId: () => set({ pendingRouteId: null }),
}));