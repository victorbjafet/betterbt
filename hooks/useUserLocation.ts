/**
 * useUserLocation Hook
 * Gets user's current GPS location and finds nearest stops
 */

import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { UserLocation, NearestStop } from '@/types/transit';

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Location permission denied');
          setIsLoading(false);
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          accuracy: currentLocation.coords.accuracy || 0,
          timestamp: new Date(currentLocation.timestamp),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    requestLocation();
  }, []);

  return { location, isLoading, error };
}

/**
 * Find nearest stops to user location
 */
export function useNearestStops(maxDistance = 1000): NearestStop[] {
  const { location } = useUserLocation();
  
  // TODO: Implement distance calculation and filtering
  // This will use the stops from useStops + user location
  // and return closest N stops sorted by distance

  return [];
}
