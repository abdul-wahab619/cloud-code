import ky from 'ky';
import type { DashboardStats, Task, Session, Issue, GitHubStatus, RepositoryDetail, RepositoriesResponse } from './types';

// Get the base URL based on platform
const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    // Web: use relative path (same origin)
    return window.location.origin;
  }
  // Mobile: use the worker URL
  return 'https://cloud-code.finhub.workers.dev';
};

// Check if test mode is enabled from URL query parameter
const isTestMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  return url.searchParams.get('test') === 'true';
};

// Get search params including test mode if enabled
const getSearchParams = () => {
  const params = new URLSearchParams();
  if (isTestMode()) {
    params.set('test', 'true');
  }
  return params;
};

// Build URL with test mode parameter
const buildUrl = (path: string): string => {
  const testMode = isTestMode();
  if (testMode) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}test=true`;
  }
  return path;
};

export const apiClient = ky.create({
  prefixUrl: getBaseURL(),
  timeout: 30000,
  retry: 2,
  hooks: {
    beforeRequest: [
      (request) => {
        // Automatically add test mode parameter to API requests
        if (isTestMode()) {
          const url = new URL(request.url);
          url.searchParams.set('test', 'true');
        }
      },
    ],
  },
});

export const api = {
  // Status endpoints
  getStatus: (): Promise<GitHubStatus> =>
    apiClient.get('gh-status').json<GitHubStatus>(),

  // Tasks endpoints
  getTasks: (): Promise<Task[]> =>
    apiClient.get('api/tasks').json<Task[]>(),

  createTask: (task: Partial<Task>): Promise<Task> =>
    apiClient.post('api/tasks', { json: task }).json<Task>(),

  // Sessions endpoints
  getSessions: (): Promise<Session[]> =>
    apiClient.get('api/sessions').json<Session[]>(),

  // Issues endpoints
  getIssues: (): Promise<Issue[]> =>
    apiClient.get('api/issues').json<Issue[]>(),

  // Stats endpoint
  getStats: (): Promise<DashboardStats> =>
    apiClient.get('api/stats').json<DashboardStats>(),

  // Repositories endpoint
  getRepositories: async (): Promise<RepositoryDetail[]> => {
    const response = await apiClient.get('api/repositories').json<RepositoriesResponse>();
    return response.repositories || [];
  },

  // Test webhook
  testWebhook: (issueNumber?: number): Promise<{ message: string; issueNumber?: number }> =>
    apiClient.post('api/test-webhook', { json: { issueNumber } }).json<{ message: string; issueNumber?: number }>(),
};

// SSE client for interactive sessions
export interface SSEResponse {
  body: ReadableStream | null;
}

export async function startInteractiveSession(
  prompt: string,
  repository?: { url: string; name: string; branch?: string },
  options: { maxTurns?: number; permissionMode?: string; createPR?: boolean } = {}
): Promise<SSEResponse> {
  const baseUrl = getBaseURL();
  const testModeParam = isTestMode() ? '?test=true' : '';
  const url = `${baseUrl}/interactive/start${testModeParam}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      repository,
      options: {
        maxTurns: options.maxTurns ?? 10,
        permissionMode: options.permissionMode ?? 'bypassPermissions',
        createPR: options.createPR ?? false,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start session: ${response.statusText}`);
  }

  return response as SSEResponse;
}

export async function cancelSession(sessionId: string): Promise<{ success: boolean; message: string }> {
  const testModeParam = isTestMode() ? '?test=true' : '';
  return apiClient.delete(`interactive/${sessionId}${testModeParam}`).json<{ success: boolean; message: string }>();
}

export async function getSessionStatus(sessionId: string): Promise<any> {
  const testModeParam = isTestMode() ? `&test=true` : `?sessionId=${sessionId}`;
  return apiClient.get(`interactive/status${testModeParam}`).json();
}
