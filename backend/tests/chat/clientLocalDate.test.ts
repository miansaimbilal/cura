import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidCalendarDate, sendMessageSchema } from '../../src/modules/chat/chat.schema';
import { ChatContextBuilder } from '../../src/modules/chat/chat.context';
import { db } from '../../src/db/index';

vi.mock('../../src/db/index', () => ({
  db: {
    select: vi.fn(),
  },
}));

describe('Step 2.5: Backend Chat Client-Local-Date Handling (Unit Tests)', () => {
  let contextBuilder: ChatContextBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    contextBuilder = new ChatContextBuilder();
  });

  describe('1. Calendar Date Validation (isValidCalendarDate)', () => {
    it('accepts valid real calendar dates', () => {
      expect(isValidCalendarDate('2026-11-06')).toBe(true);
      expect(isValidCalendarDate('2026-01-01')).toBe(true);
      expect(isValidCalendarDate('2026-12-31')).toBe(true);
      // Leap year 2024
      expect(isValidCalendarDate('2024-02-29')).toBe(true);
    });

    it('rejects malformed date strings', () => {
      expect(isValidCalendarDate('2026/11/06')).toBe(false);
      expect(isValidCalendarDate('06-11-2026')).toBe(false);
      expect(isValidCalendarDate('2026-1-1')).toBe(false);
      expect(isValidCalendarDate('invalid-date')).toBe(false);
      expect(isValidCalendarDate('')).toBe(false);
      expect(isValidCalendarDate(null as any)).toBe(false);
    });

    it('rejects impossible calendar dates (regex alone is insufficient)', () => {
      // February 30th does not exist
      expect(isValidCalendarDate('2026-02-30')).toBe(false);
      // February 29th on non-leap year 2026 does not exist
      expect(isValidCalendarDate('2026-02-29')).toBe(false);
      // April 31st does not exist
      expect(isValidCalendarDate('2026-04-31')).toBe(false);
      // Month 13 does not exist
      expect(isValidCalendarDate('2026-13-01')).toBe(false);
      // Out of bounds numbers
      expect(isValidCalendarDate('2026-99-99')).toBe(false);
      expect(isValidCalendarDate('2026-00-10')).toBe(false);
      expect(isValidCalendarDate('2026-05-00')).toBe(false);
    });
  });

  describe('2. Request Schema Validation (sendMessageSchema)', () => {
    const validUuid = '11111111-1111-1111-1111-111111111111';

    it('successfully parses request with valid clientLocalDate', () => {
      const parsed = sendMessageSchema.safeParse({
        params: { id: validUuid },
        body: {
          content: 'Hello Cura',
          clientLocalDate: '2026-11-06',
        },
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.body.clientLocalDate).toBe('2026-11-06');
      }
    });

    it('successfully parses request when clientLocalDate is omitted (backward compatibility)', () => {
      const parsed = sendMessageSchema.safeParse({
        params: { id: validUuid },
        body: {
          content: 'Hello Cura',
        },
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.body.clientLocalDate).toBeUndefined();
      }
    });

    it('rejects request with impossible calendar date in clientLocalDate', () => {
      const parsed = sendMessageSchema.safeParse({
        params: { id: validUuid },
        body: {
          content: 'Hello Cura',
          clientLocalDate: '2026-02-31',
        },
      });

      expect(parsed.success).toBe(false);
    });
  });

  describe('3. Context Builder Date Classification & Fallback', () => {
    const mockTasks = [
      {
        id: 't-1',
        title: 'Task Due Nov 7',
        status: 'pending',
        dueDate: '2026-11-07',
        dueTime: null,
        isDeleted: false,
      },
      {
        id: 't-2',
        title: 'Task Due Nov 6',
        status: 'pending',
        dueDate: '2026-11-06',
        dueTime: null,
        isDeleted: false,
      },
    ];

    const setupMocks = () => {
      // 1. userPreferences
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { aiIncludeTasks: true, aiIncludeMoods: false },
            ]),
          }),
        }),
      });

      // 2. tasks query inside getTaskContext
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            orderBy: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce(mockTasks),
            }),
          }),
        }),
      });

      // 3. conversationSummaries
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });
    };

    it('classifies tasks relative to supplied clientLocalDate (e.g. 2026-11-07 across midnight boundary)', async () => {
      setupMocks();

      const context = await contextBuilder.buildSystemContext({
        userId: 'user-1',
        conversationId: 'conv-1',
        clientLocalDate: '2026-11-07',
      });

      // When user's local date is Nov 7:
      // "Task Due Nov 7" is scheduled for today
      // "Task Due Nov 6" is an earlier open task (overdue)
      expect(context.content).toContain('Scheduled for today (1): "Task Due Nov 7"');
      expect(context.content).toContain('Earlier open tasks (1): "Task Due Nov 6"');
    });

    it('falls back gracefully to UTC date when clientLocalDate is absent', async () => {
      setupMocks();

      const context = await contextBuilder.buildSystemContext({
        userId: 'user-1',
        conversationId: 'conv-1',
      });

      // Should complete without error and build permitted task context
      expect(context.content).toContain('[PERMITTED USER TASK CONTEXT]');
    });
  });
});
