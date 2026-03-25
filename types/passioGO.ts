/**
 * PassioGO API Response Types
 * These types represent the structure of responses from the PassioGO API
 */

export interface PassioVehicle {
  id: string;
  routeID: string;
  routeName: string;
  heading: number; // 0-359, degrees
  lat: number;
  lng: number;
  speed: number;
  updated: number; // Unix timestamp
}

export interface PassioRoute {
  id: string;
  name: string;
  shortName: string;
  color: string; // hex color code
  textColor: string;
  isActive: boolean;
  type?: string;
}

export interface PassioStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  code?: string;
}

export interface PassioArrival {
  routeID: string;
  routeName: string;
  stopID: string;
  arrivalTime: number; // Unix timestamp (estimated arrival)
  isScheduled: boolean;
  isLive: boolean;
}

export interface PassioAlert {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  affectedRoutes?: string[];
  effectiveFrom: number; // Unix timestamp
  effectiveUntil: number; // Unix timestamp
}
