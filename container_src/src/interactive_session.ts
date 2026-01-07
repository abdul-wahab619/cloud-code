/**
 * Interactive Session Handler for Claude Code Container
 *
 * Enables real-time streaming of Claude Code output with bidirectional communication.
 */

import * as http from 'http';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
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

interface CLIResult {
  type: string;
  subtype: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage?: any;
}

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
  isContinuation?: boolean; // Flag to indicate this is a follow-up message
  session?: {
    repository?: {
      url: string;
      name: string;
      branch?: string;
    };
    messages?: ConversationMessage[];
    currentTurn?: number;
  };
}

// ============================================================================
// Session Storage (in-memory for multi-turn conversations)
// ============================================================================

const activeSessions = new Map<string, InteractiveSession>();

// Session timeout - remove sessions inactive for more than 30 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastActivityAt > SESSION_TIMEOUT_MS) {
      logWithContext('SESSION_CLEANUP', 'Removing expired session', {
        sessionId,
        lastActivityAt: session.lastActivityAt
      });
      activeSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

function getSession(sessionId: string): InteractiveSession | undefined {
  return activeSessions.get(sessionId);
}

function saveSession(session: InteractiveSession): void {
  session.lastActivityAt = Date.now();
  activeSessions.set(session.id, session);
  logWithContext('SESSION_STORAGE', 'Session saved', {
    sessionId: session.id,
    hasWorkspace: !!session.workspaceDir,
    turns: session.currentTurn
  });
}

function endSession(sessionId: string): void {
  activeSessions.delete(sessionId);
  logWithContext('SESSION_STORAGE', 'Session ended', { sessionId });
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
// Extract Text from CLI Result or SDK Message
// ============================================================================

function getMessageText(message: CLIResult | any): string {
  // Handle CLI result messages
  if ('result' in message && typeof message.result === 'string' && message.result) {
    return message.result;
  }

  // Legacy SDK message handling
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

  return 'Processing completed.';
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

  // Check if this is a continuation with session state from DO
  const existingSession = getSession(config.sessionId);
  const hasDOSession = !!config.session;
  const isContinuation = config.isContinuation && (hasDOSession || !!existingSession);

  let session: InteractiveSession;

  if (isContinuation) {
    // Prefer DO-provided session state over in-memory
    if (config.session) {
      // Create session from DO state
      session = {
        id: config.sessionId,
        status: 'processing',
        repository: config.session.repository || config.repository,
        conversationHistory: (config.session.messages || []).map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          timestamp: m.timestamp
        })),
        currentTurn: config.session.currentTurn || 0,
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      };

      logWithContext('INTERACTIVE_SESSION', 'Restoring session from DO', {
        sessionId: session.id,
        hasRepository: !!session.repository,
        previousTurns: session.currentTurn,
        historyLength: session.conversationHistory.length
      });
    } else if (existingSession) {
      // Fallback to in-memory session
      session = existingSession;
      session.status = 'processing';

      logWithContext('INTERACTIVE_SESSION', 'Continuing existing in-memory session', {
        sessionId: session.id,
        hasWorkspace: !!session.workspaceDir,
        previousTurns: session.currentTurn,
        historyLength: session.conversationHistory.length
      });
    } else {
      // No session state available, create new
      session = {
        id: config.sessionId,
        status: 'starting',
        repository: config.repository,
        conversationHistory: [],
        currentTurn: 0,
        createdAt: Date.now(),
        lastActivityAt: Date.now()
      };

      logWithContext('INTERACTIVE_SESSION', 'No session state found, creating new session', {
        sessionId: session.id
      });
    }

    if (session.repository) {
      streamer.send('status', {
        message: hasDOSession ? 'Continuing conversation...' : 'Continuing conversation...',
        repository: session.repository.name,
        timestamp: Date.now()
      });
    }
  } else {
    // Create new session
    session = {
      id: config.sessionId,
      status: 'starting',
      repository: config.repository,
      conversationHistory: [],
      currentTurn: 0,
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    logWithContext('INTERACTIVE_SESSION', 'Starting new interactive session', {
      sessionId: session.id,
      hasPrompt: !!config.prompt,
      hasRepository: !!config.repository
    });
  }

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
    // For continuation: verify workspace exists or recreate it
    // For new sessions: clone if repository provided
    let needsWorkspaceSetup = false;
    let workspaceExists = false;

    if (session.repository && session.workspaceDir) {
      // Verify the workspace directory actually exists (might be on different container)
      try {
        await fs.access(session.workspaceDir);
        workspaceExists = true;
      } catch {
        logWithContext('INTERACTIVE_SESSION', 'Workspace directory not accessible, will recreate', {
          workspaceDir: session.workspaceDir
        });
        session.workspaceDir = undefined; // Clear to trigger recreation
      }
    }

    if (session.repository && !session.workspaceDir) {
      needsWorkspaceSetup = true;
      const action = isContinuation ? 'Reconnecting to repository' : 'Cloning repository';
      streamer.send('status', {
        message: `${action}: ${session.repository.name}...`,
        timestamp: Date.now()
      });

      try {
        const branch = session.repository.branch || 'main';
        session.workspaceDir = await setupWorkspace(session.repository.url, session.id);
        session.repository = {
          ...session.repository,
          branch
        };

        streamer.send('status', {
          message: isContinuation ? 'Repository reconnected' : 'Repository cloned successfully',
          repository: session.repository.name,
          timestamp: Date.now()
        });
      } catch (repoError) {
        const errorMsg = repoError instanceof Error ? repoError.message : String(repoError);
        // Check if it's a clone error (likely invalid repository)
        if (errorMsg.includes('clone') || errorMsg.includes('git') || errorMsg.includes('repository')) {
          streamer.send('error', {
            message: `Failed to access repository "${session.repository.name}". Please verify the repository exists and you have access to it.`,
            details: errorMsg,
            timestamp: Date.now()
          });
          throw new Error(`Repository error: ${errorMsg}`);
        }
        throw repoError;
      }
    } else if (!session.workspaceDir) {
      // No repository - run in general chat mode
      streamer.send('status', {
        message: 'Starting general chat mode (no repository selected)',
        timestamp: Date.now()
      });
    } else if (workspaceExists && session.repository) {
      streamer.send('status', {
        message: 'Using existing workspace',
        repository: session.repository.name,
        timestamp: Date.now()
      });
    }

    // 4. Initialize GitHub client if available
    let githubClient: ContainerGitHubClient | undefined;
    const repoName = session.repository?.name || config.repository?.name;
    if (config.githubToken && repoName) {
      const [owner, repo] = repoName.split('/');
      githubClient = new ContainerGitHubClient(config.githubToken, owner, repo);
    }

    // 5. Start Claude Code interactive session
    session.status = 'processing';
    streamer.send('status', {
      message: 'Starting Claude Code...',
      timestamp: Date.now()
    });

    await runClaudeInteractive(session, config.prompt, streamer, githubClient);

    // 6. Complete session (but save it for potential continuation)
    session.status = 'completed';
    saveSession(session); // Save session state for future messages

    // Get the last assistant message for DO persistence
    const lastAssistantMessage = session.conversationHistory[session.conversationHistory.length - 1];
    const lastUserMessage = session.conversationHistory.find(m => m.role === 'user');

    streamer.send('complete', {
      sessionId: session.id,
      turns: session.currentTurn,
      timestamp: Date.now(),
      // Include last messages for DO persistence
      lastUserMessage: lastUserMessage ? { content: lastUserMessage.content, timestamp: lastUserMessage.timestamp } : undefined,
      lastAssistantMessage: lastAssistantMessage?.role === 'assistant' ? { content: lastAssistantMessage.content, timestamp: lastAssistantMessage.timestamp } : undefined
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

      // Execute Claude Code query using CLI (non-streaming for now)
      const cliResult = await new Promise<CLIResult>((resolve, reject) => {
        const cliArgs = [
          '--output-format', 'json', '-p', '--print',
          '--permission-mode', 'acceptEdits',
          '--max-turns', '10',
          contextPrompt
        ];

        logWithContext('INTERACTIVE_SESSION', 'Starting CLI', {
          args: cliArgs,
          cwd: workspaceDir,
          hasApiKey: !!process.env.ANTHROPIC_API_KEY,
          apiUrl: process.env.ANTHROPIC_BASE_URL
        });

        const cliProcess = spawn('claude', cliArgs, {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: workspaceDir,
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || ''
          }
        });

        let stdout = '';
        let stderr = '';

        cliProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        cliProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        cliProcess.on('close', (code) => {
          if (code === 0 && stdout) {
            try {
              resolve(JSON.parse(stdout));
            } catch (e) {
              reject(new Error(`Failed to parse CLI output: ${stdout.substring(0, 200)}`));
            }
          } else {
            reject(new Error(`CLI exited with code ${code}: ${stderr || stdout}`));
          }
        });

        cliProcess.on('error', (err) => {
          reject(err);
        });
      });

      const messageText = getMessageText(cliResult);

      // Stream result to client
      streamer.send('claude_delta', {
        turn: session.currentTurn,
        content: messageText,
        type: cliResult.type,
        subtype: cliResult.subtype,
        timestamp: Date.now()
      });

      // Add assistant response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: messageText,
        timestamp: Date.now()
      });

      streamer.send('claude_end', {
        turn: session.currentTurn,
        timestamp: Date.now()
      });

      // Check if Claude hit max turns without completing
      if (cliResult.subtype === 'error_max_turns') {
        streamer.send('status', {
          message: 'Reached maximum turns without completion',
          turns: cliResult.num_turns,
          timestamp: Date.now()
        });
      }

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

      // Break after first turn (single-turn mode for now)
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
  // For now, use the direct prompt without extra context to avoid hitting turn limits
  return currentPrompt;
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

// ============================================================================
// Message Handler for Follow-up Messages
// ============================================================================

interface MessageRequest {
  message: string;
  sessionId?: string;
  session?: {
    repository?: {
      url: string;
      name: string;
      branch?: string;
    };
    messages?: ConversationMessage[];
    currentTurn?: number;
    options?: {
      maxTurns?: number;
      permissionMode?: 'bypassPermissions' | 'required';
      createPR?: boolean;
    };
  };
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  apiTimeoutMs?: string;
  githubToken?: string;
}

export function createMessageHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req, res) => {
    logWithContext('MESSAGE_HANDLER', 'Message request received', {
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

      const request: MessageRequest = JSON.parse(requestBody);

      // Validate required fields
      if (!request.message) {
        throw new Error('message is required');
      }

      // Get session ID from header or body
      const sessionId = req.headers['x-session-id'] as string || request.sessionId;
      if (!sessionId) {
        throw new Error('sessionId is required');
      }

      // Check if this is a continuation with DO-provided session state
      const hasDOSession = !!request.session;
      const existingSession = getSession(sessionId);
      const isContinuation = hasDOSession || !!existingSession;

      // Create config for the message, prioritizing DO-provided session state
      const config: InteractiveSessionConfig = {
        sessionId,
        prompt: request.message,
        anthropicApiKey: request.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        anthropicBaseUrl: request.anthropicBaseUrl || process.env.ANTHROPIC_BASE_URL,
        apiTimeoutMs: request.apiTimeoutMs || process.env.API_TIMEOUT_MS,
        githubToken: request.githubToken,
        isContinuation,
        // Pass DO-provided session state if available
        session: request.session,
        // Fallback to in-memory session repository info
        repository: request.session?.repository || existingSession?.repository,
        options: request.session?.options || existingSession?.options as InteractiveSessionConfig['options']
      };

      logWithContext('MESSAGE_HANDLER', 'Processing message', {
        sessionId,
        isContinuation,
        hasDOSession,
        hasRepository: !!config.repository,
        messagesCount: request.session?.messages?.length || 0
      });

      // Process as an interactive session (will reuse session state if found)
      await handleInteractiveSession(req, res, config);

    } catch (error) {
      logWithContext('MESSAGE_HANDLER', 'Request error', {
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
