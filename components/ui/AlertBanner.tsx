/**
 * AlertBanner Component
 * Dismissible service alert banner
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { ServiceAlert } from '@/types/transit';
import { useTheme } from '@/hooks/useTheme';

interface AlertBannerProps {
  alert: ServiceAlert;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alert }) => {
  const theme = useTheme();
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  const severityColors = {
    info:     { bg: theme.isDark ? '#0D1F35' : '#DBEAFE', text: theme.TEXT,   border: theme.INFO },
    warning:  { bg: theme.isDark ? '#2D1A00' : '#FEF3C7', text: theme.TEXT,   border: theme.WARNING },
    critical: { bg: theme.isDark ? '#2D0707' : '#FEE2E2', text: theme.TEXT,   border: theme.ERROR },
  };

  const { bg, text, border } = severityColors[alert.severity];

  return (
    <View style={[styles.container, { backgroundColor: bg, borderLeftWidth: 4, borderLeftColor: border }]}>
      <View style={styles.contentContainer}>
        <Text style={[styles.title, { color: text }]}>{alert.title}</Text>
        <Text style={[styles.message, { color: text }]}>{alert.message}</Text>
      </View>

      <Pressable
        onPress={() => setIsDismissed(true)}
        style={styles.closeButton}
      >
        <Text style={[styles.closeText, { color: text }]}>✕</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  message: {
    fontSize: 12,
  },
  closeButton: {
    marginLeft: 12,
    padding: 8,
  },
  closeText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
