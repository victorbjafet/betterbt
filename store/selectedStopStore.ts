import { create } from 'zustand';

interface SelectedStopStore {
  selectedStopId: string | null;
  setSelectedStopId: (stopId: string | null) => void;
  clearSelectedStop: () => void;
}

export const useSelectedStopStore = create<SelectedStopStore>((set) => ({
  selectedStopId: null,
  setSelectedStopId: (stopId) => set({ selectedStopId: stopId }),
  clearSelectedStop: () => set({ selectedStopId: null }),
}));
