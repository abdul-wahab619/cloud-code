import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/styles';

// Message types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
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
  timestamp: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 4,
  },
});

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [repository, setRepository] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

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

        // Update store with session
        // TODO: Integrate with useAppStore
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

    const streamStartTime = Date.now();

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

        // Timeout check (90 seconds max)
        if (Date.now() - streamStartTime > 90000) {
          console.warn('Stream timeout');
          break;
        }
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
            console.debug('Failed to parse SSE data:', data);
          }
        }
      }
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior="padding" keyboardVerticalOffset={0}>
      <View style={styles.flex1}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Chat</Text>
          {repository ? (
            <Pressable
              style={styles.repoSelector}
              onPress={() => {
                // TODO: Show repository selector
                setRepository(null);
              }}
            >
              <Ionicons name="logo-github" size={16} color={colors.foreground} />
              <Text style={styles.repoText}>{repository}</Text>
              <Ionicons name="close" size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.repoSelector}
              onPress={() => {
                // TODO: Show repository selector
                // For now, just use a placeholder
                setRepository('owner/repo');
              }}
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
          <View style={styles.emptyState}>
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
                  <View
                    style={[
                      styles.messageBubble,
                      styles.assistantBubble,
                    ]}
                  >
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
                  <View
                    style={[
                      styles.messageBubble,
                      styles.userBubble,
                    ]}
                  >
                    <Text style={styles.messageText}>{message.content}</Text>
                  </View>
                )}
              </View>
            ))}
            {isProcessing && (
              <View style={styles.messageRow}>
                <View
                  style={[
                    styles.messageBubble,
                    styles.assistantBubble,
                  ]}
                >
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
