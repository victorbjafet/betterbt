import { create } from 'zustand';

interface TransitWarmCacheState {
  loadedCount: number;
  totalCount: number;
  isPrefetching: boolean;
  setProgress: (loadedCount: number, totalCount: number) => void;
  setPrefetching: (isPrefetching: boolean) => void;
}

export const useTransitWarmCacheStore = create<TransitWarmCacheState>((set) => ({
  loadedCount: 0,
  totalCount: 0,
  isPrefetching: false,
  setProgress: (loadedCount, totalCount) => set({ loadedCount, totalCount }),
  setPrefetching: (isPrefetching) => set({ isPrefetching }),
}));
