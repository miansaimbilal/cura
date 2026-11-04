import React from 'react';
import { View, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';

export type CardVariant = 'surface' | 'elevated' | 'outlined' | 'subtle';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}

export const Card = ({
  children,
  variant = 'surface',
  padding,
  onPress,
  style,
  interactive,
}: CardProps) => {
  const { theme } = useTheme();

  const handlePress = () => {
    if (!onPress) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics fallback
    }
    onPress();
  };

  let bg = theme.colors.surface;
  let borderColor = theme.colors.borderSubtle;
  let borderWidth = 1;
  let shadow = theme.shadows.card;

  switch (variant) {
    case 'elevated':
      bg = theme.colors.surfaceElevated;
      borderColor = theme.colors.border;
      shadow = theme.shadows.elevated;
      break;
    case 'outlined':
      bg = 'transparent';
      borderColor = theme.colors.border;
      borderWidth = 1.5;
      shadow = theme.shadows.none;
      break;
    case 'subtle':
      bg = theme.colors.surfaceSubtle;
      borderColor = 'transparent';
      borderWidth = 0;
      shadow = theme.shadows.subtle;
      break;
    case 'surface':
    default:
      bg = theme.colors.surface;
      borderColor = theme.colors.borderSubtle;
      shadow = theme.shadows.card;
      break;
  }

  const cardStyle: ViewStyle = {
    backgroundColor: bg,
    borderColor,
    borderWidth,
    borderRadius: theme.radius.card,
    padding: padding !== undefined ? padding : theme.spacing.cardPadding,
    ...shadow,
  };

  if (onPress || interactive) {
    return (
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={handlePress}
        style={[cardStyle, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
};
