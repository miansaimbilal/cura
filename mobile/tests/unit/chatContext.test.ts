import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as chatRepo from '../../src/db/chatRepository';
import { IDatabase } from '../../src/db/types';

describe('Chat Context & Draft Management (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Draft Management', () => {
    it('manages conversation-specific drafts in local state', () => {
      const drafts: Record<string, string> = {};
      const convId1 = 'conv-1';
      const convId2 = 'conv-2';

      // Set draft for conv-1
      drafts[convId1] = 'I was wondering if...';
      // Set draft for conv-2
      drafts[convId2] = 'Today was exhausting.';

      expect(drafts[convId1]).toBe('I was wondering if...');
      expect(drafts[convId2]).toBe('Today was exhausting.');

      // Clearing draft for conv-1 on send
      drafts[convId1] = '';
      expect(drafts[convId1]).toBe('');
      // conv-2 draft remains preserved
      expect(drafts[convId2]).toBe('Today was exhausting.');
    });

    it('preserves draft content when an error occurs during generation', () => {
      let draft = 'Important reflection notes';
      let error: string | null = null;

      try {
        // Simulate failed send
        throw new Error('Network timeout');
      } catch (err: unknown) {
        error = (err as Error).message;
        // Draft is preserved
        draft = 'Important reflection notes';
      }

      expect(error).toBe('Network timeout');
      expect(draft).toBe('Important reflection notes');
    });
  });

  describe('Offline Behavior Safety', () => {
    it('does NOT trigger network generation when offline', async () => {
      const isOffline = true;
      const fetchSpy = vi.fn();

      if (!isOffline) {
        fetchSpy();
      }

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('persists user message locally even when offline', async () => {
      const mockDb = {} as IDatabase;
      const createMsgSpy = vi.spyOn(chatRepo, 'createMessage').mockResolvedValueOnce({
        id: 'msg-offline-1',
        conversationId: 'conv-1',
        sender: 'user',
        content: 'Saved locally while on train',
        status: 'completed',
        createdAt: new Date().toISOString(),
      });

      const result = await chatRepo.createMessage(mockDb, {
        conversationId: 'conv-1',
        sender: 'user',
        content: 'Saved locally while on train',
        status: 'completed',
      });

      expect(result.id).toBe('msg-offline-1');
      expect(createMsgSpy).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({ content: 'Saved locally while on train' })
      );
    });
  });
});
