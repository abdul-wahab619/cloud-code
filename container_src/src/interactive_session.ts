/**
 * Interactive Session Handler for Claude Code Container
 *
 * Enables real-time streaming of Claude Code output with bidirectional communication.
 */

import * as http from 'http';
import { promises as fs } from 'fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import simpleGit from 'simple-git';
import * as path from 'path';
import * as readline from 'readline';
import { ContainerGitHubClient } from './github_client.js';
import {
  setupWorkspace,
  initializeGitWorkspace,
  detectGitChanges,
  createFeatureBranchCommitAndPush,
  readPRSummary
} from './main.js';

// ============================================================================
// Types
// ============================================================================

interface InteractiveSession {
  id: string;
  status: 'starting' | 'ready' | 'processing' | 'waiting_input' | 'completed' | 'error';
  repository?: {
    url: string;
    name: string;
    branch?: string;
  };
  workspaceDir?: string;
  conversationHistory: ConversationMessage[];
  currentTurn: number;
  createdAt: number;
  lastActivityAt: number;
  options?: {
    maxTurns?: number;
    permissionMode?: string;
    createPR?: boolean;
  };
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface SSEEvent {
  type: 'status' | 'claude_start' | 'claude_delta' | 'claude_end' | 'claude_message' | 'input_request' | 'file_change' | 'complete' | 'error';
  data: any;
  timestamp?: number;
}

interface InteractiveSessionConfig {
  sessionId: string;
  prompt: string;
  repository?: {
    url: string;
    name: string;
    branch?: string;
  };
  githubToken?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  apiTimeoutMs?: string;
  options?: {
    maxTurns?: number;
    permissionMode?: 'bypassPermissions' | 'required';
    createPR?: boolean;
  };
}

// ============================================================================
// SSE Utility
// ============================================================================

class SSEStreamer {
  private res: http.ServerResponse;
  private isActive = true;

  constructor(res: http.ServerResponse) {
    this.res = res;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Send initial connection message
    this.send('connected', { message: 'SSE connection established', timestamp: Date.now() });
  }

  send(event: string, data: any): void {
    if (!this.isActive) return;

    try {
      const sseData = typeof data === 'string' ? data : JSON.stringify(data);
      this.res.write(`event: ${event}\ndata: ${sseData}\n\n`);
    } catch (error) {
      this.isActive = false;
    }
  }

  close(): void {
    if (this.isActive) {
      this.isActive = false;
      this.send('end', { timestamp: Date.now() });
      this.res.end();
    }
  }

  get isAlive(): boolean {
    return this.isActive;
  }
}

// ============================================================================
// Logging Utility
// ============================================================================

function logWithContext(context: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${context}] ${message}`;

  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
}

// ============================================================================
// Extract Text from SDK Message
// ============================================================================

function getMessageText(message: SDKMessage): string {
  if ('content' in message && typeof message.content === 'string') {
    return message.content;
  }
  if ('text' in message && typeof message.text === 'string') {
    return message.text;
  }
  if ('content' in message && Array.isArray(message.content)) {
    const textContent = message.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n\n');

    if (textContent.trim()) {
      return textContent;
    }
  }

  if ('message' in message && message.message && typeof message.message === 'object') {
    const msg = message.message as any;
    if ('content' in msg && Array.isArray(msg.content)) {
      const textContent = msg.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n\n');

      if (textContent.trim()) {
        return textContent;
      }
    }
  }

  return JSON.stringify(message);
}

// ============================================================================
// Check if Message Requires Input
// ============================================================================

function requiresInput(message: SDKMessage): boolean {
  // Check for ask prompts or tool use that requires confirmation
  const text = getMessageText(message).toLowerCase();

  // Indicators that Claude is asking for input
  const inputIndicators = [
    'would you like',
    'should i',
    'do you want',
    'shall i',
    'proceed?',
    'continue?',
    'confirm',
    'allow me'
  ];

  return inputIndicators.some(indicator => text.includes(indicator));
}

// ============================================================================
// Main Interactive Session Handler
// ============================================================================

export async function handleInteractiveSession(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: InteractiveSessionConfig
): Promise<void> {
  const streamer = new SSEStreamer(res);
  const session: InteractiveSession = {
    id: config.sessionId,
    status: 'starting',
    repository: config.repository,
    conversationHistory: [],
    currentTurn: 0,
    createdAt: Date.now(),
    lastActivityAt: Date.now()
  };

  logWithContext('INTERACTIVE_SESSION', 'Starting interactive session', {
    sessionId: session.id,
    hasPrompt: !!config.prompt,
    hasRepository: !!config.repository
  });

  try {
    // 1. Set environment variables
    if (config.githubToken) {
      process.env.GITHUB_TOKEN = config.githubToken;
    }

    // Set Anthropic API configuration
    // Use the provided API key from config, or fall back to container default
    if (config.anthropicApiKey) {
      process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
    }
    // Also support ANTHROPIC_AUTH_TOKEN (used by some SDK versions)
    if (!process.env.ANTHROPIC_AUTH_TOKEN) {
      process.env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_API_KEY;
    }

    // Set custom base URL if provided (for GLM/proxy APIs)
    if (config.anthropicBaseUrl) {
      process.env.ANTHROPIC_BASE_URL = config.anthropicBaseUrl;
    } else if (!process.env.ANTHROPIC_BASE_URL) {
      process.env.ANTHROPIC_BASE_URL = 'https://api.z.ai/api/anthropic';
    }

    // Set API timeout if provided
    if (config.apiTimeoutMs) {
      process.env.API_TIMEOUT_MS = config.apiTimeoutMs;
    }

    // 2. Validate API key
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    // 3. Setup workspace if repository provided
    if (config.repository) {
      streamer.send('status', {
        message: `Cloning repository: ${config.repository.name}...`,
        timestamp: Date.now()
      });

      const branch = config.repository.branch || 'main';
      session.workspaceDir = await setupWorkspace(config.repository.url, session.id);
      session.repository = {
        ...config.repository,
        branch
      };

      streamer.send('status', {
        message: 'Repository cloned successfully',
        repository: config.repository.name,
        timestamp: Date.now()
      });
    }

    // 4. Initialize GitHub client if available
    let githubClient: ContainerGitHubClient | undefined;
    if (config.githubToken && config.repository) {
      const [owner, repo] = config.repository.name.split('/');
      githubClient = new ContainerGitHubClient(config.githubToken, owner, repo);
    }

    // 5. Start Claude Code interactive session
    session.status = 'processing';
    streamer.send('status', {
      message: 'Starting Claude Code...',
      timestamp: Date.now()
    });

    await runClaudeInteractive(session, config.prompt, streamer, githubClient);

    // 6. Complete session
    session.status = 'completed';
    streamer.send('complete', {
      sessionId: session.id,
      turns: session.currentTurn,
      timestamp: Date.now()
    });

    logWithContext('INTERACTIVE_SESSION', 'Session completed', {
      sessionId: session.id,
      turns: session.currentTurn
    });

  } catch (error) {
    session.status = 'error';
    const errorMessage = error instanceof Error ? error.message : String(error);

    logWithContext('INTERACTIVE_SESSION', 'Session error', {
      sessionId: session.id,
      error: errorMessage
    });

    streamer.send('error', {
      message: errorMessage,
      timestamp: Date.now()
    });
  } finally {
    // Small delay before closing to ensure last message is sent
    setTimeout(() => {
      streamer.close();
    }, 100);
  }
}

// ============================================================================
// Claude Code Interactive Execution
// ============================================================================

async function runClaudeInteractive(
  session: InteractiveSession,
  initialPrompt: string,
  streamer: SSEStreamer,
  githubClient?: ContainerGitHubClient
): Promise<void> {
  const maxTurns = session.currentTurn + (session.options?.maxTurns || 10);
  let currentPrompt = initialPrompt;
  const workspaceDir = session.workspaceDir || process.cwd();
  const originalCwd = process.cwd();

  // Change to workspace directory if set
  if (session.workspaceDir) {
    process.chdir(workspaceDir);
    logWithContext('INTERACTIVE_SESSION', 'Changed to workspace directory', { workspaceDir });
  }

  try {
    while (session.currentTurn < maxTurns && streamer.isAlive) {
      session.currentTurn++;
      session.lastActivityAt = Date.now();

      // Add user message to history
      session.conversationHistory.push({
        role: 'user',
        content: currentPrompt,
        timestamp: Date.now()
      });

      streamer.send('claude_start', {
        turn: session.currentTurn,
        prompt: currentPrompt.substring(0, 200) + (currentPrompt.length > 200 ? '...' : ''),
        timestamp: Date.now()
      });

      logWithContext('INTERACTIVE_SESSION', `Starting turn ${session.currentTurn}`, {
        promptLength: currentPrompt.length
      });

      // Build conversation context for Claude
      const contextPrompt = buildConversationContext(session, currentPrompt);

      let turnComplete = false;
      let fullResponse = '';

      // Execute Claude Code query with streaming
      for await (const message of query({
        prompt: contextPrompt,
        options: { permissionMode: 'bypassPermissions' }
      })) {
        if (!streamer.isAlive) break;

        const messageText = getMessageText(message);

        // Stream message to client
        streamer.send('claude_delta', {
          turn: session.currentTurn,
          content: messageText,
          type: message.type,
          timestamp: Date.now()
        });

        fullResponse += messageText + '\n\n';

        // Check if Claude is asking for input
        if (requiresInput(message)) {
          streamer.send('input_request', {
            prompt: messageText,
            turn: session.currentTurn,
            timestamp: Date.now()
          });

          // Wait for user input (this would come from a separate endpoint)
          // For now, we'll continue with a default response
          logWithContext('INTERACTIVE_SESSION', 'Input requested from Claude', {
            prompt: messageText.substring(0, 100)
          });

          // In a full implementation, we would wait here for user input
          // For now, signal that input is needed and pause
          session.status = 'waiting_input';
          break;
        }
      }

      // Add assistant response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now()
      });

      streamer.send('claude_end', {
        turn: session.currentTurn,
        timestamp: Date.now()
      });

      // Check for file changes
      if (session.workspaceDir) {
        const hasChanges = await detectGitChanges(session.workspaceDir);

        if (hasChanges) {
          streamer.send('file_change', {
            message: 'File changes detected',
            workspaceDir: session.workspaceDir,
            timestamp: Date.now()
          });

          // Optionally create PR if configured
          if (session.options?.createPR && githubClient) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/g, '-').split('.')[0];
            const branchName = `claude-interactive-${session.id}-${timestamp}`;

            await createFeatureBranchCommitAndPush(
              session.workspaceDir,
              branchName,
              `Changes from interactive session ${session.id}`
            );

            const prSummary = await readPRSummary(session.workspaceDir);
            const repoInfo = await githubClient.getRepository();

            const pullRequest = await githubClient.createPullRequest(
              prSummary?.split('\n')[0].trim() || `Interactive session ${session.id}`,
              prSummary || `Changes from interactive Claude Code session.`,
              branchName,
              repoInfo.default_branch
            );

            streamer.send('status', {
              message: `Pull request created: ${pullRequest.html_url}`,
              prUrl: pullRequest.html_url,
              timestamp: Date.now()
            });
          }

          // Reset for next interaction
          await initializeGitWorkspace(session.workspaceDir);
        }
      }

      // Check if we should continue (in real implementation, wait for user input)
      // For now, break after first turn
      break;
    }

  } finally {
    // Always restore original working directory
    if (session.workspaceDir) {
      process.chdir(originalCwd);
    }
  }
}

// ============================================================================
// Build Conversation Context
// ============================================================================

function buildConversationContext(session: InteractiveSession, currentPrompt: string): string {
  let context = '';

  // Add repository context if available
  if (session.repository) {
    context += `Working in repository: ${session.repository.name} (branch: ${session.repository.branch})\n\n`;
  }

  // Add conversation history
  if (session.conversationHistory.length > 0) {
    context += '## Conversation History\n\n';
    for (const msg of session.conversationHistory) {
      context += `### ${msg.role === 'user' ? 'User' : 'Assistant'}\n\n${msg.content}\n\n`;
    }
  }

  // Add current prompt
  context += `## Current Request\n\n${currentPrompt}`;

  return context;
}

// ============================================================================
// HTTP Handler Wrapper
// ============================================================================

export function createInteractiveSessionHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req, res) => {
    logWithContext('INTERACTIVE_HANDLER', 'Interactive session request received', {
      method: req.method,
      url: req.url
    });

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      // Read request body
      let requestBody = '';
      for await (const chunk of req) {
        requestBody += chunk;
      }

      const config: InteractiveSessionConfig = JSON.parse(requestBody);

      // Validate required fields
      if (!config.sessionId) {
        throw new Error('sessionId is required');
      }
      if (!config.prompt) {
        throw new Error('prompt is required');
      }

      // Start interactive session
      await handleInteractiveSession(req, res, config);

    } catch (error) {
      logWithContext('INTERACTIVE_HANDLER', 'Request error', {
        error: error instanceof Error ? error.message : String(error)
      });

      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bad request',
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  };
}

// ============================================================================
// Export Session Status Check
// ============================================================================

export async function getActiveSessionStatus(sessionId: string): Promise<InteractiveSession | null> {
  // This would check with a session manager DO in the full implementation
  // For now, return null
  return null;
}
