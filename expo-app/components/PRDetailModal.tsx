/**
 * PRDetailModal Component
 * Modal for viewing pull request details
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { colors } from '../lib/tokens/colors';
import { spacing, borderRadius } from '../lib/tokens/spacing';
import { Button } from './Button';
import { haptics } from '../lib/haptics';
import { Ionicons } from '@expo/vector-icons';

export interface PRDetail {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  body?: string;
  headBranch: string;
  baseBranch: string;
  repository: string;
  url: string;
  reviewDecision?: 'approved' | 'changes_requested' | 'commented' | 'pending' | null;
}

interface PRDetailModalProps {
  visible: boolean;
  onClose: () => void;
  prNumber: number;
  repository: string;
}

export function PRDetailModal({
  visible,
  onClose,
  prNumber,
  repository,
}: PRDetailModalProps) {
  const [pr, setPR] = useState<PRDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && prNumber && repository) {
      loadPR();
    }
  }, [visible, prNumber, repository]);

  const loadPR = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/pr/${repository}/${prNumber}`
      );

      if (!response.ok) {
        throw new Error('Failed to load PR details');
      }

      const data = await response.json();
      setPR(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PR');
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    haptics.modalOpen();
    // Would call merge API
    Alert.alert('Merge', 'Merge functionality coming soon');
  };

  const getStatusColor = () => {
    if (!pr) return colors.mutedForeground;

    switch (pr.state) {
      case 'open':
        return colors.success;
      case 'merged':
        return colors.primary;
      case 'closed':
        return colors.error;
      default:
        return colors.mutedForeground;
    }
  };

  const getStatusIcon = () => {
    if (!pr) return 'git-pr';

    switch (pr.state) {
      case 'open':
        return 'git-pull-request';
      case 'merged':
        return 'git-merge';
      case 'closed':
        return 'close';
      default:
        return 'git-pr';
    }
  };

  const getReviewDecisionColor = () => {
    if (!pr || !pr.reviewDecision) return colors.mutedForeground;

    switch (pr.reviewDecision) {
      case 'approved':
        return colors.success;
      case 'changes_requested':
        return colors.error;
      case 'commented':
        return colors.warning;
      default:
        return colors.mutedForeground;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={e => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name={getStatusIcon() as any} size={24} color={getStatusColor()} />
              <View>
                <Text style={styles.prNumber}>#{prNumber}</Text>
                <Text style={styles.repository}>{repository}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView style={styles.bodyPadding}>
            {loading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading PR details...</Text>
              </View>
            ) : error ? (
              <View style={styles.centered}>
                <Ionicons name="alert-circle" size={48} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
                <Button label="Retry" variant="primary" onPress={loadPR} />
              </View>
            ) : pr ? (
              <>
                {/* Title and State */}
                <Text style={styles.title}>{pr.title}</Text>

                {/* Status badges */}
                <View style={styles.badges}>
                  <View style={[styles.badge, { backgroundColor: `${getStatusColor()}20` }]}>
                    <Text style={[styles.badgeText, { color: getStatusColor() }]}>
                  {pr.state.toUpperCase()}
                </Text>
                  </View>
                  {pr.reviewDecision && (
                    <View style={[styles.badge, { backgroundColor: `${getReviewDecisionColor()}20` }]}>
                      <Text style={[styles.badgeText, { color: getReviewDecisionColor() }]}>
                        {pr.reviewDecision.replace(/_/g, ' ').toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Meta info */}
                <View style={styles.meta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
                    <Text style={styles.metaText}>{pr.author}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
                    <Text style={styles.metaText}>
                      {new Date(pr.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                {/* Branches */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Branches</Text>
                  <View style={styles.branches}>
                    <View style={styles.branch}>
                      <Text style={styles.branchLabel}>From</Text>
                      <Text style={styles.branchName}>{pr.headBranch}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
                    <View style={styles.branch}>
                      <Text style={styles.branchLabel}>Into</Text>
                      <Text style={styles.branchName}>{pr.baseBranch}</Text>
                    </View>
                  </View>
                </View>

                {/* Changes */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Changes</Text>
                  <View style={styles.changes}>
                    <View style={styles.changeItem}>
                      <Ionicons name="add-circle" size={16} color={colors.success} />
                      <Text style={styles.changeText}>+{pr.additions}</Text>
                      <Text style={styles.changeLabel}>additions</Text>
                    </View>
                    <View style={styles.changeItem}>
                      <Ionicons name="remove-circle" size={16} color={colors.error} />
                      <Text style={styles.changeText}>-{pr.deletions}</Text>
                      <Text style={styles.changeLabel}>deletions</Text>
                    </View>
                    <View style={styles.changeItem}>
                      <Ionicons name="document-outline" size={16} color={colors.info} />
                      <Text style={styles.changeText}>{pr.changedFiles}</Text>
                      <Text style={styles.changeLabel}>files</Text>
                    </View>
                  </View>
                </View>

                {/* Body */}
                {pr.body && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Description</Text>
                    <Text style={styles.body}>{pr.body}</Text>
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>

          {/* Footer */}
          {!loading && !error && pr && (
            <View style={styles.footer}>
              <Button
                label="View on GitHub"
                variant="outline"
                icon={<Ionicons name="logo-github" size={18} color="currentColor" />}
                onPress={() => Linking.openURL(pr.url)}
                style={styles.footerButton}
              />
              {pr.state === 'open' && (
                <Button
                  label="Merge PR"
                  variant="primary"
                  icon={<Ionicons name="git-merge" size={18} color="currentColor" />}
                  onPress={handleMerge}
                  style={styles.footerButton}
                />
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  content: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  prNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  repository: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  closeButton: {
    padding: spacing[1],
  },
  bodyPadding: {
    padding: spacing[4],
    gap: spacing[4],
  },
  centered: {
    alignItems: 'center',
    paddingVertical: spacing[8],
    gap: spacing[4],
  },
  loadingText: {
    color: colors.mutedForeground,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    lineHeight: 24,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  meta: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  metaText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  section: {
    gap: spacing[2],
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  branches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  branch: {
    alignItems: 'center',
    gap: spacing[1],
  },
  branchLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
  },
  branchName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  changes: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  changeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  changeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  changeLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.foreground,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: {
    flex: 1,
  },
});
