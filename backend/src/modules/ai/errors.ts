import type { AIErrorCategory, AIProviderId } from './types';

export interface AIProviderErrorOptions {
  category: AIErrorCategory;
  provider: AIProviderId;
  message: string;
  statusCode?: number;
  isRetryable?: boolean;
  retryAfterSeconds?: number;
  originalError?: unknown;
}

export class AIProviderError extends Error {
  public readonly category: AIErrorCategory;
  public readonly provider: AIProviderId;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;
  public readonly retryAfterSeconds?: number;
  public readonly originalError?: unknown;

  constructor(options: AIProviderErrorOptions) {
    super(options.message);
    this.name = 'AIProviderError';
    this.category = options.category;
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? isRetryableCategory(options.category);
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.originalError = options.originalError;
    Object.setPrototypeOf(this, AIProviderError.prototype);
  }

  /**
   * Safe serialization that strips API keys, Authorization headers, and sensitive fields.
   */
  public toSafeJSON(): {
    name: string;
    category: AIErrorCategory;
    provider: AIProviderId;
    message: string;
    statusCode?: number;
    isRetryable: boolean;
    retryAfterSeconds?: number;
  } {
    return {
      name: this.name,
      category: this.category,
      provider: this.provider,
      message: sanitizeErrorString(this.message),
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

export class AllProvidersFailedError extends Error {
  public readonly attempts: Array<{
    provider: AIProviderId;
    category: AIErrorCategory;
    message: string;
    retryAfterSeconds?: number;
  }>;

  constructor(
    message: string,
    attempts: Array<{
      provider: AIProviderId;
      category: AIErrorCategory;
      message: string;
      retryAfterSeconds?: number;
    }>
  ) {
    super(message);
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
    Object.setPrototypeOf(this, AllProvidersFailedError.prototype);
  }
}

export class AllCredentialsExhaustedError extends AIProviderError {
  constructor(provider: AIProviderId, message?: string, retryAfterSeconds?: number) {
    super({
      category: 'QUOTA_EXCEEDED',
      provider,
      message:
        message ??
        `All configured API credentials for provider "${provider}" are currently exhausted or cooling down.`,
      statusCode: 429,
      isRetryable: true,
      retryAfterSeconds,
    });
    this.name = 'AllCredentialsExhaustedError';
    Object.setPrototypeOf(this, AllCredentialsExhaustedError.prototype);
  }
}

/**
 * Determines default retryability for a given error category.
 */
export function isRetryableCategory(category: AIErrorCategory): boolean {
  switch (category) {
    case 'RATE_LIMITED':
    case 'QUOTA_EXCEEDED':
    case 'TIMEOUT':
    case 'NETWORK_ERROR':
    case 'PROVIDER_UNAVAILABLE':
      return true;
    case 'AUTHENTICATION_ERROR':
    case 'INVALID_REQUEST':
    case 'MODEL_UNAVAILABLE':
    case 'UNSUPPORTED_CAPABILITY':
    case 'UNKNOWN_PROVIDER_ERROR':
    default:
      return false;
  }
}

/**
 * Strips common secrets/keys from error messages before exposure or logging.
 */
export function sanitizeErrorString(text: string): string {
  if (!text) return '';
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9_\-.]+/gi, '$1***')
    .replace(/(key=)[A-Za-z0-9_\-.]+/gi, '$1***')
    .replace(/(x-goog-api-key['"]?\s*[:=]\s*['"]?)[A-Za-z0-9_\-.]+/gi, '$1***')
    .replace(/(api[_-]?key['"]?\s*[:=]\s*['"]?)[A-Za-z0-9_\-.]+/gi, '$1***');
}

export interface ClassifiedHttpError {
  category: AIErrorCategory;
  isRetryable: boolean;
  message: string;
  reason?: 'quota_exhausted' | 'account_restricted' | 'model_permission' | 'general_forbidden';
}

/**
 * Normalizes HTTP status codes and provider error responses into an AIErrorCategory.
 */
export function classifyHttpError(
  statusCode: number,
  responseBody?: unknown
): ClassifiedHttpError {
  const bodyString =
    typeof responseBody === 'object' && responseBody !== null
      ? JSON.stringify(responseBody).toLowerCase()
      : String(responseBody || '').toLowerCase();

  const isQuotaRelated =
    bodyString.includes('quota') ||
    bodyString.includes('insufficient_quota') ||
    bodyString.includes('resource_exhausted') ||
    bodyString.includes('resource exhausted') ||
    bodyString.includes('credit') ||
    bodyString.includes('billing') ||
    bodyString.includes('balance') ||
    bodyString.includes('10016') ||
    bodyString.includes('usage_limit') ||
    bodyString.includes('insufficient_credits') ||
    bodyString.includes('exceeded your current quota');

  // 1. HTTP 429: Rate limit vs Quota exhaustion
  if (
    statusCode === 429 ||
    bodyString.includes('rate_limit') ||
    bodyString.includes('rate limit') ||
    bodyString.includes('too many requests')
  ) {
    if (isQuotaRelated) {
      return {
        category: 'QUOTA_EXCEEDED',
        isRetryable: true,
        message: 'Provider quota exhausted or credit balance depleted.',
        reason: 'quota_exhausted',
      };
    }
    return {
      category: 'RATE_LIMITED',
      isRetryable: true,
      message: 'Provider rate limit exceeded. Please retry later.',
    };
  }

  // 2. HTTP 403: Differentiate quota exhaustion, account usage restrictions, model permissions, and general forbidden
  if (statusCode === 403) {
    // A. Model permission / access restrictions -> non-retryable, do NOT rotate keys
    const isModelPermission =
      (bodyString.includes('model') &&
        (bodyString.includes('access') ||
          bodyString.includes('permission') ||
          bodyString.includes('not allowed') ||
          bodyString.includes('agreement') ||
          bodyString.includes('entitlement') ||
          bodyString.includes('restricted'))) ||
      bodyString.includes('10014') ||
      bodyString.includes('model_not_allowed') ||
      bodyString.includes('permission_denied on model');

    if (isModelPermission) {
      return {
        category: 'UNSUPPORTED_CAPABILITY',
        isRetryable: false,
        message: 'Access to this model is restricted or requires elevated provider permissions.',
        reason: 'model_permission',
      };
    }

    // B. Quota exhaustion -> retryable, rotate keys
    if (isQuotaRelated) {
      return {
        category: 'QUOTA_EXCEEDED',
        isRetryable: true,
        message: 'Provider access blocked due to quota exhaustion or billing limit.',
        reason: 'quota_exhausted',
      };
    }

    // C. Account usage restrictions (e.g. region, tier, project status) -> retryable across different accounts/keys
    const isAccountRestriction =
      bodyString.includes('account_restricted') ||
      bodyString.includes('account deactivated') ||
      bodyString.includes('region') ||
      bodyString.includes('tier_restricted') ||
      bodyString.includes('plan restriction') ||
      bodyString.includes('project_usage_restricted') ||
      bodyString.includes('account does not have access');

    if (isAccountRestriction) {
      return {
        category: 'QUOTA_EXCEEDED',
        isRetryable: true,
        message: 'Account-specific usage restriction encountered. Key rotation eligible.',
        reason: 'account_restricted',
      };
    }

    // D. General forbidden -> non-retryable, do NOT blindly rotate through credentials
    return {
      category: 'AUTHENTICATION_ERROR',
      isRetryable: false,
      message: 'Forbidden: Request rejected by provider (403 Forbidden).',
      reason: 'general_forbidden',
    };
  }

  // 3. HTTP 401: Authentication failure
  if (statusCode === 401 || bodyString.includes('unauthorized') || bodyString.includes('invalid api key')) {
    return {
      category: 'AUTHENTICATION_ERROR',
      isRetryable: false,
      message: 'Provider authentication failed or API key is invalid.',
    };
  }

  // 4. Model Not Found / Unavailable
  if (
    statusCode === 404 ||
    bodyString.includes('model_not_found') ||
    bodyString.includes('does not exist') ||
    bodyString.includes('not found') ||
    bodyString.includes('unknown model')
  ) {
    return {
      category: 'MODEL_UNAVAILABLE',
      isRetryable: false,
      message: 'Specified AI model is unavailable or does not exist for this provider.',
    };
  }

  // 5. Invalid Request
  if (statusCode === 400 || statusCode === 422) {
    return {
      category: 'INVALID_REQUEST',
      isRetryable: false,
      message: 'The AI request was rejected by the provider due to invalid parameters.',
    };
  }

  // 6. Timeout
  if (statusCode === 408) {
    return {
      category: 'TIMEOUT',
      isRetryable: true,
      message: 'Provider request timed out.',
    };
  }

  // 7. Provider Unavailable (5xx)
  if (statusCode >= 500 && statusCode < 600) {
    return {
      category: 'PROVIDER_UNAVAILABLE',
      isRetryable: true,
      message: `Provider server error (${statusCode}). Service is temporarily unavailable.`,
    };
  }

  return {
    category: 'UNKNOWN_PROVIDER_ERROR',
    isRetryable: false,
    message: `Unknown provider error with HTTP status ${statusCode}.`,
  };
}
