/**
 * StatusBadge Component
 * "Live" / "Predicted" / "Offline" indicator
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

type Status = 'live' | 'predicted' | 'offline' | 'scheduled';

interface StatusBadgeProps {
  status: Status;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const theme = useTheme();
  const colors = {
    live:      { bg: theme.LIVE,           text: '#FFFFFF' },
    predicted: { bg: theme.PREDICTED,      text: theme.isDark ? '#000000' : '#FFFFFF' },
    offline:   { bg: theme.OFFLINE,        text: '#FFFFFF' },
    scheduled: { bg: theme.TEXT_SECONDARY, text: '#FFFFFF' },
  };

  const { bg, text } = colors[status];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
