// ============================================================================
// Cost Tracking and Quota Management
// ============================================================================

import { logWithContext } from './log';
import type { Env } from './types';

// ============================================================================
// Types
// ============================================================================

export interface UsageRecord {
  sessionId: string;
  timestamp: number;
  apiCalls: number;
  tokensUsed: number;
  costEstimate: number;
  repository?: string;
}

export interface DailyUsage {
  date: string;
  totalTokens: number;
  totalCost: number;
  apiCalls: number;
  sessionCount: number;
}

export interface QuotaConfig {
  maxDailyTokens: number;
  maxDailyCost: number;
  maxConcurrentSessions: number;
}

export interface QuotaStatus {
  allowed: boolean;
  reason?: string;
  remainingTokens: number;
  remainingCost: number;
  activeSessions: number;
  maxConcurrentSessions: number;
}

// ============================================================================
// Pricing Constants (Claude API pricing as of 2025)
// ============================================================================

const PRICING = {
  sonnet: {
    input: 3.0 / 1_000_000,  // $3 per million tokens
    output: 15.0 / 1_000_000, // $15 per million tokens
  },
  opus: {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
  },
  haiku: {
    input: 1.0 / 1_000_000,
    output: 5.0 / 1_000_000,
  },
};

const DEFAULT_MODEL = 'sonnet';

// ============================================================================
// Quota Configuration
// ============================================================================

export const DEFAULT_QUOTA: QuotaConfig = {
  maxDailyTokens: 1_000_000,  // 1M tokens per day
  maxDailyCost: 50,           // $50 per day
  maxConcurrentSessions: 5,   // Max 5 concurrent interactive sessions
};

// ============================================================================
// Cost Estimation
// ============================================================================

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string = DEFAULT_MODEL
): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING.sonnet;
  return (inputTokens * pricing.input) + (outputTokens * pricing.output);
}

export function parseTokensFromCliOutput(output: string): { input: number; output: number } | null {
  // Try to extract token usage from CLI output
  // Format: "Usage: {input: 1000, output: 500}" or similar
  const usageMatch = output.match(/(?:usage|tokens).*?:\s*\{[^}]*\}/i);
  if (usageMatch) {
    try {
      const parsed = JSON.parse(usageMatch[0].replace(/^[^:]+:\s*/, ''));
      return {
        input: parsed.input_tokens || parsed.input || 0,
        output: parsed.output_tokens || parsed.output || 0,
      };
    } catch {
      // Fall through to regex approach
    }
  }

  // Alternative: look for token counts in text
  const inputMatch = output.match(/input[_\s]?tokens?\s*[:=]\s*(\d+)/i);
  const outputMatch = output.match(/output[_\s]?tokens?\s*[:=]\s*(\d+)/i);

  if (inputMatch || outputMatch) {
    return {
      input: inputMatch ? parseInt(inputMatch[1], 10) : 0,
      output: outputMatch ? parseInt(outputMatch[1], 10) : 0,
    };
  }

  // Default estimation if we can't parse
  logWithContext('COST_TRACKING', 'Could not parse token usage, using default estimation');
  return { input: 1000, output: 500 };
}

// ============================================================================
// Usage Tracking (in-memory for now, can be migrated to D1/DurableObject)
// ============================================================================

class UsageTracker {
  private dailyUsage: Map<string, DailyUsage> = new Map();
  private activeSessions: Set<string> = new Set();

  getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    const today = this.getTodayKey();
    let usage = this.dailyUsage.get(today);

    if (!usage) {
      usage = {
        date: today,
        totalTokens: 0,
        totalCost: 0,
        apiCalls: 0,
        sessionCount: 0,
      };
      this.dailyUsage.set(today, usage);
    }

    usage.totalTokens += record.tokensUsed;
    usage.totalCost += record.costEstimate;
    usage.apiCalls += record.apiCalls;
    usage.sessionCount += 1;

    // Clean up old entries (keep last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffKey = sevenDaysAgo.toISOString().split('T')[0];

    for (const [key] of this.dailyUsage) {
      if (key < cutoffKey) {
        this.dailyUsage.delete(key);
      }
    }

    logWithContext('USAGE_TRACKER', 'Usage recorded', {
      sessionId: record.sessionId,
      tokensUsed: record.tokensUsed,
      costEstimate: record.costEstimate,
      dailyTotal: usage.totalCost,
    });
  }

  getTodayUsage(): DailyUsage {
    const today = this.getTodayKey();
    return this.dailyUsage.get(today) || {
      date: today,
      totalTokens: 0,
      totalCost: 0,
      apiCalls: 0,
      sessionCount: 0,
    };
  }

  async checkQuota(config: QuotaConfig = DEFAULT_QUOTA): Promise<QuotaStatus> {
    const usage = this.getTodayUsage();

    const remainingTokens = Math.max(0, config.maxDailyTokens - usage.totalTokens);
    const remainingCost = Math.max(0, config.maxDailyCost - usage.totalCost);
    const activeSessions = this.activeSessions.size;

    let allowed = true;
    let reason: string | undefined;

    if (usage.totalTokens >= config.maxDailyTokens) {
      allowed = false;
      reason = 'Daily token limit exceeded';
    } else if (usage.totalCost >= config.maxDailyCost) {
      allowed = false;
      reason = 'Daily cost limit exceeded';
    } else if (activeSessions >= config.maxConcurrentSessions) {
      allowed = false;
      reason = 'Maximum concurrent sessions reached';
    }

    return {
      allowed,
      reason,
      remainingTokens,
      remainingCost,
      activeSessions,
      maxConcurrentSessions: config.maxConcurrentSessions,
    };
  }

  startSession(sessionId: string): void {
    this.activeSessions.add(sessionId);
    logWithContext('USAGE_TRACKER', 'Session started', { sessionId });
  }

  endSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    logWithContext('USAGE_TRACKER', 'Session ended', { sessionId });
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}

// Singleton instance
const usageTracker = new UsageTracker();

export { usageTracker };

// ============================================================================
// Public API
// ============================================================================

export async function checkQuota(env: Env, config?: QuotaConfig): Promise<QuotaStatus> {
  return usageTracker.checkQuota(config);
}

export async function recordUsage(env: Env, record: UsageRecord): Promise<void> {
  await usageTracker.recordUsage(record);
}

export function startSession(sessionId: string): void {
  usageTracker.startSession(sessionId);
}

export function endSession(sessionId: string): void {
  usageTracker.endSession(sessionId);
}

export function getUsageStats(env: Env): {
  today: DailyUsage;
  activeSessions: number;
  quotaStatus: QuotaStatus;
} {
  const today = usageTracker.getTodayUsage();
  const activeSessions = usageTracker.getActiveSessionCount();

  return {
    today,
    activeSessions,
    quotaStatus: {
      allowed: today.totalTokens < DEFAULT_QUOTA.maxDailyTokens,
      remainingTokens: Math.max(0, DEFAULT_QUOTA.maxDailyTokens - today.totalTokens),
      remainingCost: Math.max(0, DEFAULT_QUOTA.maxDailyCost - today.totalCost),
      activeSessions,
      maxConcurrentSessions: DEFAULT_QUOTA.maxConcurrentSessions,
    },
  };
}

// ============================================================================
// CLI Result Cost Calculator
// ============================================================================

export interface CLIResult {
  type: string;
  subtype: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export function calculateCostFromCliResult(result: CLIResult): number {
  // If CLI provides cost directly, use it
  if (result.total_cost_usd) {
    return result.total_cost_usd;
  }

  // Otherwise, estimate from usage data
  if (result.usage) {
    return estimateCost(
      result.usage.input_tokens || 0,
      result.usage.output_tokens || 0
    );
  }

  // Parse from result text
  const tokens = parseTokensFromCliOutput(result.result || '');
  if (tokens) {
    return estimateCost(tokens.input, tokens.output);
  }

  // Rough estimation based on turns (assume ~2k tokens per turn)
  const estimatedTokens = (result.num_turns || 1) * 2000;
  return estimateCost(estimatedTokens, estimatedTokens);
}

export function createUsageRecordFromCliResult(
  result: CLIResult,
  repository?: string
): UsageRecord {
  const cost = calculateCostFromCliResult(result);

  let tokensUsed = 0;
  if (result.usage) {
    tokensUsed = (result.usage.input_tokens || 0) + (result.usage.output_tokens || 0);
  } else {
    // Estimate from cost
    tokensUsed = Math.round(cost / PRICING.sonnet.input);
  }

  return {
    sessionId: result.session_id || 'unknown',
    timestamp: Date.now(),
    apiCalls: result.num_turns || 1,
    tokensUsed,
    costEstimate: cost,
    repository,
  };
}
