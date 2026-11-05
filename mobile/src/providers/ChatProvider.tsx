import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from '../types/chat';
import { getDatabase } from '../db/client';
import * as chatRepo from '../db/chatRepository';
import { generateUUID } from '../utils/uuid';

interface ChatContextValue {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isGenerating: boolean;
  streamingText: string;
  error: string | null;
  isOffline: boolean;
  drafts: Record<string, string>;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string | null) => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  updateTitle: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setDraft: (conversationId: string, text: string) => void;
  sendMessage: (content: string, options?: { provider?: string; model?: string }) => Promise<void>;
  stopGeneration: () => void;
  retryLastMessage: () => Promise<void>;
  setIsOffline: (offline: boolean) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserPromptRef = useRef<string>('');

  const loadConversations = useCallback(async () => {
    try {
      const db = await getDatabase();
      const list = await chatRepo.getAllConversations(db);
      setConversations(list);
    } catch (err: unknown) {
      console.warn('Failed to load conversations from SQLite:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    getDatabase()
      .then((db) => chatRepo.getAllConversations(db))
      .then((list) => {
        if (isMounted) {
          setConversations(list);
        }
      })
      .catch((err) => {
        console.warn('Failed to load conversations from SQLite:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectConversation = useCallback(async (id: string | null) => {
    setError(null);
    setStreamingText('');
    setIsGenerating(false);

    if (!id) {
      setActiveConversation(null);
      setMessages([]);
      return;
    }

    try {
      const db = await getDatabase();
      const conv = await chatRepo.getConversationById(db, id);
      if (conv) {
        setActiveConversation(conv);
        const msgs = await chatRepo.getMessages(db, conv.id);
        setMessages(msgs);
      }
    } catch (err: unknown) {
      console.warn('Failed to select conversation:', err);
    }
  }, []);

  const createConversation = useCallback(
    async (title?: string): Promise<Conversation> => {
      const db = await getDatabase();
      const conv = await chatRepo.createConversation(db, { title });
      await loadConversations();
      await selectConversation(conv.id);
      return conv;
    },
    [loadConversations, selectConversation]
  );

  const updateTitle = useCallback(
    async (id: string, title: string) => {
      const db = await getDatabase();
      await chatRepo.updateConversationTitle(db, id, title);
      await loadConversations();
      if (activeConversation?.id === id) {
        setActiveConversation((prev) => (prev ? { ...prev, title } : null));
      }
    },
    [activeConversation?.id, loadConversations]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const db = await getDatabase();
      await chatRepo.deleteConversation(db, id);
      if (activeConversation?.id === id) {
        setActiveConversation(null);
        setMessages([]);
      }
      await loadConversations();
    },
    [activeConversation?.id, loadConversations]
  );

  const setDraft = useCallback((conversationId: string, text: string) => {
    setDrafts((prev) => ({
      ...prev,
      [conversationId]: text,
    }));
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  const sendMessage = useCallback(
    async (content: string, options?: { provider?: string; model?: string }) => {
      if (!content.trim()) return;

      let conv = activeConversation;
      if (!conv) {
        conv = await createConversation();
      }

      setError(null);
      lastUserPromptRef.current = content;

      // 1. Persist User Message locally in SQLite
      const db = await getDatabase();
      const clientMessageId = generateUUID();
      const userMsg = await chatRepo.createMessage(db, {
        conversationId: conv.id,
        sender: 'user',
        content: content.trim(),
        clientMessageId,
        status: 'completed',
      });

      setMessages((prev) => [...prev, userMsg]);
      // Clear draft for this conversation
      setDrafts((prev) => ({ ...prev, [conv.id]: '' }));

      // 2. Offline check: if offline, do NOT pretend an AI response was generated
      if (isOffline) {
        setError('Offline mode: Conversation saved locally. AI generation requires an active network connection.');
        return;
      }

      // 3. Prepare for generation
      setIsGenerating(true);
      setStreamingText('');

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
        const endpoint = `${baseUrl}/api/chat/conversations/${conv.id}/messages/stream`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: content.trim(),
            clientMessageId,
            provider: options?.provider,
            model: options?.model,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          let errJson: any;
          try {
            errJson = await res.json();
          } catch {
            errJson = {};
          }
          throw new Error(errJson?.error?.message || errJson?.message || `Server returned error (${res.status})`);
        }

        // Read SSE stream
        let accumulatedText = '';
        if (res.body && typeof (res.body as any).getReader === 'function') {
          const reader = (res.body as any).getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const dataStr = trimmed.slice(6).trim();
                try {
                  const eventData = JSON.parse(dataStr);
                  if (eventData.text) {
                    accumulatedText += eventData.text;
                    setStreamingText(accumulatedText);
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        } else {
          // Fallback if reader not available: text body
          const fullText = await res.text();
          accumulatedText = fullText;
          setStreamingText(fullText);
        }

        // Persist completed Assistant Message to SQLite
        const assistantMsg = await chatRepo.createMessage(db, {
          conversationId: conv.id,
          sender: 'assistant',
          content: accumulatedText.trim() || 'I am listening. How can I support you today?',
          status: 'completed',
          providerUsed: options?.provider || 'groq',
          modelUsed: options?.model || null,
        });

        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText('');
      } catch (err: unknown) {
        const error = err as Error;
        const isAbort =
          error.name === 'AbortError' ||
          error.message.toLowerCase().includes('aborted') ||
          abortController.signal.aborted;

        if (isAbort) {
          // Persist partial message if any text was received
          if (streamingText.trim().length > 0) {
            const partialMsg = await chatRepo.createMessage(db, {
              conversationId: conv.id,
              sender: 'assistant',
              content: streamingText.trim(),
              status: 'interrupted',
            });
            setMessages((prev) => [...prev, partialMsg]);
          }
          setError('Response generation was stopped.');
        } else {
          // Failure: restore unsent draft so user doesn't lose text
          setDrafts((prev) => ({ ...prev, [conv.id]: content }));
          setError(error.message || 'Failed to generate response. Your message draft has been preserved.');
        }
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
        await loadConversations();
      }
    },
    [activeConversation, createConversation, isOffline, loadConversations, streamingText]
  );

  const retryLastMessage = useCallback(async () => {
    if (lastUserPromptRef.current) {
      await sendMessage(lastUserPromptRef.current);
    }
  }, [sendMessage]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        isGenerating,
        streamingText,
        error,
        isOffline,
        drafts,
        loadConversations,
        selectConversation,
        createConversation,
        updateTitle,
        deleteConversation,
        setDraft,
        sendMessage,
        stopGeneration,
        retryLastMessage,
        setIsOffline,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
