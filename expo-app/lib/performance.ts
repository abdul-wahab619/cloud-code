/**
 * Performance Monitoring and Optimization
 *
 * Utilities for monitoring and optimizing app performance.
 */

import { Performance } from 'react-native';
import { InteractionManager } from 'react-native';

// ============================================================================
// Types
// ============================================================================

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceReport {
  screenRender: PerformanceMetric[];
  apiCalls: PerformanceMetric[];
  memory: PerformanceMetric[];
  overall: {
    avgRenderTime: number;
    slowRenders: number;
    totalMetrics: number;
  };
}

// ============================================================================
// Performance Monitor
// ============================================================================

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private screenStartTime: number = 0;
  private screenName: string = '';

  /**
   * Start tracking screen render time
   */
  startScreenRender(screenName: string): void {
    this.screenName = screenName;
    this.screenStartTime = Date.now();
  }

  /**
   * End tracking screen render time
   */
  endScreenRender(): void {
    const duration = Date.now() - this.screenStartTime;
    this.metrics.push({
      name: `screen_render_${this.screenName}`,
      duration,
      timestamp: Date.now(),
    });

    // Warn about slow renders
    if (duration > 16) {
      console.warn(`[Performance] Slow render detected: ${this.screenName} took ${duration}ms`);
    }
  }

  /**
   * Track an API call
   */
  trackApiCall(endpoint: string, duration: number): void {
    this.metrics.push({
      name: `api_call_${endpoint}`,
      duration,
      timestamp: Date.now(),
      metadata: { endpoint },
    });

    if (duration > 3000) {
      console.warn(`[Performance] Slow API call: ${endpoint} took ${duration}ms`);
    }
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport {
    const screenMetrics = this.metrics.filter((m) => m.name.startsWith('screen_render'));
    const apiMetrics = this.metrics.filter((m) => m.name.startsWith('api_call'));

    const avgRenderTime =
      screenMetrics.length > 0
        ? screenMetrics.reduce((sum, m) => sum + m.duration, 0) / screenMetrics.length
        : 0;

    const slowRenders = screenMetrics.filter((m) => m.duration > 16).length;

    return {
      screenRender: screenMetrics,
      apiCalls: apiMetrics,
      memory: [],
      overall: {
        avgRenderTime,
        slowRenders,
        totalMetrics: this.metrics.length,
      },
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get metrics for export
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// ============================================================================
// Optimization Utilities
// ============================================================================

/**
 * Defer non-critical work until after interactions complete
 */
export function deferInteraction(callback: () => void): void {
  InteractionManager.runAfterInteractions(callback);
}

/**
 * Measure function execution time
 */
export function measurePerformance<T>(
  name: string,
  fn: () => T
): T {
  const start = Date.now();
  const result = fn();
  const duration = Date.now() - start;

  if (duration > 100) {
    console.warn(`[Performance] ${name} took ${duration}ms`);
  }

  return result;
}

/**
 * Measure async function execution time
 */
export async function measureAsyncPerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;

  if (duration > 100) {
    console.warn(`[Performance] ${name} took ${duration}ms`);
  }

  return result;
}

/**
 * Memoize expensive computations
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  getKey?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>) => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

// ============================================================================
// Bundle Size Monitoring
// ============================================================================

export interface BundleSizeReport {
  total: number;
  modules: number;
  vendor: number;
  images: number;
}

/**
 * Get bundle size information (web only)
 */
export function getBundleSize(): BundleSizeReport | null {
  if (typeof window === 'undefined') return null;

  const performance = (window as any).performance;
  if (!performance || !performance.getEntriesByType) return null;

  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

  let total = 0;
  let modules = 0;
  let vendor = 0;
  let images = 0;

  for (const resource of resources) {
    const size = resource.transferSize || resource.encodedBodySize || 0;
    total += size;

    if (resource.name.includes('chunks') || resource.name.includes('main.')) {
      modules += size;
    } else if (resource.name.includes('vendor')) {
      vendor += size;
    } else if (
      resource.name.includes('.png') ||
      resource.name.includes('.jpg') ||
      resource.name.includes('.svg')
    ) {
      images += size;
    }
  }

  return { total, modules, vendor, images };
}

// ============================================================================
// Singleton Export
// ============================================================================

export const performanceMonitor = new PerformanceMonitor();

export default {
  performanceMonitor,
  deferInteraction,
  measurePerformance,
  measureAsyncPerformance,
  memoize,
  debounce,
  throttle,
  getBundleSize,
};
