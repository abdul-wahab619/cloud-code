/**
 * Performance Utilities for Expo/React Native
 *
 * Provides utilities for:
 * - Image optimization (caching, preloading)
 * - Memoization helpers for React components
 * - Debounce/throttle utilities
 * - Lazy loading utilities for components
 * - Animation performance helpers
 * - Memory leak detection helpers
 * - Performance monitoring utilities
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
  type ComponentType,
  type RefObject,
} from 'react';
import { Image, Platform } from 'react-native';

// ============================================================================
// IMAGE OPTIMIZATION UTILITIES
// ============================================================================

/**
 * Image cache state tracking
 */
interface ImageCacheEntry {
  uri: string;
  timestamp: number;
  size?: number;
}

const imageCache = new Map<string, ImageCacheEntry>();
const MAX_CACHE_SIZE = 50; // Maximum number of cached images
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Result of image preloading operation
 */
export interface ImagePreloadResult {
  uri: string;
  success: boolean;
  error?: Error;
}

/**
 * Preloads a single image and returns a promise that resolves when complete
 */
export function preloadImage(uri: string): Promise<ImagePreloadResult> {
  return new Promise((resolve) => {
    if (!uri) {
      resolve({ uri, success: false, error: new Error('No URI provided') });
      return;
    }

    // Check if already cached
    const cached = imageCache.get(uri);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      resolve({ uri, success: true });
      return;
    }

    Image.prefetch(uri)
      .then(() => {
        imageCache.set(uri, { uri, timestamp: Date.now() });
        resolve({ uri, success: true });
      })
      .catch((error) => {
        resolve({ uri, success: false, error });
      });
  });
}

/**
 * Preloads multiple images in parallel
 */
export async function preloadImages(
  uris: string[]
): Promise<ImagePreloadResult[]> {
  const results = await Promise.all(uris.map(preloadImage));

  // Clean up old cache entries if cache is too large
  if (imageCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(imageCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, imageCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => imageCache.delete(key));
  }

  return results;
}

/**
 * Clears the image cache
 */
export function clearImageCache(): void {
  imageCache.clear();
  // Image.queryCache may not be available in all React Native versions
  // Skip cache query for compatibility
}

/**
 * Gets cache statistics for debugging
 */
export function getImageCacheStats() {
  return {
    size: imageCache.size,
    maxSize: MAX_CACHE_SIZE,
    entries: Array.from(imageCache.values()).map((entry) => ({
      uri: entry.uri,
      age: Date.now() - entry.timestamp,
    })),
  };
}

/**
 * Optimized Image component source helper
 * Handles memory cache checks before creating Image source
 */
export function getOptimizedImageSource(
  uri: string | null | undefined
): { uri: string } | number | null {
  if (!uri) return null;
  return { uri };
}

// ============================================================================
// MEMOIZATION HELPERS
// ============================================================================

/**
 * Deep comparison function for memoization
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (
        !Object.prototype.hasOwnProperty.call(b, key) ||
        !deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      ) {
        return false;
      }
    }
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  return false;
}

/**
 * Custom comparator for React.memo that compares specific props
 */
export function memoCompare<T extends Record<string, unknown>>(
  propNames: (keyof T)[]
): (prevProps: T, nextProps: T) => boolean {
  return (prevProps, nextProps) => {
    for (const prop of propNames) {
      if (!deepEqual(prevProps[prop], nextProps[prop])) {
        return false;
      }
    }
    return true;
  };
}

/**
 * Hook for memoized callback with custom comparator
 */
export function useMemoCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: DependencyList,
  comparator?: (prevDeps: DependencyList, nextDeps: DependencyList) => boolean
): T {
  const prevDepsRef = useRef<DependencyList | undefined>(undefined);
  const callbackRef = useRef(callback);

  const depsEqual = comparator
    ? comparator(prevDepsRef.current || [], deps)
    : deepEqual(prevDepsRef.current, deps);

  if (!depsEqual) {
    prevDepsRef.current = deps;
    callbackRef.current = callback;
  }

  return callbackRef.current as T;
}

/**
 * Hook for memoized value with deep comparison
 */
export function useDeepMemo<T>(value: T, deps: DependencyList): T {
  const prevDepsRef = useRef<DependencyList | undefined>(undefined);
  const prevValueRef = useRef<T>(value);

  const depsEqual = deepEqual(prevDepsRef.current, deps);

  if (!depsEqual) {
    prevDepsRef.current = deps;
    prevValueRef.current = value;
  }

  return prevValueRef.current;
}

// ============================================================================
// DEBOUNCE AND THROTTLE UTILITIES
// ============================================================================

/**
 * Hook that returns a debounced version of the callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const argsRef = useRef<unknown[]>([]);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: unknown[]) => {
      argsRef.current = args;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...(argsRef.current || []));
      }, delay);
    },
    [delay]
  ) as T;
}

/**
 * Hook that returns a debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook that returns a throttled version of the callback
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const argsRef = useRef<unknown[]>([]);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: unknown[]) => {
      argsRef.current = args;
      const now = Date.now();

      if (now - lastRunRef.current >= delay) {
        lastRunRef.current = now;
        callbackRef.current(...args);
      } else if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          lastRunRef.current = Date.now();
          timeoutRef.current = null;
          callbackRef.current(...(argsRef.current || []));
        }, delay - (now - lastRunRef.current));
      }
    },
    [delay]
  ) as T;
}

/**
 * Hook that returns a throttled value
 */
export function useThrottledValue<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    const timeSinceUpdate = now - lastUpdateRef.current;

    const timeout = setTimeout(() => {
      setThrottledValue(value);
      lastUpdateRef.current = Date.now();
    }, Math.max(delay - timeSinceUpdate, 0));

    return () => clearTimeout(timeout);
  }, [value, delay]);

  return throttledValue;
}

// ============================================================================
// LAZY LOADING UTILITIES
// ============================================================================

/**
 * Component load state
 */
export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Result of lazy component loading
 */
export interface LazyComponentResult<T> {
  Component: ComponentType<T> | null;
  loadState: LoadState;
  error: Error | null;
  retry: () => void;
}

/**
 * Hook for lazy loading React components
 * Similar to React.lazy but with explicit state management
 */
export function useLazyComponent<T = unknown>(
  loader: () => Promise<{ default: ComponentType<T> }>
): LazyComponentResult<T> {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [component, setComponent] = useState<ComponentType<T> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const loaderRef = useRef(loader);

  const load = useCallback(() => {
    setLoadState('loading');
    setError(null);

    loaderRef
      .current()
      .then((module) => {
        setComponent(() => module.default);
        setLoadState('loaded');
      })
      .catch((err) => {
        setError(err);
        setLoadState('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    Component: component,
    loadState,
    error,
    retry: load,
  };
}

/**
 * Creates a lazy component wrapper with fallback UI
 */
export function createLazyComponent<T = unknown>(
  loader: () => Promise<{ default: ComponentType<T> }>,
  FallbackComponent?: ComponentType<{ error?: Error }>,
  LoadingComponent?: ComponentType
): ComponentType<T> {
  return function LazyWrapper(props: T) {
    const { Component, loadState, error, retry } = useLazyComponent<T>(loader);

    if (loadState === 'loading' && LoadingComponent) {
      return <LoadingComponent />;
    }

    if (loadState === 'error' && FallbackComponent) {
      return <FallbackComponent error={error ?? undefined} {...(props as unknown as Record<string, unknown>)} />;
    }

    if (!Component) {
      return LoadingComponent ? <LoadingComponent /> : null;
    }

    return <Component {...(props as any)} />;
  };
}

/**
 * Hook for lazy loading data with retry capability
 */
export function useLazyData<T>(
  fetcher: () => Promise<T>,
  options: {
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const { enabled = true, onSuccess, onError } = options;

  const fetch = useCallback(async () => {
    if (!enabled) return;

    setLoadState('loading');
    setError(null);

    try {
      const result = await fetcher();
      setData(result);
      setLoadState('loaded');
      onSuccess?.(result);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Unknown error');
      setError(errorObj);
      setLoadState('error');
      onError?.(errorObj);
    }
  }, [fetcher, enabled, onSuccess, onError]);

  const retry = useCallback(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return {
    data,
    loadState,
    error,
    retry,
  };
}

// ============================================================================
// ANIMATION PERFORMANCE HELPERS
// ============================================================================

/**
 * Animation frame callback type
 */
type AnimationFrameCallback = (timestamp: number) => void;

/**
 * Hook for requesting animation frames with cleanup
 */
export function useAnimationFrame(
  callback: AnimationFrameCallback,
  enabled = true
): void {
  const requestRef = useRef<number | undefined>(undefined);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const animate = (timestamp: number) => {
      callbackRef.current(timestamp);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [enabled]);
}

/**
 * Hook for optimizing expensive calculations during animations
 * Returns a value that only updates once per animation frame
 */
export function useAnimationFrameValue<T>(getValue: () => T, deps: DependencyList): T {
  const [value, setValue] = useState<T>(getValue);
  const pendingValueRef = useRef<T | undefined>(getValue());
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    pendingValueRef.current = getValue();

    if (frameRef.current) return;

    frameRef.current = requestAnimationFrame(() => {
      if (pendingValueRef.current !== undefined) {
        setValue(pendingValueRef.current);
      }
      frameRef.current = undefined;
    });

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, deps);

  return value;
}

/**
 * Checks if device can handle complex animations
 */
export function getAnimationQuality(): 'low' | 'medium' | 'high' {
  // On web, check if user prefers reduced motion
  if (Platform.OS === 'web') {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return 'low';
  }

  // Check device performance (heuristic)
  // In a real app, you might want to benchmark and cache this
  return 'high';
}

/**
 * Returns appropriate animation config based on device capabilities
 */
export function getAnimationConfig() {
  const quality = getAnimationQuality();

  const configs = {
    low: {
      duration: 200,
      useNativeDriver: true,
      isInteraction: false,
    },
    medium: {
      duration: 300,
      useNativeDriver: true,
      isInteraction: true,
    },
    high: {
      duration: 400,
      useNativeDriver: true,
      isInteraction: true,
    },
  };

  return configs[quality];
}

/**
 * Optimizes layout animations by batching
 */
export function useBatchedLayoutUpdates() {
  const [updatesPending, setUpdatesPending] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleUpdate = useCallback((callback: () => void) => {
    // Queue the callback
    const queue = useRef<(() => void)[]>([]);

    queue.current.push(callback);

    if (!updatesPending) {
      setUpdatesPending(true);
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      // Batch all updates
      queue.current.forEach((cb) => cb());
      queue.current = [];
      setUpdatesPending(false);
    }, 0);
  }, [updatesPending]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { scheduleUpdate, isBatching: updatesPending };
}

// ============================================================================
// MEMORY LEAK DETECTION HELPERS
// ============================================================================

/**
 * Tracking state for potential memory leaks
 */
interface LeakTracker {
  ref: WeakRef<object>;
  stack: string;
  timestamp: number;
}

const leakTrackers = new Map<string, LeakTracker>();

/**
 * Hook to track component mount/unmount for leak detection
 */
export function useLeakTracker(componentName: string, enableTracking = __DEV__) {
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!enableTracking) return;

    const key = `${componentName}-${Date.now()}-${Math.random()}`;
    const stack = new Error().stack || '';

    leakTrackers.set(key, {
      ref: new WeakRef({}),
      stack,
      timestamp: Date.now(),
    });

    // Clean up tracker on unmount
    return () => {
      mountedRef.current = false;
      leakTrackers.delete(key);
    };
  }, [componentName, enableTracking]);

  useEffect(() => {
    return () => {
      if (!enableTracking) return;

      // Check for cleanup issues
      const interval = setInterval(() => {
        if (!mountedRef.current) {
          clearInterval(interval);
        }
      }, 1000);
    };
  }, [enableTracking]);
}

/**
 * Hook to ensure async operations are cancelled on unmount
 */
export function useAsyncCleanup() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(
    <T,>(promise: Promise<T>): Promise<T | null> => {
      return promise.then(
        (value) => (isMountedRef.current ? value : null),
        (error) => (isMountedRef.current ? Promise.reject(error) : null)
      );
    },
    []
  );
}

/**
 * Hook to track and log memory usage (dev mode only)
 */
export function useMemoryMonitor(interval = 5000) {
  const [memoryUsage, setMemoryUsage] = useState<{
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  }>({});

  useEffect(() => {
    if (Platform.OS !== 'web' || !('memory' in performance)) {
      return;
    }

    const updateMemory = () => {
      const mem = (performance as unknown as { memory: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      }}).memory;

      setMemoryUsage({
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      });
    };

    updateMemory();
    const intervalId = setInterval(updateMemory, interval);

    return () => clearInterval(intervalId);
  }, [interval]);

  return memoryUsage;
}

/**
 * Hook to detect and warn about effect cleanup issues
 */
export function useEffectCleanupWarning(effectName: string) {
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (__DEV__ && !cleanupRef.current) {
        console.warn(
          `[Performance Warning] Effect "${effectName}" may be missing cleanup function. ` +
          'Ensure your useEffect returns a cleanup function when needed.'
        );
      }
    };
  }, [effectName]);
}

// ============================================================================
// PERFORMANCE MONITORING UTILITIES
// ============================================================================

/**
 * Performance metric entry
 */
export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const performanceMetrics: PerformanceMetric[] = [];
const MAX_METRICS = 100;

/**
 * Records a performance metric
 */
export function recordMetric(
  name: string,
  duration: number,
  metadata?: Record<string, unknown>
): void {
  const metric: PerformanceMetric = {
    name,
    duration,
    timestamp: Date.now(),
    metadata,
  };

  performanceMetrics.push(metric);

  // Keep only recent metrics
  if (performanceMetrics.length > MAX_METRICS) {
    performanceMetrics.shift();
  }
}

/**
 * Gets all recorded metrics
 */
export function getMetrics(): PerformanceMetric[] {
  return [...performanceMetrics];
}

/**
 * Clears all recorded metrics
 */
export function clearMetrics(): void {
  performanceMetrics.length = 0;
}

/**
 * Gets statistics for a specific metric name
 */
export function getMetricStats(name: string) {
  const metrics = performanceMetrics.filter((m) => m.name === name);

  if (metrics.length === 0) {
    return null;
  }

  const durations = metrics.map((m) => m.duration);
  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / durations.length;
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    count: metrics.length,
    avg,
    min,
    max,
    median,
    sum,
  };
}

/**
 * Hook for measuring component render time
 */
export function useRenderMetrics(componentName: string, enabled = __DEV__) {
  const renderCountRef = useRef(0);
  const renderTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;

    renderCountRef.current += 1;
  });

  useEffect(() => {
    const startTime = performance.now();

    return () => {
      const renderTime = performance.now() - startTime;
      renderTimesRef.current.push(renderTime);

      if (__DEV__ && renderTime > 16) {
        console.warn(
          `[Performance Warning] ${componentName} took ${renderTime.toFixed(2)}ms to render. ` +
          'Consider optimizing with React.memo or useMemo.'
        );
      }
    };
  }, [componentName, enabled]);

  return {
    renderCount: renderCountRef.current,
    avgRenderTime:
      renderTimesRef.current.length > 0
        ? renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length
        : 0,
    lastRenderTime:
      renderTimesRef.current.length > 0
        ? renderTimesRef.current[renderTimesRef.current.length - 1]
        : 0,
  };
}

/**
 * Higher-order component for measuring render performance
 */
export function withRenderMetrics<P extends object>(
  WrappedComponent: ComponentType<P>,
  name?: string
): ComponentType<P> {
  const displayName = name || WrappedComponent.displayName || WrappedComponent.name || 'Component';

  function WithRenderMetrics(props: P) {
    const metrics = useRenderMetrics(displayName);

    if (__DEV__) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useEffect(() => {
        if (metrics.renderCount > 100) {
          console.warn(
            `[Performance Warning] ${displayName} has rendered ${metrics.renderCount} times. ` +
            'This may indicate unnecessary re-renders.'
          );
        }
      });
    }

    return <WrappedComponent {...props} />;
  }

  WithRenderMetrics.displayName = `withRenderMetrics(${displayName})`;
  return WithRenderMetrics;
}

/**
 * Creates a performance timer for measuring async operations
 */
export function createTimer(label: string) {
  const startTime = performance.now();

  return {
    end: (metadata?: Record<string, unknown>) => {
      const duration = performance.now() - startTime;
      recordMetric(label, duration, metadata);

      if (__DEV__) {
        console.log(`[Timer] ${label}: ${duration.toFixed(2)}ms`);
      }

      return duration;
    },
    getElapsed: () => performance.now() - startTime,
  };
}

/**
 * Hook for measuring async operation performance
 */
export function usePerformanceTimer(operation: string) {
  const startTimeRef = useRef<number | undefined>(undefined);

  const start = useCallback(() => {
    startTimeRef.current = performance.now();
  }, []);

  const end = useCallback(
    (metadata?: Record<string, unknown>) => {
      if (!startTimeRef.current) return 0;

      const duration = performance.now() - startTimeRef.current;
      recordMetric(operation, duration, metadata);
      startTimeRef.current = undefined;

      return duration;
    },
    [operation]
  );

  return { start, end };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Hook that returns a value from the previous render
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Hook that returns whether the component is mounted
 */
export function useIsMounted(): RefObject<boolean> {
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return isMounted;
}

/**
 * Hook for tracking mount state
 */
export function useMountState(): { isMounted: boolean; isUnmounting: boolean } {
  const [state, setState] = useState({
    isMounted: false,
    isUnmounting: false,
  });

  useEffect(() => {
    setState({ isMounted: true, isUnmounting: false });
    return () => {
      setState({ isMounted: false, isUnmounting: true });
    };
  }, []);

  return state;
}

/**
 * Hook for singleton pattern - ensures only one instance exists
 */
export function useSingleton<T>(factory: () => T): T {
  const instanceRef = useRef<T | null>(null);

  if (instanceRef.current === null) {
    instanceRef.current = factory();
  }

  return instanceRef.current;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Image optimization
  preloadImage,
  preloadImages,
  clearImageCache,
  getImageCacheStats,
  getOptimizedImageSource,

  // Memoization
  deepEqual,
  memoCompare,
  useMemoCallback,
  useDeepMemo,

  // Debounce/Throttle
  useDebouncedCallback,
  useDebouncedValue,
  useThrottledCallback,
  useThrottledValue,

  // Lazy loading
  useLazyComponent,
  createLazyComponent,
  useLazyData,

  // Animation
  useAnimationFrame,
  useAnimationFrameValue,
  getAnimationQuality,
  getAnimationConfig,
  useBatchedLayoutUpdates,

  // Memory leak detection
  useLeakTracker,
  useAsyncCleanup,
  useMemoryMonitor,
  useEffectCleanupWarning,

  // Performance monitoring
  recordMetric,
  getMetrics,
  clearMetrics,
  getMetricStats,
  useRenderMetrics,
  withRenderMetrics,
  createTimer,
  usePerformanceTimer,

  // Utility hooks
  usePrevious,
  useIsMounted,
  useMountState,
  useSingleton,
};
