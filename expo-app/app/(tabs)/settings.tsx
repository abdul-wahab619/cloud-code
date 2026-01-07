// Cache bust: v2
import { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAppStore } from '../lib/useStore';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { StatusDot } from '../../components/StatusDot';
import { Button } from '../../components/Button';
import { colors } from '../lib/styles';
import { Ionicons } from '@expo/vector-icons';

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  spaceY4: { gap: 16 },
  justifyBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  destructiveText: {
    color: colors.error,
    fontSize: 14,
  },
});

export default function SettingsScreen() {
  const { stats, status, isLoading, refresh } = useAppStore();

  useEffect(() => {
    refresh();
  }, []);

  const openGitHubSetup = async () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/gh-setup';
    } else {
      await WebBrowser.openAsync('https://cloud-code.finhub.workers.dev/gh-setup');
    }
  };

  // Check if GitHub is configured (supports both old and new API responses)
  const isGitHubConfigured = status?.configured || status?.githubAppConfigured;

  return (
    <ScrollView style={styles.flex1}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.content}>
        {/* GitHub Status */}
        <Card title="GitHub Configuration">
          <View style={styles.spaceY4}>
            <View style={styles.row}>
              <StatusDot status={isGitHubConfigured ? 'completed' : 'pending'} />
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      isGitHubConfigured
                        ? colors.success
                        : colors.warning,
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
            />
          </View>
        </Card>

        {/* Claude API Status */}
        <Card title="Claude API">
          <View style={styles.justifyBetween}>
            <View>
              <Text style={[styles.textMuted, { fontWeight: '500' }]}>Claude API (Centralized)</Text>
              <Text style={styles.textXsMuted}>Managed by service administrator</Text>
            </View>
            <Badge
              label={stats?.claudeKeyConfigured ? 'Configured' : 'Not Set'}
              variant={stats?.claudeKeyConfigured ? 'success' : 'warning'}
            />
          </View>
          <Text style={[styles.textXsMuted, { marginTop: 16 }]}>
            Contact your administrator to configure the Claude API key
          </Text>
        </Card>

        {/* Connected Repositories */}
        {stats?.repositories && stats.repositories.length > 0 && (
          <Card title="Connected Repositories">
            {stats.repositories.map((repo) => (
              <View key={repo} style={styles.repoRow}>
                <View style={styles.row}>
                  <Ionicons name="logo-github" size={18} color="#71717a" />
                  <Text style={styles.textMuted}>{repo}</Text>
                </View>
                <Badge label="Connected" variant="secondary" />
              </View>
            ))}
          </Card>
        )}

        {/* About */}
        <Card title="About">
          <View style={styles.spaceY4}>
            <View style={styles.row}>
              <Ionicons name="flash" size={18} color="#6366f1" />
              <Text style={[styles.textMuted, { fontWeight: '500' }]}>Claude Code Pipeline</Text>
            </View>
            <Text style={styles.textMuted}>Version: 2.0.0 (Expo Web)</Text>
            <Text style={styles.textMuted}>AI-powered coding automation for GitHub</Text>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
