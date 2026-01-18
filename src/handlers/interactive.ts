/**
 * Interactive Mode Handler for Cloudflare Worker
 *
 * Handles routing of interactive Claude Code sessions to containers.
 */

import { logWithContext } from '../log';
import { containerFetch, getRouteFromRequest } from '../fetch';
import { ensureDOEncryptionKey } from '../index';
import type { Env, InteractiveSessionState } from '../types';
import {
  detectTestMode,
  addTestModeHeaders,
  createMockSSEStream,
  createMockMultiRepoSSEStream,
  createMockErrorSSEStream,
  sseGeneratorToStream
} from '../test_mode';

// ============================================================================
// Types
// ============================================================================

interface StartInteractiveSessionRequest {
  prompt?: string; // Optional - session can start without initial message
  repository?: {
    url: string;
    name: string;
    branch?: string;
  };
  repositories?: Array<{
    url: string;
    name: string;
    branch?: string;
  }>;
  prNumber?: number; // If provided, post review comments to this PR
  options?: {
    maxTurns?: number;
    permissionMode?: 'bypassPermissions' | 'required';
    createPR?: boolean;
  };
  // Test mode options
  testMode?: 'normal' | 'error' | 'multi-repo';
  testError?: string;
}

interface StartInteractiveSessionResponse {
  success: boolean;
  sessionId?: string;
  streamUrl?: string;
  testMode?: boolean;
  error?: string;
}

// ============================================================================
// Generate Session ID
// ============================================================================

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `sess_${timestamp}_${random}`;
}

// ============================================================================
// Start Interactive Session
// ============================================================================

export async function handleStartInteractiveSession(
  request: Request,
  env: Env
): Promise<Response> {
  logWithContext('INTERACTIVE_WORKER', 'Starting interactive session');

  // Detect test mode
  const testMode = detectTestMode(request);

  try {
    const body: StartInteractiveSessionRequest = await request.json();

    // Validate request - prompt is now optional, session can start empty
    if (!body.prompt && !body.repository && !body.repositories) {
      const response = Response.json({
        success: false,
        error: 'Either prompt or repository (or repositories) must be provided'
      } satisfies StartInteractiveSessionResponse, { status: 400 });
      return addTestModeHeaders(response, testMode);
    }

    // Check for centralized Claude API key (skip in test mode)
    if (!env.ANTHROPIC_API_KEY && !testMode.enabled) {
      const response = Response.json({
        success: false,
        error: 'Claude API key not configured'
      } satisfies StartInteractiveSessionResponse, { status: 400 });
      return addTestModeHeaders(response, testMode);
    }

    // Generate session ID
    const sessionId = generateSessionId();

    // If test mode is enabled, return mock SSE stream
    if (testMode.enabled) {
      logWithContext('TEST_MODE', 'Returning mock SSE stream', {
        testType: body.testMode || 'normal',
        sessionId
      });

      let streamGenerator: AsyncGenerator<Uint8Array>;

      if (body.testMode === 'error') {
        streamGenerator = createMockErrorSSEStream(body.testError);
      } else if (body.testMode === 'multi-repo' && body.repositories) {
        const repoNames = body.repositories.map(r => r.name);
        streamGenerator = createMockMultiRepoSSEStream(repoNames);
      } else {
        streamGenerator = createMockSSEStream();
      }

      const response = new Response(sseGeneratorToStream(streamGenerator), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Session-Id': sessionId,
          'X-Test-Mode': 'true'
        }
      });

      return addTestModeHeaders(response, testMode);
    }

    // Normal flow: Create session record in DO
    // Use any to avoid deep type instantiation with DurableObjectNamespace
    const sessionDO = (env.INTERACTIVE_SESSIONS as any).idFromName('session-manager');
    const sessionDOStub = (env.INTERACTIVE_SESSIONS as any).get(sessionDO);
    const now = Date.now();

    await sessionDOStub.fetch(new Request('http://internal/create', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        status: 'starting',
        repository: body.repository,
        repositories: body.repositories,
        currentTurn: 0,
        createdAt: now,
        lastActivityAt: now
      } satisfies InteractiveSessionState)
    }));

    // Save initial user message to DO if provided
    if (body.prompt) {
      await sessionDOStub.fetch(new Request('http://internal/add-message', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          role: 'user',
          content: body.prompt,
          turnNumber: 1
        })
      }));
    }

    // Get GitHub token if repository is provided
    let githubToken: string | undefined;
    const repositories = body.repositories;
    if (body.repository || repositories) {
      const githubConfigId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
      const githubConfigDO = (env.GITHUB_APP_CONFIG as any).get(githubConfigId);

      // Ensure encryption key is set before attempting to decrypt credentials
      if (env.ENCRYPTION_KEY) {
        await ensureDOEncryptionKey(githubConfigDO, env.ENCRYPTION_KEY);
      }

      const tokenResponse = await githubConfigDO.fetch(new Request('http://internal/get-installation-token'));
      const tokenData = tokenResponse.ok ? await tokenResponse.json() as { token: string | null } : null;
      githubToken = tokenData?.token || undefined;
    }

    // Create unique container for this session
    const containerName = `interactive-${sessionId}`;
    const id = (env.MY_CONTAINER as any).idFromName(containerName);
    const container = (env.MY_CONTAINER as any).get(id);

    // Prepare session config
    const sessionConfig = {
      sessionId,
      prompt: body.prompt,
      repository: body.repository,
      repositories,
      prNumber: body.prNumber,
      // GLM configuration
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      anthropicBaseUrl: 'https://api.z.ai/api/anthropic',
      apiTimeoutMs: '3000000',
      githubToken,
      options: body.options
    };

    logWithContext('INTERACTIVE_WORKER', 'Starting container for interactive session', {
      sessionId,
      hasRepository: !!body.repository,
      promptLength: body.prompt?.length || 0
    });

    // Start the interactive session in the container
    // Note: This returns a Response with SSE stream
    const containerResponse = await containerFetch(
      container,
      new Request('http://internal/interactive-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId
        },
        body: JSON.stringify(sessionConfig)
      }),
      {
        containerName,
        route: '/interactive-session'
      }
    );

    // Check if container request succeeded
    if (!containerResponse.ok) {
      const errorText = await containerResponse.text();
      logWithContext('INTERACTIVE_WORKER', 'Container session failed', {
        status: containerResponse.status,
        error: errorText
      });

      const response = Response.json({
        success: false,
        error: `Failed to start session: ${errorText}`
      } satisfies StartInteractiveSessionResponse, { status: 500 });
      return addTestModeHeaders(response, testMode);
    }

    // Stream the SSE response directly to the client
    logWithContext('INTERACTIVE_WORKER', 'Session started, streaming response', {
      sessionId
    });

    // Return the SSE stream directly from the container
    const response = new Response(containerResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Session-Id': sessionId
      }
    });

    return addTestModeHeaders(response, testMode);

  } catch (error) {
    logWithContext('INTERACTIVE_WORKER', 'Error starting interactive session', {
      error: error instanceof Error ? error.message : String(error)
    });

    const response = Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    } satisfies StartInteractiveSessionResponse, { status: 500 });

    return addTestModeHeaders(response, testMode);
  }
}

// ============================================================================
// Handle Interactive Request Router
// ============================================================================

export async function handleInteractiveRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Detect test mode
  const testMode = detectTestMode(request);

  logWithContext('INTERACTIVE_WORKER', 'Interactive request received', {
    method: request.method,
    pathname,
    testMode: testMode.enabled
  });

  // Start interactive session
  if (pathname === '/interactive/start' && request.method === 'POST') {
    return await handleStartInteractiveSession(request, env);
  }

  // Send message to active session
  if (pathname.match(/^\/interactive\/[^\/]+\/message$/) && request.method === 'POST') {
    const sessionId = pathname.split('/')[2];
    const response = await handleSendMessage(sessionId, request, env);
    return addTestModeHeaders(response, testMode);
  }

  // Session status (optional - for checking active sessions)
  if (pathname === '/interactive/status' && request.method === 'GET') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      const response = Response.json({ error: 'sessionId is required' }, { status: 400 });
      return addTestModeHeaders(response, testMode);
    }

    // If test mode, return mock status
    if (testMode.enabled) {
      const response = Response.json({
        sessionId,
        status: 'completed',
        repository: {
          url: 'https://github.com/octocat/Hello-World',
          name: 'octocat/Hello-World',
          branch: 'main'
        },
        currentTurn: 1,
        createdAt: Date.now() - 60000,
        lastActivityAt: Date.now() - 10000,
        messages: [
          {
            role: 'user',
            content: 'Analyze this repository',
            timestamp: Date.now() - 60000
          },
          {
            role: 'assistant',
            content: 'I have analyzed the repository and found several areas for improvement...',
            timestamp: Date.now() - 30000
          }
        ]
      } satisfies InteractiveSessionState);
      return addTestModeHeaders(response, testMode);
    }

    // Check session status with messages from session DO
    const sessionDO = (env.INTERACTIVE_SESSIONS as any).idFromName('session-manager');
    const sessionDOStub = (env.INTERACTIVE_SESSIONS as any).get(sessionDO);
    const statusResponse = await sessionDOStub.fetch(
      new Request(`http://internal/get-with-messages?sessionId=${encodeURIComponent(sessionId)}`)
    );
    const sessionData = await statusResponse.json() as InteractiveSessionState | null;

    const response = Response.json(sessionData || { error: 'Session not found' });
    return addTestModeHeaders(response, testMode);
  }

  // End session
  if (pathname.startsWith('/interactive/') && request.method === 'DELETE') {
    const sessionId = pathname.split('/')[2];

    // If test mode, just return success
    if (testMode.enabled) {
      const response = Response.json({
        success: true,
        message: 'Test mode session ended',
        sessionId
      });
      return addTestModeHeaders(response, testMode);
    }

    const containerName = `interactive-${sessionId}`;
    const id = (env.MY_CONTAINER as any).idFromName(containerName);
    const container = (env.MY_CONTAINER as any).get(id);

    // Mark session as ended in DO
    const sessionDO = (env.INTERACTIVE_SESSIONS as any).idFromName('session-manager');
    const sessionDOStub = (env.INTERACTIVE_SESSIONS as any).get(sessionDO);
    await sessionDOStub.fetch(new Request('http://internal/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    }));

    // Send shutdown signal to container
    await containerFetch(
      container,
      new Request('http://internal/shutdown', {
        method: 'POST',
        body: JSON.stringify({ sessionId })
      }),
      { containerName, route: '/shutdown' }
    );

    const response = Response.json({ success: true, message: 'Session ended' });
    return addTestModeHeaders(response, testMode);
  }

  // Unknown endpoint
  const response = Response.json({ error: 'Unknown interactive endpoint' }, { status: 404 });
  return addTestModeHeaders(response, testMode);
}

// ============================================================================
// Send Message to Active Session
// ============================================================================

async function handleSendMessage(
  sessionId: string,
  request: Request,
  env: Env
): Promise<Response> {
  logWithContext('INTERACTIVE_WORKER', 'Sending message to session', { sessionId });

  try {
    const body = await request.json() as { message: string };

    if (!body.message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    // Fetch session state from DO (including conversation history)
    const sessionDO = (env.INTERACTIVE_SESSIONS as any).idFromName('session-manager');
    const sessionDOStub = (env.INTERACTIVE_SESSIONS as any).get(sessionDO);
    const sessionResponse = await sessionDOStub.fetch(
      new Request(`http://internal/get-with-messages?sessionId=${encodeURIComponent(sessionId)}`)
    );
    const sessionData = sessionResponse.ok ? await sessionResponse.json() as InteractiveSessionState | null : null;

    if (!sessionData) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Calculate next turn number
    const nextTurn = (sessionData.currentTurn || 0) + 1;

    // Save user message to DO
    await sessionDOStub.fetch(new Request('http://internal/add-message', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        role: 'user',
        content: body.message,
        turnNumber: nextTurn
      })
    }));

    // Get container for this session
    const containerName = `interactive-${sessionId}`;
    const id = (env.MY_CONTAINER as any).idFromName(containerName);
    const container = (env.MY_CONTAINER as any).get(id);

    // Get GitHub token if repository is configured
    let githubToken: string | undefined;
    if (sessionData.repository) {
      const githubConfigId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
      const githubConfigDO = (env.GITHUB_APP_CONFIG as any).get(githubConfigId);

      if (env.ENCRYPTION_KEY) {
        await ensureDOEncryptionKey(githubConfigDO, env.ENCRYPTION_KEY);
      }

      const tokenResponse = await githubConfigDO.fetch(new Request('http://internal/get-installation-token'));
      const tokenData = tokenResponse.ok ? await tokenResponse.json() as { token: string | null } : null;
      githubToken = tokenData?.token || undefined;
    }

    // Prepare message payload with session state for restoration
    const messagePayload = {
      message: body.message,
      session: {
        sessionId: sessionData.sessionId,
        repository: sessionData.repository,
        messages: sessionData.messages || [],
        currentTurn: sessionData.currentTurn,
        options: {
          maxTurns: 10,
          permissionMode: 'bypassPermissions' as const
        }
      },
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      anthropicBaseUrl: 'https://api.z.ai/api/anthropic',
      apiTimeoutMs: '3000000',
      githubToken
    };

    // Forward message to container with session state
    const containerResponse = await containerFetch(
      container,
      new Request('http://internal/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId
        },
        body: JSON.stringify(messagePayload)
      }),
      { containerName, route: '/message' }
    );

    // Stream the SSE response
    if (!containerResponse.ok) {
      return Response.json({
        error: `Failed to send message: ${containerResponse.status}`
      }, { status: 500 });
    }

    // Transform the stream to capture complete event and save assistant message to DO
    const transformStream = new TransformStream({
      start(controller) {
        this.decoder = new TextDecoder();
        this.lineBuffer = '';
        this.currentEvent = '';
      },
      transform(chunk, controller) {
        this.lineBuffer += this.decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk); // Pass through to client

        // Process complete lines
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() || ''; // Keep incomplete line

        for (const line of lines) {
          if (line.startsWith('event:')) {
            this.currentEvent = line.substring(6).trim();
          } else if (line.startsWith('data:') && this.currentEvent === 'complete') {
            try {
              const data = JSON.parse(line.substring(5).trim());
              if (data.lastAssistantMessage) {
                // Save assistant message to DO asynchronously
                sessionDOStub.fetch(new Request('http://internal/add-message', {
                  method: 'POST',
                  body: JSON.stringify({
                    sessionId,
                    role: 'assistant',
                    content: data.lastAssistantMessage.content,
                    turnNumber: data.turns || nextTurn
                  })
                })).catch(err => {
                  logWithContext('INTERACTIVE_WORKER', 'Failed to save assistant message', {
                    error: err instanceof Error ? err.message : String(err)
                  });
                });

                // Update session status in DO
                sessionDOStub.fetch(new Request('http://internal/update', {
                  method: 'POST',
                  body: JSON.stringify({
                    sessionId,
                    status: 'completed',
                    currentTurn: data.turns || nextTurn
                  })
                })).catch(() => {}); // Fire and forget
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
            this.currentEvent = ''; // Reset event
          }
        }
      }
    });

    // Pipe container response through transform
    const transformedStream = containerResponse.body!.pipeThrough(transformStream);

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Session-Id': sessionId
      }
    });

  } catch (error) {
    logWithContext('INTERACTIVE_WORKER', 'Error sending message', {
      error: error instanceof Error ? error.message : String(error)
    });

    return Response.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
