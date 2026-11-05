import { AIProviderError } from './errors';
import type { AIProviderId } from './types';

export interface HttpRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  provider: AIProviderId;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  latencyMs: number;
  retryAfterSeconds?: number;
}

/**
 * Parses the HTTP `Retry-After` header value.
 * Supports both integer seconds (e.g. "30") and HTTP-date strings (e.g. "Wed, 21 Oct 2026 07:28:00 GMT").
 */
export function parseRetryAfterHeader(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;

  // 1. Numeric seconds
  const numericSeconds = Number(trimmed);
  if (!Number.isNaN(numericSeconds) && numericSeconds >= 0) {
    return Math.round(numericSeconds);
  }

  // 2. HTTP-date format
  const parsedDateMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedDateMs)) {
    const diffSeconds = Math.round((parsedDateMs - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : 0;
  }

  return undefined;
}

export async function executeAIHttpRequest<T = unknown>(
  options: HttpRequestOptions
): Promise<HttpResponse<T>> {
  const { url, method = 'POST', headers = {}, body, timeoutMs = 30000, provider } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`AI request to ${provider} timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const startTime = Date.now();

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startTime;
    clearTimeout(timer);

    const retryAfterHeader = res.headers && typeof res.headers.get === 'function'
      ? res.headers.get('retry-after')
      : undefined;
    const retryAfterSeconds = parseRetryAfterHeader(retryAfterHeader);

    let data: T;
    const text = await res.text();
    try {
      data = (text ? JSON.parse(text) : {}) as T;
    } catch {
      data = text as unknown as T;
    }

    return {
      status: res.status,
      data,
      latencyMs,
      retryAfterSeconds,
    };
  } catch (err: unknown) {
    clearTimeout(timer);

    const error = err as Error;
    const isTimeout =
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.toLowerCase().includes('timed out') ||
      error.message.toLowerCase().includes('aborted');

    if (isTimeout) {
      throw new AIProviderError({
        category: 'TIMEOUT',
        provider,
        message: `Request to ${provider} timed out after ${timeoutMs}ms.`,
        isRetryable: true,
        originalError: err,
      });
    }

    throw new AIProviderError({
      category: 'NETWORK_ERROR',
      provider,
      message: `Network communication failure when contacting ${provider}: ${error.message || 'Connection refused or unreachable.'}`,
      isRetryable: true,
      originalError: err,
    });
  }
}
