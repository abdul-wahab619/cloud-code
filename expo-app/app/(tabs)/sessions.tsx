import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, KeyboardAvoidingView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/styles';
import { useAppStore, RepositoryDetail } from '../../lib/useStore';
import { ErrorBoundary } from '../../components/ErrorBoundary';

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
}

// Parse markdown for code blocks
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
  return (
    <View style={styles.codeBlockContainer}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>{language}</Text>
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
  return (
    <View style={styles.prContainer}>
      <Ionicons name="git-pull-request" size={16} color={colors.brand} />
      <Text style={styles.prText}>Pull request #{prNumber} created</Text>
      <Pressable onPress={() => window.open(prUrl, '_blank')} style={styles.prLink}>
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
  newChatButton: {
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
    border: 1,
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    width: '90%',
    maxWidth: 450,
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
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
  repoCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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

// Checkbox component
function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.repoCheckbox, checked && styles.repoCheckboxChecked]}
    >
      {checked && <Text style={styles.repoCheckboxText}>✓</Text>}
    </Pressable>
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
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const copyToClipboard = useCallback(async (content: string) => {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(content);
    }
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setLastPrompt('');
    setInputText('');
    setSelectedRepos([]);
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

  const sendMessage = async (promptText?: string) => {
    const text = (promptText || inputText).trim();
    if (!text || isProcessing) return;

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

    try {
      // If no session, start a new one
      if (!sessionId) {
        const isMultiRepo = selectedRepos.length > 1;
        const response = await fetch('/interactive/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text,
            // Use 'repository' for single repo, 'repositories' for multiple
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
        });

        if (!response.ok) {
          throw new Error('Failed to start session');
        }

        const newSessionId = response.headers.get('X-Session-Id');
        if (newSessionId) {
          setSessionId(newSessionId);
        }

        await processSSEStream(response);
      } else {
        const isMultiRepo = selectedRepos.length > 1;
        const response = await fetch(`/interactive/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            // Use 'repository' for single repo, 'repositories' for multiple
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
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        await processSSEStream(response);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Something went wrong. ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const retryLastMessage = useCallback(async () => {
    if (!lastPrompt || isProcessing) return;
    setMessages((prev) => prev.slice(0, -1));
    await sendMessage(lastPrompt);
  }, [lastPrompt, isProcessing, sendMessage]);

  const processSSEStream = async (response: Response) => {
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
    const streamStartTime = Date.now();

    try {
      while (true) {
        if (Date.now() - streamStartTime > 90000) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, isStreaming: false, content: assistantContent || 'Request timed out.' }
                : m
            )
          );
          break;
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
      <View style={styles.flex1}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {messages.length > 0 && (
              <Pressable onPress={startNewChat} style={styles.newChatButton}>
                <Ionicons name="add-circle-outline" size={24} color={colors.brand} />
              </Pressable>
            )}
            <Text style={styles.title}>Chat</Text>
          </View>
          <Pressable
            style={styles.repoSelector}
            onPress={() => setShowRepoModal(true)}
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
          <View style={styles.selectedRepos}>
            {selectedRepos.slice(0, 3).map(repo => (
              <View key={repo} style={styles.selectedRepoChip}>
                <Text style={styles.selectedRepoText}>{repo.split('/')[1]}</Text>
                <Pressable onPress={() => removeRepo(repo)}>
                  <Ionicons name="close-circle" size={14} color={colors.brand} />
                </Pressable>
              </View>
            ))}
            {selectedRepos.length > 3 && (
              <Text style={styles.selectedRepoText}>+{selectedRepos.length - 3} more</Text>
            )}
          </View>
        )}

        {messages.length === 0 ? (
          <View style={styles.emptyState}>
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
          >
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                onCopy={copyToClipboard}
                onRetry={message.error ? retryLastMessage : undefined}
              />
            ))}
            {isProcessing && (
              <View style={styles.messageRow}>
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
            <Pressable
              style={[
                styles.sendButton,
                (!inputText.trim() || isProcessing) && styles.sendButtonDisabled,
              ]}
              onPress={() => sendMessage()}
              disabled={!inputText.trim() || isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={20} color="white" />
              )}
            </Pressable>
          </View>
        </View>

        {/* Multi-repo selection modal */}
        {showRepoModal && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Repositories</Text>
                <Pressable onPress={() => setShowRepoModal(false)}>
                  <Ionicons name="close" size={24} color={colors.foreground} />
                </Pressable>
              </View>

              <View style={styles.modalActions}>
                <Pressable onPress={selectAllRepos} style={styles.modalActionButton}>
                  <Text style={styles.modalActionText}>Select All</Text>
                </Pressable>
                <Pressable onPress={clearRepoSelection} style={styles.modalActionButton}>
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
                        onPress={() => toggleRepo(repo.full_name)}
                      >
                        <Checkbox checked={isSelected} onToggle={() => toggleRepo(repo.full_name)} />
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
                  <Pressable onPress={() => setShowRepoModal(false)} style={styles.modalActionButton}>
                    <Text style={styles.modalActionText}>Done</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

export default function ChatScreen() {
  return (
    <ErrorBoundary>
      <ChatScreenContent />
    </ErrorBoundary>
  );
}
