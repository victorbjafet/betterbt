import { useServiceLevel } from '@/hooks/useServiceLevel';
import { useTheme } from '@/hooks/useTheme';
import { ServiceLevel } from '@/types/serviceLevel';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Theme = ReturnType<typeof useTheme>;

const colorForLevel = (level: ServiceLevel, theme: Theme): string => {
  switch (level) {
    case ServiceLevel.FULL_SERVICE:
      return theme.SUCCESS;
    case ServiceLevel.REDUCED_SERVICE:
      return theme.WARNING;
    case ServiceLevel.NO_SERVICE:
      return theme.ERROR;
    case ServiceLevel.GAME_DAY:
      return theme.PRIMARY;
    case ServiceLevel.SPECIAL_SCHEDULE:
    default:
      return theme.INFO;
  }
};

const FALLBACK_LABEL: Record<ServiceLevel, string> = {
  [ServiceLevel.FULL_SERVICE]: 'Full Service',
  [ServiceLevel.REDUCED_SERVICE]: 'Reduced Service',
  [ServiceLevel.NO_SERVICE]: 'No Service',
  [ServiceLevel.GAME_DAY]: 'Game Day',
  [ServiceLevel.SPECIAL_SCHEDULE]: 'Special Schedule',
};

/**
 * Header pill showing today's system service level (Full / Reduced / No Service,
 * etc.), sourced from the active provider's service-level feed (the official
 * BT4U provider derives it from GetScheduledRoutes). Renders nothing until the
 * status resolves, so it never shows a misleading placeholder.
 */
export function ServiceLevelBadge() {
  const theme = useTheme();
  const { data } = useServiceLevel();

  if (!data) return null;

  const color = colorForLevel(data.level, theme);
  const label = data.description?.trim() || FALLBACK_LABEL[data.level];

  return (
    <View style={[styles.pill, { borderColor: color, backgroundColor: theme.SURFACE }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 160,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
