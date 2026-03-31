import { STATIC_BUS_COLOR_MAP } from '@/constants/staticTransitData';

type BusColorMap = Record<string, string>;

const sanitizeKey = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();

export const getBusColorKey = (routeName: string, routeId: string) => {
  const preferred = routeName?.trim() ? routeName : routeId;
  return sanitizeKey(preferred || routeId || 'UNKNOWN');
};

export const getBusColors = async (): Promise<BusColorMap> => {
  return STATIC_BUS_COLOR_MAP;
};

export const resolveBusColor = (routeName: string, routeId: string): string => {
  const byPattern = STATIC_BUS_COLOR_MAP[getBusColorKey(routeName, routeId)];
  if (byPattern) return byPattern;

  const byRouteId = STATIC_BUS_COLOR_MAP[sanitizeKey(routeId)];
  if (byRouteId) return byRouteId;

  return '#666666';
};
