/**
 * Account Settings Component
 *
 * Displays user account information and provides account management options.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAppStore } from '../lib/useStore';
import type { UserAccount, UserTier } from '../lib/types';
import { TIER_LIMITS } from '../lib/types';

// ============================================================================
// Helper Components
// ============================================================================

function TierBadge({ tier }: { tier: UserTier }) {
  const colors: Record<UserTier, string> = {
    free: '#8E8E93',
    pro: '#007AFF',
    enterprise: '#5856D6',
  };

  return (
    <View style={[styles.tierBadge, { backgroundColor: colors[tier] }]}>
      <Text style={styles.tierBadgeText}>
        {tier === 'free' ? 'FREE' : tier === 'pro' ? 'PRO' : 'ENTERPRISE'}
      </Text>
    </View>
  );
}

function UsageStat({ label, value, max, color = '#007AFF' }: { label: string; value: number; max?: number; color?: string }) {
  const percentage = max && max > 0 ? (value / max) * 100 : 0;
  const isUnlimited = max === -1;
  const isNearLimit = max && max > 0 && value >= max * 0.8;
  const barColor = isNearLimit ? '#FF3B30' : color;

  return (
    <View style={styles.usageStat}>
      <View style={styles.usageStatHeader}>
        <Text style={styles.usageStatLabel}>{label}</Text>
        <Text style={styles.usageStatValue}>
          {isUnlimited ? 'Unlimited' : `${value} / ${max}`}
        </Text>
      </View>
      {!isUnlimited && max !== undefined && (
        <View style={styles.usageBarBackground}>
          <View style={[styles.usageBarFill, { width: `${Math.min(percentage, 100)}%`, backgroundColor: barColor }]} />
        </View>
      )}
    </View>
  );
}

function SettingRow({
  label,
  value,
  onPress,
  destructive = false,
  disabled = false,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, destructive && styles.settingRowDestructive]}
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
    >
      <Text style={[styles.settingLabel, destructive && styles.settingLabelDestructive]}>{label}</Text>
      {value && <Text style={styles.settingValue}>{value}</Text>}
      {onPress && <Text style={styles.settingChevron}>›</Text>}
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface AccountSettingsProps {
  onNavigateToAuth?: () => void;
}

export function AccountSettings({ onNavigateToAuth }: AccountSettingsProps) {
  const { user, isAuthenticated, logout, updateUser } = useAppStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            await logout();
            setIsLoggingOut(false);
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleEditProfile = () => {
    Alert.prompt(
      'Edit Name',
      'Enter your display name',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (name: string | undefined) => {
            if (name && name.trim()) {
              await updateUser({ name: name.trim() });
            }
          },
        },
      ],
      'plain-text',
      user?.name || ''
    );
  };

  // Not authenticated - show login button
  if (!isAuthenticated || !user) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.notAuthenticatedContainer}>
          <Text style={styles.notAuthenticatedText}>
            Sign in to track your usage and access premium features
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={onNavigateToAuth}
            accessibilityRole="button"
            accessibilityLabel="Sign in to your account"
          >
            <Text style={styles.signInButtonText}>Sign In / Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Authenticated - show account info
  const limits = user.limits || TIER_LIMITS[user.tier];
  const canUpgrade = user.tier === 'free';

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>

      {/* User Info Card */}
      <View style={styles.userInfoCard}>
        <View style={styles.userInfoHeader}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{user.name}</Text>
              <TierBadge tier={user.tier} />
            </View>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        </View>

        {user.isEmailVerified === false && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              Please verify your email address
            </Text>
          </View>
        )}
      </View>

      {/* Usage Statistics */}
      <View style={styles.usageContainer}>
        <Text style={styles.usageTitle}>Usage This Month</Text>

        <UsageStat
          label="Sessions"
          value={user.usage.sessionsThisMonth}
          max={limits.sessionsPerMonth}
          color="#34C759"
        />

        <UsageStat
          label="Repositories"
          value={user.usage.repositoryCount}
          max={limits.repositories}
          color="#FF9500"
        />

        <UsageStat
          label="Total Sessions"
          value={user.usage.totalSessions}
        />
      </View>

      {/* Account Settings */}
      <View style={styles.settingsContainer}>
        <SettingRow
          label="Edit Profile"
          value={user.name}
          onPress={handleEditProfile}
        />

        {canUpgrade && (
          <SettingRow
            label="Upgrade to Pro"
            value="100 sessions/mo, 50 repos"
            onPress={() => {
              Alert.alert(
                'Upgrade to Pro',
                'Get 100 sessions per month, connect up to 50 repositories, and support development.\n\nComing soon!',
                [{ text: 'OK' }]
              );
            }}
          />
        )}

        <SettingRow
          label="Total Sessions"
          value={user.usage.totalSessions.toLocaleString()}
          disabled
        />

        <SettingRow
          label="Member Since"
          value={new Date(user.createdAt).toLocaleDateString()}
          disabled
        />
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity
        style={[styles.signOutButton, isLoggingOut && styles.signOutButtonDisabled]}
        onPress={handleLogout}
        disabled={isLoggingOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out of your account"
        accessibilityState={{ disabled: isLoggingOut }}
      >
        {isLoggingOut ? (
          <ActivityIndicator size="small" color="#FF3B30" />
        ) : (
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  notAuthenticatedContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  notAuthenticatedText: {
    fontSize: 15,
    color: '#AEAEB2',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  signInButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  userInfoCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  userInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 8,
  },
  userEmail: {
    fontSize: 14,
    color: '#AEAEB2',
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  warningBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 8,
    padding: 10,
  },
  warningText: {
    fontSize: 13,
    color: '#FF9500',
    textAlign: 'center',
  },
  usageContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  usageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  usageStat: {
    marginBottom: 12,
  },
  usageStatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  usageStatLabel: {
    fontSize: 14,
    color: '#AEAEB2',
  },
  usageStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  usageBarBackground: {
    height: 6,
    backgroundColor: '#2C2C2E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  settingsContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#38383A',
  },
  settingRowDestructive: {
    // Style for destructive actions (if needed)
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  settingLabelDestructive: {
    color: '#FF3B30',
  },
  settingValue: {
    fontSize: 15,
    color: '#8E8E93',
    marginRight: 8,
  },
  settingChevron: {
    fontSize: 20,
    color: '#8E8E93',
  },
  signOutButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  signOutButtonDisabled: {
    opacity: 0.5,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
});
