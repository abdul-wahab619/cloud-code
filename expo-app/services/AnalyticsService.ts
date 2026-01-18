/**
 * Analytics Service
 *
 * Tracks user behavior and app metrics for PRD compliance.
 * All tracking is opt-in by default for privacy compliance.
 */

import { Platform } from 'react-native';

// ============================================================================
// Types
// ============================================================================

export type AnalyticsEvent =
  | 'app_opened'
  | 'screen_view'
  | 'session_created'
  | 'session_completed'
  | 'button_click'
  | 'form_submit'
  | 'repo_connected'
  | 'repo_disconnected'
  | 'issue_processed'
  | 'issue_created'
  | 'history_loaded'
  | 'history_deleted'
  | 'search_query'
  | 'settings_changed'
  | 'error_occurred';

export interface AnalyticsEventData {
  [key: string]: string | number | boolean | undefined;
}

interface QueuedEvent {
  id: string;
  type: AnalyticsEvent;
  data: AnalyticsEventData;
  timestamp: number;
}

interface AnalyticsState {
  isEnabled: boolean;
  sessionId: string | null;
  userId: string | null;
  installId: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'analytics_state';
const QUEUE_KEY = 'analytics_queue';
const FLUSH_INTERVAL = 30000; // 30 seconds
const MAX_QUEUE_SIZE = 50;
const MAX_BATCH_SIZE = 10;

// API endpoint for analytics (would be configured in production)
const ANALYTICS_ENDPOINT = '/api/analytics/events';

// ============================================================================
// Analytics Service Class
// ============================================================================

class AnalyticsServiceClass {
  private state: AnalyticsState;
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionStartTime: number = 0;

  constructor() {
    this.state = this.loadState();
    this.queue = this.loadQueue();
    this.startFlushTimer();
  }

  // ============================================================================
  // State Management
  // ============================================================================

  private loadState(): AnalyticsState {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.warn('[Analytics] Failed to load state:', error);
      }
    }

    // Default state
    return {
      isEnabled: false, // Opt-in by default
      sessionId: null,
      userId: null,
      installId: this.generateId(),
    };
  }

  private saveState(): void {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (error) {
        console.warn('[Analytics] Failed to save state:', error);
      }
    }
  }

  private loadQueue(): QueuedEvent[] {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(QUEUE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.warn('[Analytics] Failed to load queue:', error);
      }
    }
    return [];
  }

  private saveQueue(): void {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
      } catch (error) {
        console.warn('[Analytics] Failed to save queue:', error);
      }
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Initialize analytics for the session
   */
  initialize(): void {
    if (!this.state.isEnabled) {
      console.log('[Analytics] Disabled - user has opted out');
      return;
    }

    this.sessionStartTime = Date.now();
    this.state.sessionId = this.generateId();

    this.track('app_opened', {
      platform: Platform.OS,
      installId: this.state.installId,
    });

    this.saveState();
  }

  /**
   * Enable analytics tracking (user opt-in)
   */
  enable(): void {
    if (!this.state.isEnabled) {
      this.state.isEnabled = true;
      this.saveState();
      this.track('settings_changed', { setting: 'analytics_enabled', value: true });
      console.log('[Analytics] Enabled by user');
    }
  }

  /**
   * Disable analytics tracking (user opt-out)
   */
  disable(): void {
    if (this.state.isEnabled) {
      this.state.isEnabled = false;
      this.saveState();
      this.clearQueue();
      console.log('[Analytics] Disabled by user');
    }
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.state.isEnabled;
  }

  /**
   * Set user ID for analytics
   */
  setUserId(userId: string): void {
    this.state.userId = userId;
    this.saveState();
  }

  /**
   * Track an analytics event
   */
  track(eventType: AnalyticsEvent, data: AnalyticsEventData = {}): void {
    if (!this.state.isEnabled) {
      return; // Silently drop events when disabled
    }

    const event: QueuedEvent = {
      id: this.generateId(),
      type: eventType,
      data: {
        ...data,
        sessionId: this.state.sessionId || undefined,
        userId: this.state.userId || undefined,
        timestamp: Date.now(),
      } as AnalyticsEventData,
      timestamp: Date.now(),
    };

    this.queue.push(event);

    // Trim queue if it exceeds max size
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    this.saveQueue();

    // Flush immediately for important events
    const immediateEvents: AnalyticsEvent[] = ['session_completed', 'error_occurred'];
    if (immediateEvents.includes(eventType)) {
      this.flush();
    }
  }

  /**
   * Track screen view
   */
  trackScreen(screenName: string): void {
    this.track('screen_view', { screen: screenName });
  }

  /**
   * Track button click
   */
  trackButton(buttonName: string, context?: string): void {
    this.track('button_click', {
      button: buttonName,
      context,
    });
  }

  /**
   * Track session creation
   */
  trackSessionCreated(repoCount: number): void {
    this.track('session_created', { repoCount });
  }

  /**
   * Track session completion
   */
  trackSessionCompleted(duration: number, messageCount: number, success: boolean): void {
    this.track('session_completed', {
      duration,
      messageCount,
      success,
    });
  }

  /**
   * Track repository connection
   */
  trackRepoConnected(repoName: string): void {
    this.track('repo_connected', { repo: repoName });
  }

  /**
   * Track issue processing
   */
  trackIssueProcessed(issueNumber: number, success: boolean): void {
    this.track('issue_processed', {
      issueNumber,
      success,
    });
  }

  /**
   * Track error
   */
  trackError(errorType: string, errorMessage: string): void {
    this.track('error_occurred', {
      errorType,
      errorMessage: errorMessage.substring(0, 100), // Truncate long messages
    });
  }

  /**
   * Get current analytics state
   */
  getState(): AnalyticsState {
    return { ...this.state };
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear all queued events
   */
  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
  }

  /**
   * Flush queued events to server
   */
  async flush(): Promise<boolean> {
    if (!this.state.isEnabled || this.queue.length === 0) {
      return true;
    }

    const eventsToSend = this.queue.splice(0, MAX_BATCH_SIZE);
    this.saveQueue();

    try {
      const response = await fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: eventsToSend,
          installId: this.state.installId,
          userId: this.state.userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analytics flush failed: ${response.status}`);
      }

      console.log(`[Analytics] Flushed ${eventsToSend.length} events`);
      return true;
    } catch (error) {
      // Put events back in queue on failure
      this.queue.unshift(...eventsToSend);
      this.saveQueue();
      console.warn('[Analytics] Flush failed, events requeued:', error);
      return false;
    }
  }

  /**
   * Export analytics data (for user data access requests)
   */
  exportData(): string {
    return JSON.stringify({
      state: this.state,
      events: this.queue,
    }, null, 2);
  }

  /**
   * Reset all analytics data
   */
  reset(): void {
    this.state = {
      isEnabled: false,
      sessionId: null,
      userId: null,
      installId: this.generateId(),
    };
    this.clearQueue();
    this.saveState();
    console.log('[Analytics] Reset complete');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, FLUSH_INTERVAL);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const AnalyticsService = new AnalyticsServiceClass();

// ============================================================================
// React Hook
// ============================================================================

export function useAnalytics() {
  return {
    track: AnalyticsService.track.bind(AnalyticsService),
    trackScreen: AnalyticsService.trackScreen.bind(AnalyticsService),
    trackButton: AnalyticsService.trackButton.bind(AnalyticsService),
    trackSessionCreated: AnalyticsService.trackSessionCreated.bind(AnalyticsService),
    trackSessionCompleted: AnalyticsService.trackSessionCompleted.bind(AnalyticsService),
    trackRepoConnected: AnalyticsService.trackRepoConnected.bind(AnalyticsService),
    trackIssueProcessed: AnalyticsService.trackIssueProcessed.bind(AnalyticsService),
    trackError: AnalyticsService.trackError.bind(AnalyticsService),
    isEnabled: AnalyticsService.isEnabled.bind(AnalyticsService),
    enable: AnalyticsService.enable.bind(AnalyticsService),
    disable: AnalyticsService.disable.bind(AnalyticsService),
    getState: AnalyticsService.getState.bind(AnalyticsService),
    exportData: AnalyticsService.exportData.bind(AnalyticsService),
    reset: AnalyticsService.reset.bind(AnalyticsService),
  };
}

export default AnalyticsService;
