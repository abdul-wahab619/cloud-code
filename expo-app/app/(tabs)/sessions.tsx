import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, KeyboardAvoidingView, ActivityIndicator, Platform, Modal, Animated, Linking, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/styles';
import { useAppStore, RepositoryDetail } from '../../lib/useStore';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ErrorIds } from '../../constants/errorIds';
import { SessionHistoryModal } from '../../components/SessionHistoryModal';
import { OfflineBanner } from '../../components/OfflineBanner';
import { OfflineQueue } from '../../components/OfflineQueue';
import { SessionReplay, SessionData, SessionEvent } from '../../components/SessionReplay';
import { useScreenTracking } from '../../contexts/AnalyticsContext';
import { syncManager } from '../../lib/syncManager';
import { offlineQueue } from '../../lib/offlineStorage';

// Request handling constants
const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout

// Session storage constants
const MAX_SESSION_STORAGE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_STORAGE_KEY = 'claude_chat_sessions';
const CURRENT_SESSION_KEY = 'claude_chat_current';

// Message types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: boolean;
  metadata?: {
    repository?: string;
    prNumber?: number;
  };
  errorId?: string; // Error ID for tracking
}

// Session storage type
interface ChatSession {
  id: string;
  title: string; // First user message or "New Chat"
  messages: Omit<ChatMessage, 'isStreaming'>[];
  sessionId: string | null;
  selectedRepos: string[];
  createdAt: number;
  updatedAt: number;
}

interface SessionListItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  tokenCount: number;
}

/**
 * Structured logging utility for error tracking
 */
const logError = (errorId: string, error: unknown, context?: Record<string, unknown>) => {
  console.error(`[${errorId}]`, error, context ? { context } : '');
};

const logForDebugging = (message: string, data?: unknown) => {
  if (__DEV__) {
    console.log('[DEBUG]', message, data);
  }
};

// LocalStorage helpers for web platform with proper error handling
const storage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        logError(ErrorIds.STORAGE_QUOTA_EXCEEDED, error, { key, operation: 'getItem' });
      } else {
        logError(ErrorIds.STORAGE_GET_ITEM, error, { key });
      }
      return null;
    }
  },
  setItem: (key: string, value: string): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        logError(ErrorIds.STORAGE_QUOTA_EXCEEDED, error, { key, operation: 'setItem', valueLength: value.length });
      } else {
        logError(ErrorIds.STORAGE_SET_ITEM, error, { key });
      }
      return false;
    }
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      logError(ErrorIds.STORAGE_REMOVE_ITEM, error, { key });
    }
  },
};

const generateSessionTitle = (messages: ChatMessage[]): string => {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'New Chat';
  const content = firstUserMessage.content;
  return content.length > 50 ? content.slice(0, 47) + '...' : content;
};

// Generate a persistent session ID for the current session
let currentSessionId: string | null = null;

const saveCurrentSession = (messages: ChatMessage[], sessionId: string | null, selectedRepos: string[]) => {
  // Use a persistent ID for the current session to avoid duplicate history entries
  if (!currentSessionId) {
    currentSessionId = `session_${Date.now()}`;
  }

  const session: ChatSession = {
    id: currentSessionId,
    title: generateSessionTitle(messages),
    messages: messages.map(({ isStreaming, ...msg }) => msg),
    sessionId,
    selectedRepos,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  storage.setItem(CURRENT_SESSION_KEY, JSON.stringify(session));

  // Also save to session history if it has messages
  if (messages.length > 0) {
    saveSessionToHistory(session);
  }
};

const saveSessionToHistory = (session: ChatSession) => {
  const historyData = storage.getItem(SESSION_STORAGE_KEY);
  let history: ChatSession[] = [];

  try {
    history = historyData ? JSON.parse(historyData) : [];
  } catch (error) {
    logError(ErrorIds.STORAGE_PARSE_FAILED, error, { context: 'saveSessionToHistory' });
    // Backup corrupted data for potential recovery
    try {
      if (historyData) {
        localStorage.setItem('claude_chat_sessions_corrupted_backup', historyData);
        logForDebugging('Corrupted session data backed up for recovery');
      }
    } catch (backupError) {
      logError(ErrorIds.STORAGE_SET_ITEM, backupError, { context: 'backup_corrupted_data' });
    }
    history = [];
  }

  // Remove old sessions that are too old
  const now = Date.now();
  history = history.filter(s => now - s.updatedAt <= MAX_SESSION_STORAGE_AGE_MS);

  // Find if session with this ID already exists (using the persistent ID)
  const existingIdx = history.findIndex(s => s.id === session.id);

  if (existingIdx >= 0) {
    history[existingIdx] = session;
  } else {
    history.unshift(session);
  }

  // Keep only the last 50 sessions
  history = history.slice(0, 50);

  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(history));
};

const loadCurrentSession = (): ChatSession | null => {
  const data = storage.getItem(CURRENT_SESSION_KEY);
  if (!data) return null;

  try {
    const session = JSON.parse(data) as ChatSession;
    // Check if session is too old
    if (Date.now() - session.updatedAt > MAX_SESSION_STORAGE_AGE_MS) {
      logForDebugging('Current session expired, clearing', { sessionId: session.id });
      storage.removeItem(CURRENT_SESSION_KEY);
      return null;
    }
    // Restore the persistent session ID
    currentSessionId = session.id;
    return session;
  } catch (error) {
    logError(ErrorIds.SESSION_LOAD_FAILED, error, { context: 'loadCurrentSession' });
    return null;
  }
};

const clearCurrentSession = () => {
  currentSessionId = null; // Reset persistent session ID
  storage.removeItem(CURRENT_SESSION_KEY);
};

const getFullChatSession = (sessionId: string): ChatSession | null => {
  const historyData = storage.getItem(SESSION_STORAGE_KEY);
  if (!historyData) return null;

  try {
    const sessions: ChatSession[] = JSON.parse(historyData);
    return sessions.find(s => s.id === sessionId) ?? null;
  } catch {
    return null;
  }
};

const getSessionHistory = (): SessionListItem[] => {
  const historyData = storage.getItem(SESSION_STORAGE_KEY);
  if (!historyData) return [];

  try {
    const sessions: ChatSession[] = JSON.parse(historyData);
    const now = Date.now();

    return sessions
      .filter(s => now - s.updatedAt <= MAX_SESSION_STORAGE_AGE_MS)
      .map(s => ({
        id: s.id,
        title: s.title || 'New Chat',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length,
        tokenCount: s.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt); // Most recent first
  } catch {
    return [];
  }
};

const loadSessionFromHistory = (sessionId: string): ChatSession | null => {
  const historyData = storage.getItem(SESSION_STORAGE_KEY);
  if (!historyData) return null;

  try {
    const sessions: ChatSession[] = JSON.parse(historyData);
    const session = sessions.find(s => s.id === sessionId);
    if (!session) {
      logForDebugging('Session not found in history', { sessionId });
      return null;
    }

    // Check if session is too old
    const age = Date.now() - session.updatedAt;
    if (age > MAX_SESSION_STORAGE_AGE_MS) {
      logForDebugging('Session expired', { sessionId, age });
      return null;
    }

    return session;
  } catch (error) {
    logError(ErrorIds.SESSION_LOAD_FAILED, error, { context: 'loadSessionFromHistory', sessionId });
    return null;
  }
};

const deleteSessionFromHistory = (sessionId: string): boolean => {
  const historyData = storage.getItem(SESSION_STORAGE_KEY);
  if (!historyData) return false;

  try {
    const sessions: ChatSession[] = JSON.parse(historyData);
    const filtered = sessions.filter(s => s.id !== sessionId);
    return storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    logError(ErrorIds.SESSION_DELETE_FAILED, error, { sessionId });
    return false;
  }
};

const clearAllHistory = (): void => {
  storage.removeItem(SESSION_STORAGE_KEY);
};

// Language display name mapping for better code block labels
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ts': 'TypeScript',
  'typescript': 'TypeScript',
  'jsx': 'JSX',
  'tsx': 'TSX',
  'py': 'Python',
  'python': 'Python',
  'rb': 'Ruby',
  'ruby': 'Ruby',
  'go': 'Go',
  'golang': 'Go',
  'rs': 'Rust',
  'rust': 'Rust',
  'java': 'Java',
  'kt': 'Kotlin',
  'kotlin': 'Kotlin',
  'swift': 'Swift',
  'c': 'C',
  'cpp': 'C++',
  'c++': 'C++',
  'cs': 'C#',
  'csharp': 'C#',
  'php': 'PHP',
  'sh': 'Shell',
  'shell': 'Shell',
  'bash': 'Shell',
  'zsh': 'Zsh',
  'fish': 'Fish',
  'powershell': 'PowerShell',
  'ps1': 'PowerShell',
  'sql': 'SQL',
  'html': 'HTML',
  'xml': 'XML',
  'css': 'CSS',
  'scss': 'SCSS',
  'sass': 'Sass',
  'less': 'Less',
  'json': 'JSON',
  'yaml': 'YAML',
  'yml': 'YAML',
  'toml': 'TOML',
  'md': 'Markdown',
  'markdown': 'Markdown',
  'dockerfile': 'Dockerfile',
  'docker': 'Docker',
  'nginx': 'Nginx',
  'apache': 'Apache',
  'vim': 'Vim',
  'viml': 'VimL',
  'emacs': 'Emacs Lisp',
  'elisp': 'Emacs Lisp',
  'lua': 'Lua',
  'r': 'R',
  'scala': 'Scala',
  'groovy': 'Groovy',
  'perl': 'Perl',
  'pl': 'Perl',
  'dart': 'Dart',
  'flutter': 'Flutter',
  'ex': 'Elixir',
  'elixir': 'Elixir',
  'exs': 'Elixir',
  'erl': 'Erlang',
  'erlang': 'Erlang',
  'hs': 'Haskell',
  'haskell': 'Haskell',
  'fs': 'F#',
  'fsharp': 'F#',
  'ocaml': 'OCaml',
  'ml': 'OCaml',
  'nim': 'Nim',
  'julia': 'Julia',
  'matlab': 'MATLAB',
  'tex': 'LaTeX',
  'latex': 'LaTeX',
  'make': 'Makefile',
  'makefile': 'Makefile',
  'cmake': 'CMake',
  'gradle': 'Gradle',
  'maven': 'Maven',
  'pom': 'Maven',
  'vue': 'Vue',
  'svelte': 'Svelte',
  'angular': 'Angular',
  'next': 'Next.js',
  'nextjs': 'Next.js',
  'nuxt': 'Nuxt',
  'react': 'React',
  'solid': 'Solid',
  'astro': 'Astro',
};

function getLanguageDisplayName(lang: string): string {
  const normalized = lang.toLowerCase();
  return LANGUAGE_DISPLAY_NAMES[normalized] || lang;
}

// Simple token estimation using max(word count, char count / 4)
// Rough approximation: 1 token ≈ 4 characters for English text
function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const chars = text.length;
  return Math.max(words, Math.ceil(chars / 4));
}

// Parse markdown for code blocks and PR references
function parseMarkdown(text: string): Array<{ type: 'text' | 'code' | 'pr'; content: string; language?: string; prNumber?: number; prUrl?: string }> {
  const parts: Array<{ type: 'text' | 'code' | 'pr'; content: string; language?: string; prNumber?: number; prUrl?: string }> = [];

  // First, extract PR references
  const prRegex = /Pull request created: #(\d+)\n+URL: (https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+)/g;
  let prProcessedText = text;
  const prMatches = [...text.matchAll(new RegExp(/Pull request created: #(\d+)\n+URL: (https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+)/g))];

  let lastIndex = 0;

  // Process PR references
  for (const match of prMatches) {
    const fullMatch = match[0];
    const matchIndex = text.indexOf(fullMatch, lastIndex);
    if (matchIndex > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, matchIndex) });
    }
    parts.push({
      type: 'pr',
      content: `Pull request #${match[1]} created`,
      prNumber: parseInt(match[1], 10),
      prUrl: match[2]
    });
    lastIndex = matchIndex + fullMatch.length;
  }

  // Then process code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;

  // Need to re-apply regex on the pr-processed text for code blocks
  while ((match = codeBlockRegex.exec(prProcessedText)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: prProcessedText.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', content: match[2].trim(), language: match[1] || 'text' });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < prProcessedText.length) {
    parts.push({ type: 'text', content: prProcessedText.slice(lastIndex) });
  }

  if (parts.length === 0) {
    return [{ type: 'text', content: text }];
  }

  return parts;
}

// Code block component
function CodeBlock({ content, language, onCopy }: { content: string; language: string; onCopy: () => void }) {
  const displayLanguage = getLanguageDisplayName(language);
  return (
    <View style={styles.codeBlockContainer}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>{displayLanguage}</Text>
        <Pressable onPress={onCopy} style={styles.copyButton}>
          <Ionicons name="copy-outline" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <Text style={styles.codeContent}>{content}</Text>
    </View>
  );
}

// PR reference component
function PRReference({ prNumber, prUrl }: { prNumber: number; prUrl: string }) {
  const handlePress = useCallback(() => {
    if (Platform.OS === 'web') {
      window.open(prUrl, '_blank');
    } else {
      Linking.openURL(prUrl);
    }
  }, [prUrl]);

  return (
    <View style={styles.prContainer}>
      <Ionicons name="git-pull-request" size={16} color={colors.brand} />
      <Text style={styles.prText}>Pull request #{prNumber} created</Text>
      <Pressable onPress={handlePress} style={styles.prLink}>
        <Text style={styles.prLinkText}>View PR</Text>
        <Ionicons name="open-outline" size={14} color={colors.brand} />
      </Pressable>
    </View>
  );
}

// Message component
function Message({ message, onRetry, onCopy }: { message: ChatMessage; onRetry?: () => void; onCopy: (content: string) => void }) {
  const parsedContent = parseMarkdown(message.content);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemMessageContainer}>
        {message.metadata?.repository && (
          <Text style={styles.systemRepo}>{message.metadata.repository}</Text>
        )}
        <Text style={styles.systemMessageText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : null]}>
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble, message.error && styles.errorBubble]}>
        {message.isStreaming && message.content === '' ? (
          <View style={styles.typingIndicator}>
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
          </View>
        ) : (
          parsedContent.map((part, idx) => (
            <View key={idx}>
              {part.type === 'code' ? (
                <CodeBlock
                  content={part.content}
                  language={part.language || 'text'}
                  onCopy={() => onCopy(part.content)}
                />
              ) : part.type === 'pr' ? (
                <PRReference prNumber={part.prNumber!} prUrl={part.prUrl!} />
              ) : (
                <Text style={styles.messageText}>{part.content}</Text>
              )}
            </View>
          ))
        )}
        {message.isStreaming && message.content.length > 0 && (
          <View style={styles.streamingCursor} />
        )}
      </View>
      {!isUser && (
        <Pressable onPress={() => onCopy(message.content)} style={styles.messageAction}>
          <Ionicons name="copy-outline" size={14} color={colors.mutedForeground} />
        </Pressable>
      )}
      {message.error && (
        <Pressable onPress={onRetry} style={styles.retryButton}>
          <Ionicons name="refresh-outline" size={16} color={colors.brand} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  tokenCounter: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.muted,
    borderRadius: 10,
  },
  newChatButton: {
    padding: 4,
  },
  historyButton: {
    padding: 4,
  },
  repoSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  repoText: {
    fontSize: 13,
    color: colors.foreground,
  },
  repoTextPlaceholder: {
    color: colors.mutedForeground,
  },
  repoCount: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginLeft: 4,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: colors.brand,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.muted,
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.foreground,
  },
  messageAction: {
    padding: 4,
    marginTop: 4,
  },
  codeBlockContainer: {
    backgroundColor: '#1a1a1e',
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 4,
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#27272a',
  },
  codeLanguage: {
    fontSize: 11,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
  },
  copyButton: {
    padding: 4,
  },
  codeContent: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 18,
    color: '#e4e4e7',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typingIndicator: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.mutedForeground,
  },
  streamingCursor: {
    width: 2,
    height: 16,
    backgroundColor: colors.brand,
    marginLeft: 2,
  },
  systemMessageContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  systemRepo: {
    fontSize: 11,
    color: colors.brand,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    textTransform: 'uppercase',
  },
  systemMessageText: {
    fontSize: 12,
    color: colors.mutedForeground,
    backgroundColor: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  prContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  prText: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
  },
  prLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.brand,
  },
  prLinkText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    paddingBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputField: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.muted,
    borderRadius: 22,
    fontSize: 15,
    color: colors.foreground,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.5,
  },
  cancelButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  quickActionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionText: {
    fontSize: 13,
    color: colors.foreground,
  },
  // Multi-repo modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    position: 'relative',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    width: '90%',
    maxWidth: 450,
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.muted,
  },
  modalActionText: {
    fontSize: 13,
    color: colors.brand,
    fontWeight: '500',
  },
  modalList: {
    maxHeight: 350,
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  repoCheckboxContainer: {
    marginRight: 12,
  },
  repoCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repoCheckboxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  repoCheckboxText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  repoItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repoItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
    flex: 1,
  },
  repoItemDesc: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  repoItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repoPrivateBadge: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
  selectedRepos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedRepoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  selectedRepoText: {
    fontSize: 12,
    color: colors.brand,
  },
  modalEmpty: {
    padding: 32,
    alignItems: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retryText: {
    fontSize: 13,
    color: colors.brand,
  },
});

const QUICK_ACTIONS = [
  'Analyze this codebase',
  'Fix the bug in...',
  'Add tests for...',
  'Refactor...',
];

// Animated modal component with fade and backdrop handling
function RepositoryModal({
  visible,
  onClose,
  repositories,
  selectedRepos,
  onToggleRepo,
  onSelectAll,
  onClearSelection,
}: {
  visible: boolean;
  onClose: () => void;
  repositories: RepositoryDetail[];
  selectedRepos: string[];
  onToggleRepo: (repoName: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

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
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        {/* Backdrop - separate from modal content */}
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        {/* Modal content - positioned absolutely, sibling to backdrop */}
        <Animated.View
          style={[styles.modalContent, { transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Repositories</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.modalActions}>
            <Pressable onPress={onSelectAll} style={styles.modalActionButton}>
              <Text style={styles.modalActionText}>Select All</Text>
            </Pressable>
            <Pressable onPress={onClearSelection} style={styles.modalActionButton}>
              <Text style={styles.modalActionText}>Clear</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalList}>
            {repositories.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="git-branch" size={48} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { marginTop: 12 }]}>No repositories</Text>
                <Text style={styles.emptySubtitle}>
                  Install the GitHub App to see your repositories here.
                </Text>
              </View>
            ) : (
              repositories.map((repo) => {
                const isSelected = selectedRepos.includes(repo.full_name);
                return (
                  <Pressable
                    key={repo.full_name}
                    style={styles.repoItem}
                    onPress={() => onToggleRepo(repo.full_name)}
                    android_ripple={{ color: colors.border }}
                  >
                    <View style={styles.repoCheckboxContainer}>
                      <View style={[styles.repoCheckbox, isSelected && styles.repoCheckboxChecked]}>
                        {isSelected && <Text style={styles.repoCheckboxText}>✓</Text>}
                      </View>
                    </View>
                    <View style={styles.repoItemMain}>
                      <Ionicons name="logo-github" size={20} color={colors.foreground} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.repoItemName}>{repo.full_name}</Text>
                        {repo.description && (
                          <Text style={styles.repoItemDesc} numberOfLines={1}>
                            {repo.description}
                          </Text>
                        )}
                      </View>
                      {repo.private && (
                        <Ionicons name="lock-closed" size={14} color={colors.mutedForeground} />
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {selectedRepos.length > 0 && (
            <View style={styles.selectedRepos}>
              <Text style={styles.selectedRepoText}>{selectedRepos.length} selected</Text>
              <Pressable onPress={onClose} style={styles.modalActionButton}>
                <Text style={styles.modalActionText}>Done</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function ChatScreenContent() {
  const { repositories, refresh } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<string>('');
  const [canCancel, setCanCancel] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showOfflineQueueModal, setShowOfflineQueueModal] = useState(false);
  const [showSessionReplay, setShowSessionReplay] = useState(false);
  const [replaySession, setReplaySession] = useState<SessionData | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionListItem[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Track connection status for offline mode
  useEffect(() => {
    const unsubscribe = syncManager.onConnectionChange((online) => {
      setIsOffline(!online);
    });
    return unsubscribe;
  }, []);

  // Calculate total tokens used in the session (excludes system messages)
  // Note: This is an approximation using character estimation, not actual API token usage
  const totalTokens = useMemo(() => {
    return messages
      .filter(msg => msg.role !== 'system') // Exclude system status messages
      .reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
  }, [messages]);

  // Load saved session on mount
  useEffect(() => {
    const savedSession = loadCurrentSession();
    if (savedSession && savedSession.messages.length > 0) {
      setMessages(savedSession.messages as ChatMessage[]);
      setSessionId(savedSession.sessionId);
      setSelectedRepos(savedSession.selectedRepos);
    }
    refresh();
  }, []);

  // Save session whenever messages or session state changes
  useEffect(() => {
    if (messages.length > 0 || sessionId) {
      saveCurrentSession(messages, sessionId, selectedRepos);
    }
  }, [messages, sessionId, selectedRepos]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Cleanup timeout and abort controller on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const copyToClipboard = useCallback(async (content: string) => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(content);
      } else {
        await Clipboard.setStringAsync(content);
      }
    } catch (error) {
      logError(ErrorIds.CLIPBOARD_WRITE_FAILED, error, { contentLength: content.length });
      // Show user feedback about the failure
      alert('Failed to copy to clipboard. Please try again.');
    }
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setLastPrompt('');
    setInputText('');
    setSelectedRepos([]);
    clearCurrentSession(); // This also resets currentSessionId
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsProcessing(false);
    setCanCancel(false);

    // Add a cancellation message
    const cancelMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'system',
      content: 'Request cancelled',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, cancelMessage]);
  }, []);

  const toggleRepo = useCallback((repoName: string) => {
    setSelectedRepos(prev =>
      prev.includes(repoName)
        ? prev.filter(r => r !== repoName)
        : [...prev, repoName]
    );
  }, []);

  const selectAllRepos = useCallback(() => {
    setSelectedRepos(repositories.map(r => r.full_name));
  }, [repositories]);

  const clearRepoSelection = useCallback(() => {
    setSelectedRepos([]);
  }, []);

  const removeRepo = useCallback((repoName: string) => {
    setSelectedRepos(prev => prev.filter(r => r !== repoName));
  }, []);

  // Auth state
  const { isAuthenticated } = useAppStore();

  // Session history handlers
  const openHistoryModal = useCallback(() => {
    // Require authentication for session history
    if (!isAuthenticated) {
      Alert.alert(
        'Authentication Required',
        'Please sign in to access your session history.',
        [{ text: 'OK' }]
      );
      return;
    }
    // Refresh history when opening modal
    const history = getSessionHistory();
    setSessionHistory(history);
    setShowHistoryModal(true);
  }, [isAuthenticated]);

  const handleLoadSession = useCallback((sessionId: string) => {
    const session = loadSessionFromHistory(sessionId);
    if (!session) {
      logError(ErrorIds.SESSION_LOAD_FAILED, new Error('Session not found or corrupted'), { sessionId });
      Alert.alert('Error', 'Could not load this session. It may have been corrupted or deleted.');
      return;
    }

    // Load the session
    setMessages(session.messages as ChatMessage[]);
    setSessionId(session.sessionId);
    setSelectedRepos(session.selectedRepos);
    currentSessionId = session.id; // Restore the persistent session ID
    setShowHistoryModal(false);
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    const success = deleteSessionFromHistory(sessionId);
    if (!success) {
      logError(ErrorIds.SESSION_DELETE_FAILED, new Error('Failed to delete session'), { sessionId });
      Alert.alert('Error', 'Could not delete this session. Please try again.');
      return;
    }

    // Refresh the history list
    const updatedHistory = getSessionHistory();
    setSessionHistory(updatedHistory);
  }, []);

  const handleReplaySession = useCallback((sessionId: string) => {
    const chatSession = getFullChatSession(sessionId);
    if (!chatSession) {
      logError(ErrorIds.SESSION_LOAD_FAILED, new Error('Session not found'), { sessionId });
      Alert.alert('Error', 'Could not find this session.');
      return;
    }

    // Convert ChatSession to SessionData format for replay
    const events: SessionEvent[] = chatSession.messages.flatMap((msg, idx) => {
      const baseEvent: SessionEvent = {
        id: `${sessionId}-${idx}`,
        type: msg.role === 'user' ? 'status' as SessionEvent['type'] : 'claude_delta' as SessionEvent['type'],
        timestamp: msg.timestamp,
        content: msg.content,
      };

      // For assistant messages, add start/end events
      if (msg.role === 'assistant') {
        return [
          {
            id: `${sessionId}-${idx}-start`,
            type: 'claude_start',
            timestamp: msg.timestamp,
          } as SessionEvent,
          baseEvent,
          {
            id: `${sessionId}-${idx}-end`,
            type: 'claude_end',
            timestamp: msg.timestamp,
          } as SessionEvent,
        ];
      }

      return [baseEvent];
    });

    const replayData: SessionData = {
      id: chatSession.id,
      prompt: chatSession.title,
      repository: chatSession.selectedRepos.length > 0 ? {
        url: `https://github.com/${chatSession.selectedRepos[0]}`,
        name: chatSession.selectedRepos[0],
      } : undefined,
      startTime: chatSession.createdAt,
      endTime: chatSession.updatedAt,
      status: 'completed',
      events,
      metadata: {
        sessionId: chatSession.sessionId,
        selectedRepos: chatSession.selectedRepos,
        messageCount: chatSession.messages.length,
      },
    };

    setReplaySession(replayData);
    setShowSessionReplay(true);
    setShowHistoryModal(false);
  }, []);

  const sendMessage = async (promptText?: string) => {
    const text = (promptText || inputText).trim();
    if (!text || isProcessing) return;

    // Check offline status - queue message if offline
    if (isOffline) {
      // Queue the message for offline sync
      await offlineQueue.add('session_message', {
        sessionId,
        message: text,
        selectedRepos,
        timestamp: Date.now(),
      });

      // Add user message to UI
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputText('');

      // Add pending indicator
      const pendingMessage: ChatMessage = {
        id: `pending-${Date.now()}`,
        role: 'system',
        content: 'Message queued. Will send when connection is restored.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, pendingMessage]);

      return;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLastPrompt(text);
    setIsProcessing(true);
    setCanCancel(true);

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
      setIsProcessing(false);
      setCanCancel(false);
      const timeoutMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`,
        timestamp: Date.now(),
        error: true,
      };
      setMessages((prev) => [...prev, timeoutMessage]);
    }, REQUEST_TIMEOUT_MS);
    timeoutRef.current = timeoutId;

    try {
      // If no session, start a new one
      if (!sessionId) {
        const isMultiRepo = selectedRepos.length > 1;
        const response = await fetch('/interactive/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text,
            ...(isMultiRepo ? {
              repositories: selectedRepos.map(r => ({
                url: `https://github.com/${r}`,
                name: r,
              }))
            } : selectedRepos.length === 1 ? {
              repository: {
                url: `https://github.com/${selectedRepos[0]}`,
                name: selectedRepos[0],
              }
            } : {}),
            options: {
              maxTurns: 10,
              permissionMode: 'bypassPermissions',
              createPR: true,
            },
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to start session (${response.status})`);
        }

        const newSessionId = response.headers.get('X-Session-Id');
        if (newSessionId) {
          setSessionId(newSessionId);
        }

        await processSSEStream(response, abortController);
      } else {
        const isMultiRepo = selectedRepos.length > 1;
        const response = await fetch(`/interactive/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            ...(isMultiRepo ? {
              repositories: selectedRepos.map(r => ({
                url: `https://github.com/${r}`,
                name: r,
              }))
            } : selectedRepos.length === 1 ? {
              repository: {
                url: `https://github.com/${selectedRepos[0]}`,
                name: selectedRepos[0],
              }
            } : {}),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to send message (${response.status})`);
        }

        await processSSEStream(response, abortController);
      }

      // Clear timeout on success
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } catch (error) {
      // Clear timeout on error
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Handle different error types with specific messages
      let errorMessage = 'Something went wrong. Please try again.';
      let errorId: string = ErrorIds.CHAT_SEND_UNKNOWN;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          // User cancelled or timeout
          if (!canCancel) {
            // This was a timeout (handled above) or user cancelled via cancelRequest
            return;
          }
          // Otherwise it was a user-initiated cancellation
          errorMessage = `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds. Please check your connection and try again.`;
          errorId = ErrorIds.CHAT_SEND_TIMEOUT;
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
          errorId = ErrorIds.CHAT_SEND_NETWORK;
        } else if (error.message.includes('401') || error.message.includes('403')) {
          errorMessage = 'Authentication error. Please refresh and try again.';
          errorId = ErrorIds.CHAT_SEND_AUTH;
        } else if (error.message.includes('429')) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
          errorId = ErrorIds.CHAT_SEND_RATE_LIMIT;
        } else {
          errorMessage = error.message;
          errorId = ErrorIds.CHAT_SEND_SERVER;
        }
      }

      logError(errorId, error);

      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now(),
        error: true,
        errorId,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      setCanCancel(false);
      abortControllerRef.current = null;
    }
  };

  const retryLastMessage = useCallback(async () => {
    if (!lastPrompt || isProcessing) return;
    setMessages((prev) => prev.slice(0, -1));
    await sendMessage(lastPrompt);
  }, [lastPrompt, isProcessing, sendMessage]);

  const processSSEStream = async (response: Response, abortController: AbortController) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let assistantMessageId = Date.now().toString();
    let assistantContent = '';

    const streamingMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, streamingMessage]);

    let currentEventType = '';

    try {
      while (true) {
        // Check for abort
        if (abortController.signal.aborted) {
          throw new Error('Cancelled');
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEventType = line.substring(7).trim();
            continue;
          }

          if (line.startsWith('data:')) {
            const data = line.substring(5).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (currentEventType === 'claude_delta') {
                assistantContent += parsed.content || '';
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: assistantContent }
                      : m
                  )
                );
              } else if (currentEventType === 'status') {
                const metadata = parsed.repository ? { repository: parsed.repository } : undefined;
                setMessages((prev) => {
                  const existingStatusIdx = prev.findIndex(m => m.role === 'system' && m.isStreaming);
                  const statusMsg: ChatMessage = {
                    id: Date.now().toString(),
                    role: 'system',
                    content: parsed.message || parsed.status || 'Processing...',
                    timestamp: Date.now(),
                    isStreaming: true,
                    metadata,
                  };

                  if (existingStatusIdx >= 0) {
                    return [...prev.slice(0, existingStatusIdx), statusMsg, ...prev.slice(existingStatusIdx + 1)];
                  }
                  return [...prev, statusMsg];
                });
              } else if (currentEventType === 'complete') {
                // Handle multi-repo results
                if (parsed.multiRepoResults && Array.isArray(parsed.multiRepoResults)) {
                  const results = parsed.multiRepoResults;
                  const successCount = results.filter((r: any) => r.success).length;
                  const failCount = results.length - successCount;

                  let resultsText = `## Multi-Repo Results\n\nProcessed ${results.length} repositories:\n\n`;

                  for (const result of results) {
                    const statusIcon = result.success ? '✓' : '✗';
                    resultsText += `${statusIcon} **${result.repository}**\n`;
                    if (result.success) {
                      if (result.prUrl) {
                        resultsText += `  - PR: ${result.prUrl}\n`;
                      }
                    } else {
                      resultsText += `  - Error: ${result.error}\n`;
                    }
                    resultsText += '\n';
                  }

                  resultsText += `**Summary:** ${successCount} succeeded, ${failCount} failed`;

                  assistantContent += '\n\n' + resultsText;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: assistantContent }
                        : m
                    )
                  );
                }
                break;
              } else if (currentEventType === 'error') {
                assistantContent += `\n\nError: ${parsed.message || 'Unknown error'}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: assistantContent, isStreaming: false, error: true }
                      : m
                  )
                );
              }
            } catch (e) {
              // Only ignore if it looks like an incomplete chunk (doesn't end with })
              const isLikelyIncomplete = !data.trim().endsWith('}');

              if (!isLikelyIncomplete) {
                // This is a real parse error, not just an incomplete chunk
                logError(ErrorIds.SSE_PARSE_ERROR, e, { data, eventType: currentEventType });
              }
              // Continue - incomplete chunks are expected during SSE streaming
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: false }
            : m
        )
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Cancelled') {
        // Request was cancelled, don't add error message
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: false, error: true, content: assistantContent || 'Connection error.' }
            : m
        )
      );
    }
  };

  const getRepoDisplayText = () => {
    if (selectedRepos.length === 0) {
      return repositories.length > 0 ? `${repositories.length} repos` : 'Select repo';
    }
    if (selectedRepos.length === 1) {
      return selectedRepos[0];
    }
    return `${selectedRepos.length} repos`;
  };

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior="padding" keyboardVerticalOffset={0}>
      <View style={styles.flex1} accessibilityLabel="Chat screen">
        <View style={styles.header} accessibilityRole="header">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={openHistoryModal}
              style={styles.historyButton}
              accessibilityLabel="Session history"
              accessibilityHint={`Open session history${sessionHistory.length > 0 ? ` with ${sessionHistory.length} sessions` : ''}`}
              accessibilityRole="button"
            >
              <Ionicons name="time-outline" size={24} color={colors.brand} />
            </Pressable>
            {messages.length > 0 && (
              <Pressable
                onPress={startNewChat}
                style={styles.newChatButton}
                accessibilityLabel="Start new chat"
                accessibilityHint="Clears current conversation and starts a new one"
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={24} color={colors.brand} />
              </Pressable>
            )}
            <Text style={styles.title}>Chat</Text>
            {totalTokens > 0 && (
              <Text
                style={styles.tokenCounter}
                accessibilityLabel={`Session tokens used: ${totalTokens}`}
                accessibilityRole="text"
              >
                {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} tokens
              </Text>
            )}
          </View>
          <Pressable
            style={styles.repoSelector}
            onPress={() => setShowRepoModal(true)}
            accessibilityLabel={`Select repositories${selectedRepos.length > 0 ? `. ${selectedRepos.length} selected` : ''}`}
            accessibilityHint="Open repository selection modal"
            accessibilityRole="button"
          >
            <Ionicons name="git-branch" size={16} color={selectedRepos.length > 0 ? colors.foreground : colors.mutedForeground} />
            <Text style={[styles.repoText, selectedRepos.length === 0 && styles.repoTextPlaceholder]}>
              {getRepoDisplayText()}
            </Text>
            {selectedRepos.length > 1 && (
              <Text style={styles.repoCount}>(multi)</Text>
            )}
            <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Selected repos chips when multiple selected */}
        {selectedRepos.length > 1 && (
          <View
            style={styles.selectedRepos}
            accessibilityLabel={`Selected repositories: ${selectedRepos.join(', ')}`}
            accessibilityRole="text"
          >
            {selectedRepos.slice(0, 3).map((repo, index) => (
              <View key={repo} style={styles.selectedRepoChip} importantForAccessibility="no">
                <Text style={styles.selectedRepoText}>{repo.split('/')[1]}</Text>
                <Pressable
                  onPress={() => removeRepo(repo)}
                  accessibilityLabel={`Remove ${repo} from selection`}
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle" size={14} color={colors.brand} />
                </Pressable>
              </View>
            ))}
            {selectedRepos.length > 3 && (
              <Text style={styles.selectedRepoText}>+{selectedRepos.length - 3} more</Text>
            )}
          </View>
        )}

        {/* Offline banner */}
        <OfflineBanner onSyncPress={() => setShowOfflineQueueModal(true)} />

        {messages.length === 0 ? (
          <View style={styles.emptyState} accessibilityLabel="Empty chat state">
            <Ionicons name="sparkles-outline" size={48} color={colors.mutedForeground} />
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptySubtitle}>
              Ask Claude Code to help with your code.{'\n'}
              {selectedRepos.length > 0
                ? `Working on ${selectedRepos.length === 1 ? selectedRepos[0] : `${selectedRepos.length} repositories`}`
                : 'Select repositories to make changes directly.'
              }
            </Text>
            <View style={styles.quickActions}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action}
                  style={styles.quickActionButton}
                  onPress={() => sendMessage(action)}
                  accessibilityLabel={`Quick action: ${action}`}
                  accessibilityHint="Sends this prompt to Claude"
                  accessibilityRole="button"
                >
                  <Text style={styles.quickActionText}>{action}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={styles.messagesList}
            accessibilityLabel="Chat messages"
          >
            {messages.map((message, index) => (
              <View
                key={message.id}
                accessibilityLabel={`${message.role === 'user' ? 'You' : 'Claude'}: ${message.content.slice(0, 100)}${message.content.length > 100 ? '...' : ''}`}
                accessibilityRole="text"
              >
                <Message
                  key={message.id}
                  message={message}
                  onCopy={copyToClipboard}
                  onRetry={message.error ? retryLastMessage : undefined}
                />
              </View>
            ))}
            {isProcessing && (
              <View
                style={styles.messageRow}
                accessibilityLabel="Claude is typing"
              >
                <View style={[styles.messageBubble, styles.assistantBubble]}>
                  <View style={styles.typingIndicator}>
                    <View style={styles.typingDot} />
                    <View style={styles.typingDot} />
                    <View style={styles.typingDot} />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              placeholder="Message Claude Code..."
              placeholderTextColor={colors.mutedForeground}
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={!isProcessing}
              onSubmitEditing={() => sendMessage()}
            />
            {canCancel ? (
              // Show cancel button when request is in progress and can be cancelled
              <Pressable
                style={styles.cancelButton}
                onPress={cancelRequest}
              >
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </Pressable>
            ) : (
              // Show send button when not processing
              <Pressable
                style={[
                  styles.sendButton,
                  (!inputText.trim() || isProcessing) && styles.sendButtonDisabled,
                ]}
                onPress={() => sendMessage()}
                disabled={!inputText.trim() || isProcessing}
                pointerEvents={(!inputText.trim() || isProcessing) ? 'none' : 'auto'}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={inputText.trim() ? 'white' : colors.mutedForeground} />
                ) : (
                  <Ionicons name="send" size={20} color={inputText.trim() ? 'white' : colors.mutedForeground} />
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Multi-repo selection modal */}
        <RepositoryModal
          visible={showRepoModal}
          onClose={() => setShowRepoModal(false)}
          repositories={repositories}
          selectedRepos={selectedRepos}
          onToggleRepo={toggleRepo}
          onSelectAll={selectAllRepos}
          onClearSelection={clearRepoSelection}
        />

        {/* Session history modal */}
        <SessionHistoryModal
          visible={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          onLoadSession={handleLoadSession}
          onDeleteSession={handleDeleteSession}
          onReplaySession={handleReplaySession}
          sessions={sessionHistory}
        />

        {/* Session replay modal */}
        {replaySession && (
          <Modal
            visible={showSessionReplay}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setShowSessionReplay(false)}
          >
            <SessionReplay
              session={replaySession}
              onClose={() => setShowSessionReplay(false)}
            />
          </Modal>
        )}

        {/* Offline queue modal */}
        <Modal
          visible={showOfflineQueueModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowOfflineQueueModal(false)}
        >
          <OfflineQueue
            onDismiss={() => setShowOfflineQueueModal(false)}
          />
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function ChatScreen() {
  // Track screen views for analytics
  useScreenTracking('Sessions');

  return (
    <ErrorBoundary>
      <ChatScreenContent />
    </ErrorBoundary>
  );
}
