import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle, StyleProp } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { TypographyVariant } from '../../theme/typography';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: string;
  muted?: boolean;
  secondary?: boolean;
  accent?: boolean;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export const Text = ({
  variant = 'body',
  color,
  muted,
  secondary,
  accent,
  align,
  weight,
  style,
  children,
  ...props
}: TextProps) => {
  const { theme } = useTheme();

  let resolvedColor = theme.colors.textPrimary;
  if (color) {
    resolvedColor = color;
  } else if (accent) {
    resolvedColor = theme.colors.accent;
  } else if (muted) {
    resolvedColor = theme.colors.textMuted;
  } else if (secondary) {
    resolvedColor = theme.colors.textSecondary;
  }

  const typographyStyle: TextStyle = theme.typography[variant] || theme.typography.body;

  const dynamicStyle: TextStyle = {
    color: resolvedColor,
    ...(align && { textAlign: align }),
    ...(weight && { fontWeight: weight }),
  };

  return (
    <RNText style={[typographyStyle, dynamicStyle, style]} {...props}>
      {children}
    </RNText>
  );
};
