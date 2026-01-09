/**
 * Notification Service
 *
 * Handles push notifications for the Cloud Code app.
 * Supports session completion, issue updates, PR merges, and more.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Constants } from 'expo-constants';
import { storage } from '../lib/offlineStorage';

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | 'session_complete'
  | 'session_failed'
  | 'issue_comment'
  | 'pr_merged'
  | 'pr_closed'
  | 'monthly_summary'
  | 'error_alert'
  | 'system_update';

export interface NotificationPreferences {
  enabled: boolean;
  sessionComplete: boolean;
  sessionFailed: boolean;
  issueComments: boolean;
  prUpdates: boolean;
  monthlySummary: boolean;
  errorAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm format
  quietHoursEnd: string; // HH:mm format
}

export interface PushToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId: string;
  updatedAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const NOTIFICATION_PREFS_KEY = 'notification_prefs';
const PUSH_TOKEN_KEY = 'push_token';

// Default notification preferences
export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabled: false,
  sessionComplete: true,
  sessionFailed: true,
  issueComments: true,
  prUpdates: true,
  monthlySummary: true,
  errorAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

// ============================================================================
// Notification Categories
// ============================================================================

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ============================================================================
// Notification Service Class
// ============================================================================

class NotificationServiceClass {
  private preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFS;
  private pushToken: PushToken | null = null;
  private isInitialized = false;

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Load saved preferences
      await this.loadPreferences();
      await this.loadPushToken();

      // Configure notification categories for iOS
      if (Platform.OS === 'ios') {
        await Notifications.setNotificationCategoryAsync('session_complete', [
          {
            identifier: 'view',
            buttonTitle: 'View',
            options: {
              foreground: true,
            },
          },
        ]);

        await Notifications.setNotificationCategoryAsync('issue_comment', [
          {
            identifier: 'reply',
            buttonTitle: 'Reply',
            options: {
              foreground: true,
              opensAppToForeground: true,
            },
          },
        ]);
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[NotificationService] Initialization error:', error);
      return false;
    }
  }

  // ========================================================================
  // Permission Management
  // ========================================================================

  async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      console.warn('[NotificationService] Push notifications require a physical device');
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[NotificationService] Failed to get push token for push notification!');
      return false;
    }

    return true;
  }

  async getPermissionsStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
    const { status } = await Notifications.getPermissionsAsync();
    return status as 'granted' | 'denied' | 'undetermined';
  }

  // ========================================================================
  // Push Token Management
  // ========================================================================

  async registerPushToken(): Promise<PushToken | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return null;

    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId || '',
      });

      const pushTokenData: PushToken = {
        token: token.data,
        platform: Platform.OS as 'ios' | 'android',
        deviceId: Constants.deviceId || Constants.sessionId || 'unknown',
        updatedAt: Date.now(),
      };

      this.pushToken = pushTokenData;
      await this.savePushToken(pushTokenData);

      // TODO: Send token to backend
      // await fetch('/api/users/push-token', {
      //   method: 'POST',
      //   body: JSON.stringify(pushTokenData),
      // });

      console.log('[NotificationService] Push token registered:', token.data);
      return pushTokenData;
    } catch (error) {
      console.error('[NotificationService] Token registration error:', error);
      return null;
    }
  }

  async getPushToken(): Promise<PushToken | null> {
    return this.pushToken;
  }

  // ========================================================================
  // Notification Sending
  // ========================================================================

  async sendLocalNotification(type: NotificationType, data: {
    title: string;
    body: string;
    sessionId?: string;
    issueNumber?: number;
    prNumber?: number;
  }): Promise<void> {
    // Check if notifications are enabled
    if (!this.preferences.enabled) return;

    // Check quiet hours
    if (this.preferences.quietHoursEnabled && this.isQuietHours()) {
      console.log('[NotificationService] Quiet hours - skipping notification');
      return;
    }

    // Check type-specific preferences
    const typeEnabled = this.getTypePreference(type);
    if (!typeEnabled) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: data.title,
          body: data.body,
          data: {
            type,
            sessionId: data.sessionId,
            issueNumber: data.issueNumber,
            prNumber: data.prNumber,
          },
          categoryIdentifier: type,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('[NotificationService] Send notification error:', error);
    }
  }

  // ========================================================================
  // Notification Templates
  // ========================================================================

  async notifySessionComplete(sessionId: string, repoName: string, duration: number): Promise<void> {
    if (!this.preferences.sessionComplete) return;

    await this.sendLocalNotification('session_complete', {
      title: 'Session Complete',
      body: `Your Claude Code session for ${repoName} completed in ${Math.round(duration / 60)} minutes`,
      sessionId,
    });
  }

  async notifySessionFailed(sessionId: string, repoName: string, error: string): Promise<void> {
    if (!this.preferences.sessionFailed) return;

    await this.sendLocalNotification('session_failed', {
      title: 'Session Failed',
      body: `Your session for ${repoName} encountered an error`,
      sessionId,
    });
  }

  async notifyIssueComment(issueNumber: number, repoName: string, commenter: string): Promise<void> {
    if (!this.preferences.issueComments) return;

    await this.sendLocalNotification('issue_comment', {
      title: `New Comment on #${issueNumber}`,
      body: `${commenter} commented on issue in ${repoName}`,
      issueNumber,
    });
  }

  async notifyPRMerged(prNumber: number, repoName: string, title: string): Promise<void> {
    if (!this.preferences.prUpdates) return;

    await this.sendLocalNotification('pr_merged', {
      title: `PR #${prNumber} Merged`,
      body: `"${title}" was merged in ${repoName}`,
      prNumber,
    });
  }

  async notifyPRClosed(prNumber: number, repoName: string): Promise<void> {
    if (!this.preferences.prUpdates) return;

    await this.sendLocalNotification('pr_closed', {
      title: `PR #${prNumber} Closed`,
      body: `Pull request was closed in ${repoName}`,
      prNumber,
    });
  }

  async notifyMonthlySummary(stats: {
    sessionsCompleted: number;
    issuesProcessed: number;
    successRate: number;
  }): Promise<void> {
    if (!this.preferences.monthlySummary) return;

    await this.sendLocalNotification('monthly_summary', {
      title: 'Monthly Summary',
      body: `You completed ${stats.sessionsCompleted} sessions with ${stats.successRate}% success rate`,
    });
  }

  async notifyError(errorType: string, errorMessage: string): Promise<void> {
    if (!this.preferences.errorAlerts) return;

    await this.sendLocalNotification('error_alert', {
      title: `Error: ${errorType}`,
      body: errorMessage.substring(0, 100),
    });
  }

  // ========================================================================
  // Preferences Management
  // ========================================================================

  async updatePreferences(updates: Partial<NotificationPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...updates };

    // Enable/disable notifications based on preference
    if (updates.enabled === true) {
      await this.registerPushToken();
    }

    await this.savePreferences();
  }

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private getTypePreference(type: NotificationType): boolean {
    switch (type) {
      case 'session_complete':
        return this.preferences.sessionComplete;
      case 'session_failed':
        return this.preferences.sessionFailed;
      case 'issue_comment':
        return this.preferences.issueComments;
      case 'pr_merged':
      case 'pr_closed':
        return this.preferences.prUpdates;
      case 'monthly_summary':
        return this.preferences.monthlySummary;
      case 'error_alert':
        return this.preferences.errorAlerts;
      default:
        return true;
    }
  }

  private isQuietHours(): boolean {
    if (!this.preferences.quietHoursEnabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = this.preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = this.preferences.quietHoursEnd.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime < endTime) {
      // Same day quiet hours (e.g., 22:00 - 08:00 doesn't work here)
      return currentTime >= startTime && currentTime < endTime;
    } else {
      // Overnight quiet hours (e.g., 22:00 - 08:00)
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  private async loadPreferences(): Promise<void> {
    try {
      const data = await storage.get<NotificationPreferences>(NOTIFICATION_PREFS_KEY);
      if (data) {
        this.preferences = { ...DEFAULT_NOTIFICATION_PREFS, ...data };
      }
    } catch (error) {
      console.error('[NotificationService] Load preferences error:', error);
    }
  }

  private async savePreferences(): Promise<void> {
    try {
      await storage.set(NOTIFICATION_PREFS_KEY, this.preferences);
    } catch (error) {
      console.error('[NotificationService] Save preferences error:', error);
    }
  }

  private async loadPushToken(): Promise<void> {
    try {
      const data = await storage.get<PushToken>(PUSH_TOKEN_KEY);
      if (data) {
        this.pushToken = data;
      }
    } catch (error) {
      console.error('[NotificationService] Load push token error:', error);
    }
  }

  private async savePushToken(token: PushToken): Promise<void> {
    try {
      await storage.set(PUSH_TOKEN_KEY, token);
    } catch (error) {
      console.error('[NotificationService] Save push token error:', error);
    }
  }

  // ========================================================================
  // Event Listeners
  // ========================================================================

  addNotificationListener(listener: (notification: Notifications.Notification) => void): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(listener);
  }

  addResponseListener(listener: (response: Notifications.NotificationResponse) => void): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(listener);
  }

  // ========================================================================
  // Badge Management
  // ========================================================================

  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const notificationService = new NotificationServiceClass();

export default notificationService;
