/**
 * Service Alerts Screen
 * Displays all current service alerts
 */

import React from 'react';
import { StyleSheet, Text, View, FlatList } from 'react-native';
import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import { useAlerts } from '@/hooks/useAlerts';
import { useTheme } from '@/hooks/useTheme';

export default function AlertsScreen() {
  const theme = useTheme();
  const { data: alerts = [], isLoading, error } = useAlerts();

  const alertBg = theme.isDark
    ? { info: '#0D1F35', warning: '#2D1A00', critical: '#2D0707' }
    : { info: '#DBEAFE', warning: '#FEF3C7', critical: '#FEE2E2' };

  const severityColors = {
    info:     { bg: alertBg.info,     border: theme.INFO },
    warning:  { bg: alertBg.warning,  border: theme.WARNING },
    critical: { bg: alertBg.critical, border: theme.ERROR },
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.TEXT_SECONDARY }}>Loading alerts...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Text style={{ color: theme.ERROR }}>Failed to load alerts</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper scrollable>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item: alert }) => {
          const colors = severityColors[alert.severity];
          return (
            <View
              style={[
                styles.alertItem,
                { backgroundColor: colors.bg, borderLeftColor: colors.border },
              ]}
            >
              <Text style={[styles.alertTitle, { color: theme.TEXT }]}>{alert.title}</Text>
              <Text style={[styles.alertMessage, { color: theme.TEXT_SECONDARY }]}>{alert.message}</Text>
              {alert.affectedRoutes && alert.affectedRoutes.length > 0 && (
                <Text style={[styles.alertRoutes, { color: theme.TEXT_MUTED }]}>
                  Affected routes: {alert.affectedRoutes.join(', ')}
                </Text>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={{ color: theme.TEXT_SECONDARY, fontSize: 18 }}>🟢 No active alerts</Text>
          </View>
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  alertItem: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 14,
    marginBottom: 8,
  },
  alertRoutes: {
    fontSize: 12,
    fontWeight: '500',
  },
});
