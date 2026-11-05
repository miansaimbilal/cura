import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatContextBuilder } from '../../src/modules/chat/chat.context';
import { db } from '../../src/db/index';

vi.mock('../../src/db/index', () => ({
  db: {
    select: vi.fn(),
  },
}));

describe('ChatContextBuilder Crisis Safety Guidelines (Unit Tests)', () => {
  let contextBuilder: ChatContextBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    contextBuilder = new ChatContextBuilder();
  });

  const setupMockDb = (prefs = { aiIncludeTasks: false, aiIncludeMoods: false }) => {
    // 1. userPreferences
    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([prefs]),
        }),
      }),
    });

    // 2. conversationSummaries
    (db.select as any).mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([]),
        }),
      }),
    });
  };

  it('includes comprehensive crisis safety instructions prioritizing immediate physical safety', async () => {
    setupMockDb();
    const systemMessage = await contextBuilder.buildSystemContext({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    const content = systemMessage.content;
    expect(content).toContain('Crisis Safety & Immediate Danger');
    expect(content).toContain('Prioritize immediate physical safety above all else');
    expect(content).toContain('calmly, compassionately, and without judgment');
  });

  it('provides explicit immediate danger guidance (emergency services and emergency department)', async () => {
    setupMockDb();
    const systemMessage = await contextBuilder.buildSystemContext({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    const content = systemMessage.content;
    expect(content).toContain('contact their local emergency services immediately or go to the nearest emergency department');
  });

  it('strictly avoids universal assumption that 988 applies globally', async () => {
    setupMockDb();
    const systemMessage = await contextBuilder.buildSystemContext({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    const content = systemMessage.content;
    expect(content).toContain('Do not assume the user is in the United States, Canada, or any particular country');
    expect(content).toContain('Never present 988 or any single country-specific number as globally applicable');
  });

  it('suggests https://findahelpline.com/ for international crisis support', async () => {
    setupMockDb();
    const systemMessage = await contextBuilder.buildSystemContext({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    const content = systemMessage.content;
    expect(content).toContain('https://findahelpline.com/');
    expect(content).toContain('free, confidential, country-specific crisis support');
  });

  it('instructs model not to invent country-specific numbers, hotlines, or operating hours', async () => {
    setupMockDb();
    const systemMessage = await contextBuilder.buildSystemContext({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    const content = systemMessage.content;
    expect(content).toContain('Use country-specific numbers (such as 988 in the US/Canada) only if the user explicitly mentions their country');
    expect(content).toContain('Never invent emergency numbers, hotlines, or operating hours');
  });

  it('encourages contacting a trusted physically present person and clarifies AI is not a substitute for care', async () => {
    setupMockDb();
    const systemMessage = await contextBuilder.buildSystemContext({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    const content = systemMessage.content;
    expect(content).toContain('Encourage contacting a trusted family member, friend, or professional who can be physically present');
    expect(content).toContain('AI chat is never a substitute for emergency services or professional support');
  });
});
