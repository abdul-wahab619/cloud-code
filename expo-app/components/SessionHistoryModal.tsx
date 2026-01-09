/**
 * SessionHistoryModal Component
 *
 * Displays and manages historical chat sessions with search, filtering,
 * date grouping, and swipe-to-delete functionality.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/tokens/colors';
import { spacing, borderRadius, iconSize } from '../lib/tokens/spacing';
import { fontFamily, fontSize, fontWeight } from '../lib/tokens/typography';
import { haptics } from '../lib/haptics';
import { SwipeableItem, SwipeAction } from './SwipeableItem';

// ============================================================================
// Types
// ============================================================================

export interface SessionListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tokenCount: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  sessionId: string | null;
  selectedRepos: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  sessions: SessionListItem[];
  isLoading?: boolean;
}

// ============================================================================
// Utilities
// ============================================================================

const getDateGroup = (timestamp: number): { label: string; order: number } => {
  const now = Date.now();
  const date = new Date(timestamp);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeek = new Date(now);
  thisWeek.setDate(thisWeek.getDate() - 7);

  // Reset time portions for accurate comparison
  today.setHours(0, 0, 0, 0);
  yesterday.setHours(0, 0, 0, 0);
  thisWeek.setHours(0, 0, 0, 0);

  const sessionDate = new Date(date);
  sessionDate.setHours(0, 0, 0, 0);

  const sessionTime = sessionDate.getTime();
  const todayTime = today.getTime();
  const yesterdayTime = yesterday.getTime();
  const weekTime = thisWeek.getTime();

  if (sessionTime === todayTime) {
    return { label: 'Today', order: 1 };
  } else if (sessionTime === yesterdayTime) {
    return { label: 'Yesterday', order: 2 };
  } else if (sessionTime >= weekTime) {
    return { label: 'This Week', order: 3 };
  } else {
    return { label: 'Older', order: 4 };
  }
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;

  // Less than an hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return minutes < 1 ? 'Just now' : `${minutes}m ago`;
  }

  // Less than a day
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  // Less than a week
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return days === 1 ? 'Yesterday' : `${days}d ago`;
  }

  // Format as date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const formatTokenCount = (count: number): string => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
};

// ============================================================================
// SessionListItem Component
// ============================================================================

interface SessionItemProps {
  session: SessionListItem;
  onPress: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  searchQuery: string;
}

function SessionItem({ session, onPress, onDelete, searchQuery }: SessionItemProps) {
  const handlePress = useCallback(() => {
    haptics.cardPress();
    onPress(session.id);
  }, [session.id, onPress]);

  const deleteAction: SwipeAction = {
    label: 'Delete',
    icon: 'trash',
    color: colors.foreground,
    backgroundColor: colors.error,
    onPress: () => {
      haptics.delete();
      onDelete(session.id);
    },
  };

  // Highlight search query in title
  const highlightedTitle = useMemo(() => {
    if (!searchQuery.trim()) return session.title;

    const query = searchQuery.toLowerCase();
    const title = session.title;
    const index = title.toLowerCase().indexOf(query);

    if (index === -1) return title;

    return (
      <Text style={styles.sessionTitle}>
        {title.slice(0, index)}
        <Text style={styles.searchHighlight}>{title.slice(index, index + query.length)}</Text>
        {title.slice(index + query.length)}
      </Text>
    );
  }, [session.title, searchQuery]);

  return (
    <SwipeableItem
      key={session.id}
      rightActions={[deleteAction]}
      enabled={true}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.sessionItem, pressed && styles.sessionItemPressed]}
        android_ripple={{ color: colors.border, foreground: true }}
        accessible={true}
        accessibilityLabel={`Session: ${session.title}. ${session.messageCount} messages, ${formatTokenCount(session.tokenCount)} tokens. ${formatTimestamp(session.updatedAt)}`}
        accessibilityHint="Double tap to load this session"
        accessibilityRole="button"
      >
        <View style={styles.sessionItemContent}>
          <View style={styles.sessionItemHeader}>
            {highlightedTitle}
            <Text style={styles.sessionTimestamp}>{formatTimestamp(session.updatedAt)}</Text>
          </View>

          <View style={styles.sessionItemMeta}>
            <View style={styles.sessionMetaItem}>
              <Ionicons name="chatbubble-outline" size={iconSize.sm} color={colors.mutedForeground} />
              <Text style={styles.sessionMetaText}>{session.messageCount}</Text>
            </View>
            <View style={styles.sessionMetaItem}>
              <Ionicons name="code-outline" size={iconSize.sm} color={colors.mutedForeground} />
              <Text style={styles.sessionMetaText}>{formatTokenCount(session.tokenCount)}</Text>
            </View>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={iconSize.md} color={colors.mutedForeground} style={styles.sessionChevron} />
      </Pressable>
    </SwipeableItem>
  );
}

// ============================================================================
// SessionGroup Component
// ============================================================================

interface SessionGroupProps {
  label: string;
  sessions: SessionListItem[];
  onPress: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  searchQuery: string;
}

function SessionGroup({ label, sessions, onPress, onDelete, searchQuery }: SessionGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = useCallback(() => {
    haptics.selection();
    setIsExpanded((prev) => !prev);
  }, []);

  if (sessions.length === 0) return null;

  return (
    <View style={styles.sessionGroup}>
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [styles.groupHeader, pressed && styles.groupHeaderPressed]}
        accessible={true}
        accessibilityLabel={`${label}: ${sessions.length} sessions`}
        accessibilityHint={isExpanded ? 'Double tap to collapse' : 'Double tap to expand'}
        accessibilityRole="button"
      >
        <Text style={styles.groupLabel}>{label}</Text>
        <View style={styles.groupHeaderRight}>
          <Text style={styles.groupCount}>{sessions.length}</Text>
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={iconSize.md}
            color={colors.mutedForeground}
          />
        </View>
      </Pressable>

      {isExpanded && (
        <View style={styles.groupSessions}>
          {sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              onPress={onPress}
              onDelete={onDelete}
              searchQuery={searchQuery}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
  searchQuery: string;
  onClearSearch: () => void;
}

function EmptyState({ searchQuery, onClearSearch }: EmptyStateProps) {
  return (
    <View style={styles.emptyState} accessible={true}>
      <Ionicons
        name={searchQuery ? 'search-outline' : 'time-outline'}
        size={iconSize['3xl']}
        color={colors.mutedForeground}
      />
      <Text style={styles.emptyTitle}>
        {searchQuery ? 'No sessions found' : 'No history yet'}
      </Text>
      <Text style={styles.emptyText}>
        {searchQuery
          ? `No sessions match "${searchQuery}"`
          : 'Your chat sessions will be saved here.'}
      </Text>
      {searchQuery && (
        <Pressable
          onPress={onClearSearch}
          style={({ pressed }) => [styles.clearSearchButton, pressed && styles.clearSearchButtonPressed]}
        >
          <Text style={styles.clearSearchButtonText}>Clear search</Text>
        </Pressable>
      )}
    </View>
  );
}

// ============================================================================
// SessionHistoryModal Main Component
// ============================================================================

export function SessionHistoryModal({
  visible,
  onClose,
  onLoadSession,
  onDeleteSession,
  sessions,
  isLoading = false,
}: SessionHistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const searchInputRef = useRef<TextInput>(null);

  // Reset search when modal opens/closes
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
    }
  }, [visible]);

  // Focus search input when modal opens
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Animation
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  // Group sessions by date
  const groupedSessions = useMemo(() => {
    const filtered = sessions.filter((session) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        session.title.toLowerCase().includes(query) ||
        session.id.toLowerCase().includes(query)
      );
    });

    const groups: Record<string, SessionListItem[]> = {};

    for (const session of filtered) {
      const { label } = getDateGroup(session.updatedAt);
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(session);
    }

    return groups;
  }, [sessions, searchQuery]);

  // Sort groups by order
  const sortedGroups = useMemo(() => {
    return Object.entries(groupedSessions).sort((a, b) => {
      const orderA = getDateGroup(a[1][0].updatedAt).order;
      const orderB = getDateGroup(b[1][0].updatedAt).order;
      return orderA - orderB;
    });
  }, [groupedSessions]);

  const handleLoadSession = useCallback(
    (sessionId: string) => {
      onLoadSession(sessionId);
      onClose();
      haptics.modalClose();
    },
    [onLoadSession, onClose]
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      setDeletingSessionId(sessionId);

      // Show confirmation alert
      Alert.alert(
        'Delete Session',
        'Are you sure you want to delete this session? This action cannot be undone.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setDeletingSessionId(null);
              haptics.buttonPress();
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              onDeleteSession(sessionId);
              setDeletingSessionId(null);
              haptics.success();
            },
          },
        ]
      );
    },
    [onDeleteSession]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
    haptics.buttonPress();
  }, []);

  const hasSessions = sessions.length > 0;
  const hasFilteredResults = Object.keys(groupedSessions).length > 0;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        {/* Backdrop */}
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        {/* Modal content */}
        <Animated.View
          style={[styles.modalContent, { transform: [{ scale: scaleAnim }] }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Session History</Text>
            <Pressable
              onPress={() => {
                haptics.buttonPress();
                onClose();
              }}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
              accessible={true}
              accessibilityLabel="Close session history"
              accessibilityHint="Closes the session history modal"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={iconSize.lg} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={iconSize.md}
              color={colors.mutedForeground}
              style={styles.searchIcon}
            />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search sessions..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessible={true}
              accessibilityLabel="Search sessions"
              accessibilityHint="Type to filter your session history"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  haptics.buttonPress();
                }}
                style={({ pressed }) => [
                  styles.clearSearchIcon,
                  pressed && styles.clearSearchIconPressed,
                ]}
                accessible={true}
                accessibilityLabel="Clear search"
                accessibilityRole="button"
              >
                <Ionicons
                  name="close-circle"
                  size={iconSize.md}
                  color={colors.mutedForeground}
                />
              </Pressable>
            )}
          </View>

          {/* Session count */}
          {hasSessions && (
            <Text style={styles.sessionCount}>
              {searchQuery
                ? `${Object.keys(groupedSessions).length} of ${sessions.length} sessions`
                : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`}
            </Text>
          )}

          {/* Content */}
          <ScrollView
            style={styles.contentList}
            contentContainerStyle={styles.contentListContainer}
            showsVerticalScrollIndicator={true}
          >
            {isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={colors.brand} />
                <Text style={styles.loadingText}>Loading sessions...</Text>
              </View>
            ) : !hasSessions ? (
              <EmptyState searchQuery={searchQuery} onClearSearch={handleClearSearch} />
            ) : !hasFilteredResults ? (
              <EmptyState searchQuery={searchQuery} onClearSearch={handleClearSearch} />
            ) : (
              sortedGroups.map(([groupLabel, groupSessions]) => (
                <SessionGroup
                  key={groupLabel}
                  label={groupLabel}
                  sessions={groupSessions}
                  onPress={handleLoadSession}
                  onDelete={handleDeleteSession}
                  searchQuery={searchQuery}
                />
              ))
            )}
          </ScrollView>

          {/* Loading overlay for delete */}
          {deletingSessionId && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.foreground} />
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '85%',
    minHeight: '50%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.titleLarge,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    fontFamily: fontFamily.semibold,
  },
  closeButton: {
    width: iconSize.comfortable,
    height: iconSize.comfortable,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    backgroundColor: colors.muted,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
    paddingHorizontal: spacing[3],
    height: iconSize.comfortable,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.bodyMedium,
    color: colors.foreground,
    fontFamily: fontFamily.regular,
    padding: 0,
  },
  clearSearchIcon: {
    padding: spacing[1],
    marginLeft: spacing[1],
  },
  clearSearchIconPressed: {
    opacity: 0.6,
  },
  sessionCount: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  contentList: {
    flex: 1,
  },
  contentListContainer: {
    paddingBottom: spacing[8],
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[16],
  },
  loadingText: {
    fontSize: fontSize.bodyMedium,
    color: colors.mutedForeground,
    marginTop: spacing[4],
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius['2xl'],
  },
  sessionGroup: {
    marginBottom: spacing[2],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.muted,
  },
  groupHeaderPressed: {
    opacity: 0.8,
  },
  groupLabel: {
    fontSize: fontSize.labelMedium,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: fontFamily.medium,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  groupCount: {
    fontSize: fontSize.labelSmall,
    color: colors.mutedForeground,
    fontWeight: fontWeight.medium,
  },
  groupSessions: {
    backgroundColor: colors.card,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: iconSize.comfortable,
  },
  sessionItemPressed: {
    backgroundColor: colors.muted,
  },
  sessionItemContent: {
    flex: 1,
    gap: spacing[1],
  },
  sessionItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionTitle: {
    fontSize: fontSize.bodyMedium,
    fontWeight: fontWeight.medium,
    color: colors.foreground,
    fontFamily: fontFamily.medium,
    flex: 1,
    marginRight: spacing[2],
  },
  searchHighlight: {
    backgroundColor: colors.brand + '30',
    color: colors.brand,
  },
  sessionTimestamp: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
    fontFamily: fontFamily.regular,
  },
  sessionItemMeta: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  sessionMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  sessionMetaText: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
    fontFamily: fontFamily.regular,
  },
  sessionChevron: {
    marginLeft: spacing[2],
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[8],
  },
  emptyTitle: {
    fontSize: fontSize.titleLarge,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing[4],
    marginBottom: spacing[2],
    fontFamily: fontFamily.semibold,
  },
  emptyText: {
    fontSize: fontSize.bodyMedium,
    color: colors.mutedForeground,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
  },
  clearSearchButton: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.brand,
    borderRadius: borderRadius.md,
  },
  clearSearchButtonPressed: {
    opacity: 0.8,
  },
  clearSearchButtonText: {
    fontSize: fontSize.bodyMedium,
    fontWeight: fontWeight.medium,
    color: '#ffffff',
    fontFamily: fontFamily.medium,
  },
});

export default SessionHistoryModal;
