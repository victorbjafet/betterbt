/**
 * RoutePolyline Component
 * Renders route path on map
 */

import React from 'react';
import { Route } from '@/types/transit';

interface RoutePolylineProps {
  route: Route;
}

export const RoutePolyline: React.FC<RoutePolylineProps> = ({ route }) => {
  // TODO: Implement polyline rendering with route.stops
  // This will depend on whether we're using react-native-maps or react-leaflet
  
  return null;
};
