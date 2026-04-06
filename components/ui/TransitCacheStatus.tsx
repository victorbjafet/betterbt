import { useTheme } from '@/hooks/useTheme';
import { useTransitWarmCacheStore } from '@/store/transitWarmCacheStore';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function TransitCacheStatus() {
  const theme = useTheme();
  const loadedCount = useTransitWarmCacheStore((state) => state.loadedCount);
  const totalCount = useTransitWarmCacheStore((state) => state.totalCount);
  const isPrefetching = useTransitWarmCacheStore((state) => state.isPrefetching);

  const totalLabel = totalCount > 0 ? String(totalCount) : '?';
  const statusText = `Loaded ${loadedCount}/${totalLabel} routes and stops`;

  return (
    <View
      style={[
        styles.pill,
        {
          borderColor: isPrefetching ? theme.INFO : theme.BORDER,
          backgroundColor: theme.SURFACE,
        },
      ]}
    >
      <Text style={[styles.text, { color: theme.TEXT_SECONDARY }]} numberOfLines={1}>
        {statusText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 260,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});
