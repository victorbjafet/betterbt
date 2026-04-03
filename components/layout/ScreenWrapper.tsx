/**
 * ScreenWrapper Component
 * Safe area + scroll handling for screens
 */

import { useTheme } from '@/hooks/useTheme';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  includeTopInset?: boolean;
  includeBottomInset?: boolean;
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  scrollable = false,
  includeTopInset = true,
  includeBottomInset = true,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const containerStyle = {
    paddingTop: includeTopInset ? insets.top : 0,
    paddingBottom: includeBottomInset ? insets.bottom : 0,
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
