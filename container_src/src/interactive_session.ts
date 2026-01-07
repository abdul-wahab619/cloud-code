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

      // Create a minimal config for the message
      const config: InteractiveSessionConfig = {
        sessionId,
        prompt: request.message,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
        apiTimeoutMs: process.env.API_TIMEOUT_MS
      };

      // Process as a single-turn interactive session
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
