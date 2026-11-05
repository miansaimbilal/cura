export type MessageSender = 'user' | 'assistant' | 'system';
export type MessageStatus = 'completed' | 'interrupted' | 'failed' | 'sending';

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  conversationType: string;
  serverRevision: number;
  serverUpdatedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage?: Message | null;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: MessageSender;
  content: string;
  status: MessageStatus;
  providerUsed?: string | null;
  modelUsed?: string | null;
  clientMessageId?: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  conversationId: string;
  summaryText: string;
  keyTopics: string[];
  lastMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationInput {
  title?: string;
  conversationType?: string;
  userId?: string;
}

export interface CreateMessageInput {
  conversationId: string;
  sender: MessageSender;
  content: string;
  status?: MessageStatus;
  providerUsed?: string | null;
  modelUsed?: string | null;
  clientMessageId?: string | null;
  createdAt?: string;
}
