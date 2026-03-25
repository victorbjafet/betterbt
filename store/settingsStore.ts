/**
 * Settings Store (Zustand)
 * Manages user preferences and app settings
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  // Saved favorites
  favoriteRouteIds: string[];
  favoriteStopIds: string[];
  
  // User preferences
  theme: 'light' | 'dark' | 'auto';
  mapType: 'map' | 'satellite' | 'hybrid';
  notificationsEnabled: boolean;
  
  // Actions
  addFavoriteRoute: (routeId: string) => void;
  removeFavoriteRoute: (routeId: string) => void;
  addFavoriteStop: (stopId: string) => void;
  removeFavoriteStop: (stopId: string) => void;
  
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  setMapType: (mapType: 'map' | 'satellite' | 'hybrid') => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  
  clear: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      favoriteRouteIds: [],
      favoriteStopIds: [],
      theme: 'dark',
      mapType: 'map',
      notificationsEnabled: true,
      
      addFavoriteRoute: (routeId) =>
        set((state) => {
          if (!state.favoriteRouteIds.includes(routeId)) {
            return {
              favoriteRouteIds: [...state.favoriteRouteIds, routeId],
            };
          }
          return state;
        }),
      
      removeFavoriteRoute: (routeId) =>
        set((state) => ({
          favoriteRouteIds: state.favoriteRouteIds.filter(
            (id) => id !== routeId
          ),
        })),
      
      addFavoriteStop: (stopId) =>
        set((state) => {
          if (!state.favoriteStopIds.includes(stopId)) {
            return {
              favoriteStopIds: [...state.favoriteStopIds, stopId],
            };
          }
          return state;
        }),
      
      removeFavoriteStop: (stopId) =>
        set((state) => ({
          favoriteStopIds: state.favoriteStopIds.filter(
            (id) => id !== stopId
          ),
        })),
      
      setTheme: (theme) => set({ theme }),
      setMapType: (mapType) => set({ mapType }),
      setNotificationsEnabled: (enabled) =>
        set({ notificationsEnabled: enabled }),
      
      clear: () =>
        set({
          favoriteRouteIds: [],
          favoriteStopIds: [],
          theme: 'dark',
          mapType: 'map',
          notificationsEnabled: true,
        }),
    }),
    {
      name: 'betterbt-settings',
    }
  )
);
