import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { useTheme } from '../../hooks/useTheme';
import { Conversation } from '../../types/chat';

interface ConversationListItemProps {
  conversation: Conversation;
  isSelected?: boolean;
  onPress: () => void;
  onDelete: () => void;
}

export const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  isSelected = false,
  onPress,
  onDelete,
}) => {
  const { theme } = useTheme();

  const formattedDate = new Date(conversation.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const handleDeletePress = () => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  const previewText = conversation.lastMessage
    ? `${conversation.lastMessage.sender === 'user' ? 'You: ' : 'Cura: '}${conversation.lastMessage.content}`
    : 'No messages yet';

  return (
    <Card
      variant="surface"
      style={[
        styles.card,
        {
          borderColor: isSelected ? theme.colors.accent : theme.colors.borderSubtle,
          backgroundColor: isSelected ? theme.colors.surfaceElevated : theme.colors.surface,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.touchArea}
      >
        <View style={styles.contentColumn}>
          <View style={styles.topRow}>
            <Text
              variant="subheading"
              numberOfLines={1}
              color={theme.colors.textPrimary}
              style={styles.title}
            >
              {conversation.title || 'Untitled Conversation'}
            </Text>
            <Text variant="caption" color={theme.colors.textMuted}>
              {formattedDate}
            </Text>
          </View>

          <Text
            variant="body"
            numberOfLines={2}
            color={theme.colors.textSecondary}
            style={styles.preview}
          >
            {previewText}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleDeletePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.deleteButton}
          accessibilityLabel="Delete conversation"
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 0,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  touchArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  contentColumn: {
    flex: 1,
    marginRight: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
  },
});
