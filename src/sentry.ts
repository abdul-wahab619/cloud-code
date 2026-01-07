/**
 * Sentry Error Monitoring Integration
 *
 * Provides error tracking and performance monitoring for Cloudflare Workers.
 * Docs: https://docs.sentry.io/platforms/javascript/guides/cloudflare-workers/
 */

import * as Sentry from '@sentry/cloudflare';
import { captureException, captureMessage, startSpan, withIsolationScope } from '@sentry/cloudflare';
import type { Context } from '@sentry/types';
import { logWithContext } from './log';
import type { Env } from './types';

// ============================================================================
// Configuration
// ============================================================================

const VERSION = '1.0.3';

/**
 * Check if Sentry is enabled for the given environment
 */
export function isSentryEnabled(env: Env): boolean {
  const dsn = env.SENTRY_DSN || '';
  return !!dsn && dsn !== 'https://dummyPublicKey@o0.ingest.sentry.io/0';
}

/**
 * Get Sentry configuration from the environment
 */
export function getSentryConfig(env: Env) {
  const dsn = env.SENTRY_DSN || '';
  const environment = env.ENVIRONMENT || 'production';
  const tracesSampleRate = parseFloat(env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
  const profilesSampleRate = parseFloat(env.SENTRY_PROFILES_SAMPLE_RATE || '0.1');

  return {
    dsn,
    environment,
    tracesSampleRate,
    profilesSampleRate,
    release: `cloud-code@${VERSION}`
  };
}

/**
 * Initialize Sentry for a request
 * This must be called at the start of each request to set up the Sentry context
 */
export function initSentry(env: Env, request: Request): void {
  if (!isSentryEnabled(env)) {
    return;
  }

  const config = getSentryConfig(env);

  Sentry.init({
    ...config,
    beforeSend: (event) => {
      // Filter out sensitive data
      if (event.request) {
        delete event.request.cookies;
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers['x-api-key'];
          delete event.request.headers['cookie'];
        }
      }
      return event;
    }
  });

  // Add request context
  addRequestBreadcrumb('request', `Incoming ${request.method} request to ${new URL(request.url).pathname}`, {
    method: request.method,
    url: request.url,
    cfRay: request.headers.get('cf-ray')
  });
}

// ============================================================================
// Error Capturing
// ============================================================================

/**
 * Capture an exception and send it to Sentry
 */
export function captureError(error: Error | unknown, context?: Context): void {
  logWithContext('SENTRY', 'Capturing error', { error, context });

  if (error instanceof Error) {
    captureException(error, {
      user: context?.user,
      tags: context?.tags,
      extra: context?.extra
    });
  } else {
    captureMessage(String(error), 'error');
  }
}

/**
 * Capture a message and send it to Sentry
 */
export function captureMessageLevel(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Context
): void {
  logWithContext('SENTRY', `Capturing ${level} message`, { message });

  captureMessage(message, {
    level,
    user: context?.user,
    tags: context?.tags,
    extra: context?.extra
  });
}

// ============================================================================
// Performance Monitoring
// ============================================================================

/**
 * Wrap a function with performance monitoring
 */
export async function withPerformanceTracking<T>(
  operation: string,
  fn: () => Promise<T>,
  description?: string
): Promise<T> {
  return startSpan(
    {
      op: operation,
      description: description || operation,
      name: description || operation
    },
    async (span) => {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        if (span) {
          span.setStatus({ code: 2, message: 'internal_error' });
        }
        throw error;
      }
    }
  );
}

/**
 * Set user context for Sentry
 */
export function setSentryUser(user: { id: string; email?: string; username?: string }): void {
  withIsolationScope((scope) => {
    scope.setUser(user);
  });
}

/**
 * Set tags for Sentry context
 */
export function setSentryTags(tags: Record<string, string | number | boolean>): void {
  withIsolationScope((scope) => {
    scope.setTags(tags);
  });
}

/**
 * Set extra data for Sentry context
 */
export function setSentryExtra(data: Record<string, unknown>): void {
  withIsolationScope((scope) => {
    scope.setExtras(data);
  });
}

// ============================================================================
// Request Context Helpers
// ============================================================================

/**
 * Extract request context for Sentry
 */
export function extractRequestContext(request: Request): {
  url: string;
  method: string;
  headers: Record<string, string>;
  cfRay?: string;
  country?: string;
} {
  const url = new URL(request.url);
  const cfRay = request.headers.get('cf-ray');
  const country = request.headers.get('cf-ipcountry');

  return {
    url: url.href,
    method: request.method,
    headers: Object.fromEntries(
      Array.from(request.headers.entries()).filter(
        ([key]) =>
          ![
            'authorization',
            'cookie',
            'x-api-key',
            'set-cookie'
          ].includes(key.toLowerCase())
      )
    ),
    cfRay: cfRay || undefined,
    country: country || undefined
  };
}

/**
 * Add breadcrumbs for request tracking
 */
export function addRequestBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  withIsolationScope((scope) => {
    scope.addBreadcrumb({
      category,
      message,
      level: 'info',
      data
    });
  });
}

// ============================================================================
// Health Check Integration
// ============================================================================

export function getSentryStatus(env: Env) {
  return {
    enabled: isSentryEnabled(env),
    dsnConfigured: !!env.SENTRY_DSN,
    environment: env.ENVIRONMENT || 'unknown',
    tracesSampleRate: parseFloat(env.SENTRY_TRACES_SAMPLE_RATE || '0.1')
  };
}
