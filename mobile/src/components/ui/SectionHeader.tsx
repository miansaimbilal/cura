import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionText?: string;
  onActionPress?: () => void;
  rightElement?: React.ReactNode;
  style?: ViewStyle;
}

export const SectionHeader = ({
  title,
  subtitle,
  actionText,
  onActionPress,
  rightElement,
  style,
}: SectionHeaderProps) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.textColumn}>
        <Text variant="heading3">{title}</Text>
        {subtitle && (
          <Text variant="caption" color={theme.colors.textSecondary} style={styles.subtitle}>
            {subtitle}
          </Text>
        )}
      </View>

      {actionText && onActionPress ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onActionPress}>
          <Text variant="caption" color={theme.colors.accent} weight="600">
            {actionText}
          </Text>
        </TouchableOpacity>
      ) : rightElement ? (
        <View>{rightElement}</View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
  },
  textColumn: {
    flex: 1,
    marginRight: 12,
  },
  subtitle: {
    marginTop: 2,
  },
});
