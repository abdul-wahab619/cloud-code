import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../lib/styles';
import { haptics } from '../lib/haptics';
import { spacing, borderRadius, iconSize } from '../lib/tokens/spacing';
import { fontFamily, textStyle, fontWeight, fontSize } from '../lib/tokens/typography';
import { Button } from './Button';
import { Card } from './Card';
import { Badge } from './Badge';

// ============================================================================
// Types
// ============================================================================

export type SessionEventType =
  | 'claude_start'
  | 'claude_delta'
  | 'claude_end'
  | 'input_request'
  | 'file_change'
  | 'status'
  | 'error'
  | 'complete';

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  timestamp: number;
  content?: string;
  data?: Record<string, unknown>;
}

export interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  diff?: string;
}

export interface SessionData {
  id: string;
  prompt: string;
  repository?: {
    url: string;
    name: string;
    branch?: string;
  };
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  events: SessionEvent[];
  fileChanges?: FileChange[];
  metadata?: Record<string, unknown>;
}

export interface SessionReplayProps {
  session: SessionData;
  style?: any;
  onShareLink?: (sessionId: string) => Promise<string | undefined>;
  onClose?: () => void;
}

export interface SessionTimelineProps {
  events: SessionEvent[];
  currentIndex: number;
  onSeek: (index: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  style?: any;
}

export interface SessionContentProps {
  session: SessionData;
  currentIndex: number;
  style?: any;
}

export interface FileChangesListProps {
  fileChanges: FileChange[];
  style?: any;
}

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  badge?: string;
  style?: any;
  haptic?: 'light' | 'medium' | 'none';
}

// ============================================================================
// Utilities
// ============================================================================

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatDuration = (startTime: number, endTime?: number): string => {
  const end = endTime ?? Date.now();
  const diff = end - startTime;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
};

const getEventTypeColor = (type: SessionEventType): string => {
  switch (type) {
    case 'claude_start':
    case 'claude_delta':
    case 'claude_end':
      return colors.brand;
    case 'input_request':
      return colors.warning;
    case 'file_change':
      return colors.success;
    case 'status':
      return colors.mutedForeground;
    case 'error':
      return colors.error;
    case 'complete':
      return colors.success;
    default:
      return colors.mutedForeground;
  }
};

const getEventTypeLabel = (type: SessionEventType): string => {
  switch (type) {
    case 'claude_start':
      return 'Claude started';
    case 'claude_delta':
      return 'Response';
    case 'claude_end':
      return 'Claude finished';
    case 'input_request':
      return 'Input requested';
    case 'file_change':
      return 'File changed';
    case 'status':
      return 'Status';
    case 'error':
      return 'Error';
    case 'complete':
      return 'Complete';
    default:
      return type;
  }
};

const getFileChangeIcon = (type: FileChange['type']): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case 'created':
      return 'add-circle';
    case 'modified':
      return 'refresh-circle';
    case 'deleted':
      return 'remove-circle';
  }
};

// ============================================================================
// CollapsibleSection Component
// ============================================================================

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = true,
  badge,
  style,
  haptic = 'light',
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    if (haptic !== 'none') {
      haptics.selection();
    }
    setIsExpanded((prev) => !prev);
  }, [haptic]);

  return (
    <View style={[styles.collapsibleSection, style]}>
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [
          styles.collapsibleHeader,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={styles.collapsibleHeaderLeft}>
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={iconSize.md}
            color={colors.mutedForeground}
          />
          <Text style={styles.collapsibleTitle}>{title}</Text>
        </View>
        {badge && <Badge label={badge} variant="secondary" />}
      </Pressable>
      {isExpanded && <View style={styles.collapsibleContent}>{children}</View>}
    </View>
  );
}

// ============================================================================
// SessionTimeline Component
// ============================================================================

export function SessionTimeline({
  events,
  currentIndex,
  onSeek,
  isPlaying,
  onPlayPause,
  style,
}: SessionTimelineProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleSeek = useCallback(
    (index: number) => {
      haptics.selection();
      onSeek(index);
    },
    [onSeek]
  );

  const handlePlayPause = useCallback(() => {
    haptics.buttonPress();
    onPlayPause();
  }, [onPlayPause]);

  const progress = useMemo(() => {
    if (events.length === 0) return 0;
    return currentIndex / (events.length - 1);
  }, [currentIndex, events.length]);

  const progressPercent = Math.max(0, Math.min(100, progress * 100));

  return (
    <View style={[styles.timelineContainer, style]}>
      <View style={styles.timelineHeader}>
        <Text style={styles.timelineLabel}>
          {currentIndex + 1} of {events.length}
        </Text>
        <Pressable
          onPress={handlePlayPause}
          style={({ pressed }) => [
            styles.playButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={iconSize.lg}
            color={colors.foreground}
          />
        </Pressable>
      </View>

      <View style={styles.timelineTrack}>
        <View style={styles.timelineBackground}>
          <View style={[styles.timelineProgress, { width: `${progressPercent}%` }]} />
        </View>
        <View style={[styles.timelineThumb, { left: `${progressPercent}%` }]} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timelineDotsContainer}
      >
        {events.map((event, index) => (
          <Pressable
            key={event.id}
            onPress={() => handleSeek(index)}
            onPressIn={() => setIsDragging(true)}
            onPressOut={() => setIsDragging(false)}
            style={({ pressed }) => [
              styles.timelineDot,
              index === currentIndex && styles.timelineDotActive,
              index < currentIndex && styles.timelineDotCompleted,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View
              style={[
                styles.timelineDotInner,
                { backgroundColor: getEventTypeColor(event.type) },
                index === currentIndex && styles.timelineDotInnerActive,
              ]}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// FileChangesList Component
// ============================================================================

export function FileChangesList({ fileChanges, style }: FileChangesListProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFileExpanded = useCallback(
    (path: string) => {
      haptics.selection();
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    },
    []
  );

  if (!fileChanges || fileChanges.length === 0) {
    return (
      <View style={[styles.fileChangesEmpty, style]}>
        <Ionicons name="document-outline" size={iconSize['2xl']} color={colors.mutedForeground} />
        <Text style={styles.fileChangesEmptyText}>No file changes</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fileChangesList, style]}>
      {fileChanges.map((change) => {
        const isExpanded = expandedFiles.has(change.path);
        const icon = getFileChangeIcon(change.type);
        const typeColor =
          change.type === 'created'
            ? colors.success
            : change.type === 'deleted'
              ? colors.error
              : colors.warning;

        return (
          <View key={change.path} style={styles.fileChangeItem}>
            <Pressable
              onPress={() => toggleFileExpanded(change.path)}
              style={({ pressed }) => [
                styles.fileChangeHeader,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name={icon} size={iconSize.md} color={typeColor} />
              <Text style={styles.fileChangePath} numberOfLines={1}>
                {change.path}
              </Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={iconSize.sm}
                color={colors.mutedForeground}
              />
            </Pressable>
            {isExpanded && change.diff && (
              <View style={styles.fileChangeDiff}>
                <Text style={styles.fileChangeDiffText}>{change.diff}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// MarkdownText Component
// ============================================================================

interface MarkdownTextProps {
  content: string;
  style?: any;
}

function MarkdownText({ content, style }: MarkdownTextProps) {
  const [isCodeExpanded, setIsCodeExpanded] = useState(false);

  // Simple markdown parsing - handles basic formatting
  const parsedContent = useMemo(() => {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      // Code blocks
      if (line.trim().startsWith('```')) {
        return null; // Handled separately
      }

      // Headers
      if (line.startsWith('# ')) {
        return (
          <Text key={index} style={styles.mdH1}>
            {line.replace(/^#\s+/, '')}
            {'\n'}
          </Text>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <Text key={index} style={styles.mdH2}>
            {line.replace(/^##\s+/, '')}
            {'\n'}
          </Text>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <Text key={index} style={styles.mdH3}>
            {line.replace(/^###\s+/, '')}
            {'\n'}
          </Text>
        );
      }

      // Lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <Text key={index} style={styles.mdListItem}>
            {'  • ' + line.trim().replace(/^[-*]\s+/, '')}
            {'\n'}
          </Text>
        );
      }

      // Numbered lists
      if (/^\d+\.\s/.test(line.trim())) {
        return (
          <Text key={index} style={styles.mdListItem}>
            {'  ' + line.trim()}
            {'\n'}
          </Text>
        );
      }

      // Code inline
      if (line.includes('`')) {
        const parts = line.split(/`([^`]+)`/g);
        return (
          <Text key={index}>
            {parts.map((part, i) =>
              i % 2 === 1 ? (
                <Text key={i} style={styles.mdInlineCode}>
                  {part}
                </Text>
              ) : (
                part
              )
            )}
            {'\n'}
          </Text>
        );
      }

      // Regular paragraph
      return (
        <Text key={index} style={styles.mdParagraph}>
          {line || '\n'}
        </Text>
      );
    });
  }, [content]);

  return <Text style={[styles.mdText, style]}>{parsedContent}</Text>;
}

// ============================================================================
// SessionContent Component
// ============================================================================

export function SessionContent({ session, currentIndex, style }: SessionContentProps) {
  const visibleEvents = useMemo(() => {
    // Show events up to and including current index
    // For delta events, accumulate them
    const result: SessionEvent[] = [];
    let accumulatedDelta = '';

    for (let i = 0; i <= currentIndex && i < session.events.length; i++) {
      const event = session.events[i];

      if (event.type === 'claude_delta') {
        accumulatedDelta += event.content || '';
        // Only show the last delta as accumulated
        if (i === currentIndex) {
          result.push({
            ...event,
            content: accumulatedDelta,
          });
        }
      } else if (event.type === 'claude_start' || event.type === 'claude_end') {
        // Skip start/end in content view
        continue;
      } else {
        accumulatedDelta = ''; // Reset delta accumulator
        result.push(event);
      }
    }

    return result;
  }, [session.events, currentIndex]);

  const currentEvent = session.events[currentIndex];

  return (
    <ScrollView style={[styles.contentContainer, style]} contentContainerStyle={styles.contentScroll}>
      {/* Current event highlight */}
      {currentEvent && (
        <Card variant="outlined" size="sm" style={styles.currentEventCard}>
          <View style={styles.currentEventHeader}>
            <Badge
              label={getEventTypeLabel(currentEvent.type)}
              variant="secondary"
              style={{ backgroundColor: getEventTypeColor(currentEvent.type) + '20' }}
            />
            <Text style={styles.currentEventTime}>
              {formatTimestamp(currentEvent.timestamp)}
            </Text>
          </View>
          {currentEvent.content && (
            <View style={styles.currentEventContent}>
              <MarkdownText content={currentEvent.content} />
            </View>
          )}
        </Card>
      )}

      {/* Event history */}
      <CollapsibleSection
        title="Conversation History"
        defaultExpanded={true}
        badge={String(visibleEvents.length)}
      >
        <View style={styles.eventList}>
          {visibleEvents.map((event, index) => (
            <View key={event.id} style={styles.eventItem}>
              <View style={styles.eventHeader}>
                <View style={styles.eventTypeIndicator}>
                  <View
                    style={[
                      styles.eventTypeDot,
                      { backgroundColor: getEventTypeColor(event.type) },
                    ]}
                  />
                  <Text style={styles.eventTypeLabel}>
                    {getEventTypeLabel(event.type)}
                  </Text>
                </View>
                <Text style={styles.eventTime}>{formatTimestamp(event.timestamp)}</Text>
              </View>
              {event.content && (
                <View style={styles.eventContent}>
                  <MarkdownText content={event.content} />
                </View>
              )}
              {event.data && Object.keys(event.data).length > 0 && (
                <View style={styles.eventData}>
                  <Text style={styles.eventDataLabel}>Details:</Text>
                  {Object.entries(event.data).map(([key, value]) => (
                    <Text key={key} style={styles.eventDataItem}>
                      {key}: {String(value)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </CollapsibleSection>

      {/* File changes */}
      {session.fileChanges && session.fileChanges.length > 0 && (
        <CollapsibleSection
          title="File Changes"
          defaultExpanded={false}
          badge={String(session.fileChanges.length)}
        >
          <FileChangesList fileChanges={session.fileChanges} />
        </CollapsibleSection>
      )}

      {/* Session info */}
      <CollapsibleSection title="Session Details" defaultExpanded={false}>
        <View style={styles.sessionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Session ID:</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {session.id}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Badge
              label={session.status}
              variant={
                session.status === 'completed'
                  ? 'success'
                  : session.status === 'error'
                    ? 'destructive'
                    : 'default'
              }
            />
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Duration:</Text>
            <Text style={styles.detailValue}>
              {formatDuration(session.startTime, session.endTime)}
            </Text>
          </View>
          {session.repository && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Repository:</Text>
              <Text style={styles.detailValue}>{session.repository.name}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Started:</Text>
            <Text style={styles.detailValue}>
              {new Date(session.startTime).toLocaleString()}
            </Text>
          </View>
        </View>
      </CollapsibleSection>
    </ScrollView>
  );
}

// ============================================================================
// ShareMenu Component
// ============================================================================

interface ShareMenuProps {
  visible: boolean;
  onCopy: () => void;
  onShareLink?: () => void;
  onClose: () => void;
}

function ShareMenu({ visible, onCopy, onShareLink, onClose }: ShareMenuProps) {
  if (!visible) return null;

  return (
    <View style={styles.shareMenuOverlay}>
      <Pressable style={styles.shareMenuBackdrop} onPress={onClose} />
      <View style={styles.shareMenu}>
        <Pressable
          style={({ pressed }) => [styles.shareMenuItem, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            haptics.success();
            onCopy();
            onClose();
          }}
        >
          <Ionicons name="copy-outline" size={iconSize.lg} color={colors.foreground} />
          <Text style={styles.shareMenuItemLabel}>Copy to clipboard</Text>
        </Pressable>
        {onShareLink && (
          <Pressable
            style={({ pressed }) => [styles.shareMenuItem, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              haptics.success();
              onShareLink();
              onClose();
            }}
          >
            <Ionicons name="link-outline" size={iconSize.lg} color={colors.foreground} />
            <Text style={styles.shareMenuItemLabel}>Copy share link</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.shareMenuItem, styles.shareMenuCancel, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            haptics.buttonPress();
            onClose();
          }}
        >
          <Text style={styles.shareMenuCancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ============================================================================
// SessionReplay Main Component
// ============================================================================

export function SessionReplay({ session, style, onShareLink, onClose }: SessionReplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [copying, setCopying] = useState(false);

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying) return;

    if (currentIndex >= session.events.length - 1) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, session.events.length - 1));
    }, 1000); // 1 second per event

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, session.events.length]);

  const handleSeek = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, session.events.length - 1)));
  }, [session.events.length]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleShare = useCallback(() => {
    setShareMenuVisible(true);
  }, []);

  const handleCopySession = useCallback(async () => {
    setCopying(true);
    try {
      const sessionJson = JSON.stringify(session, null, 2);
      await Clipboard.setStringAsync(sessionJson);
      haptics.success();
    } catch (error) {
      haptics.error();
      console.error('Failed to copy session:', error);
    } finally {
      setCopying(false);
    }
  }, [session]);

  const handleCopyShareLink = useCallback(async () => {
    if (onShareLink) {
      setCopying(true);
      try {
        const link = await onShareLink(session.id);
        if (link) {
          await Clipboard.setStringAsync(link);
          haptics.success();
        }
      } catch (error) {
        haptics.error();
        console.error('Failed to copy share link:', error);
      } finally {
        setCopying(false);
      }
    }
  }, [session.id, onShareLink]);

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onClose && (
            <Pressable
              onPress={() => {
                haptics.buttonPress();
                onClose();
              }}
              style={({ pressed }) => [
                styles.headerButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="chevron-back" size={iconSize.lg} color={colors.foreground} />
            </Pressable>
          )}
          <View style={styles.headerTitle}>
            <Text style={styles.headerTitleText} numberOfLines={1}>
              Session Replay
            </Text>
            <Text style={styles.headerSubtitle}>
              {formatDuration(session.startTime, session.endTime)}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="share-outline" size={iconSize.lg} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Original prompt */}
      <Card variant="outlined" size="sm" style={styles.promptCard}>
        <Text style={styles.promptLabel} numberOfLines={1}>
          Original prompt
        </Text>
        <Text style={styles.promptText} numberOfLines={2}>
          {session.prompt}
        </Text>
      </Card>

      {/* Timeline */}
      <SessionTimeline
        events={session.events}
        currentIndex={currentIndex}
        onSeek={handleSeek}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
      />

      {/* Content */}
      <SessionContent session={session} currentIndex={currentIndex} />

      {/* Share menu */}
      <ShareMenu
        visible={shareMenuVisible}
        onCopy={handleCopySession}
        onShareLink={onShareLink ? handleCopyShareLink : undefined}
        onClose={() => setShareMenuVisible(false)}
      />

      {/* Copying indicator */}
      {copying && (
        <View style={styles.copyingIndicator}>
          <ActivityIndicator size="small" color={colors.foreground} />
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const screenWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerButton: {
    padding: spacing[2],
    marginRight: spacing[2],
  },
  headerTitle: {
    flex: 1,
  },
  headerTitleText: {
    fontSize: fontSize.titleLarge,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
  },
  headerSubtitle: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
    marginTop: spacing[0.5],
  },

  // Prompt card
  promptCard: {
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
  },
  promptLabel: {
    fontSize: fontSize.labelSmall,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing[1],
  },
  promptText: {
    fontSize: fontSize.bodyMedium,
    color: colors.foreground,
    lineHeight: 20,
  },

  // Timeline
  timelineContainer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  timelineLabel: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineTrack: {
    height: 4,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing[3],
  },
  timelineBackground: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  timelineProgress: {
    height: '100%',
    backgroundColor: colors.brand,
    borderRadius: borderRadius.full,
  },
  timelineThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: borderRadius.full,
    backgroundColor: colors.foreground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    transform: [{ translateX: -8 }],
  },
  timelineDotsContainer: {
    paddingHorizontal: spacing[2],
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[1],
  },
  timelineDotActive: {
    backgroundColor: colors.muted,
  },
  timelineDotCompleted: {
    opacity: 0.6,
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  timelineDotInnerActive: {
    width: 12,
    height: 12,
  },

  // Content
  contentContainer: {
    flex: 1,
  },
  contentScroll: {
    padding: spacing[4],
    paddingBottom: spacing[8],
  },

  // Current event card
  currentEventCard: {
    marginBottom: spacing[4],
  },
  currentEventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  currentEventTime: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
  },
  currentEventContent: {
    marginTop: spacing[2],
  },

  // Collapsible section
  collapsibleSection: {
    marginBottom: spacing[4],
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  collapsibleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  collapsibleTitle: {
    fontSize: fontSize.titleMedium,
    fontWeight: fontWeight.medium,
    color: colors.foreground,
    marginLeft: spacing[2],
  },
  collapsibleContent: {
    marginTop: spacing[2],
  },

  // Event list
  eventList: {
    gap: spacing[3],
  },
  eventItem: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[3],
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  eventTypeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventTypeDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    marginRight: spacing[2],
  },
  eventTypeLabel: {
    fontSize: fontSize.labelMedium,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
  },
  eventTime: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
  },
  eventContent: {
    marginTop: spacing[2],
  },
  eventData: {
    marginTop: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.muted,
    borderRadius: borderRadius.md,
  },
  eventDataLabel: {
    fontSize: fontSize.bodySmall,
    fontWeight: fontWeight.medium,
    color: colors.mutedForeground,
    marginBottom: spacing[1],
  },
  eventDataItem: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
    fontFamily: fontFamily.mono,
  },

  // File changes
  fileChangesList: {
    gap: spacing[2],
  },
  fileChangesEmpty: {
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  fileChangesEmptyText: {
    fontSize: fontSize.bodyMedium,
    color: colors.mutedForeground,
    marginTop: spacing[3],
  },
  fileChangeItem: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  fileChangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    gap: spacing[2],
  },
  fileChangePath: {
    flex: 1,
    fontSize: fontSize.bodyMedium,
    color: colors.foreground,
  },
  fileChangeDiff: {
    padding: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.muted,
  },
  fileChangeDiffText: {
    fontSize: fontSize.bodySmall,
    color: colors.mutedForeground,
    fontFamily: fontFamily.mono,
  },

  // Session details
  sessionDetails: {
    gap: spacing[3],
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: fontSize.bodyMedium,
    color: colors.mutedForeground,
  },
  detailValue: {
    fontSize: fontSize.bodyMedium,
    color: colors.foreground,
    fontWeight: fontWeight.medium,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing[4],
  },

  // Share menu
  shareMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  shareMenuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  shareMenu: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingTop: spacing[3],
    paddingBottom: spacing[6],
    paddingHorizontal: spacing[4],
  },
  shareMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  shareMenuItemLabel: {
    fontSize: fontSize.bodyLarge,
    color: colors.foreground,
  },
  shareMenuCancel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing[4],
    marginTop: spacing[2],
    justifyContent: 'center',
  },
  shareMenuCancelLabel: {
    fontSize: fontSize.bodyLarge,
    color: colors.error,
    fontWeight: fontWeight.medium,
  },

  // Copying indicator
  copyingIndicator: {
    position: 'absolute',
    top: spacing[4],
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  // Markdown styles
  mdText: {
    fontSize: fontSize.bodyMedium,
    color: colors.foreground,
    lineHeight: 22,
  },
  mdH1: {
    fontSize: fontSize.displaySmall,
    fontWeight: fontWeight.bold,
    color: colors.foreground,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  mdH2: {
    fontSize: fontSize.headlineMedium,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  mdH3: {
    fontSize: fontSize.headlineSmall,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  mdParagraph: {
    fontSize: fontSize.bodyMedium,
    color: colors.foreground,
    marginVertical: spacing[1],
  },
  mdListItem: {
    fontSize: fontSize.bodyMedium,
    color: colors.foreground,
    marginVertical: spacing[0.5],
  },
  mdInlineCode: {
    backgroundColor: colors.muted,
    color: colors.foreground,
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.bodySmall,
  },
});

// Export all components
export default SessionReplay;
