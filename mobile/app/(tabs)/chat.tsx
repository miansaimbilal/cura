import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Text } from '../../src/components/ui/Text';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { useTheme } from '../../src/hooks/useTheme';
import { useChat } from '../../src/hooks/useChat';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { ChatInput } from '../../src/components/chat/ChatInput';
import { ConversationListItem } from '../../src/components/chat/ConversationListItem';
import { CheckinPreferencesModal } from '../../src/components/checkin/CheckinPreferencesModal';
import { CrisisSupportModal } from '../../src/components/settings/CrisisSupportModal';

const PROMPT_SUGGESTIONS = [
  'How did my day go so far?',
  'I am feeling a bit overwhelmed.',
  'Let us organize my tasks for today.',
  'I need a calm space to reflect.',
];

export default function ChatScreen() {
  const { theme } = useTheme();
  const {
    conversations,
    activeConversation,
    messages,
    isGenerating,
    streamingText,
    error,
    isOffline,
    drafts,
    selectConversation,
    createConversation,
    updateTitle,
    deleteConversation,
    setDraft,
    sendMessage,
    stopGeneration,
    retryLastMessage,
  } = useChat();

  const [localInput, setLocalInput] = useState<string | null>(null);
  const [isCheckinPrefsOpen, setIsCheckinPrefsOpen] = useState(false);
  const [isCrisisHelpOpen, setIsCrisisHelpOpen] = useState(false);
  const activeDraft = activeConversation ? drafts[activeConversation.id] ?? '' : '';
  const inputVal = localInput ?? activeDraft;
  const flatListRef = useRef<FlatList>(null);

  // Scroll to bottom when new messages arrive or when streaming text changes
  useEffect(() => {
    if (activeConversation && (messages.length > 0 || streamingText.length > 0)) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [activeConversation, messages.length, streamingText]);

  const handleInputChange = (text: string) => {
    setLocalInput(text);
    if (activeConversation) {
      setDraft(activeConversation.id, text);
    }
  };

  const handleSend = async () => {
    if (!inputVal.trim()) return;
    const textToSend = inputVal.trim();
    setLocalInput('');
    await sendMessage(textToSend);
  };

  const handleRenamePress = () => {
    if (!activeConversation) return;
    if (Alert.prompt) {
      Alert.prompt(
        'Rename Conversation',
        'Enter a new title for this conversation:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: (newTitle) => {
              if (newTitle?.trim()) {
                updateTitle(activeConversation.id, newTitle.trim());
              }
            },
          },
        ],
        'plain-text',
        activeConversation.title || ''
      );
    }
  };

  // --- VIEW 1: ACTIVE CHAT CONVERSATION ---
  if (activeConversation) {
    // Construct streaming placeholder message if currently generating
    const displayMessages = [...messages];
    if (isGenerating && streamingText.length > 0) {
      displayMessages.push({
        id: 'streaming-preview',
        conversationId: activeConversation.id,
        sender: 'assistant',
        content: streamingText,
        status: 'completed',
        createdAt: new Date().toISOString(),
      });
    }

    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Chat Room Header */}
        <View
          style={[
            styles.chatHeader,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.borderSubtle,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => selectConversation(null)}
            style={styles.backButton}
            accessibilityLabel="Back to conversation list"
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleRenamePress}
            style={styles.headerTitleBox}
          >
            <Text
              variant="subheading"
              numberOfLines={1}
              color={theme.colors.textPrimary}
              style={{ fontWeight: '600' }}
            >
              {activeConversation.title || 'Conversation'}
            </Text>
            <View style={styles.providerBadge}>
              <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
              <Text variant="caption" color={theme.colors.textMuted} style={{ fontSize: 11 }}>
                Cura AI · Groq / OpenRouter
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsCrisisHelpOpen(true)}
            style={styles.headerAction}
            accessibilityLabel="Crisis and safety support"
          >
            <Ionicons name="heart-circle-outline" size={22} color={theme.colors.error} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsCheckinPrefsOpen(true)}
            style={styles.headerAction}
            accessibilityLabel="Check-in preferences"
          >
            <Ionicons name="settings-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              Alert.alert('Delete Conversation', 'Delete this entire conversation?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteConversation(activeConversation.id),
                },
              ])
            }
            style={styles.headerAction}
            accessibilityLabel="Delete this conversation"
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Offline Warning Banner */}
        {isOffline && (
          <View style={[styles.banner, { backgroundColor: theme.colors.warningSubtle }]}>
            <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.warning} />
            <Text variant="caption" color={theme.colors.warning} weight="600" style={{ marginLeft: 6 }}>
              Offline: Conversations saved locally. AI streaming requires an internet connection.
            </Text>
          </View>
        )}

        {/* Error Banner */}
        {error && (
          <View style={[styles.banner, { backgroundColor: theme.colors.errorSubtle }]}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
            <Text
              variant="caption"
              color={theme.colors.error}
              weight="500"
              style={{ marginLeft: 6, flex: 1 }}
            >
              {error}
            </Text>
            <TouchableOpacity onPress={retryLastMessage} style={styles.retryPill}>
              <Text variant="caption" color={theme.colors.error} weight="700">
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Message Bubble List */}
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isStreaming={item.id === 'streaming-preview'}
              onRetry={retryLastMessage}
            />
          )}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="sparkles" size={32} color={theme.colors.accent} />
              <Text variant="subheading" color={theme.colors.textPrimary} style={{ marginTop: 12 }}>
                Welcome to your safe reflection space
              </Text>
              <Text
                variant="body"
                color={theme.colors.textSecondary}
                style={{ textAlign: 'center', marginTop: 6, maxWidth: 280 }}
              >
                Share how you are feeling, talk through your day, or ask for calm task guidance.
              </Text>
            </View>
          }
        />

        {/* Bottom Input Area */}
        <ChatInput
          value={inputVal}
          onChangeText={handleInputChange}
          onSend={handleSend}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          disabled={isOffline}
        />

        {/* Checkin Preferences Modal */}
        <CheckinPreferencesModal
          visible={isCheckinPrefsOpen}
          onClose={() => setIsCheckinPrefsOpen(false)}
        />

        {/* Crisis Support Directory Modal */}
        <CrisisSupportModal
          visible={isCrisisHelpOpen}
          onClose={() => setIsCrisisHelpOpen(false)}
        />
      </KeyboardAvoidingView>
    );
  }

  // --- VIEW 2: CONVERSATION LIST & PROMPT STARTERS ---
  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.listHeader}>
        <View style={styles.listHeaderTitle}>
          <Text variant="caption" color={theme.colors.accent} weight="700">
            COMPANION
          </Text>
          <Text variant="heading1">Cura Reflections</Text>
          <Text variant="body" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
            Your safe space to reflect, plan, and unwind
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsCheckinPrefsOpen(true)}
            accessibilityLabel="Check-in preferences"
            style={{ padding: 8, marginRight: 6 }}
          >
            <Ionicons name="settings-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <Button
            title="New Chat"
            variant="primary"
            size="sm"
            onPress={() => createConversation()}
            style={styles.newChatButton}
          />
        </View>
      </View>

      {/* Offline Status Pill */}
      {isOffline && (
        <View style={[styles.banner, { backgroundColor: theme.colors.warningSubtle, marginHorizontal: 16 }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.warning} />
          <Text variant="caption" color={theme.colors.warning} weight="600" style={{ marginLeft: 6 }}>
            Offline Mode: Showing cached conversations
          </Text>
        </View>
      )}

      {/* Suggested Starters Card */}
      <Card variant="surface" style={[styles.startersCard, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.startersHeader}>
          <Ionicons name="bulb-outline" size={18} color={theme.colors.accent} />
          <Text variant="subheading" color={theme.colors.textPrimary} style={{ marginLeft: 6 }}>
            Conversation Starters
          </Text>
        </View>

        <View style={styles.starterChipsRow}>
          {PROMPT_SUGGESTIONS.map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              activeOpacity={0.7}
              onPress={async () => {
                await createConversation();
                await sendMessage(suggestion);
              }}
              style={[
                styles.starterChip,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.borderSubtle,
                },
              ]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={theme.colors.accent} />
              <Text
                variant="caption"
                color={theme.colors.textPrimary}
                style={{ marginLeft: 6 }}
              >
                {suggestion}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Conversation List */}
      <View style={styles.conversationsSection}>
        <View style={styles.sectionTitleRow}>
          <Text variant="subheading" color={theme.colors.textPrimary} weight="600">
            Past Conversations
          </Text>
          <Text variant="caption" color={theme.colors.textMuted}>
            {conversations.length} saved
          </Text>
        </View>

        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationListItem
              conversation={item}
              onPress={() => selectConversation(item.id)}
              onDelete={() => deleteConversation(item.id)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Ionicons name="chatbubbles-outline" size={42} color={theme.colors.textMuted} />
              <Text variant="subheading" color={theme.colors.textPrimary} style={{ marginTop: 12 }}>
                No conversations yet
              </Text>
              <Text
                variant="body"
                color={theme.colors.textSecondary}
                style={{ textAlign: 'center', marginTop: 4, maxWidth: 260 }}
              >
                Tap &#34;New Chat&#34; or choose a conversation starter above to begin reflecting with Cura.
              </Text>
            </View>
          }
        />
      </View>

      {/* Checkin Preferences Modal */}
      <CheckinPreferencesModal
        visible={isCheckinPrefsOpen}
        onClose={() => setIsCheckinPrefsOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleBox: {
    flex: 1,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerAction: {
    padding: 6,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginVertical: 4,
    borderRadius: 8,
  },
  retryPill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  messageListContent: {
    paddingVertical: 14,
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  listHeaderTitle: {
    flex: 1,
    marginRight: 12,
  },
  newChatButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  startersCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
  },
  startersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  starterChipsRow: {
    flexDirection: 'column',
    gap: 8,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  conversationsSection: {
    flex: 1,
    marginTop: 18,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
});
