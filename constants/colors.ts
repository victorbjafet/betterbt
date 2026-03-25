/**
 * Color Palette, Theme Tokens, and Route Colors
 */

export const ROUTE_COLORS: Record<string, { bg: string; text: string }> = {
  HXP:     { bg: '#E31E24', text: '#FFFFFF' },
  Local:   { bg: '#00A651', text: '#FFFFFF' },
  '1':     { bg: '#0066CC', text: '#FFFFFF' },
  '2':     { bg: '#FF8C00', text: '#FFFFFF' },
  '3':     { bg: '#800080', text: '#FFFFFF' },
  '4':     { bg: '#808000', text: '#FFFFFF' },
  '5':     { bg: '#FF69B4', text: '#FFFFFF' },
  '6':     { bg: '#008080', text: '#FFFFFF' },
  '26':    { bg: '#FFD700', text: '#000000' },
  DEFAULT: { bg: '#666666', text: '#FFFFFF' },
};

export interface Theme {
  PRIMARY: string;
  SECONDARY: string;
  SUCCESS: string;
  WARNING: string;
  ERROR: string;
  INFO: string;
  BACKGROUND: string;
  SURFACE: string;
  SURFACE_2: string;
  BORDER: string;
  TEXT: string;
  TEXT_SECONDARY: string;
  TEXT_MUTED: string;
  LIVE: string;
  PREDICTED: string;
  OFFLINE: string;
  ALERT: string;
  HEADER_BG: string;
  TAB_BG: string;
  CARD: string;
}

export const DARK_THEME: Theme = {
  PRIMARY:        '#3B82F6',
  SECONDARY:      '#34D399',
  SUCCESS:        '#34D399',
  WARNING:        '#FBBF24',
  ERROR:          '#F87171',
  INFO:           '#60A5FA',
  BACKGROUND:     '#0F1117',
  SURFACE:        '#1A1D27',
  SURFACE_2:      '#242736',
  BORDER:         '#2E3347',
  TEXT:           '#F9FAFB',
  TEXT_SECONDARY: '#9CA3AF',
  TEXT_MUTED:     '#6B7280',
  LIVE:           '#34D399',
  PREDICTED:      '#FBBF24',
  OFFLINE:        '#6B7280',
  ALERT:          '#F87171',
  HEADER_BG:      '#1A1D27',
  TAB_BG:         '#1A1D27',
  CARD:           '#242736',
};

export const LIGHT_THEME: Theme = {
  PRIMARY:        '#2563EB',
  SECONDARY:      '#10B981',
  SUCCESS:        '#10B981',
  WARNING:        '#F59E0B',
  ERROR:          '#EF4444',
  INFO:           '#3B82F6',
  BACKGROUND:     '#FFFFFF',
  SURFACE:        '#F9FAFB',
  SURFACE_2:      '#F3F4F6',
  BORDER:         '#E5E7EB',
  TEXT:           '#111827',
  TEXT_SECONDARY: '#6B7280',
  TEXT_MUTED:     '#9CA3AF',
  LIVE:           '#10B981',
  PREDICTED:      '#F59E0B',
  OFFLINE:        '#6B7280',
  ALERT:          '#EF4444',
  HEADER_BG:      '#2563EB',
  TAB_BG:         '#FFFFFF',
  CARD:           '#F9FAFB',
};

/** Fallback for contexts where the hook can't be called — always dark */
export const THEME_COLORS = DARK_THEME;

export const getRouteColor = (routeName: string): { bg: string; text: string } =>
  ROUTE_COLORS[routeName] ?? ROUTE_COLORS.DEFAULT;
