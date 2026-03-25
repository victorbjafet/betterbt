/**
 * Application-level Transit Types
 * These types are normalized/processed versions of PassioGO types
 */

export interface Bus {
  id: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  heading: number; // 0-359 degrees
  latitude: number;
  longitude: number;
  speed: number;
  lastUpdated: Date;
}

export interface Route {
  id: string;
  name: string;
  shortName: string;
  color: string;
  textColor: string;
  isActive: boolean;
  stops: Stop[];
  description?: string;
}

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  code?: string;
  routes: string[]; // Route IDs that serve this stop
}

export interface Arrival {
  routeId: string;
  routeName: string;
  routeColor: string;
  stopId: string;
  arrivalTime: Date;
  minutesUntilArrival: number;
  isScheduled: boolean;
  isLive: boolean;
  source: 'live' | 'predicted' | 'scheduled';
}

export interface ServiceAlert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  affectedRoutes?: string[];
  validFrom: Date;
  validUntil: Date;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface NearestStop {
  stop: Stop;
  distanceMeters: number;
}
