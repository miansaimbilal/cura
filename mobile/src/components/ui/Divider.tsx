import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Text } from './Text';

export interface DividerProps {
  label?: string;
  vertical?: boolean;
  spacing?: number;
  style?: ViewStyle;
}

export const Divider = ({ label, vertical = false, spacing: customSpacing, style }: DividerProps) => {
  const { theme } = useTheme();

  if (vertical) {
    return (
      <View
        style={[
          styles.verticalLine,
          {
            backgroundColor: theme.colors.borderSubtle,
            marginHorizontal: customSpacing !== undefined ? customSpacing : theme.spacing.sm,
          },
          style,
        ]}
      />
    );
  }

  if (label) {
    return (
      <View
        style={[
          styles.labelRow,
          { marginVertical: customSpacing !== undefined ? customSpacing : theme.spacing.md },
          style,
        ]}
      >
        <View style={[styles.line, { backgroundColor: theme.colors.borderSubtle }]} />
        <Text variant="caption" color={theme.colors.textMuted} style={styles.label}>
          {label}
        </Text>
        <View style={[styles.line, { backgroundColor: theme.colors.borderSubtle }]} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.line,
        {
          backgroundColor: theme.colors.borderSubtle,
          marginVertical: customSpacing !== undefined ? customSpacing : theme.spacing.md,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  line: {
    height: 1,
    width: '100%',
  },
  verticalLine: {
    width: 1,
    height: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  label: {
    paddingHorizontal: 12,
  },
});
