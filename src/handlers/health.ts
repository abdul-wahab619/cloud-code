/**
 * Health Check and Metrics Handler
 *
 * Provides container health monitoring and metrics endpoints.
 */

import { logWithContext } from '../log';
import { getUsageStats, DEFAULT_QUOTA } from '../quota';
import type { Env } from '../types';

// ============================================================================
// Types
// ============================================================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  components: {
    durableObjects: { status: string; message: string };
    containers: { status: string; message: string };
    githubApp: { status: string; configured: boolean };
    claudeApiKey: { status: string; configured: boolean };
    rateLimit: { status: string; configured: boolean };
  };
  metrics: {
    requests: {
      total: number;
      byRoute: Record<string, number>;
      byStatus: Record<string, number>;
      successRate: number;
    };
    containers: {
      active: number;
      total: number;
      errors: number;
    };
    averageResponseTime: number;
    errorRate: number;
  };
  quota: {
    dailyTokens: number;
    maxDailyTokens: number;
    remainingTokens: number;
    dailyCost: number;
    maxDailyCost: number;
    remainingCost: number;
    activeSessions: number;
    maxConcurrentSessions: number;
    allowed: boolean;
    reason?: string;
  };
  github?: {
    appId?: string;
    installationId?: string;
    repositoryCount: number;
    totalWebhooks: number;
    lastWebhookAt?: string;
  };
}

interface MetricsData {
  requests: {
    total: number;
    byRoute: Record<string, number>;
    byStatus: Record<string, number>;
  };
  containers: {
    active: number;
    total: number;
    errors: number;
  };
  averageResponseTime: number;
}

// In-memory metrics storage (reset on deployment)
const metrics: MetricsData = {
  requests: {
    total: 0,
    byRoute: {},
    byStatus: {}
  },
  containers: {
    active: 0,
    total: 0,
    errors: 0
  },
  averageResponseTime: 0
};

const deploymentStartTime = Date.now();
const VERSION = '1.0.0';
const ENVIRONMENT = (typeof process !== 'undefined' && process.env?.ENVIRONMENT) || 'production';

// ============================================================================
// Metrics Recording
// ============================================================================

export function recordRequest(route: string, status: number, responseTime: number): void {
  metrics.requests.total++;

  // Track by route
  const routeKey = route || 'unknown';
  metrics.requests.byRoute[routeKey] = (metrics.requests.byRoute[routeKey] || 0) + 1;

  // Track by status
  const statusKey = status.toString();
  metrics.requests.byStatus[statusKey] = (metrics.requests.byStatus[statusKey] || 0) + 1;

  // Track container errors
  if (status >= 500) {
    metrics.containers.errors++;
  }

  // Update average response time (exponential moving average)
  if (metrics.averageResponseTime === 0) {
    metrics.averageResponseTime = responseTime;
  } else {
    metrics.averageResponseTime = (metrics.averageResponseTime * 0.9) + (responseTime * 0.1);
  }
}

export function recordContainerStartup(): void {
  metrics.containers.total++;
  metrics.containers.active++;
}

export function recordContainerShutdown(): void {
  metrics.containers.active--;
}

export function getRequestCount(): number {
  return metrics.requests.total;
}

// ============================================================================
// Health Check Handler
// ============================================================================

export async function handleHealthCheck(_request: Request, env: Env): Promise<Response> {
  const uptime = Date.now() - deploymentStartTime;

  logWithContext('HEALTH_CHECK', 'Health check requested', { uptime });

  // Check GitHub App configuration
  const githubConfigId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
  const githubConfigDO = (env.GITHUB_APP_CONFIG as any).get(githubConfigId);
  const githubConfigResponse = await githubConfigDO.fetch(new Request('http://internal/get'));
  const githubConfig = await githubConfigResponse.json().catch(() => null);
  const githubConfigured = !!githubConfig && !!githubConfig.appId;

  // Check centralized Claude API key configuration
  const claudeKeyConfigured = !!env.ANTHROPIC_API_KEY;

  // Check rate limit configuration
  const rateLimitConfigured = !!env.RATE_LIMIT_KV;

  // Get quota and usage stats
  const usageStats = getUsageStats(env);

  // Get webhook stats
  const webhookStats = await getWebhookStats(env);

  // Determine overall health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (!githubConfigured && !claudeKeyConfigured) {
    status = 'degraded';
  }

  // Calculate error rate
  const errorCount = Object.entries(metrics.requests.byStatus)
    .filter(([code]) => parseInt(code, 10) >= 500)
    .reduce((sum, [, count]) => sum + count, 0);
  const errorRate = metrics.requests.total > 0 ? errorCount / metrics.requests.total : 0;

  if (errorRate > 0.5) {
    status = 'unhealthy';
  }

  // Check if quota allows operation
  if (!usageStats.quotaStatus.allowed) {
    status = 'degraded';
  }

  // Calculate success rate
  const successCount = metrics.requests.byStatus['200'] || 0;
  const successRate = metrics.requests.total > 0 ? successCount / metrics.requests.total : 1;

  const healthStatus: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    uptime,
    version: VERSION,
    environment: ENVIRONMENT,
    components: {
      durableObjects: { status: 'operational', message: 'Durable Objects accessible' },
      containers: { status: 'operational', message: `${metrics.containers.active} active containers` },
      githubApp: { status: githubConfigured ? 'configured' : 'not configured', configured: githubConfigured },
      claudeApiKey: { status: claudeKeyConfigured ? 'configured' : 'not configured', configured: claudeKeyConfigured },
      rateLimit: { status: rateLimitConfigured ? 'configured' : 'not configured', configured: rateLimitConfigured },
    },
    metrics: {
      requests: {
        total: metrics.requests.total,
        byRoute: metrics.requests.byRoute,
        byStatus: metrics.requests.byStatus,
        successRate,
      },
      containers: {
        active: metrics.containers.active,
        total: metrics.containers.total,
        errors: metrics.containers.errors,
      },
      averageResponseTime: metrics.averageResponseTime,
      errorRate,
    },
    quota: {
      dailyTokens: usageStats.today.totalTokens,
      maxDailyTokens: DEFAULT_QUOTA.maxDailyTokens,
      remainingTokens: usageStats.quotaStatus.remainingTokens,
      dailyCost: usageStats.today.totalCost,
      maxDailyCost: DEFAULT_QUOTA.maxDailyCost,
      remainingCost: usageStats.quotaStatus.remainingCost,
      activeSessions: usageStats.activeSessions,
      maxConcurrentSessions: DEFAULT_QUOTA.maxConcurrentSessions,
      allowed: usageStats.quotaStatus.allowed,
      reason: usageStats.quotaStatus.reason,
    },
    github: githubConfigured ? {
      appId: githubConfig.appId,
      installationId: githubConfig.installationId,
      repositoryCount: githubConfig.repositories?.length || 0,
      totalWebhooks: webhookStats?.totalWebhooks || 0,
      lastWebhookAt: webhookStats?.lastWebhookAt ?? undefined,
    } : undefined,
  };

  logWithContext('HEALTH_CHECK', 'Health check completed', {
    status,
    githubConfigured,
    claudeKeyConfigured,
    activeContainers: metrics.containers.active,
    quotaAllowed: usageStats.quotaStatus.allowed,
  });

  const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

  return Response.json(healthStatus, { status: httpStatus });
}

// ============================================================================
// Metrics Handler
// ============================================================================

export async function handleMetrics(_request: Request, env: Env): Promise<Response> {
  logWithContext('METRICS', 'Metrics requested');

  // Get webhook stats from GitHub config DO
  const webhookStats = await getWebhookStats(env);

  const metricsResponse = {
    ...metrics,
    deploymentStartTime: new Date(deploymentStartTime).toISOString(),
    uptime: Date.now() - deploymentStartTime,
    version: VERSION,
    webhookStats
  };

  return Response.json(metricsResponse);
}

// ============================================================================
// Prometheus Metrics Format
// ============================================================================

export async function handlePrometheusMetrics(_request: Request): Promise<Response> {
  const uptime = Date.now() - deploymentStartTime;

  const prometheusMetrics = [
    `# HELP claude_code_requests_total Total number of requests`,
    `# TYPE claude_code_requests_total counter`,
    `claude_code_requests_total ${metrics.requests.total}`,

    `# HELP claude_code_containers_active Number of active containers`,
    `# TYPE claude_code_containers_active gauge`,
    `claude_code_containers_active ${metrics.containers.active}`,

    `# HELP claude_code_containers_total Total containers created`,
    `# TYPE claude_code_containers_total counter`,
    `claude_code_containers_total ${metrics.containers.total}`,

    `# HELP claude_code_container_errors_total Number of container errors`,
    `# TYPE claude_code_container_errors_total counter`,
    `claude_code_container_errors_total ${metrics.containers.errors}`,

    `# HELP claude_code_average_response_time_ms Average response time in milliseconds`,
    `# TYPE claude_code_average_response_time_ms gauge`,
    `claude_code_average_response_time_ms ${metrics.averageResponseTime.toFixed(2)}`,

    `# HELP claude_code_uptime_seconds Uptime in seconds`,
    `# TYPE claude_code_uptime_seconds gauge`,
    `claude_code_uptime_seconds ${(uptime / 1000).toFixed(2)}`,

    ''
  ].join('\n');

  return new Response(prometheusMetrics, {
    headers: { 'Content-Type': 'text/plain; version=0.0.4' }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getWebhookStats(env: Env): Promise<{ totalWebhooks: number; lastWebhookAt: string | null } | null> {
  try {
    const configId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
    const configDO = (env.GITHUB_APP_CONFIG as any).get(configId);
    const response = await configDO.fetch(new Request('http://internal/get-webhook-stats', {
      method: 'GET'
    }));
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

// ============================================================================
// Middleware for Recording Metrics
// ============================================================================

export function createMetricsMiddleware() {
  return async (request: Request, env: Env, next: () => Promise<Response>): Promise<Response> => {
    const startTime = Date.now();
    const url = new URL(request.url);
    const route = url.pathname;

    let response: Response;

    try {
      response = await next();
    } catch (error) {
      response = new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const responseTime = Date.now() - startTime;

    // Record metrics
    recordRequest(route, response.status, responseTime);

    // Add metrics headers to response
    response.headers.set('X-Response-Time', `${responseTime}ms`);
    response.headers.set('X-Request-Count', metrics.requests.total.toString());

    return response;
  };
}
