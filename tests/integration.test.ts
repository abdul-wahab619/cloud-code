/**
 * Integration Tests for Claude Code Container
 *
 * Tests container communication, routing, and health monitoring.
 * These tests require a running Cloudflare Workers deployment.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ============================================================================
// Configuration
// ============================================================================

const WORKER_URL = 'https://claude-code-containers.finhub.workers.dev';

interface TestContext {
  baseUrl: string;
  metrics: {
    requestCount: number;
  };
}

const ctx: TestContext = {
  baseUrl: WORKER_URL,
  metrics: {
    requestCount: 0
  }
};

// ============================================================================
// Test Helpers
// ============================================================================

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${ctx.baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as T;
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(`${ctx.baseUrl}${path}`);
  return response.text();
}

// ============================================================================
// Health Check Tests
// ============================================================================

describe('Health Check', () => {
  it('GET /health returns health status', async () => {
    const health = await fetchJson<{
      status: string;
      timestamp: string;
      uptime: number;
      version: string;
      components: {
        durableObjects: { status: string; message: string };
        containers: { status: string; message: string };
        githubApp: { status: string; configured: boolean };
        claudeConfig: { status: string; configured: boolean };
      };
    }>('/health');

    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('timestamp');
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('version');
    expect(health.components).toHaveProperty('durableObjects');
    expect(health.components.durableObjects.status).toBe('operational');
  });

  it('GET /healthz also works (alias)', async () => {
    const health = await fetchJson<{ status: string }>('/healthz');
    expect(health).toHaveProperty('status');
  });
});

// ============================================================================
// Metrics Tests
// ============================================================================

describe('Metrics', () => {
  it('GET /metrics returns JSON metrics', async () => {
    const metrics = await fetchJson<{
      requests: { total: number; byRoute: Record<string, number>; byStatus: Record<string, number> };
      containers: { active: number; total: number; errors: number };
      averageResponseTime: number;
      deploymentStartTime: string;
      uptime: number;
      version: string;
    }>('/metrics');

    expect(metrics).toHaveProperty('requests');
    expect(metrics).toHaveProperty('containers');
    expect(metrics).toHaveProperty('averageResponseTime');
    expect(metrics).toHaveProperty('version');
    expect(metrics.requests.total).toBeGreaterThanOrEqual(0);
  });

  it('GET /metrics/prometheus returns Prometheus format', async () => {
    const text = await fetchText('/metrics/prometheus');

    expect(text).toContain('# HELP');
    expect(text).toContain('# TYPE');
    expect(text).toContain('claude_code_requests_total');
    expect(text).toContain('claude_code_containers_active');
    expect(text).toContain('claude_code_uptime_seconds');
  });
});

// ============================================================================
// Container Route Tests
// ============================================================================

describe('Container Routes', () => {
  it('GET /container returns health check', async () => {
    const response = await fetchJson<{
      status: string;
      message: string;
      instanceId: string;
    }>('/container');

    expect(response.status).toBe('healthy');
    expect(response).toHaveProperty('instanceId');
    expect(response).toHaveProperty('message');
  });

  it('GET /container/ works with trailing slash', async () => {
    const response = await fetchJson<{ status: string }>('/container/');
    expect(response.status).toBe('healthy');
  });

  it('GET /lb returns health check (load balanced)', async () => {
    const response = await fetchJson<{ status: string }>('/lb');
    expect(response.status).toBe('healthy');
  });

  it('GET /singleton returns health check', async () => {
    const response = await fetchJson<{ status: string }>('/singleton');
    expect(response.status).toBe('healthy');
  });

  it('GET /error returns test error (500)', async () => {
    const response = await fetch(`${ctx.baseUrl}/error`);
    expect(response.status).toBe(500);

    const text = await response.text();
    expect(text).toContain('test error');
  });

  it('GET /error/test works (edge case route)', async () => {
    const response = await fetch(`${ctx.baseUrl}/error/test`);
    expect(response.status).toBe(500);

    const text = await response.text();
    expect(text).toContain('test error');
  });

  it('POST /container/process-issue requires credentials', async () => {
    const response = await fetch(`${ctx.baseUrl}/container/process-issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    const text = await response.text();
    expect(text.toLowerCase()).toMatch(/api key|required|missing/);
  });
});

// ============================================================================
// Dashboard Tests
// ============================================================================

describe('Dashboard', () => {
  it('GET / serves home page', async () => {
    const text = await fetchText('/');
    expect(text).toContain('Claude Code Container');
  });

  it('GET /dashboard/ serves dashboard', async () => {
    const response = await fetch(`${ctx.baseUrl}/dashboard/`);
    expect(response.ok).toBe(true);
  });
});

// ============================================================================
// Interactive Mode Tests
// ============================================================================

describe('Interactive Mode', () => {
  it('POST /interactive/start requires API key', async () => {
    const response = await fetch(`${ctx.baseUrl}/interactive/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Test prompt'
      })
    });

    const data = await response.json() as { success: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('Claude API key');
  });

  it('POST /interactive/start requires prompt', async () => {
    const response = await fetch(`${ctx.baseUrl}/interactive/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json() as { success: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('prompt');
  });

  it('GET /interactive/status returns status (without sessionId returns error)', async () => {
    const response = await fetch(`${ctx.baseUrl}/interactive/status`);
    expect(response.status).toBe(400);
  });
});

// ============================================================================
// GitHub Setup Tests
// ============================================================================

describe('GitHub Setup', () => {
  it('GET /gh-status returns configuration status', async () => {
    const status = await fetchJson<{
      githubAppConfigured: boolean;
      claudeConfigured: boolean;
      repositoryCount: number;
      ready: boolean;
    }>('/gh-status');

    expect(status).toHaveProperty('githubAppConfigured');
    expect(status).toHaveProperty('claudeConfigured');
    expect(status).toHaveProperty('ready');
  });

  it('GET /gh-setup returns setup page', async () => {
    const text = await fetchText('/gh-setup');
    expect(text).toContain('GitHub');
    expect(text.toLowerCase()).toContain('setup');
  });

  it('GET /claude-setup returns setup page', async () => {
    const text = await fetchText('/claude-setup');
    expect(text).toContain('Claude');
    expect(text.toLowerCase()).toContain('api key');
  });
});

// ============================================================================
// Response Header Tests
// ============================================================================

describe('Response Headers', () => {
  it('responses include X-Response-Time header', async () => {
    const response = await fetch(`${ctx.baseUrl}/health`);
    expect(response.headers.get('X-Response-Time')).toBeTruthy();
  });

  it('responses include X-Request-Count header', async () => {
    const response = await fetch(`${ctx.baseUrl}/health`);
    const count = response.headers.get('X-Request-Count');
    expect(count).toBeTruthy();
    expect(parseInt(count || '0')).toBeGreaterThanOrEqual(0);
  });
});

// Export for running in other environments
export { ctx as testContext };
