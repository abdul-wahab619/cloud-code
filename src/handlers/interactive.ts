/**
 * Interactive Mode Handler for Cloudflare Worker
 *
 * Handles routing of interactive Claude Code sessions to containers.
 */

import { logWithContext } from '../log';
import { containerFetch, getRouteFromRequest } from '../fetch';
import type { Env, InteractiveSessionState } from '../types';

// ============================================================================
// Types
// ============================================================================

interface StartInteractiveSessionRequest {
  prompt: string;
  repository?: {
    url: string;
    name: string;
    branch?: string;
  };
  options?: {
    maxTurns?: number;
    permissionMode?: 'bypassPermissions' | 'required';
    createPR?: boolean;
  };
}

interface StartInteractiveSessionResponse {
  success: boolean;
  sessionId?: string;
  streamUrl?: string;
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

  try {
    const body: StartInteractiveSessionRequest = await request.json();

    // Validate request
    if (!body.prompt) {
      return Response.json({
        success: false,
        error: 'prompt is required'
      } satisfies StartInteractiveSessionResponse, { status: 400 });
    }

    // Generate session ID
    const sessionId = generateSessionId();

    // Create session record in DO
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
        currentTurn: 0,
        createdAt: now,
        lastActivityAt: now
      } satisfies InteractiveSessionState)
    }));

    // Get credentials
    const claudeConfigId = (env.GITHUB_APP_CONFIG as any).idFromName('claude-config');
    const claudeConfigDO = (env.GITHUB_APP_CONFIG as any).get(claudeConfigId);
    const claudeKeyResponse = await claudeConfigDO.fetch(new Request('http://internal/get-claude-key'));
    const claudeKeyData = await claudeKeyResponse.json() as { anthropicApiKey: string | null };

    if (!claudeKeyData.anthropicApiKey) {
      return Response.json({
        success: false,
        error: 'Claude API key not configured'
      } satisfies StartInteractiveSessionResponse, { status: 400 });
    }

    // Get GitHub token if repository is provided
    let githubToken: string | undefined;
    if (body.repository) {
      const tokenResponse = await claudeConfigDO.fetch(new Request('http://internal/get-installation-token'));
      const tokenData = await tokenResponse.json() as { token: string | null };
      githubToken = tokenData.token || undefined;
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
      // GLM configuration
      anthropicApiKey: claudeKeyData.anthropicApiKey,
      anthropicBaseUrl: 'https://api.z.ai/api/anthropic',
      apiTimeoutMs: '3000000',
      githubToken,
      options: body.options
    };

    logWithContext('INTERACTIVE_WORKER', 'Starting container for interactive session', {
      sessionId,
      hasRepository: !!body.repository,
      promptLength: body.prompt.length
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

      return Response.json({
        success: false,
        error: `Failed to start session: ${errorText}`
      } satisfies StartInteractiveSessionResponse, { status: 500 });
    }

    // Stream the SSE response directly to the client
    logWithContext('INTERACTIVE_WORKER', 'Session started, streaming response', {
      sessionId
    });

    // Return the SSE stream directly from the container
    return new Response(containerResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Session-Id': sessionId
      }
    });

  } catch (error) {
    logWithContext('INTERACTIVE_WORKER', 'Error starting interactive session', {
      error: error instanceof Error ? error.message : String(error)
    });

    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    } satisfies StartInteractiveSessionResponse, { status: 500 });
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

  logWithContext('INTERACTIVE_WORKER', 'Interactive request received', {
    method: request.method,
    pathname
  });

  // Start interactive session
  if (pathname === '/interactive/start' && request.method === 'POST') {
    return await handleStartInteractiveSession(request, env);
  }

  // Session status (optional - for checking active sessions)
  if (pathname === '/interactive/status' && request.method === 'GET') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      return Response.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Check session status from session DO
    const sessionDO = (env.INTERACTIVE_SESSIONS as any).idFromName('session-manager');
    const sessionDOStub = (env.INTERACTIVE_SESSIONS as any).get(sessionDO);
    const statusResponse = await sessionDOStub.fetch(
      new Request(`http://internal/get?sessionId=${encodeURIComponent(sessionId)}`)
    );
    const sessionData = await statusResponse.json() as InteractiveSessionState | null;

    return Response.json(sessionData || { error: 'Session not found' });
  }

  // End session
  if (pathname.startsWith('/interactive/') && request.method === 'DELETE') {
    const sessionId = pathname.split('/')[2];
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

    return Response.json({ success: true, message: 'Session ended' });
  }

  // Unknown endpoint
  return Response.json({ error: 'Unknown interactive endpoint' }, { status: 404 });
}
