import { describe, it, expect } from 'vitest';
import {
  classifyHttpError,
  isRetryableCategory,
  sanitizeErrorString,
  AIProviderError,
} from '../../src/modules/ai/errors';
import { parseRetryAfterHeader } from '../../src/modules/ai/http';

describe('AI Error Classification & Sanitization', () => {
  describe('classifyHttpError', () => {
    it('classifies 401 as non-retryable AUTHENTICATION_ERROR', () => {
      const res401 = classifyHttpError(401, { error: { message: 'Invalid API key' } });
      expect(res401.category).toBe('AUTHENTICATION_ERROR');
      expect(res401.isRetryable).toBe(false);
    });

    it('classifies standard 403 as non-retryable AUTHENTICATION_ERROR', () => {
      const res403 = classifyHttpError(403, 'Forbidden access');
      expect(res403.category).toBe('AUTHENTICATION_ERROR');
      expect(res403.isRetryable).toBe(false);
    });

    it('classifies 403 with quota/billing restrictions as retryable QUOTA_EXCEEDED', () => {
      const res403Billing = classifyHttpError(403, {
        error: { message: 'Project billing has reached its monthly quota limit.' },
      });
      expect(res403Billing.category).toBe('QUOTA_EXCEEDED');
      expect(res403Billing.isRetryable).toBe(true);
      expect(res403Billing.message).toContain('quota exhaustion or billing limit');
    });

    it('classifies 403 with model permission/access restrictions as non-retryable UNSUPPORTED_CAPABILITY', () => {
      const res403Model = classifyHttpError(403, {
        error: { message: 'User does not have permission or access to this model.' },
      });
      expect(res403Model.category).toBe('UNSUPPORTED_CAPABILITY');
      expect(res403Model.isRetryable).toBe(false);
      expect(res403Model.message).toContain('Access to this model is restricted');

      // Groq model_not_allowed
      const groqModelErr = classifyHttpError(403, { error: { message: 'model_not_allowed for this organization' } });
      expect(groqModelErr.category).toBe('UNSUPPORTED_CAPABILITY');
      expect(groqModelErr.isRetryable).toBe(false);

      // Cloudflare error 10014
      const cfModelErr = classifyHttpError(403, { errors: [{ code: 10014, message: 'Model access restricted' }] });
      expect(cfModelErr.category).toBe('UNSUPPORTED_CAPABILITY');
      expect(cfModelErr.isRetryable).toBe(false);
    });

    it('classifies 403 with account usage restrictions as retryable QUOTA_EXCEEDED (eligible for key rotation)', () => {
      // Region/Tier account restriction
      const resAccountRestricted = classifyHttpError(403, {
        error: { message: 'Account is tier_restricted or region not supported for this account.' },
      });
      expect(resAccountRestricted.category).toBe('QUOTA_EXCEEDED');
      expect(resAccountRestricted.isRetryable).toBe(true);
      expect(resAccountRestricted.message).toContain('Account-specific usage restriction');

      // Cloudflare plan restriction
      const cfPlanErr = classifyHttpError(403, {
        errors: [{ message: 'Account does not have access to Workers AI in this plan restriction' }],
      });
      expect(cfPlanErr.category).toBe('QUOTA_EXCEEDED');
      expect(cfPlanErr.isRetryable).toBe(true);
    });

    it('classifies general 403 forbidden as non-retryable AUTHENTICATION_ERROR (halts rotation)', () => {
      const resGeneral = classifyHttpError(403, {
        error: { message: 'Forbidden: Request not allowed by gateway rules.' },
      });
      expect(resGeneral.category).toBe('AUTHENTICATION_ERROR');
      expect(resGeneral.isRetryable).toBe(false);
      expect(resGeneral.message).toContain('Forbidden: Request rejected by provider (403 Forbidden)');
    });

    it('classifies standard 429 as retryable RATE_LIMITED', () => {
      const res429 = classifyHttpError(429, { error: { message: 'Rate limit reached: 30 requests per minute.' } });
      expect(res429.category).toBe('RATE_LIMITED');
      expect(res429.isRetryable).toBe(true);
    });

    it('classifies 429 quota exhaustion as retryable QUOTA_EXCEEDED', () => {
      const resQuota1 = classifyHttpError(429, { error: { message: 'Insufficient quota or credit balance' } });
      expect(resQuota1.category).toBe('QUOTA_EXCEEDED');
      expect(resQuota1.isRetryable).toBe(true);

      const resQuota2 = classifyHttpError(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for project' } });
      expect(resQuota2.category).toBe('QUOTA_EXCEEDED');
      expect(resQuota2.isRetryable).toBe(true);
    });

    it('classifies 404 as non-retryable MODEL_UNAVAILABLE', () => {
      const res404 = classifyHttpError(404, { error: { message: 'Model gemini-fake does not exist' } });
      expect(res404.category).toBe('MODEL_UNAVAILABLE');
      expect(res404.isRetryable).toBe(false);
    });

    it('classifies 400 and 422 as non-retryable INVALID_REQUEST', () => {
      const res400 = classifyHttpError(400, { error: { message: 'Malformed JSON payload' } });
      expect(res400.category).toBe('INVALID_REQUEST');
      expect(res400.isRetryable).toBe(false);

      const res422 = classifyHttpError(422, { error: { message: 'Unprocessable content' } });
      expect(res422.category).toBe('INVALID_REQUEST');
      expect(res422.isRetryable).toBe(false);
    });

    it('classifies 408 as retryable TIMEOUT', () => {
      const res408 = classifyHttpError(408);
      expect(res408.category).toBe('TIMEOUT');
      expect(res408.isRetryable).toBe(true);
    });

    it('classifies 500, 502, 503, 504 as retryable PROVIDER_UNAVAILABLE', () => {
      for (const code of [500, 502, 503, 504]) {
        const res5xx = classifyHttpError(code, { error: 'Internal server error' });
        expect(res5xx.category).toBe('PROVIDER_UNAVAILABLE');
        expect(res5xx.isRetryable).toBe(true);
      }
    });

    it('classifies unknown status codes as non-retryable UNKNOWN_PROVIDER_ERROR', () => {
      const res = classifyHttpError(418);
      expect(res.category).toBe('UNKNOWN_PROVIDER_ERROR');
      expect(res.isRetryable).toBe(false);
    });
  });

  describe('Retry-After Header Parsing', () => {
    it('parses integer seconds correctly', () => {
      expect(parseRetryAfterHeader('30')).toBe(30);
      expect(parseRetryAfterHeader('  120  ')).toBe(120);
      expect(parseRetryAfterHeader('0')).toBe(0);
    });

    it('parses valid HTTP-date format correctly', () => {
      const futureDate = new Date(Date.now() + 45000).toUTCString();
      const seconds = parseRetryAfterHeader(futureDate);
      expect(seconds).toBeGreaterThanOrEqual(44);
      expect(seconds).toBeLessThanOrEqual(46);
    });

    it('returns 0 for expired HTTP-date in the past', () => {
      const pastDate = new Date(Date.now() - 10000).toUTCString();
      expect(parseRetryAfterHeader(pastDate)).toBe(0);
    });

    it('returns undefined for invalid or missing header values', () => {
      expect(parseRetryAfterHeader(undefined)).toBeUndefined();
      expect(parseRetryAfterHeader(null)).toBeUndefined();
      expect(parseRetryAfterHeader('')).toBeUndefined();
      expect(parseRetryAfterHeader('not-a-valid-date-or-number')).toBeUndefined();
    });
  });

  describe('isRetryableCategory helper', () => {
    it('correctly maps retryability for all categories', () => {
      expect(isRetryableCategory('RATE_LIMITED')).toBe(true);
      expect(isRetryableCategory('QUOTA_EXCEEDED')).toBe(true);
      expect(isRetryableCategory('TIMEOUT')).toBe(true);
      expect(isRetryableCategory('NETWORK_ERROR')).toBe(true);
      expect(isRetryableCategory('PROVIDER_UNAVAILABLE')).toBe(true);

      expect(isRetryableCategory('AUTHENTICATION_ERROR')).toBe(false);
      expect(isRetryableCategory('INVALID_REQUEST')).toBe(false);
      expect(isRetryableCategory('MODEL_UNAVAILABLE')).toBe(false);
      expect(isRetryableCategory('UNSUPPORTED_CAPABILITY')).toBe(false);
      expect(isRetryableCategory('UNKNOWN_PROVIDER_ERROR')).toBe(false);
    });
  });

  describe('Sanitization & Safe Serialization', () => {
    it('masks Bearer tokens and API keys in error strings', () => {
      const raw = 'Failed with Bearer sk-1234567890abcdef and key=ai-super-secret-key-123456';
      const sanitized = sanitizeErrorString(raw);

      expect(sanitized).not.toContain('sk-1234567890abcdef');
      expect(sanitized).not.toContain('ai-super-secret-key-123456');
      expect(sanitized).toContain('Bearer ***');
      expect(sanitized).toContain('key=***');
    });

    it('toSafeJSON returns structured error preserving retryAfterSeconds without sensitive fields', () => {
      const error = new AIProviderError({
        category: 'RATE_LIMITED',
        provider: 'groq',
        message: 'Rate limit exceeded with key=secret-key',
        statusCode: 429,
        isRetryable: true,
        retryAfterSeconds: 25,
      });

      const safe = error.toSafeJSON();
      expect(safe.category).toBe('RATE_LIMITED');
      expect(safe.provider).toBe('groq');
      expect(safe.statusCode).toBe(429);
      expect(safe.retryAfterSeconds).toBe(25);
      expect(safe.message).toBe('Rate limit exceeded with key=***');
      expect(safe).not.toHaveProperty('originalError');
    });
  });
});
