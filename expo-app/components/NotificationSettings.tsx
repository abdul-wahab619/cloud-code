/**
 * NotificationSettings Component
 * Provides toggle switches for different notification types with permission management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Card, CardRow } from './Card';
import { Toggle } from './Toggle';
import { colors, commonStyles } from '../lib/styles';
import { spacing, borderRadius } from '../lib/tokens/spacing';
import { haptics } from '../lib/haptics';
import { settingsStorage, STORAGE_KEYS } from '../lib/offlineStorage';

/**
 * Notification settings state
 */
export interface NotificationSettingsState {
  /** All notifications enabled */
  enabled: boolean;
  /** Session complete notifications */
  sessionComplete: boolean;
  /** PR status updates */
  prStatus: boolean;
  /** Error alerts */
  errorAlerts: boolean;
  /** General notifications */
  general: boolean;
}

/**
 * Permission status
 */
interface NotificationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'not-determined';
}

const DEFAULT_SETTINGS: NotificationSettingsState = {
  enabled: true,
  sessionComplete: true,
  prStatus: true,
  errorAlerts: true,
  general: true,
};

/**
 * Legacy notification prefs interface (for backwards compatibility)
 */
export interface NotificationPrefs {
  sessionComplete: boolean;
  prStatus: boolean;
  errorAlerts: boolean;
}

export interface NotificationSettingsProps {
  /** Callback when settings change */
  onSettingsChange?: (settings: NotificationSettingsState) => void;
  /** Legacy callback for backwards compatibility */
  onPrefsChange?: (prefs: NotificationPrefs) => void;
  /** Initial settings (overrides stored settings) */
  initialSettings?: Partial<NotificationSettingsState>;
  /** Additional style for container */
  style?: any;
  /** Show permission request banner */
  showPermissionBanner?: boolean;
  /** Test ID for testing */
  testID?: string;
}

/**
 * NotificationSettings Component
 */
export function NotificationSettings({
  onSettingsChange,
  onPrefsChange,
  initialSettings,
  style,
  showPermissionBanner = true,
  testID,
}: NotificationSettingsProps) {
  const [settings, setSettings] = useState<NotificationSettingsState>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });
  const [permissionStatus, setNotificationPermissionStatus] = useState<NotificationPermissionStatus>({
    granted: false,
    canAskAgain: true,
    status: 'not-determined',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings from storage and check permissions
  useEffect(() => {
    loadSettingsAndPermissions();
  }, []);

  const loadSettingsAndPermissions = async () => {
    setIsLoading(true);

    try {
      // Load stored settings
      const storedPrefs = await settingsStorage.getNotificationPrefs();
      if (storedPrefs) {
        setSettings(prev => ({
          ...prev,
          sessionComplete: storedPrefs.sessionComplete,
          prStatus: storedPrefs.prStatus,
          errorAlerts: storedPrefs.errorAlerts,
        }));
      }

      // Check notification permissions
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      setNotificationPermissionStatus({
        granted: status === 'granted',
        canAskAgain,
        status: status as 'granted' | 'denied' | 'not-determined',
      });
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Save settings to storage
  const saveSettings = useCallback(
    async (newSettings: NotificationSettingsState) => {
      setIsSaving(true);

      try {
        await settingsStorage.saveNotificationPrefs({
          sessionComplete: newSettings.sessionComplete,
          prStatus: newSettings.prStatus,
          errorAlerts: newSettings.errorAlerts,
        });

        // Call both callbacks for compatibility
        onSettingsChange?.(newSettings);
        onPrefsChange?.({
          sessionComplete: newSettings.sessionComplete,
          prStatus: newSettings.prStatus,
          errorAlerts: newSettings.errorAlerts,
        });
      } catch (error) {
        console.error('Failed to save notification settings:', error);
      } finally {
        setIsSaving(false);
      }
    },
    [onSettingsChange, onPrefsChange]
  );

  // Request notification permissions
  const requestPermissions = async () => {
    haptics.modalOpen();

    try {
      const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
      setNotificationPermissionStatus({
        granted: status === 'granted',
        canAskAgain,
        status: status as 'granted' | 'denied' | 'not-determined',
      });

      if (status === 'granted') {
        // Enable notifications on successful permission grant
        const newSettings = { ...settings, enabled: true };
        setSettings(newSettings);
        await saveSettings(newSettings);
      }
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
    }
  };

  // Handle toggle change with haptic feedback
  const handleToggleChange = async (
    key: keyof NotificationSettingsState,
    value: boolean
  ) => {
    haptics.toggle();

    let newSettings = { ...settings, [key]: value };

    // If enabling a specific type but overall is disabled, enable overall
    if (value && !settings.enabled && key !== 'enabled') {
      newSettings.enabled = true;
    }

    // If disabling overall, disable all types
    if (key === 'enabled' && !value) {
      newSettings.sessionComplete = false;
      newSettings.prStatus = false;
      newSettings.errorAlerts = false;
      newSettings.general = false;
    }

    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={styles.scrollContent}
      testID={testID}
    >
      {/* Permission Banner */}
      {showPermissionBanner && !permissionStatus.granted && (
        <Card variant="outlined" size="md" style={styles.banner}>
          <CardRow justify="space-between">
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle}>Enable Notifications</Text>
              <Text style={styles.bannerDescription}>
                {permissionStatus.canAskAgain
                  ? 'Allow notifications to stay updated'
                  : 'Notifications are disabled. Enable them in system settings.'}
              </Text>
            </View>
            {permissionStatus.canAskAgain && (
              <Toggle
                value={false}
                onValueChange={requestPermissions}
                size="md"
                variant="primary"
              />
            )}
          </CardRow>
        </Card>
      )}

      {/* Permission Status Indicator */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: permissionStatus.granted ? colors.success : colors.error }]} />
        <Text style={styles.statusText}>
          {permissionStatus.granted ? 'Notifications Enabled' : 'Notifications Disabled'}
        </Text>
        {!permissionStatus.granted && permissionStatus.canAskAgain && (
          <Text style={styles.tapEnable} onPress={requestPermissions}>
            Tap to enable
          </Text>
        )}
      </View>

      {/* Main Toggle */}
      <Card title="Notifications" size="md" style={styles.card}>
        <CardRow justify="space-between">
          <View style={styles.labelContainer}>
            <Text style={styles.label}>Enable Notifications</Text>
            <Text style={styles.description}>
              Receive push notifications for updates
            </Text>
          </View>
          <Toggle
            value={settings.enabled}
            onValueChange={(v) => handleToggleChange('enabled', v)}
            disabled={!permissionStatus.granted && !permissionStatus.canAskAgain}
            testID="notifications-enabled-toggle"
            accessibilityLabel="Enable notifications"
          />
        </CardRow>
      </Card>

      {/* Notification Types */}
      <Card title="Notification Types" size="md" style={styles.card}>
        {/* Session Complete */}
        <View style={styles.toggleRow}>
          <CardRow justify="space-between">
            <View style={styles.labelContainer}>
              <Text style={styles.label}>Session Complete</Text>
              <Text style={styles.description}>
                Get notified when Claude finishes a session
              </Text>
            </View>
            <Toggle
              value={settings.sessionComplete}
              onValueChange={(v) => handleToggleChange('sessionComplete', v)}
              disabled={!settings.enabled}
              variant="success"
              testID="session-complete-toggle"
              accessibilityLabel="Session complete notifications"
            />
          </CardRow>
        </View>

        <View style={styles.divider} />

        {/* PR Status */}
        <View style={styles.toggleRow}>
          <CardRow justify="space-between">
            <View style={styles.labelContainer}>
              <Text style={styles.label}>PR Status Updates</Text>
              <Text style={styles.description}>
                Updates on pull request status changes
              </Text>
            </View>
            <Toggle
              value={settings.prStatus}
              onValueChange={(v) => handleToggleChange('prStatus', v)}
              disabled={!settings.enabled}
              variant="success"
              testID="pr-status-toggle"
              accessibilityLabel="PR status notifications"
            />
          </CardRow>
        </View>

        <View style={styles.divider} />

        {/* Error Alerts */}
        <View style={styles.toggleRow}>
          <CardRow justify="space-between">
            <View style={styles.labelContainer}>
              <Text style={styles.label}>Error Alerts</Text>
              <Text style={styles.description}>
                Receive alerts for errors and failures
              </Text>
            </View>
            <Toggle
              value={settings.errorAlerts}
              onValueChange={(v) => handleToggleChange('errorAlerts', v)}
              disabled={!settings.enabled}
              variant="error"
              testID="error-alerts-toggle"
              accessibilityLabel="Error alert notifications"
            />
          </CardRow>
        </View>

        <View style={styles.divider} />

        {/* General Notifications */}
        <View style={[styles.toggleRow, styles.noMargin]}>
          <CardRow justify="space-between">
            <View style={styles.labelContainer}>
              <Text style={styles.label}>General Notifications</Text>
              <Text style={styles.description}>
                General app updates and announcements
              </Text>
            </View>
            <Toggle
              value={settings.general}
              onValueChange={(v) => handleToggleChange('general', v)}
              disabled={!settings.enabled}
              variant="primary"
              testID="general-toggle"
              accessibilityLabel="General notifications"
            />
          </CardRow>
        </View>
      </Card>

      {/* Saving Indicator */}
      {isSaving && (
        <View style={styles.savingIndicator}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: spacing[4],
  },
  loadingText: {
    ...commonStyles.textMutedForeground,
    marginTop: spacing[2],
  },
  banner: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: colors.brand,
    marginBottom: spacing[4],
  },
  bannerContent: {
    flex: 1,
    marginRight: spacing[3],
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing[0.5],
  },
  bannerDescription: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
    paddingHorizontal: spacing[2],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing[2],
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  tapEnable: {
    fontSize: 14,
    color: colors.brand,
    marginLeft: spacing[2],
    fontWeight: '500',
  },
  card: {
    marginBottom: spacing[4],
  },
  toggleRow: {
    paddingVertical: spacing[2],
  },
  noMargin: {
    marginBottom: 0,
  },
  labelContainer: {
    flex: 1,
    marginRight: spacing[3],
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: spacing[0.5],
  },
  description: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing[3],
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
  },
  savingText: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginLeft: spacing[2],
  },
});

export default NotificationSettings;
