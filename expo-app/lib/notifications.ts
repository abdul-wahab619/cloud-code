/**
 * Push Notifications Module
 * Handles push notification setup and management
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { haptics } from '../lib/haptics';

// Notification channel IDs
export const CHANNEL_IDS = {
  SESSIONS: 'sessions',
  PULL_REQUESTS: 'pull-requests',
  ISSUES: 'issues',
  GENERAL: 'general',
} as const;

// Notification types
export interface NotificationConfig {
  enabled: boolean;
  sessionComplete: boolean;
  prStatus: boolean;
  errorAlerts: boolean;
}

/**
 * Initialize push notifications
 */
export async function initializeNotifications(): Promise<boolean> {
  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus === Notifications.PermissionStatus.UNDETERMINED) {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
      return false;
    }

    // Configure notification channels (Android only)
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(CHANNEL_IDS.SESSIONS, {
        name: 'Sessions',
        description: 'Notifications for session completion',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366f1',
      });

      Notifications.setNotificationChannelAsync(CHANNEL_IDS.PULL_REQUESTS, {
        name: 'Pull Requests',
        description: 'Notifications for PR status changes',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#22c55e',
      });

      Notifications.setNotificationChannelAsync(CHANNEL_IDS.ISSUES, {
        name: 'Issues',
        description: 'Notifications for new issues',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#f59e0b',
      });

      Notifications.setNotificationChannelAsync(CHANNEL_IDS.GENERAL, {
        name: 'General',
        description: 'General notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: '#3b82f6',
      });
    }

    // Set notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    return true;
  } catch (error) {
    console.error('Failed to initialize notifications:', error);
    return false;
  }
}

/**
 * Get push token for device
 */
export async function getPushToken(): Promise<string | null> {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    // Expo returns either a string or an object with data property
    const token = typeof tokenData === 'string' ? tokenData : (tokenData as { data: string }).data;

    // Send token to server
    await registerPushToken(token);

    return token;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Register push token with server
 */
async function registerPushToken(token: string): Promise<void> {
  try {
    const isTestMode = typeof window !== 'undefined' &&
      new URL(window.location.href).searchParams.get('test') === 'true';

    const response = await fetch(`/api/notifications/register${isTestMode ? '?test=true' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error('Failed to register token');
    }
  } catch (error) {
    console.error('Failed to register push token:', error);
  }
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification({
  title,
  body,
  data,
  seconds = 1,
  sound = 'default',
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  seconds?: number;
  sound?: 'default' | 'none' | NotificationSoundName;
}): Promise<string> {
  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    });

    return identifier;
  } catch (error) {
    console.error('Failed to schedule notification:', error);
    return '';
  }
}

/**
 * Send a session complete notification
 */
export async function notifySessionComplete(sessionId: string, repository?: string): Promise<void> {
  await scheduleLocalNotification({
    title: 'Session Complete',
    body: repository
      ? `Claude has finished processing ${repository}`
      : 'Claude has finished processing your request',
    data: { type: 'session_complete', sessionId },
  });
}

/**
 * Send a PR status notification
 */
export async function notifyPRStatus(
  prNumber: number,
  repository: string,
  status: 'created' | 'approved' | 'merged' | 'closed'
): Promise<void> {
  const messages = {
    created: `PR #${prNumber} created in ${repository}`,
    approved: `PR #${prNumber} approved in ${repository}`,
    merged: `PR #${prNumber} merged in ${repository}`,
    closed: `PR #${prNumber} closed in ${repository}`,
  };

  await scheduleLocalNotification({
    title: 'Pull Request Update',
    body: messages[status],
    data: { type: 'pr_status', prNumber, repository, status },
  });
}

/**
 * Send an error notification
 */
export async function notifyError(error: string, context?: string): Promise<void> {
  await scheduleLocalNotification({
    title: 'Error',
    body: context ? `${context}: ${error}` : error,
    data: { type: 'error', error, context },
    sound: 'default' as const,
  });
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (error) {
    console.error('Failed to cancel notification:', error);
  }
}

/**
 * Cancel all notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Failed to cancel all notifications:', error);
  }
}

/**
 * Get notification settings
 */
export async function getNotificationSettings(): Promise<NotificationConfig> {
  // In a real app, this would be loaded from persistent storage
  return {
    enabled: true,
    sessionComplete: true,
    prStatus: true,
    errorAlerts: true,
  };
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(config: Partial<NotificationConfig>): Promise<void> {
  // In a real app, this would save to persistent storage and sync with server
  const { settingsStorage } = require('../lib/offlineStorage');
  await settingsStorage.saveNotificationPrefs({
    sessionComplete: config.sessionComplete ?? true,
    prStatus: config.prStatus ?? true,
    errorAlerts: config.errorAlerts ?? true,
  });
}

/**
 * Notification sounds
 */
type NotificationSoundName =
  | 'default'
  | 'default_critical'
  | 'default_notification';

export const notificationService = {
  initialize: initializeNotifications,
  getToken: getPushToken,
  schedule: scheduleLocalNotification,
  cancel: cancelNotification,
  cancelAll: cancelAllNotifications,
  sessionComplete: notifySessionComplete,
  prStatus: notifyPRStatus,
  error: notifyError,
  getSettings: getNotificationSettings,
  updateSettings: updateNotificationSettings,
};

export default notificationService;
