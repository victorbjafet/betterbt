import { create } from 'zustand';

export type SelectedStopSource =
  | 'stops-selection'
  | 'stops-to-routes-handoff'
  | 'routes-to-stops-handoff'
  | null;

interface SelectedStopStore {
  selectedStopId: string | null;
  selectedStopSource: SelectedStopSource;
  setSelectedStopId: (stopId: string | null, source?: SelectedStopSource) => void;
  clearSelectedStop: () => void;
}

export const useSelectedStopStore = create<SelectedStopStore>((set) => ({
  selectedStopId: null,
  selectedStopSource: null,
  setSelectedStopId: (stopId, source = null) =>
    set({
      selectedStopId: stopId,
      selectedStopSource: stopId ? source : null,
    }),
  clearSelectedStop: () => set({ selectedStopId: null, selectedStopSource: null }),
}));
