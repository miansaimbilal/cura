import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  style?: ViewStyle;
}

export const Header = ({ title, subtitle, leftElement, rightElement, style }: HeaderProps) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: theme.colors.borderSubtle }, style]}>
      <View style={styles.leftRow}>
        {leftElement && <View style={styles.leftElement}>{leftElement}</View>}
        <View style={styles.titleColumn}>
          <Text variant="heading2" numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  leftElement: {
    marginRight: 12,
  },
  titleColumn: {
    flex: 1,
  },
  rightElement: {
    marginLeft: 12,
  },
});
