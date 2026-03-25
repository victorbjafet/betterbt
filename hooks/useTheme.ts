/**
 * useTheme Hook
 * Returns the active theme based on user preference (default: dark)
 */

import { useSettingsStore } from '@/store/settingsStore';
import { DARK_THEME, LIGHT_THEME, Theme } from '@/constants/colors';

export type ThemeWithMode = Theme & { isDark: boolean };

export function useTheme(): ThemeWithMode {
  const themeMode = useSettingsStore((s) => s.theme);
  const isDark = themeMode !== 'light';
  const colors = isDark ? DARK_THEME : LIGHT_THEME;
  return { ...colors, isDark };
}
