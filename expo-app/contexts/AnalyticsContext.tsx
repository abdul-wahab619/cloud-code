/**
 * Analytics Context Provider
 *
 * Provides analytics tracking throughout the app.
 */

import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { AnalyticsService, useAnalytics as useAnalyticsService } from '../services/AnalyticsService';

// ============================================================================
// Types
// ============================================================================

interface AnalyticsContextValue {
  track: (eventType: string, data?: Record<string, unknown>) => void;
  trackScreen: (screenName: string) => void;
  trackButton: (buttonName: string, context?: string) => void;
  trackSessionCreated: (repoCount: number) => void;
  trackSessionCompleted: (duration: number, messageCount: number, success: boolean) => void;
  trackRepoConnected: (repoName: string) => void;
  trackIssueProcessed: (issueNumber: number, success: boolean) => void;
  trackError: (errorType: string, errorMessage: string) => void;
  isEnabled: () => boolean;
  enable: () => void;
  disable: () => void;
  getState: () => { isEnabled: boolean; sessionId: string | null; userId: string | null; installId: string };
  exportData: () => string;
  reset: () => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

interface AnalyticsProviderProps {
  children: React.ReactNode;
  autoInitialize?: boolean;
}

export function AnalyticsProvider({ children, autoInitialize = true }: AnalyticsProviderProps) {
  const analytics = useAnalyticsService();

  // Initialize analytics on mount
  useEffect(() => {
    if (autoInitialize && analytics.isEnabled()) {
      AnalyticsService.initialize();
    }
  }, [autoInitialize, analytics]);

  const contextValue: AnalyticsContextValue = {
    track: analytics.track as (eventType: string, data?: Record<string, unknown>) => void,
    trackScreen: analytics.trackScreen,
    trackButton: analytics.trackButton,
    trackSessionCreated: analytics.trackSessionCreated,
    trackSessionCompleted: analytics.trackSessionCompleted,
    trackRepoConnected: analytics.trackRepoConnected,
    trackIssueProcessed: analytics.trackIssueProcessed,
    trackError: analytics.trackError,
    isEnabled: analytics.isEnabled,
    enable: analytics.enable,
    disable: analytics.disable,
    getState: analytics.getState,
    exportData: analytics.exportData,
    reset: analytics.reset,
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within AnalyticsProvider');
  }
  return context;
}

// ============================================================================
// Screen Tracking Hook
// ============================================================================

export function useScreenTracking(screenName: string) {
  const analytics = useAnalytics();

  useEffect(() => {
    analytics.trackScreen(screenName);
  }, [screenName, analytics]);
}

export default AnalyticsProvider;
