/**
 * ScreenWrapper Component
 * Safe area + scroll handling for screens
 */

import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  scrollable = false,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const containerStyle = {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  if (scrollable) {
    return (
      <ScrollView
        style={[styles.container, containerStyle, { backgroundColor: theme.BACKGROUND }]}
        contentContainerStyle={styles.contentContainer}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, containerStyle, { backgroundColor: theme.BACKGROUND }]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
});
