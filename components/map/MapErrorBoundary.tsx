import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { logError } from '@/services/telemetry';

interface MapErrorBoundaryProps {
  children: React.ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

function MapFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();

  return (
    <View style={[styles.fallbackContainer, { backgroundColor: theme.SURFACE, borderColor: theme.BORDER }]}>
      <Text style={[styles.fallbackTitle, { color: theme.ERROR }]}>Map failed to load</Text>
      <Text style={[styles.fallbackMessage, { color: theme.TEXT_SECONDARY }]}>Route and stop lists are still available. You can retry the map.</Text>
      <Pressable
        onPress={onRetry}
        style={[styles.retryButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE_2 }]}
      >
        <Text style={[styles.retryButtonText, { color: theme.TEXT }]}>Retry map</Text>
      </Pressable>
    </View>
  );
}

export class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    logError('map_render_crash', error, { scope: 'MapErrorBoundary' });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <MapFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  fallbackMessage: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
});