import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  ActivityIndicator,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  enableHaptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Button = ({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  enableHaptics = true,
  onPress,
  style,
  ...props
}: ButtonProps) => {
  const { theme } = useTheme();

  const handlePress = (e: any) => {
    if (disabled || loading) return;
    if (enableHaptics) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Haptics optional fallback
      }
    }
    onPress?.(e);
  };

  const getContainerStyle = (): ViewStyle => {
    let bg = theme.colors.accent;
    let borderColor = 'transparent';
    let borderWidth = 0;

    switch (variant) {
      case 'secondary':
        bg = theme.colors.surfaceElevated;
        break;
      case 'outline':
        bg = 'transparent';
        borderColor = theme.colors.border;
        borderWidth = 1.5;
        break;
      case 'ghost':
        bg = 'transparent';
        break;
      case 'danger':
        bg = theme.colors.error;
        break;
      case 'primary':
      default:
        bg = theme.colors.accent;
        break;
    }

    if (disabled) {
      bg = theme.colors.surfaceSubtle;
      borderColor = theme.colors.borderSubtle;
    }

    let height = 48;
    let paddingH: number = theme.spacing.lg;

    if (size === 'sm') {
      height = 36;
      paddingH = theme.spacing.md;
    } else if (size === 'lg') {
      height = 56;
      paddingH = theme.spacing.xl;
    }

    return {
      backgroundColor: bg,
      borderColor,
      borderWidth,
      height,
      paddingHorizontal: paddingH,
      borderRadius: theme.radius.button,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      opacity: disabled ? 0.6 : 1,
      alignSelf: fullWidth ? 'stretch' : 'auto',
    };
  };

  const getTextColor = (): string => {
    if (disabled) return theme.colors.textMuted;
    switch (variant) {
      case 'secondary':
        return theme.colors.textPrimary;
      case 'outline':
      case 'ghost':
        return theme.colors.accent;
      case 'danger':
      case 'primary':
      default:
        return theme.colors.accentForeground;
    }
  };

  const textVariant = size === 'sm' ? 'buttonSmall' : 'button';

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={disabled || loading}
      onPress={handlePress}
      style={[getContainerStyle(), style]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getTextColor()} />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
          <Text variant={textVariant} color={getTextColor()}>
            {title}
          </Text>
          {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
});
