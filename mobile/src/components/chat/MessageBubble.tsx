import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../ui/Text';
import { useTheme } from '../../hooks/useTheme';
import { Message } from '../../types/chat';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isStreaming = false,
  onRetry,
}) => {
  const { theme } = useTheme();
  const isUser = message.sender === 'user';
  const isInterrupted = message.status === 'interrupted';
  const isFailed = message.status === 'failed';

  const formattedTime = new Date(message.createdAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
      ]}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <View style={[styles.avatarBox, { backgroundColor: theme.colors.accentSubtle }]}>
          <Ionicons name="sparkles" size={16} color={theme.colors.accent} />
        </View>
      )}

      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: theme.colors.accent }]
            : [
                styles.bubbleAssistant,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.borderSubtle,
                },
              ],
        ]}
      >
        <Text
          variant="body"
          color={isUser ? '#FFFFFF' : theme.colors.textPrimary}
          style={styles.messageText}
        >
          {message.content}
          {isStreaming && (
            <Text variant="body" color={theme.colors.accent} weight="700">
              {' ▍'}
            </Text>
          )}
        </Text>

        {/* Footer info: timestamp & status */}
        <View style={styles.footerRow}>
          <Text
            variant="caption"
            color={isUser ? 'rgba(255, 255, 255, 0.75)' : theme.colors.textMuted}
            style={styles.timestamp}
          >
            {formattedTime}
          </Text>

          {isInterrupted && (
            <View style={styles.statusBadge}>
              <Ionicons name="alert-circle-outline" size={12} color={theme.colors.warning} />
              <Text variant="caption" color={theme.colors.warning} style={styles.statusText}>
                Interrupted
              </Text>
            </View>
          )}

          {isFailed && (
            <View style={styles.statusBadge}>
              <Ionicons name="close-circle-outline" size={12} color={theme.colors.error} />
              <Text variant="caption" color={theme.colors.error} style={styles.statusText}>
                Failed
              </Text>
            </View>
          )}
        </View>

        {/* Retry Button if generation was interrupted or failed */}
        {(isInterrupted || isFailed) && onRetry && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onRetry}
            style={[styles.retryButton, { borderColor: theme.colors.border }]}
          >
            <Ionicons name="refresh" size={14} color={theme.colors.accent} />
            <Text variant="caption" color={theme.colors.accent} weight="600" style={{ marginLeft: 4 }}>
              Retry response
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  avatarBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    lineHeight: 22,
    fontSize: 15,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 6,
  },
  timestamp: {
    fontSize: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusText: {
    fontSize: 10,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
});
