import { Bus, RouteGeometryPath, Stop } from '@/types/transit';

export interface TransitMapViewProps {
  buses: Bus[];
  stops?: Stop[];
  stopDeparturesById?: Record<string, string[]>;
  routePaths?: RouteGeometryPath[];
  predictionRoutePaths?: RouteGeometryPath[];
  selectedRouteId?: string;
  resetViewToken?: number;
  fullscreenViewToken?: number;
  layoutVersion?: number;
  focusedBus?: Bus | null;
  focusedStop?: Stop | null;
  onBusPress?: (bus: Bus) => void;
  onStopPress?: (stop: Stop) => void;
  onStopInfoPress?: (stop: Stop) => void;
  onMapPress?: () => void;
}