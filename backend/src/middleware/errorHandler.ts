import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AIProviderError, AllProvidersFailedError } from '../modules/ai/errors';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // 2. Custom Application Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 3. Normalized AI Provider Errors
  if (err instanceof AIProviderError) {
    let statusCode = err.statusCode ?? 502;
    if (err.category === 'AUTHENTICATION_ERROR') statusCode = 502; // Internal provider auth misconfiguration
    else if (err.category === 'RATE_LIMITED' || err.category === 'QUOTA_EXCEEDED') statusCode = 429;
    else if (err.category === 'TIMEOUT') statusCode = 504;
    else if (err.category === 'INVALID_REQUEST') statusCode = 400;
    else if (err.category === 'MODEL_UNAVAILABLE') statusCode = 404;

    if (err.retryAfterSeconds) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }

    res.status(statusCode).json({
      success: false,
      error: {
        code: err.category,
        message: err.message,
        details: {
          provider: err.provider,
          isRetryable: err.isRetryable,
          ...(err.retryAfterSeconds && { retryAfterSeconds: err.retryAfterSeconds }),
        },
      },
    });
    return;
  }

  // 4. All AI Providers Failed (Background Failover Exhaustion)
  if (err instanceof AllProvidersFailedError) {
    res.status(503).json({
      success: false,
      error: {
        code: 'ALL_AI_PROVIDERS_UNAVAILABLE',
        message: err.message,
        details: {
          attempts: err.attempts,
        },
      },
    });
    return;
  }

  // 3. PostgreSQL Unique Constraint Violation (error code 23505)
  if ('code' in err && (err as { code: string }).code === '23505') {
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A record with the specified unique identifier already exists',
      },
    });
    return;
  }

  // 4. Default / Unhandled Server Errors
  console.error('Unhandled server error:', err);
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isDev ? err.message : 'An unexpected error occurred',
      ...(isDev && { details: err.stack }),
    },
  });
}
