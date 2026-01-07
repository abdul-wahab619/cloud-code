import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { useAppStore } from '../lib/useStore';
import { colors } from '../lib/styles';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { StatusDot } from '../components/StatusDot';
import { Badge } from '../components/Badge';
import { formatTime } from '../lib/utils';

// Chat message types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

// Screens
function DashboardScreen() {
  const { stats, tasks, sessions, isLoading, refresh } = useAppStore();

  React.useEffect(() => {
    refresh();
  }, []);

  return (
    <View style={styles.content}>
      <View style={styles.statsGrid}>
        {stats ? (
          <>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#6366f1' }]}>{stats.processedIssues ?? 0}</Text>
              <Text style={styles.statLabel}>Processed</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#22c55e' }]}>{Math.round(stats.successRate)}%</Text>
              <Text style={styles.statLabel}>Success Rate</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#eab308' }]}>{stats.activeSessions ?? 0}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#a1a1aa' }]}>{stats.totalIssues ?? 0}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </>
        ) : (
          <Text style={styles.loadingText}>Loading stats...</Text>
        )}
      </View>
    </View>
  );
}

function IssuesScreen() {
  const { issues, isLoading, refresh } = useAppStore();

  React.useEffect(() => {
    refresh();
  }, []);

  return (
    <View style={styles.content}>
      <Text style={styles.title}>GitHub Issues</Text>
      {!issues.length ? (
        <Text style={styles.emptyText}>No issues found</Text>
      ) : (
        issues.map((issue) => (
          <View key={issue.id ?? issue.number} style={styles.card}>
            <Text style={styles.cardTitle}>{issue.title}</Text>
            <Text style={styles.cardBody}>{issue.body ?? 'No description'}</Text>
            <Badge label={issue.state === 'open' ? 'Open' : 'Closed'} variant={issue.state === 'open' ? 'success' : 'secondary'} />
          </View>
        ))
      )}
    </View>
  );
}

function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [repository, setRepository] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const processSSEStream = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let assistantMessageId = Date.now().toString();
    let assistantContent = '';

    // Create placeholder for streaming message
    const streamingMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, streamingMessage]);

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Finalize the message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, isStreaming: false }
              : m
          )
        );
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('event:')) {
          const eventType = line.substring(7).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          const data = line.substring(5).trim();

          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'claude_delta') {
              // Append content to current message
              assistantContent += parsed.content || '';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: assistantContent }
                    : m
                )
              );
            } else if (parsed.type === 'complete') {
              // Session complete
              break;
            } else if (parsed.type === 'error') {
              // Error occurred
              assistantContent += `\n\nError: ${parsed.message || 'Unknown error'}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: assistantContent, isStreaming: false }
                    : m
                )
              );
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isProcessing) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    try {
      // If no session, start a new one
      if (!sessionId) {
        const response = await fetch('/interactive/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text,
            repository: repository ? {
              url: `https://github.com/${repository}`,
              name: repository,
            } : undefined,
            options: {
              maxTurns: 10,
              permissionMode: 'bypassPermissions',
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to start session');
        }

        // Get session ID from response header
        const newSessionId = response.headers.get('X-Session-Id');
        if (newSessionId) {
          setSessionId(newSessionId);
        }

        // Process SSE stream
        await processSSEStream(response);
      } else {
        // Send message to existing session
        const response = await fetch(`/interactive/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        // Process SSE stream
        await processSSEStream(response);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Sorry, something went wrong. ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={{ flex: 1 }}>
        {/* Header with repo selector */}
        <View style={styles.chatHeader}>
          <Text style={styles.chatTitle}>Chat</Text>
          {repository ? (
            <Pressable
              style={styles.repoSelector}
              onPress={() => setRepository(null)}
            >
              <Ionicons name="logo-github" size={16} color={colors.foreground} />
              <Text style={styles.repoText}>{repository}</Text>
              <Ionicons name="close" size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.repoSelector}
              onPress={() => setRepository('owner/repo')}
            >
              <Ionicons name="folder-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.repoText, { color: colors.mutedForeground }]}>
                Select repo
              </Text>
            </Pressable>
          )}
        </View>

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.chatEmptyState}>
            <Ionicons name="sparkles-outline" size={48} color={colors.mutedForeground} />
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptySubtitle}>
              Ask Claude Code to help with your code.{'\n'}
              Select a repository to make changes directly.
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }}
          >
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageRow,
                  message.role === 'user' ? styles.messageRowUser : null,
                ]}
              >
                {message.role === 'assistant' && (
                  <View style={[styles.messageBubble, styles.assistantBubble]}>
                    <Text style={styles.messageText}>
                      {message.content || (
                        <Text style={{ color: colors.mutedForeground }}>
                          {message.isStreaming ? 'Thinking...' : 'No response'}
                        </Text>
                      )}
                    </Text>
                    {message.isStreaming && (
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>
                        {' '}
                        Thinking...
                      </Text>
                    )}
                  </View>
                )}
                {message.role === 'user' && (
                  <View style={[styles.messageBubble, styles.userBubble]}>
                    <Text style={styles.messageText}>{message.content}</Text>
                  </View>
                )}
              </View>
            ))}
            {isProcessing && (
              <View style={styles.messageRow}>
                <View style={[styles.messageBubble, styles.assistantBubble]}>
                  <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
                    ...
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Input */}
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
              onSubmitEditing={sendMessage}
            />
            <Pressable
              style={[
                styles.sendButton,
                (!inputText.trim() || isProcessing) && styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={!inputText.trim() || isProcessing}
            >
              <Ionicons
                name={isProcessing ? 'ellipsis-horizontal' : 'send'}
                size={20}
                color="white"
              />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function SettingsScreen() {
  const { stats, status, isLoading, refresh } = useAppStore();

  React.useEffect(() => {
    refresh();
  }, []);

  return (
    <View style={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Card title="GitHub Configuration">
        <View style={styles.row}>
          <StatusDot status={status?.configured ? 'completed' : 'pending'} />
          <Text style={styles.statusText}>
            {status?.configured ? 'GitHub App Connected' : 'GitHub Not Connected'}
          </Text>
        </View>
        <Text style={styles.mutedText}>
          {status?.configured
            ? 'Your GitHub App is properly configured and connected.'
            : 'Install the GitHub App to enable automatic issue processing.'}
        </Text>
      </Card>
    </View>
  );
}

// Main App with Tab Navigation
export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'issues' | 'settings'>('dashboard');

  return (
    <View style={styles.container}>
      {/* Header */}
      {activeTab !== 'chat' && (
        <View style={styles.header}>
          <View style={styles.row}>
            <Ionicons name="cube" size={24} color="#6366f1" />
            <Text style={styles.headerTitle}>Claude Pipeline</Text>
          </View>
        </View>
      )}

      {/* Content */}
      {activeTab === 'chat' ? (
        <ChatScreen />
      ) : (
        <ScrollView style={styles.scrollContent}>
          {activeTab === 'dashboard' && <DashboardScreen />}
          {activeTab === 'issues' && <IssuesScreen />}
          {activeTab === 'settings' && <SettingsScreen />}
        </ScrollView>
      )}

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TabButton icon="home" label="Pipeline" active={activeTab === 'dashboard'} onPress={() => setActiveTab('dashboard')} />
        <TabButton icon="chatbubbles" label="Chat" active={activeTab === 'chat'} onPress={() => setActiveTab('chat')} />
        <TabButton icon="git-branch" label="Issues" active={activeTab === 'issues'} onPress={() => setActiveTab('issues')} />
        <TabButton icon="settings" label="Settings" active={activeTab === 'settings'} onPress={() => setActiveTab('settings')} />
      </View>
    </View>
  );
}

function TabButton({ icon, label, active, onPress }: { icon: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Ionicons name={icon} size={20} color={active ? '#6366f1' : '#71717a'} />
      <Text style={[styles.tabLabel, { color: active ? '#6366f1' : '#71717a' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: 8,
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    color: colors.foreground,
  },
  mutedText: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  emptyText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
  // Chat styles
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
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
  chatContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  messagesList: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 8,
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
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.foreground,
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
  chatEmptyState: {
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
});
