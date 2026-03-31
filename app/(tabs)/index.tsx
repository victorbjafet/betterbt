import { ScreenWrapper } from '@/components/layout/ScreenWrapper';
import MapView from '@/components/map/MapView';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { useAlerts } from '@/hooks/useAlerts';
import { useBusPositions } from '@/hooks/useBuses';
import { useTheme } from '@/hooks/useTheme';
import { StyleSheet, Text, View } from 'react-native';

export default function LiveMapScreen() {
  const theme = useTheme();
  const { data: buses, isError, source } = useBusPositions();
  const { data: alerts = [] } = useAlerts();

  return (
    <ScreenWrapper>
      {isError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.isDark ? '#2D1A00' : '#FEF3C7', borderBottomColor: theme.WARNING }]}>
          <Text style={[styles.errorText, { color: theme.WARNING }]}>
            Live tracking unavailable. Showing last known positions.
          </Text>
        </View>
      )}

      {alerts.map((alert) => (
        <AlertBanner key={alert.id} alert={alert} />
      ))}

      <View style={styles.mapContainer}>
        <MapView
          buses={buses}
          onBusPress={(bus) => {
            console.log('Bus pressed:', bus.id);
          }}
        />
      </View>

      <View style={[styles.statusBar, { backgroundColor: theme.SURFACE, borderTopColor: theme.BORDER }]}>
        <Text style={[styles.statusText, { color: theme.TEXT }]}>
          {source === 'live'
            ? '● Live Tracking'
            : source === 'loading'
              ? '◌ Loading'
              : '◌ Predicted'}
        </Text>
        <Text style={[styles.busCount, { color: theme.TEXT_SECONDARY }]}>
          {buses.length} buses active
        </Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  errorText: {
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  busCount: {
    fontSize: 12,
  },
});
