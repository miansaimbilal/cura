import React, { useState } from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const Input = ({
  label,
  helperText,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) => {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const hasError = Boolean(error);

  const getBorderColor = (): string => {
    if (hasError) return theme.colors.error;
    if (isFocused) return theme.colors.accent;
    return theme.colors.border;
  };

  const wrapperStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: getBorderColor(),
    borderWidth: isFocused ? 1.5 : 1,
    borderRadius: theme.radius.input,
    paddingHorizontal: theme.spacing.md,
    minHeight: 48,
  };

  const inputStyle: TextStyle = {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingVertical: theme.spacing.sm,
  };

  return (
    <View style={[styles.root, containerStyle]}>
      {label && (
        <Text variant="subheading" style={styles.label}>
          {label}
        </Text>
      )}

      <View style={wrapperStyle}>
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.accent}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[inputStyle, style]}
          {...props}
        />
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>

      {hasError ? (
        <Text variant="caption" color={theme.colors.error} style={styles.helper}>
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" color={theme.colors.textMuted} style={styles.helper}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
  helper: {
    marginTop: 4,
    marginLeft: 2,
  },
});
