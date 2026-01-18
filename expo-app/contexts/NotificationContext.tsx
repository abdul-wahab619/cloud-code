/**
 * Notification Context Provider
 *
 * Provides notification functionality throughout the app including:
 * - Permission management
 * - Notification listeners
 * - Local notification scheduling
 * - Push token registration
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Subscription } from 'expo-notifications';
import notificationService, { NotificationPreferences } from '../services/NotificationService';

// ============================================================================
// Types
// ============================================================================

interface NotificationContextValue {
  // Permissions
  requestPermissions: () => Promise<boolean>;
  getPermissionStatus: () => Promise<'granted' | 'denied' | 'undetermined'>;
  hasPermission: boolean;

  // Preferences
  preferences: NotificationPreferences;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;

  // Push token
  registerPushToken: () => Promise<string | null>;
  pushToken: string | null;

  // Local notifications
  scheduleLocalNotification: (
    title: string,
    body: string,
    data?: Record<string, unknown>
  ) => Promise<void>;

  // Session notifications
  notifySessionComplete: (sessionId: string, success: boolean) => Promise<void>;
  notifySessionFailed: (sessionId: string, error: string) => Promise<void>;
  notifyIssueUpdate: (issueNumber: number, type: 'comment' | 'closed' | 'merged') => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

interface NotificationProviderProps {
  children: React.ReactNode;
  autoInitialize?: boolean;
}

export function NotificationProvider({ children, autoInitialize = true }: NotificationProviderProps) {
  const [hasPermission, setHasPermission] = useState(false);
  const [preferences, setPreferences] = useState(notificationService.getPreferences());
  const [pushToken, setPushToken] = useState<string | null>(null);

  // Initialize notification service
  useEffect(() => {
    if (autoInitialize) {
      initializeNotifications();
    }

    // Listen for notification permissions changes
    // Note: addPermissionsReceivedListener may not be available in all expo-notifications versions
    // We'll check permissions periodically instead
    const interval = setInterval(async () => {
      const status = await notificationService.getPermissionsStatus();
      setHasPermission(status === 'granted');
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(interval);
    };
  }, [autoInitialize]);

  // Initialize notifications
  const initializeNotifications = async () => {
    try {
      await notificationService.initialize();

      // Check current permission status
      const status = await notificationService.getPermissionsStatus();
      setHasPermission(status === 'granted');

      // Load preferences
      const prefs = notificationService.getPreferences();
      setPreferences(prefs);

      // Load push token if already registered
      const token = await notificationService.getPushToken();
      setPushToken(token?.token || null);
    } catch (error) {
      console.error('[NotificationProvider] Initialization error:', error);
    }
  };

  // Request permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const granted = await notificationService.requestPermissions();
      setHasPermission(granted);

      if (granted) {
        // Auto-register push token when permissions granted
        const token = await notificationService.registerPushToken();
        if (token) {
          setPushToken(token.token);
        }
      } else if (Platform.OS !== 'web') {
        Alert.alert(
          'Notifications Disabled',
          'To receive notifications about your sessions and issues, please enable notifications in your device settings.',
          [{ text: 'OK' }]
        );
      }

      return granted;
    } catch (error) {
      console.error('[NotificationProvider] Permission request error:', error);
      return false;
    }
  }, []);

  // Get permission status
  const getPermissionStatus = useCallback(async () => {
    return await notificationService.getPermissionsStatus();
  }, []);

  // Update preferences
  const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
    const updated = await notificationService.updatePreferences(updates);
    setPreferences(updated);
  }, []);

  // Register push token
  const registerPushToken = useCallback(async (): Promise<string | null> => {
    const tokenData = await notificationService.registerPushToken();
    if (tokenData) {
      setPushToken(tokenData.token);
      return tokenData.token;
    }
    return null;
  }, []);

  // Schedule local notification
  const scheduleLocalNotification = useCallback(async (
    title: string,
    body: string,
    data?: Record<string, unknown>
  ) => {
    await notificationService.scheduleLocalNotification(title, body, data);
  }, []);

  // Notify session complete
  const notifySessionComplete = useCallback(async (sessionId: string, success: boolean) => {
    // TODO: Pass actual repoName and duration
    await notificationService.notifySessionComplete(sessionId, 'repository', 0);
  }, []);

  // Notify session failed
  const notifySessionFailed = useCallback(async (sessionId: string, error: string) => {
    // TODO: Pass actual repoName
    await notificationService.notifySessionFailed(sessionId, 'repository', error);
  }, []);

  // Notify issue update
  const notifyIssueUpdate = useCallback(async (issueNumber: number, type: 'comment' | 'closed' | 'merged') => {
    // TODO: Pass actual repoName, commenter, title
    if (type === 'comment') {
      await notificationService.notifyIssueComment(issueNumber, 'repository', 'user');
    } else if (type === 'merged') {
      await notificationService.notifyPRMerged(issueNumber, 'repository', 'PR title');
    } else {
      await notificationService.notifyPRClosed(issueNumber, 'repository');
    }
  }, []);

  const contextValue: NotificationContextValue = {
    requestPermissions,
    getPermissionStatus,
    hasPermission,
    preferences,
    updatePreferences,
    registerPushToken,
    pushToken,
    scheduleLocalNotification,
    notifySessionComplete,
    notifySessionFailed,
    notifyIssueUpdate,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

// ============================================================================
// Notification Response Listener Hook
// ============================================================================

/**
 * Hook to listen for notification responses (user tapping on notification)
 *
 * @example
 *   useNotificationResponseListener((response) => {
 *     console.log('Notification tapped:', response);
 *     // Navigate to relevant screen
 *   });
 */
export function useNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
) {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handler);

    return () => {
      subscription.remove();
    };
  }, [handler]);
}

export default NotificationProvider;
