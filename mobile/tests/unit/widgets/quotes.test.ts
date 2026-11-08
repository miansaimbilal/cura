import { describe, it, expect } from 'vitest';
import { getRotatingQuote, CURA_MINDFUL_QUOTES } from '../../../src/services/widgets/quotes';

describe('Widget Quotes Unit Tests', () => {
  it('getRotatingQuote(0) returns quote 0', () => {
    const quote = getRotatingQuote(0);
    expect(quote).toEqual(CURA_MINDFUL_QUOTES[0]);
  });

  it('getRotatingQuote(18000 * 1000) returns quote 1 - proves 5-hour rotation', () => {
    const fiveHoursMs = 18000 * 1000;
    const quote = getRotatingQuote(fiveHoursMs);
    expect(quote).toEqual(CURA_MINDFUL_QUOTES[1]);
  });

  it('getRotatingQuote at T and T + 48 * 18000 * 1000 returns same quote - proves mod 48 wrap', () => {
    const t = 1731000000000; // arbitrary timestamp
    const fullCycleMs = 48 * 18000 * 1000;
    const quoteAtT = getRotatingQuote(t);
    const quoteAtWrap = getRotatingQuote(t + fullCycleMs);
    expect(quoteAtT).toEqual(quoteAtWrap);
  });

  it('All 48 quotes exist, have non-empty id, text, author, and all ids are unique', () => {
    expect(CURA_MINDFUL_QUOTES).toHaveLength(48);

    const ids = new Set<string>();
    for (const q of CURA_MINDFUL_QUOTES) {
      const untyped = q as { id?: string; text: string; author: string };
      expect(untyped.id).toBeDefined();
      expect(typeof untyped.id).toBe('string');
      expect(untyped.id!.trim().length).toBeGreaterThan(0);
      expect(untyped.text).toBeTruthy();
      expect(untyped.author).toBeTruthy();
      ids.add(untyped.id!);
    }

    expect(ids.size).toBe(48);
  });

  it('Same nowMs called twice returns identical quote - deterministic', () => {
    const timestamp = Date.now();
    const firstCall = getRotatingQuote(timestamp);
    const secondCall = getRotatingQuote(timestamp);
    expect(firstCall).toBe(secondCall); // exact object reference or deep equality
  });
});
