import { BtRoute } from '@/types/btApi';

interface StaticRouteDefinition {
  id: string;
  name: string;
  shortName: string;
  color: string;
  textColor: string;
  serviceLevel: 'Full Service' | 'Regular Service';
  patterns: string[];
}

const ensureHex = (value: string): string => {
  const normalized = value.trim().replace('#', '');
  if (normalized.length !== 6) return '#666666';
  return `#${normalized.toUpperCase()}`;
};

export const STATIC_ROUTE_DEFINITIONS: StaticRouteDefinition[] = [
  {
    id: 'CAS',
    name: 'Campus Shuttle',
    shortName: 'CAS',
    color: '#302F2F',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['CAS TO ORANGE', 'CAS TO MAROON'],
  },
  {
    id: 'BMR',
    name: 'Beamer Way',
    shortName: 'BMR',
    color: '#FF69B4',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['BMR'],
  },
  {
    id: 'PRG',
    name: 'Progress Street',
    shortName: 'PRG',
    color: '#7156A5',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['PRG', 'PRG FR'],
  },
  {
    id: 'SME',
    name: 'South Main Ellett',
    shortName: 'SME',
    color: '#0098D4',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['SME'],
  },
  {
    id: 'HDG',
    name: 'Harding Avenue',
    shortName: 'HDG',
    color: '#874901',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['HDG', 'HDG FR'],
  },
  {
    id: 'SMA',
    name: 'South Main Airport',
    shortName: 'SMA',
    color: '#84B817',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['SMA', 'SMA FR'],
  },
  {
    id: 'HWA',
    name: 'Hethwood A',
    shortName: 'HWA',
    color: '#1A4882',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['HWA', 'HWA FR'],
  },
  {
    id: 'HWC',
    name: 'Hethwood Combined',
    shortName: 'HWC',
    color: '#7156A5',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['HWC'],
  },
  {
    id: 'HWB',
    name: 'Hethwood B',
    shortName: 'HWB',
    color: '#0098D4',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['HWB', 'HWB FR'],
  },
  {
    id: 'BLU',
    name: 'Explorer Blue',
    shortName: 'BLU',
    color: '#0000FF',
    textColor: '#FFFFFF',
    serviceLevel: 'Regular Service',
    patterns: ['EXPLORER BLUE'],
  },
  {
    id: 'PHD',
    name: 'Patrick Henry Drive',
    shortName: 'PHD',
    color: '#FF69B4',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['PHD', 'PHD FR'],
  },
  {
    id: 'HXP',
    name: 'Hokie Express',
    shortName: 'HXP',
    color: '#00A4A7',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['HXP', 'HXP FR'],
  },
  {
    id: 'PHB',
    name: 'Patrick Henry B',
    shortName: 'PHB',
    color: '#00782A',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['PHB', 'PHB FR'],
  },
  {
    id: 'UCB',
    name: 'University City Blvd',
    shortName: 'UCB',
    color: '#84B817',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['UCB'],
  },
  {
    id: 'CRB',
    name: 'Carpenter Boulevard',
    shortName: 'CRB',
    color: '#E32017',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['CRB', 'CRB FR'],
  },
  {
    id: 'CRC',
    name: 'Corporate Research Center',
    shortName: 'CRC',
    color: '#00782A',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['CRC OB', 'CRC IB', 'CRC OB FR'],
  },
  {
    id: 'TCP',
    name: 'Toms Creek via Progress',
    shortName: 'TCP',
    color: '#EE7C0E',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['TCP'],
  },
  {
    id: 'NMG',
    name: 'North Main Givens',
    shortName: 'NMG',
    color: '#E32017',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['NMG', 'NMG FR', 'NMG_'],
  },
  {
    id: 'TCR',
    name: 'Toms Creek Road',
    shortName: 'TCR',
    color: '#EE7C0E',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['TCR'],
  },
  {
    id: 'SMS',
    name: 'South Main Southpark',
    shortName: 'SMS',
    color: '#0098D4',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['SMS', 'SMS FR'],
  },
  {
    id: 'TTT',
    name: 'Two Town Trolley',
    shortName: 'TTT',
    color: '#87012D',
    textColor: '#FFFFFF',
    serviceLevel: 'Full Service',
    patterns: ['TTT', 'TTT FR'],
  },
  {
    id: 'GRN',
    name: 'Explorer Green',
    shortName: 'GRN',
    color: '#84B817',
    textColor: '#FFFFFF',
    serviceLevel: 'Regular Service',
    patterns: ['EXPLORER GREEN'],
  },
];

export const STATIC_ROUTES: BtRoute[] = STATIC_ROUTE_DEFINITIONS.map((route) => ({
  id: route.id,
  name: route.name,
  shortName: route.shortName,
  color: ensureHex(route.color),
  textColor: ensureHex(route.textColor),
  isActive: true,
  type: route.serviceLevel,
}));

const normalizeKey = (value: string): string => value.trim().replace(/\s+/g, ' ').toUpperCase();

export const STATIC_ROUTE_BY_ID = STATIC_ROUTE_DEFINITIONS.reduce<Record<string, StaticRouteDefinition>>(
  (acc, route) => {
    acc[route.id] = route;
    return acc;
  },
  {}
);

export const STATIC_BUS_COLOR_MAP = STATIC_ROUTE_DEFINITIONS.reduce<Record<string, string>>((acc, route) => {
  const color = ensureHex(route.color);
  acc[normalizeKey(route.id)] = color;
  acc[normalizeKey(route.shortName)] = color;
  acc[normalizeKey(route.name)] = color;

  for (const patternName of route.patterns) {
    acc[normalizeKey(patternName)] = color;
  }

  return acc;
}, {});

export const getStaticRouteDisplayName = (routeId: string): string => {
  return STATIC_ROUTE_BY_ID[routeId]?.name ?? routeId;
};
