import React from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChangeText,
  onSend,
  onStop,
  isGenerating,
  disabled = false,
  placeholder = 'Message Cura...',
}) => {
  const { theme } = useTheme();

  const canSend = value.trim().length > 0 && !isGenerating && !disabled;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderSubtle,
        },
      ]}
    >
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={4000}
          editable={!isGenerating && !disabled}
          style={[
            styles.textInput,
            {
              color: theme.colors.textPrimary,
            },
          ]}
        />

        {isGenerating ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onStop}
            style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
            accessibilityRole="button"
            accessibilityLabel="Stop response generation"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="stop" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onSend}
            disabled={!canSend}
            style={[
              styles.actionButton,
              {
                backgroundColor: canSend ? theme.colors.accent : theme.colors.surface,
                opacity: canSend ? 1 : 0.4,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {disabled ? (
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
            ) : (
              <Ionicons
                name="arrow-up"
                size={18}
                color={canSend ? theme.colors.accentForeground : theme.colors.textMuted}
              />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 46,
    maxHeight: 140,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    paddingTop: 8,
    paddingBottom: 8,
    marginRight: 8,
    maxHeight: 120,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
