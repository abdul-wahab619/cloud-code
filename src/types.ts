// GitHub App Manifest Template
export interface GitHubAppManifest {
  name: string;
  url: string;
  hook_attributes: {
    url: string;
  };
  redirect_url: string;
  callback_url: string;
  setup_url?: string;
  public: boolean;
  default_permissions: {
    contents: string;
    metadata: string;
    pull_requests: string;
    issues: string;
  };
  default_events: string[];
}

// GitHub App Data Response
export interface GitHubAppData {
  id: number;
  name: string;
  html_url: string;
  owner?: {
    login: string;
  };
  pem: string;
  webhook_secret: string;
}

// Storage Interfaces for Phase 2
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}

export interface GitHubAppConfig {
  appId: string;
  privateKey: string; // encrypted
  webhookSecret: string; // encrypted
  installationId?: string;
  repositories: Repository[];
  owner: {
    login: string;
    type: "User" | "Organization";
    id: number;
  };
  permissions: {
    contents: string;
    metadata: string;
    pull_requests: string;
    issues: string;
  };
  events: string[];
  createdAt: string;
  lastWebhookAt?: string;
  webhookCount: number;
}

// Environment bindings
export interface Env {
  MY_CONTAINER: DurableObjectNamespace<any>;
  GITHUB_APP_CONFIG: DurableObjectNamespace<any>;
  INTERACTIVE_SESSIONS: DurableObjectNamespace<any>;
  DASHBOARD_ASSETS?: Fetcher;
  RATE_LIMIT_KV?: KVNamespace;
  ENCRYPTION_KEY?: string;
  ANTHROPIC_API_KEY?: string; // Centralized API key for the service
}

// Interactive Session State
export interface InteractiveSessionState {
  sessionId: string;
  status: 'starting' | 'ready' | 'processing' | 'waiting_input' | 'completed' | 'error';
  repository?: {
    url: string;
    name: string;
    branch?: string;
  };
  currentTurn: number;
  createdAt: number;
  lastActivityAt: number;
  completedAt?: number;
  errorMessage?: string;
  messages?: SessionMessage[];
}

// Session message for conversation history
export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
