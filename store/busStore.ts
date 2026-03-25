/**
 * Bus Store (Zustand)
 * Manages live bus positions and related state
 */

import { create } from 'zustand';
import { Bus } from '@/types/transit';

interface BusStore {
  buses: Bus[];
  lastUpdated: Date | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setBuses: (buses: Bus[]) => void;
  addBus: (bus: Bus) => void;
  updateBus: (busId: string, bus: Partial<Bus>) => void;
  removeBus: (busId: string) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useBusStore = create<BusStore>((set) => ({
  buses: [],
  lastUpdated: null,
  isLoading: false,
  error: null,
  
  setBuses: (buses) =>
    set({
      buses,
      lastUpdated: new Date(),
      error: null,
    }),
  
  addBus: (bus) =>
    set((state) => ({
      buses: [...state.buses, bus],
      lastUpdated: new Date(),
    })),
  
  updateBus: (busId, updatedFields) =>
    set((state) => ({
      buses: state.buses.map((bus) =>
        bus.id === busId ? { ...bus, ...updatedFields } : bus
      ),
      lastUpdated: new Date(),
    })),
  
  removeBus: (busId) =>
    set((state) => ({
      buses: state.buses.filter((bus) => bus.id !== busId),
      lastUpdated: new Date(),
    })),
  
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ isLoading: loading }),
  
  clear: () => set({ buses: [], lastUpdated: null, error: null }),
}));
