// Cache bust: v7
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../lib/useStore';
import { Badge } from '../../components/Badge';
import { StatusDot } from '../../components/StatusDot';
import { Button } from '../../components/Button';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { Toggle } from '../../components/Toggle';
import { SettingsList } from '../../components/SettingsList';
import { AccountSettings } from '../../components/AccountSettings';
import { AuthModal, AuthMode } from '../../components/AuthModal';
import { NotificationSettings } from '../../components/NotificationSettings';
import { colors } from '../../lib/styles';
import { spacing } from '../../lib/tokens/spacing';
import { haptics } from '../../lib/haptics';
import {
  settingsStorage,
  cacheStorage,
  offlineState,
} from '../../lib/offlineStorage';
import {
  isBiometricAvailable,
  getBiometricTypeName,
  quickAuthenticate,
} from '../../lib/biometrics';
import { useToast } from '../../lib/useToast';
import { AnalyticsService } from '../../services/AnalyticsService';

// App version - should be updated with releases
const APP_VERSION = '2.1.0';
const APP_BUILD = '2026.01.08';

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.error,
  },
  content: {
    padding: spacing[4],
    gap: spacing[4],
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing[2],
    marginTop: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  textMuted: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  textXsMuted: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  spaceY4: { gap: spacing[4] },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  destructiveText: {
    color: colors.error,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: spacing[0.5],
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  aboutLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  repoSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  repoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    backgroundColor: colors.muted,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  repoChipSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: colors.brand,
  },
  repoChipText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  repoChipTextSelected: {
    color: colors.foreground,
    fontWeight: '500',
  },
  repoChipIcon: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  dangerZone: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
});

function SettingsScreenContent() {
  const { stats, status, isLoading, refresh, repositories, isOffline, selectedRepositories, setSelectedRepositories } =
    useAppStore();
  const toast = useToast();

  // Local state for settings
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'fingerprint' | 'iris' | 'none'>('none');
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(false);
  const [cacheSize, setCacheSize] = useState<string>('0 MB');
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(AnalyticsService.isEnabled());
  const [analyticsQueueSize, setAnalyticsQueueSize] = useState(AnalyticsService.getQueueSize());

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    checkBiometricAvailability();
    updateCacheSize();
  }, []);

  // Update cache size periodically
  useEffect(() => {
    const interval = setInterval(updateCacheSize, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  // Update analytics queue size periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setAnalyticsQueueSize(AnalyticsService.getQueueSize());
    }, 5000); // Update every 5s
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    const [savedTheme, savedBiometric, savedOffline] = await Promise.all([
      settingsStorage.getTheme(),
      settingsStorage.getBiometricEnabled(),
      settingsStorage.getOfflineModeEnabled(),
    ]);
    setTheme(savedTheme);
    setBiometricEnabled(savedBiometric);
    setOfflineModeEnabled(savedOffline);
  };

  const checkBiometricAvailability = async () => {
    const { available, biometricType: type } = await isBiometricAvailable();
    setBiometricAvailable(available);
    setBiometricType(type);
  };

  const updateCacheSize = async () => {
    const size = await cacheStorage.getCacheSize();
    const mb = (size / (1024 * 1024)).toFixed(1);
    setCacheSize(`${mb} MB`);
  };

  useEffect(() => {
    refresh();
  }, []);

  const openGitHubSetup = async () => {
    haptics.buttonPress();
    if (typeof window !== 'undefined') {
      window.location.href = '/gh-setup';
    } else {
      await WebBrowser.openAsync('https://cloud-code.finhub.workers.dev/gh-setup');
    }
  };

  // Check if GitHub is configured (supports both old and new API responses)
  const isGitHubConfigured = status?.configured || status?.githubAppConfigured;

  // Theme handlers
  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    haptics.toggle();
    setTheme(newTheme);
    await settingsStorage.saveTheme(newTheme);
    toast.success(`Theme changed to ${newTheme}`);
  };

  // Biometric handlers
  const handleBiometricToggle = async (enabled: boolean) => {
    haptics.toggle();

    if (enabled) {
      // Require authentication to enable biometric
      const authenticated = await quickAuthenticate('Authenticate to enable biometric lock');
      if (!authenticated) {
        toast.error('Authentication required');
        return;
      }
    }

    setBiometricEnabled(enabled);
    await settingsStorage.saveBiometricEnabled(enabled);

    if (enabled && biometricAvailable) {
      toast.success(`${getBiometricTypeName(biometricType)} enabled`);
    }
  };

  // Offline mode handlers
  const handleOfflineModeToggle = async (enabled: boolean) => {
    haptics.toggle();
    setOfflineModeEnabled(enabled);
    await settingsStorage.saveOfflineModeEnabled(enabled);
    await offlineState.setOffline(enabled);

    if (enabled) {
      toast.warning('Offline mode enabled. Some features may be limited.');
    } else {
      toast.success('Online mode restored');
    }
  };

  // Repository selection handlers
  const toggleRepositorySelection = async (repo: string) => {
    haptics.selection();
    const isSelected = selectedRepositories.includes(repo);
    let newSelection: string[];

    if (isSelected) {
      newSelection = selectedRepositories.filter((r) => r !== repo);
    } else {
      newSelection = [...selectedRepositories, repo];
    }

    await setSelectedRepositories(newSelection);
    toast.success(
      `${newSelection.length} repository${newSelection.length !== 1 ? 'ies' : ''} selected`
    );
  };

  // Clear cache handler
  const handleClearCache = async () => {
    haptics.warning();
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data. You may need to sync again. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            haptics.delete();
            setIsClearingCache(true);
            try {
              await cacheStorage.clearCache();
              await updateCacheSize();
              toast.success('Cache cleared successfully');
            } catch (error) {
              toast.error('Failed to clear cache');
            } finally {
              setIsClearingCache(false);
            }
          },
        },
      ]
    );
  };

  // Analytics handlers
  const handleAnalyticsToggle = (enabled: boolean) => {
    haptics.toggle();
    if (enabled) {
      AnalyticsService.enable();
      setAnalyticsEnabled(true);
      toast.success('Analytics enabled. Thank you for helping us improve!');
    } else {
      Alert.alert(
        'Disable Analytics',
        'Disabling analytics means we won\'t be able to track usage data to improve the app. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => {
              AnalyticsService.disable();
              setAnalyticsEnabled(false);
              setAnalyticsQueueSize(0);
              toast.success('Analytics disabled');
            },
          },
        ]
      );
    }
  };

  const handleExportAnalytics = () => {
    haptics.buttonPress();
    const data = AnalyticsService.exportData();
    console.log('[Analytics] Exported data:', data);
    toast.success('Analytics data exported to console');
  };

  const handleResetAnalytics = () => {
    haptics.warning();
    Alert.alert(
      'Reset Analytics',
      'This will delete all analytics data and reset your install ID. This action cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            AnalyticsService.reset();
            setAnalyticsEnabled(false);
            setAnalyticsQueueSize(0);
            toast.success('Analytics data reset');
          },
        },
      ]
    );
  };

  // Auth handlers
  const handleOpenAuth = (mode: AuthMode = 'login') => {
    setAuthMode(mode);
    setAuthModalVisible(true);
  };

  const handleCloseAuth = () => {
    setAuthModalVisible(false);
  };

  const handleAuthSuccess = () => {
    toast.success('Authentication successful!');
    refresh();
  };

  // Get theme display name
  const getThemeDisplayName = (t: 'light' | 'dark' | 'system') => {
    switch (t) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
    }
  };

  // Get available repositories for selection
  const availableRepos = stats?.repositories || [];

  return (
    <ScrollView style={styles.flex1}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Settings</Text>
          {isOffline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline" size={12} color={colors.error} />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.content}>
        {/* GitHub Configuration */}
        <Text style={styles.sectionTitle}>Integrations</Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>GitHub Configuration</Text>
            <Badge
              label={isGitHubConfigured ? 'Connected' : 'Not Connected'}
              variant={isGitHubConfigured ? 'success' : 'warning'}
            />
          </View>
          <View style={styles.row}>
            <StatusDot status={isGitHubConfigured ? 'completed' : 'pending'} />
            <Text
              style={[
                styles.statusText,
                {
                  color: isGitHubConfigured ? colors.success : colors.warning,
                },
              ]}
            >
              {isGitHubConfigured ? 'GitHub App Connected' : 'GitHub Not Connected'}
            </Text>
          </View>
          <Text style={styles.textMuted}>
            {isGitHubConfigured
              ? 'Your GitHub App is properly configured and connected.'
              : 'Install the GitHub App to enable automatic issue processing.'}
          </Text>
          <Button
            label={isGitHubConfigured ? 'Reconfigure GitHub' : 'Connect GitHub App'}
            icon={<Ionicons name="logo-github" size={18} color="currentColor" />}
            variant={isGitHubConfigured ? 'outline' : 'primary'}
            onPress={openGitHubSetup}
            size="sm"
          />
        </View>

        {/* Claude API Status */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Claude API</Text>
            <Badge
              label={stats?.claudeKeyConfigured ? 'Configured' : 'Not Set'}
              variant={stats?.claudeKeyConfigured ? 'success' : 'warning'}
            />
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Claude API (Centralized)</Text>
              <Text style={styles.settingDescription}>Managed by service administrator</Text>
            </View>
          </View>
        </View>

        {/* Appearance */}
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Theme</Text>
              <Text style={styles.settingDescription}>Select your preferred appearance</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[1] }}>
              {(['light', 'dark', 'system'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => handleThemeChange(t)}
                  style={[
                    styles.repoChip,
                    theme === t && styles.repoChipSelected,
                    { paddingHorizontal: spacing[3] },
                  ]}
                >
                  <Text
                    style={[
                      styles.repoChipText,
                      theme === t && styles.repoChipTextSelected,
                    ]}
                  >
                    {getThemeDisplayName(t)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Security */}
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          {biometricAvailable ? (
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Biometric Authentication</Text>
                <Text style={styles.settingDescription}>
                  Use {getBiometricTypeName(biometricType)} to unlock the app
                </Text>
              </View>
              <Toggle
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                accessibilityLabel="Toggle biometric authentication"
                variant="success"
              />
            </View>
          ) : (
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Biometric Authentication</Text>
                <Text style={styles.settingDescription}>Not available on this device</Text>
              </View>
              <Badge label="Unavailable" variant="secondary" />
            </View>
          )}
        </View>

        {/* Offline Mode */}
        <Text style={styles.sectionTitle}>Offline Mode</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Offline Mode</Text>
              <Text style={styles.settingDescription}>
                Work offline with cached data
              </Text>
            </View>
            <Toggle
              value={offlineModeEnabled}
              onValueChange={handleOfflineModeToggle}
              accessibilityLabel="Toggle offline mode"
              variant={offlineModeEnabled ? 'warning' : 'primary'}
            />
          </View>
          {isOffline && (
            <Text style={[styles.textXsMuted, { marginTop: spacing[2] }]}>
              You are currently offline. Some features may be limited.
            </Text>
          )}
        </View>

        {/* Repository Selection */}
        {availableRepos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Repository Selection</Text>
            <View style={styles.card}>
              <Text style={styles.settingLabel}>Select Repositories</Text>
              <Text style={styles.settingDescription}>
                Choose repositories for Claude Code sessions ({selectedRepositories.length} selected)
              </Text>
              <View style={styles.repoSelector}>
                {availableRepos.map((repo) => {
                  const isSelected = selectedRepositories.includes(repo);
                  return (
                    <Pressable
                      key={repo}
                      onPress={() => toggleRepositorySelection(repo)}
                      style={[styles.repoChip, isSelected && styles.repoChipSelected]}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={isSelected ? colors.brand : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.repoChipText,
                          isSelected && styles.repoChipTextSelected,
                        ]}
                      >
                        {repo}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* Data & Storage */}
        <Text style={styles.sectionTitle}>Data & Storage</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Cache Size</Text>
              <Text style={styles.settingDescription}>
                Temporary storage for offline data
              </Text>
            </View>
            <Text style={styles.aboutValue}>{cacheSize}</Text>
          </View>
          <Button
            label="Clear Cache"
            icon={<Ionicons name="trash-outline" size={18} color={colors.error} />}
            variant="outline"
            onPress={handleClearCache}
            loading={isClearingCache}
            disabled={isClearingCache || cacheSize === '0 MB'}
            haptic="heavy"
            style={{ borderColor: colors.error }}
            fullWidth
          />
        </View>

        {/* Analytics */}
        <Text style={styles.sectionTitle}>Analytics</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Usage Analytics</Text>
              <Text style={styles.settingDescription}>
                Help us improve by sharing anonymous usage data
              </Text>
            </View>
            <Toggle
              value={analyticsEnabled}
              onValueChange={handleAnalyticsToggle}
              accessibilityLabel="Toggle analytics"
              variant="primary"
            />
          </View>
          {analyticsEnabled && (
            <>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Queue Status</Text>
                  <Text style={styles.settingDescription}>
                    {analyticsQueueSize} event{analyticsQueueSize !== 1 ? 's' : ''} pending
                  </Text>
                </View>
              </View>
              <View style={[styles.row, { gap: spacing[2] }]}>
                <Button
                  label="Export"
                  icon={<Ionicons name="download-outline" size={16} color="currentColor" />}
                  variant="outline"
                  size="sm"
                  onPress={handleExportAnalytics}
                />
                <Button
                  label="Reset"
                  icon={<Ionicons name="refresh-outline" size={16} color={colors.error} />}
                  variant="outline"
                  size="sm"
                  onPress={handleResetAnalytics}
                  style={{ borderColor: colors.error }}
                />
              </View>
            </>
          )}
        </View>

        {/* Notifications */}
        <NotificationSettings />

        {/* Account Information */}
        <AccountSettings onNavigateToAuth={() => handleOpenAuth('login')} />

        {/* Auth Modal */}
        <AuthModal
          visible={authModalVisible}
          mode={authMode}
          onClose={handleCloseAuth}
          onModeChange={setAuthMode}
          onSuccess={handleAuthSuccess}
        />

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="flash" size={18} color={colors.brand} />
            <Text style={[styles.settingLabel, { marginLeft: spacing[2] }]}>
              Claude Code Pipeline
            </Text>
          </View>
          <Text style={styles.textMuted}>
            AI-powered coding automation for GitHub issues and pull requests.
          </Text>
          <View style={[styles.row, { marginTop: spacing[2] }]}>
            <Text style={styles.textXsMuted}>Version {APP_VERSION} (Build {APP_BUILD})</Text>
          </View>
        </View>

        {/* Quick Links */}
        <Text style={styles.sectionTitle}>Quick Links</Text>
        <SettingsList
          items={[
            {
              id: 'docs',
              title: 'Documentation',
              description: 'View user guides and API documentation',
              icon: 'document-text-outline',
              type: 'button',
              onPress: () => {
                haptics.buttonPress();
                toast.success('Opening documentation...');
              },
            },
            {
              id: 'support',
              title: 'Support',
              description: 'Get help or report an issue',
              icon: 'help-circle-outline',
              type: 'button',
              onPress: () => {
                haptics.buttonPress();
                toast.success('Opening support...');
              },
            },
            {
              id: 'privacy',
              title: 'Privacy Policy',
              description: 'Learn about data handling practices',
              icon: 'shield-checkmark-outline',
              type: 'button',
              onPress: () => {
                haptics.buttonPress();
                toast.success('Opening privacy policy...');
              },
            },
          ]}
        />
      </View>
    </ScrollView>
  );
}

export default function SettingsScreen() {
  return (
    <ErrorBoundary>
      <SettingsScreenContent />
    </ErrorBoundary>
  );
}
