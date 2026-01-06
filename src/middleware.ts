// ============================================================================
// Middleware for Cloudflare Workers
// ============================================================================

import { logWithContext } from './log';

// ============================================================================
// Types
// ============================================================================

export interface Env {
  MY_CONTAINER: DurableObjectNamespace<any>;
  GITHUB_APP_CONFIG: DurableObjectNamespace<any>;
  INTERACTIVE_SESSIONS: DurableObjectNamespace<any>;
  DASHBOARD_ASSETS?: Fetcher;
  RATE_LIMIT_KV?: KVNamespace;
  ENCRYPTION_KEY?: string;
}

export interface MiddlewareContext {
  request: Request;
  url: URL;
  env: Env;
}

export type MiddlewareHandler = (
  context: MiddlewareContext,
  next: () => Promise<Response>
) => Promise<Response>;

// ============================================================================
// Configuration
// ============================================================================

export const CONFIG = {
  // Rate limiting (requests per time window)
  RATE_LIMIT: {
    perMinute: 60,
    perHour: 1000,
    perDay: 5000,
  },

  // Request size limits
  MAX_REQUEST_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_PROMPT_LENGTH: 10000, // 10k characters

  // CORS
  ALLOWED_ORIGINS: [
    'https://cloud-code.finhub.workers.dev',
    'http://localhost:8787',
    'http://localhost:3000',
  ],

  // Cost quotas (tokens per day)
  QUOTA: {
    maxDailyTokens: 1000000, // 1M tokens per day
    maxDailyCost: 50, // $50 per day in USD
    maxConcurrentSessions: 5,
  },
};

// ============================================================================
// Error Types
// ============================================================================

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public userMessage?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, userMessage?: string) {
    super(message, 400, 'VALIDATION_ERROR', userMessage);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(
      'Rate limit exceeded',
      429,
      'RATE_LIMIT_EXCEEDED',
      'Too many requests. Please try again later.'
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }

  retryAfter?: number;
}

export class QuotaExceededError extends AppError {
  constructor(userMessage?: string) {
    super(
      'Quota exceeded',
      429,
      'QUOTA_EXCEEDED',
      userMessage || 'Daily quota exceeded. Please try again tomorrow.'
    );
    this.name = 'QuotaExceededError';
  }
}

// ============================================================================
// Error Response Builder
// ============================================================================

export function errorResponse(error: unknown, context?: string): Response {
  logWithContext('ERROR_HANDLER', 'Error occurred', {
    context,
    error: error instanceof Error ? error.message : String(error),
    type: error instanceof Error ? error.constructor.name : typeof error,
  });

  if (error instanceof AppError) {
    return new Response(JSON.stringify({
      error: error.code,
      message: error.userMessage || error.message,
      timestamp: new Date().toISOString(),
    }), {
      status: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (error instanceof Error) {
    // Don't expose internal error messages to users
    return new Response(JSON.stringify({
      error: 'INTERNAL_ERROR',
      message: 'An internal error occurred. Please try again later.',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    error: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred.',
    timestamp: new Date().toISOString(),
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// CORS Middleware
// ============================================================================

export function withCors(allowedOrigins: string[] = CONFIG.ALLOWED_ORIGINS): MiddlewareHandler {
  return async (context: MiddlewareContext, next: () => Promise<Response>) => {
    const origin = context.request.headers.get('origin');

    // Check if origin is allowed
    const isAllowed = !origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*');

    const response = await next();

    // Add CORS headers
    const headers = new Headers(response.headers);
    if (isAllowed) {
      headers.set('Access-Control-Allow-Origin', origin || '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      headers.set('Access-Control-Max-Age', '86400');
    }
    headers.set('Access-Control-Expose-Headers', 'X-Request-ID, X-RateLimit-Remaining');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

export function handleOptions(): MiddlewareHandler {
  return async (context: MiddlewareContext) => {
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': context.request.headers.get('origin') || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    // If not OPTIONS, continue to next middleware
    return new Response('Method not allowed', { status: 405 });
  };
}

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

async function checkRateLimit(
  kv: KVNamespace | undefined,
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (!kv) {
    // No KV binding - allow all requests but log warning
    logWithContext('RATE_LIMIT', 'KV not configured, rate limiting disabled');
    return { allowed: true };
  }

  const now = Date.now();
  const entry = await kv.get<RateLimitEntry>(key, 'json');

  if (!entry || now > entry.resetAt) {
    // First request or window expired - create new entry
    await kv.put(key, JSON.stringify({
      count: 1,
      resetAt: now + windowMs,
    }), { expirationTtl: Math.ceil(windowMs / 1000) });
    return { allowed: true };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment counter
  await kv.put(key, JSON.stringify({
    count: entry.count + 1,
    resetAt: entry.resetAt,
  }), { expirationTtl: Math.ceil((entry.resetAt - now) / 1000) });

  return { allowed: true };
}

export function withRateLimit(identifier: string = 'global'): MiddlewareHandler {
  return async (context: MiddlewareContext, next: () => Promise<Response>) => {
    const { perMinute, perHour, perDay } = CONFIG.RATE_LIMIT;
    const kv = context.env.RATE_LIMIT_KV;

    // Check all rate limits
    const minuteKey = `${identifier}:minute:${Math.floor(Date.now() / 60000)}`;
    const hourKey = `${identifier}:hour:${Math.floor(Date.now() / 3600000)}`;
    const dayKey = `${identifier}:day:${Math.floor(Date.now() / 86400000)}`;

    const [minuteResult, hourResult, dayResult] = await Promise.all([
      checkRateLimit(kv, minuteKey, perMinute, 60000),
      checkRateLimit(kv, hourKey, perHour, 3600000),
      checkRateLimit(kv, dayKey, perDay, 86400000),
    ]);

    if (!minuteResult.allowed) {
      throw new RateLimitError(minuteResult.retryAfter);
    }
    if (!hourResult.allowed) {
      throw new RateLimitError(hourResult.retryAfter || 3600);
    }
    if (!dayResult.allowed) {
      throw new RateLimitError(dayResult.retryAfter || 86400);
    }

    const response = await next();

    // Add rate limit headers
    const headers = new Headers(response.headers);
    // Note: These are simplified - in production, query actual remaining counts
    headers.set('X-RateLimit-Limit', perMinute.toString());
    headers.set('X-RateLimit-Remaining', 'unknown');
    headers.set('X-RateLimit-Reset', Math.floor((Date.now() + 60000) / 1000).toString());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

// ============================================================================
// Request Size Limit Middleware
// ============================================================================

export function withRequestSizeLimit(maxBytes: number = CONFIG.MAX_REQUEST_SIZE): MiddlewareHandler {
  return async (context: MiddlewareContext, next: () => Promise<Response>) => {
    const contentLength = context.request.headers.get('content-length');

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > maxBytes) {
        throw new ValidationError(
          `Request body too large: ${size} bytes (max: ${maxBytes})`,
          'The request is too large. Please reduce the size of your request.'
        );
      }
    }

    return next();
  };
}

// ============================================================================
// Input Validation Middleware
// ============================================================================

export interface ValidationSchema {
  body?: {
    required?: string[];
    maxLength?: Record<string, number>;
    type?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
    pattern?: Record<string, RegExp>;
  };
  query?: {
    required?: string[];
    maxLength?: Record<string, number>;
  };
}

export function withValidation(schema: ValidationSchema): MiddlewareHandler {
  return async (context: MiddlewareContext, next: () => Promise<Response>) => {
    const { url } = context;

    // Validate query parameters
    if (schema.query) {
      const { required, maxLength } = schema.query;

      if (required) {
        for (const param of required) {
          if (!url.searchParams.has(param)) {
            throw new ValidationError(
              `Missing required query parameter: ${param}`,
              `Required parameter '${param}' is missing.`
            );
          }
        }
      }

      if (maxLength) {
        for (const [param, maxLen] of Object.entries(maxLength)) {
          const value = url.searchParams.get(param);
          if (value && value.length > maxLen) {
            throw new ValidationError(
              `Query parameter '${param}' too long: ${value.length} (max: ${maxLen})`,
              `Parameter '${param}' is too long.`
            );
          }
        }
      }
    }

    // Validate body
    if (schema.body && context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      const { required, maxLength, type, pattern } = schema.body;

      const contentType = context.request.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        throw new ValidationError(
          'Invalid content type',
          'Request body must be JSON.'
        );
      }

      try {
        const body = await context.request.json();

        if (required) {
          for (const field of required) {
            if (!(field in body)) {
              throw new ValidationError(
                `Missing required field: ${field}`,
                `Required field '${field}' is missing from the request body.`
              );
            }
          }
        }

        if (maxLength) {
          for (const [field, maxLen] of Object.entries(maxLength)) {
            const value = body[field];
            if (typeof value === 'string' && value.length > maxLen) {
              throw new ValidationError(
                `Field '${field}' too long: ${value.length} (max: ${maxLen})`,
                `Field '${field}' exceeds maximum length.`
              );
            }
          }
        }

        if (type) {
          for (const [field, expectedType] of Object.entries(type)) {
            const value = body[field];
            if (value !== undefined && typeof value !== expectedType) {
              throw new ValidationError(
                `Field '${field}' has wrong type: ${typeof value} (expected: ${expectedType})`,
                `Field '${field}' has an invalid type.`
              );
            }
          }
        }

        if (pattern) {
          for (const [field, regex] of Object.entries(pattern)) {
            const value = body[field];
            if (typeof value === 'string' && !regex.test(value)) {
              throw new ValidationError(
                `Field '${field}' does not match required pattern`,
                `Field '${field}' has an invalid format.`
              );
            }
          }
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        if (error instanceof SyntaxError) {
          throw new ValidationError('Invalid JSON', 'Request body is not valid JSON.');
        }
        // Re-throw other errors
        throw error;
      }
    }

    return next();
  };
}

// ============================================================================
// Security Headers Middleware
// ============================================================================

export function withSecurityHeaders(): MiddlewareHandler {
  return async (context: MiddlewareContext, next: () => Promise<Response>) => {
    const response = await next();

    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-XSS-Protection', '1; mode=block');
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

// ============================================================================
// Request ID Middleware
// ============================================================================

export function withRequestId(): MiddlewareHandler {
  return async (context: MiddlewareContext, next: () => Promise<Response>) => {
    const requestId = crypto.randomUUID();
    const response = await next();

    const headers = new Headers(response.headers);
    headers.set('X-Request-ID', requestId);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

// ============================================================================
// Middleware Composer
// ============================================================================

export function compose(...middlewares: MiddlewareHandler[]): MiddlewareHandler {
  return async (context: MiddlewareContext, final: () => Promise<Response>) => {
    let index = 0;

    const dispatch = async (i: number): Promise<Response> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i === middlewares.length) {
        return final();
      }

      const middleware = middlewares[i];
      return middleware(context, () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}

// ============================================================================
// Common Middleware Stacks
// ============================================================================

export const commonMiddleware = compose(
  withRequestId(),
  withSecurityHeaders(),
  withCors()
);

export const apiMiddleware = compose(
  withRequestId(),
  withSecurityHeaders(),
  withCors(),
  withRequestSizeLimit(),
  withRateLimit()
);

export const publicApiMiddleware = compose(
  withRequestId(),
  withSecurityHeaders(),
  withCors(),
  withRequestSizeLimit()
);
