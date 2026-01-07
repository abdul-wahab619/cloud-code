// Types from src/types.ts - backend API contracts

export interface DashboardStats {
  totalIssues: number;
  processedIssues: number;
  activeSessions: number;
  successRate: number;
  repositories: string[];
  claudeKeyConfigured?: boolean;
}

export interface Task {
  id: string;
  title: string;
  repository: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt?: string;
}

export interface Session {
  id: string;
  prompt: string;
  repository?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  turns?: number;
}

export interface Issue {
  number: number;
  id?: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  repository: string;
  labels?: string[];
  createdAt?: string;
  status?: 'open' | 'processing' | 'completed';
}

export interface GitHubStatus {
  configured?: boolean;
  githubAppConfigured?: boolean;
  claudeKeyConfigured?: boolean;
  claudeConfigured?: boolean;
}

export interface Repository {
  url: string;
  name: string;
  branch?: string;
}

// SSE Event types for interactive sessions
export type SSEEventType =
  | 'connected'
  | 'status'
  | 'claude_start'
  | 'claude_delta'
  | 'claude_end'
  | 'claude_message'
  | 'input_request'
  | 'file_change'
  | 'complete'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  content?: string;
  message?: string;
  turn?: number;
  turns?: number;
  timestamp?: number;
  sessionId?: string;
  [key: string]: any;
}
