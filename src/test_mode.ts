/**
 * Test Mode Utility for Cloudflare Worker
 *
 * Provides mock data and simulated responses for testing the UI
 * without requiring actual GitHub integration or Claude API calls.
 */

import { logWithContext } from './log';
import type { Task, Session, Issue } from './handlers/dashboard';

// ============================================================================
// Test Mode Detection
// ============================================================================

export interface TestModeContext {
  enabled: boolean;
  source: 'query' | 'header' | 'none';
}

/**
 * Detect if test mode is enabled via query parameter or header
 */
export function detectTestMode(request: Request): TestModeContext {
  const url = new URL(request.url);
  const queryParam = url.searchParams.get('test');
  const header = request.headers.get('X-Test-Mode');

  const enabled = queryParam === 'true' || header === 'true';
  const source: TestModeContext['source'] = queryParam === 'true' ? 'query' : header === 'true' ? 'header' : 'none';

  if (enabled) {
    logWithContext('TEST_MODE', 'Test mode enabled', { source });
  }

  return { enabled, source };
}

/**
 * Add test mode headers to a response
 */
export function addTestModeHeaders(response: Response, testMode: TestModeContext): Response {
  if (!testMode.enabled) return response;

  const headers = new Headers(response.headers);
  headers.set('X-Test-Mode', 'true');
  headers.set('X-Test-Mode-Source', testMode.source);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Mock repositories for testing
 */
export function getMockRepositories() {
  return {
    repositories: [
      {
        full_name: 'octocat/Hello-World',
        name: 'Hello-World',
        owner: 'octocat',
        private: false,
        description: 'My first repository',
        default_branch: 'main',
        html_url: 'https://github.com/octocat/Hello-World'
      },
      {
        full_name: 'torvalds/linux',
        name: 'linux',
        owner: 'torvalds',
        private: false,
        description: 'Linux kernel source tree',
        default_branch: 'master',
        html_url: 'https://github.com/torvalds/linux'
      },
      {
        full_name: 'facebook/react',
        name: 'react',
        owner: 'facebook',
        private: false,
        description: 'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
        default_branch: 'main',
        html_url: 'https://github.com/facebook/react'
      },
      {
        full_name: 'my-org/private-repo',
        name: 'private-repo',
        owner: 'my-org',
        private: true,
        description: 'Private repository for testing',
        default_branch: 'develop',
        html_url: 'https://github.com/my-org/private-repo'
      },
      {
        full_name: 'example/typescript-starter',
        name: 'typescript-starter',
        owner: 'example',
        private: false,
        description: 'TypeScript starter template',
        default_branch: 'main',
        html_url: 'https://github.com/example/typescript-starter'
      }
    ],
    installationUrl: 'https://github.com/organizations/my-org/settings/installations/12345'
  };
}

/**
 * Mock statistics for testing
 */
export function getMockStats() {
  return {
    totalIssues: 42,
    processedIssues: 38,
    activeSessions: 2,
    successRate: 95.5,
    repositories: ['octocat/Hello-World', 'torvalds/linux', 'facebook/react'],
    claudeKeyConfigured: true,
    installationUrl: 'https://github.com/organizations/my-org/settings/installations/12345'
  };
}

/**
 * Mock status endpoint response
 */
export function getMockStatus() {
  return {
    configured: true,
    github: {
      connected: true,
      appId: '123456',
      installationId: '789012',
      owner: {
        login: 'my-org',
        type: 'Organization'
      }
    },
    claude: {
      configured: true,
      baseUrl: 'https://api.z.ai/api/anthropic'
    },
    repositories: [
      { full_name: 'octocat/Hello-World', name: 'Hello-World' },
      { full_name: 'torvalds/linux', name: 'linux' },
      { full_name: 'facebook/react', name: 'react' }
    ]
  };
}

/**
 * Mock tasks for testing
 */
export function getMockTasks(): Task[] {
  return [
    {
      id: 'task-1',
      title: 'Add authentication middleware',
      repository: 'octocat/Hello-World',
      status: 'completed' as const,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'task-2',
      title: 'Fix memory leak in data processing',
      repository: 'torvalds/linux',
      status: 'running' as const,
      createdAt: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'task-3',
      title: 'Update dependencies to latest versions',
      repository: 'facebook/react',
      status: 'pending' as const,
      createdAt: new Date(Date.now() - 900000).toISOString()
    }
  ];
}

/**
 * Mock sessions for testing
 */
export function getMockSessions(): Session[] {
  return [
    {
      id: 'sess_abc123',
      prompt: 'Analyze the codebase for security vulnerabilities',
      repository: 'octocat/Hello-World',
      status: 'completed' as const,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      turns: 5
    },
    {
      id: 'sess_def456',
      prompt: 'Refactor the authentication module',
      repository: 'torvalds/linux',
      status: 'running' as const,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    }
  ];
}

/**
 * Mock issues for testing
 */
export function getMockIssues(): Issue[] {
  return [
    {
      number: 1,
      title: 'Add authentication middleware',
      body: 'Implement JWT-based authentication for the API endpoints',
      state: 'open' as const,
      repository: 'octocat/Hello-World',
      labels: ['enhancement', 'security'],
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      number: 42,
      title: 'Fix memory leak in data processing',
      body: 'Memory usage keeps increasing when processing large datasets',
      state: 'open' as const,
      repository: 'torvalds/linux',
      labels: ['bug', 'high-priority'],
      createdAt: new Date(Date.now() - 43200000).toISOString()
    },
    {
      number: 13,
      title: 'Update README with new examples',
      body: 'Add usage examples for the new API endpoints',
      state: 'open' as const,
      repository: 'facebook/react',
      labels: ['documentation'],
      createdAt: new Date(Date.now() - 21600000).toISOString()
    }
  ];
}

// ============================================================================
// SSE Stream Simulation
// ============================================================================

/**
 * Simulated Claude response chunks for testing the SSE stream
 */
const MOCK_CLAUDE_RESPONSE = `I'll analyze this repository for you.

Looking at the codebase structure, I can see:

1. **Main Components**:
   - The project uses TypeScript with strict type checking
   - Configuration is managed through wrangler.jsonc
   - Durable Objects are used for state management

2. **Security Considerations**:
   - API keys are encrypted using AES-256-GCM
   - Rate limiting is implemented for API endpoints
   - Webhook signatures are verified

3. **Recommended Improvements**:
   - Add input validation for all user inputs
   - Implement request caching for frequently accessed data
   - Add more comprehensive error handling

Would you like me to implement any of these improvements?`;

/**
 * Create a simulated SSE stream for testing the interactive mode
 */
export async function* createMockSSEStream(): AsyncGenerator<Uint8Array, void, unknown> {
  const sessionId = `sess_test_${Date.now()}`;

  // Send connected event
  yield textToSSE('connected', JSON.stringify({ sessionId }));

  // Small delay to simulate connection
  await delay(100);

  // Send status events
  yield textToSSE('status', JSON.stringify({ message: 'Initializing session...' }));
  await delay(200);

  yield textToSSE('status', JSON.stringify({ message: 'Loading repository context...' }));
  await delay(200);

  // Send claude_start event
  yield textToSSE('claude_start', JSON.stringify({
    turn: 1,
    prompt: 'Analyze this repository'
  }));
  await delay(100);

  // Stream the response in chunks
  const words = MOCK_CLAUDE_RESPONSE.split(' ');
  let currentChunk = '';

  for (const word of words) {
    currentChunk += word + ' ';

    // Every few words, send a delta
    if (Math.random() > 0.7 || currentChunk.length > 50) {
      yield textToSSE('claude_delta', JSON.stringify({
        content: currentChunk,
        turn: 1
      }));
      await delay(30 + Math.random() * 50); // Simulate typing delay
      currentChunk = '';
    }
  }

  // Send any remaining content
  if (currentChunk) {
    yield textToSSE('claude_delta', JSON.stringify({
      content: currentChunk,
      turn: 1
    }));
  }

  await delay(100);

  // Send file change simulation
  yield textToSSE('file_change', JSON.stringify({
    file: 'src/test.ts',
    action: 'modified',
    linesChanged: 15
  }));
  await delay(200);

  // Send PR creation simulation
  yield textToSSE('pr_created', JSON.stringify({
    repository: 'octocat/Hello-World',
    prNumber: 123,
    prUrl: 'https://github.com/octocat/Hello-World/pull/123',
    title: 'Implement security improvements'
  }));
  await delay(100);

  // Send multi-repo results simulation
  yield textToSSE('multi_repo_result', JSON.stringify({
    repository: 'octocat/Hello-World',
    success: true,
    prUrl: 'https://github.com/octocat/Hello-World/pull/123',
    reviewComments: 3
  }));
  await delay(150);

  yield textToSSE('multi_repo_result', JSON.stringify({
    repository: 'torvalds/linux',
    success: true,
    prUrl: 'https://github.com/torvalds/linux/pull/456',
    reviewComments: 1
  }));
  await delay(100);

  // Send complete event
  yield textToSSE('complete', JSON.stringify({
    turns: 1,
    lastAssistantMessage: {
      role: 'assistant',
      content: MOCK_CLAUDE_RESPONSE
    },
    summary: {
      totalRepositories: 2,
      successfulRepositories: 2,
      pullRequestsCreated: 2
    }
  }));
}

/**
 * Create a simulated SSE stream for multi-repo processing
 */
export async function* createMockMultiRepoSSEStream(repositories: string[]): AsyncGenerator<Uint8Array, void, unknown> {
  const sessionId = `sess_multi_${Date.now()}`;

  // Send connected event
  yield textToSSE('connected', JSON.stringify({ sessionId }));
  await delay(100);

  // Send initial status
  yield textToSSE('status', JSON.stringify({
    message: `Starting multi-repo analysis for ${repositories.length} repositories...`
  }));
  await delay(200);

  // Process each repository
  for (let i = 0; i < repositories.length; i++) {
    const repo = repositories[i];

    yield textToSSE('status', JSON.stringify({
      message: `Processing repository ${i + 1}/${repositories.length}: ${repo}...`
    }));
    await delay(300);

    yield textToSSE('claude_start', JSON.stringify({
      turn: i + 1,
      repository: repo
    }));
    await delay(100);

    // Simulate Claude's response
    const response = `I've analyzed ${repo}. Here are my findings:

- Code quality: Good
- Test coverage: 85%
- Security: No critical issues found

Creating PR with recommended improvements...`;

    for (const chunk of splitIntoChunks(response, 30)) {
      yield textToSSE('claude_delta', JSON.stringify({
        content: chunk,
        turn: i + 1,
        repository: repo
      }));
      await delay(40);
    }

    // Send PR creation
    yield textToSSE('pr_created', JSON.stringify({
      repository: repo,
      prNumber: 100 + i,
      prUrl: `https://github.com/${repo}/pull/${100 + i}`,
      title: `Automated improvements for ${repo}`
    }));
    await delay(100);

    // Send multi-repo result
    yield textToSSE('multi_repo_result', JSON.stringify({
      repository: repo,
      success: true,
      prUrl: `https://github.com/${repo}/pull/${100 + i}`,
      reviewComments: Math.floor(Math.random() * 5)
    }));
    await delay(150);
  }

  // Send complete event with summary
  yield textToSSE('complete', JSON.stringify({
    turns: repositories.length,
    summary: {
      totalRepositories: repositories.length,
      successfulRepositories: repositories.length,
      pullRequestsCreated: repositories.length,
      failedRepositories: []
    }
  }));
}

/**
 * Create a simulated error SSE stream for testing error handling
 */
export async function* createMockErrorSSEStream(errorMessage: string = 'Simulated error for testing'): AsyncGenerator<Uint8Array, void, unknown> {
  const sessionId = `sess_error_${Date.now()}`;

  yield textToSSE('connected', JSON.stringify({ sessionId }));
  await delay(100);

  yield textToSSE('status', JSON.stringify({
    message: 'Starting session...'
  }));
  await delay(200);

  yield textToSSE('status', JSON.stringify({
    message: 'An error occurred'
  }));
  await delay(100);

  yield textToSSE('error', JSON.stringify({
    error: errorMessage,
    timestamp: new Date().toISOString()
  }));
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert text to SSE format
 */
function textToSSE(event: string, data: string): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${data}\n\n`
  );
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Split text into chunks
 */
function splitIntoChunks(text: string, wordsPerChunk: number): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }

  return chunks;
}

/**
 * Create a ReadableStream from an AsyncGenerator for SSE responses
 */
export function sseGeneratorToStream(generator: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

// Export types for use in other modules
export type { Task, Session, Issue };
