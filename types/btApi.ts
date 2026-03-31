/**
 * RideBT API Response Types
 * These types represent the structure of responses from the RideBT Joomla AJAX API at ridebt.org
 */

export interface BtVehicle {
  id: string;
  routeID: string;
  routeName: string;
  heading: number; // 0-359, degrees
  lat: number;
  lng: number;
  speed: number;
  updated: number; // Unix timestamp
  stopID?: string;
  capacity?: number;
  percentOfCapacity?: number;
  passengers?: number;
  isBusAtStop?: boolean;
  tripStartOn?: number;
}

export interface BtRoute {
  id: string;
  name: string;
  shortName: string;
  color: string; // hex color code
  textColor: string;
  isActive: boolean;
  type?: string;
}

export interface BtStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  code?: string;
}

export interface BtArrival {
  routeID: string;
  routeName: string;
  stopID: string;
  arrivalTime: number; // Unix timestamp (estimated arrival)
  isScheduled: boolean;
  isLive: boolean;
}

export interface BtAlert {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  affectedRoutes?: string[];
  effectiveFrom: number; // Unix timestamp
  effectiveUntil: number; // Unix timestamp
}

export interface BtPattern {
  routeId: string;
  name: string;
  points: BtPatternPoint[] | null;
}

export interface BtPatternPoint {
  routeShortName: string;
  patternPointName: string;
  isBusStop: 'Y' | 'N';
  isTimePoint: 'Y' | 'N';
  stopCode: string;
  latitude: string;
  longitude: string;
}

export interface BtDeparture {
  routeShortName: string;
  adjustedDepartureTime: string;
}
