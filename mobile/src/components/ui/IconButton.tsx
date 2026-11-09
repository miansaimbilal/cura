import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, ViewStyle, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';

export type IconButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'surface';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends TouchableOpacityProps {
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  rounded?: boolean;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
}

export const IconButton = ({
  icon,
  variant = 'surface',
  size = 'md',
  rounded = true,
  loading = false,
  disabled = false,
  accessibilityLabel,
  onPress,
  style,
  ...props
}: IconButtonProps) => {
  const { theme } = useTheme();

  const handlePress = (e: any) => {
    if (disabled || loading) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics fallback
    }
    onPress?.(e);
  };

  const dimension = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;

  let bg = theme.colors.surface;
  let borderColor = 'transparent';
  let borderWidth = 0;

  switch (variant) {
    case 'primary':
      bg = theme.colors.accent;
      break;
    case 'secondary':
      bg = theme.colors.surfaceElevated;
      break;
    case 'outline':
      bg = 'transparent';
      borderColor = theme.colors.border;
      borderWidth = 1;
      break;
    case 'ghost':
      bg = 'transparent';
      break;
    case 'surface':
    default:
      bg = theme.colors.surface;
      borderColor = theme.colors.borderSubtle;
      borderWidth = 1;
      break;
  }

  const containerStyle: ViewStyle = {
    width: dimension,
    height: dimension,
    borderRadius: rounded ? dimension / 2 : theme.radius.md,
    backgroundColor: bg,
    borderColor,
    borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled || loading}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={props.hitSlop ?? (size === 'sm' ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined)}
      style={[containerStyle, style]}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color={theme.colors.accent} /> : icon}
    </TouchableOpacity>
  );
};
