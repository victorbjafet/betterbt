import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface InlineErrorStateProps {
  title: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function InlineErrorState({
  title,
  message,
  retryLabel = 'Try again',
  onRetry,
}: InlineErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE }]}>
      <Text style={[styles.title, { color: theme.ERROR }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: theme.TEXT_SECONDARY }]}>{message}</Text> : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={[styles.retryButton, { borderColor: theme.BORDER, backgroundColor: theme.SURFACE_2 }]}
        >
          <Text style={[styles.retryButtonText, { color: theme.TEXT }]}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    marginTop: 4,
    fontSize: 12,
  },
  retryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
});