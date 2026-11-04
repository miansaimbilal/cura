import React from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Text } from './Text';

export interface LoadingIndicatorProps {
  label?: string;
  size?: 'small' | 'large';
  color?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
}

export const LoadingIndicator = ({
  label,
  size = 'small',
  color,
  fullScreen = false,
  style,
}: LoadingIndicatorProps) => {
  const { theme } = useTheme();
  const indicatorColor = color || theme.colors.accent;

  const containerStyle: ViewStyle = fullScreen
    ? {
        ...StyleSheet.absoluteFill,
        backgroundColor: theme.colors.overlay,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }
    : {
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.lg,
      };

  return (
    <View style={[containerStyle, style]}>
      <ActivityIndicator size={size} color={indicatorColor} />
      {label && (
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          {label}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    marginTop: 10,
  },
});
