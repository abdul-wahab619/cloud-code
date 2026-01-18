/**
 * IssueDetailModal Component
 *
 * Modal for viewing GitHub issue details with comments
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
  Platform,
} from 'react-native';
import { colors } from '../lib/tokens/colors';
import { spacing, borderRadius } from '../lib/tokens/spacing';
import { fontFamily, fontSize, fontWeight } from '../lib/tokens/typography';
import { Button } from './Button';
import { Badge } from './Badge';
import { haptics } from '../lib/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../lib/useStore';

// ============================================================================
// Types
// ============================================================================

export interface IssueComment {
  id: number;
  author: string;
  authorAssociation?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueDetail {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  createdAt: string;
  updatedAt: string;
  body?: string;
  comments: number;
  labels: Array<{ name: string; color: string }>;
  repository: string;
  url: string;
}

interface IssueDetailModalProps {
  visible: boolean;
  onClose: () => void;
  issueNumber: number;
  repository: string;
}

// ============================================================================
// Component
// ============================================================================

export function IssueDetailModal({
  visible,
  onClose,
  issueNumber,
  repository,
}: IssueDetailModalProps) {
  const { getToken } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && issueNumber && repository) {
      loadIssueDetails();
    }
  }, [visible, issueNumber, repository]);

  const loadIssueDetails = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      // Fetch issue details
      const issueResponse = await fetch(
        `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!issueResponse.ok) {
        throw new Error(`GitHub API error: ${issueResponse.status}`);
      }

      const issueData = await issueResponse.json();

      // Skip if this is a pull request
      if (issueData.pull_request) {
        throw new Error('This is a pull request, not an issue');
      }

      setIssue({
        number: issueData.number,
        title: issueData.title,
        state: issueData.state,
        author: issueData.user.login,
        createdAt: issueData.created_at,
        updatedAt: issueData.updated_at,
        body: issueData.body,
        comments: issueData.comments,
        labels: issueData.labels.map((label: any) => ({
          name: label.name,
          color: label.color,
        })),
        repository,
        url: issueData.html_url,
      });

      // Fetch comments if there are any
      if (issueData.comments > 0) {
        const commentsResponse = await fetch(
          `https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          setComments(
            commentsData.map((comment: any) => ({
              id: comment.id,
              author: comment.user.login,
              authorAssociation: comment.author_association,
              body: comment.body,
              createdAt: comment.created_at,
              updatedAt: comment.updated_at,
            }))
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issue details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const handleOpenInGitHub = () => {
    if (issue?.url) {
      haptics.light();
      Linking.openURL(issue.url).catch(() => {
        Alert.alert('Error', 'Could not open URL');
      });
    }
  };

  const renderComment = (comment: IssueComment) => (
    <View key={comment.id} style={styles.commentContainer}>
      <View style={styles.commentHeader}>
        <View style={styles.authorInfo}>
          <Ionicons name="person-circle" size={24} color={colors.mutedForeground} />
          <Text style={styles.authorName}>{comment.author}</Text>
          {comment.authorAssociation && comment.authorAssociation !== 'NONE' && (
            <Badge variant="outline" size="sm">
              {comment.authorAssociation}
            </Badge>
          )}
        </View>
        <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>
      </View>
      <Text style={styles.commentBody}>{comment.body || 'No comment'}</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>Issue Details</Text>
          <Pressable onPress={handleOpenInGitHub} style={styles.headerButton}>
            <Ionicons name="open-outline" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.loadingText}>Loading issue details...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.destructive} />
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <Button variant="outline" onPress={onClose} style={{ marginTop: spacing.lg }}>
              Close
            </Button>
          </View>
        ) : issue ? (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Issue Header */}
            <View style={styles.issueHeader}>
              <View style={styles.issueNumberRow}>
                <Text style={styles.issueNumber}>#{issue.number}</Text>
                <Badge
                  variant={issue.state === 'open' ? 'success' : 'secondary'}
                  size="sm"
                >
                  {issue.state}
                </Badge>
              </View>
              <Text style={styles.issueTitle}>{issue.title}</Text>

              {/* Labels */}
              {issue.labels.length > 0 && (
                <View style={styles.labelsContainer}>
                  {issue.labels.map((label) => (
                    <View
                      key={label.name}
                      style={[
                        styles.label,
                        { backgroundColor: `#${label.color}` || colors.muted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.labelText,
                          { color: getContrastColor(label.color) },
                        ]}
                      >
                        {label.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Metadata */}
              <View style={styles.metadata}>
                <View style={styles.metadataItem}>
                  <Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
                  <Text style={styles.metadataText}>{issue.author}</Text>
                </View>
                <View style={styles.metadataItem}>
                  <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} />
                  <Text style={styles.metadataText}>
                    opened {formatDate(issue.createdAt)}
                  </Text>
                </View>
                <View style={styles.metadataItem}>
                  <Ionicons name="chatbubbles-outline" size={16} color={colors.mutedForeground} />
                  <Text style={styles.metadataText}>{issue.comments} comments</Text>
                </View>
              </View>
            </View>

            {/* Issue Body */}
            {issue.body && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.bodyText}>{issue.body}</Text>
              </View>
            )}

            {/* Comments */}
            {comments.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Comments ({comments.length})
                </Text>
                {comments.map(renderComment)}
              </View>
            )}

            {comments.length === 0 && issue.comments === 0 && (
              <View style={styles.section}>
                <Text style={styles.noComments}>No comments yet</Text>
              </View>
            )}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getContrastColor(hexColor: string): string {
  // Remove # if present
  const color = (hexColor || '808080').replace('#', '');

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...Platform.select({
      ios: {
        paddingTop: spacing.lg,
      },
    }),
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.mutedForeground,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing.md,
  },
  errorMessage: {
    fontSize: fontSize.md,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
  },
  issueHeader: {
    marginBottom: spacing.lg,
  },
  issueNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  issueNumber: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
  },
  issueTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  labelsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  label: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  labelText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  metadata: {
    gap: spacing.sm,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metadataText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  bodyText: {
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.foreground,
  },
  commentContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentHeader: {
    marginBottom: spacing.sm,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  authorName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  commentDate: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  commentBody: {
    fontSize: fontSize.md,
    lineHeight: 20,
    color: colors.foreground,
  },
  noComments: {
    fontSize: fontSize.md,
    color: colors.mutedForeground,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
