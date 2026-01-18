import { Container, loadBalance, getContainer } from '@cloudflare/containers';
import { decrypt, generateInstallationToken } from './crypto';
import { containerFetch, getRouteFromRequest } from './fetch';
import { handleOAuthCallback } from './handlers/oauth_callback';
import { handleGitHubSetup, handleReEncryptPage, handleReEncrypt, handleClearConfig } from './handlers/github_setup';
import { handleGitHubStatus } from './handlers/github_status';
import { handleGitHubWebhook } from './handlers/github_webhook';
import { handleInteractiveRequest } from './handlers/interactive';
import { handleDashboardAPI, serveDashboard } from './handlers/dashboard';
import { handleAddRepositories, handleRepoCallback, handleRefreshRepositories } from './handlers/add_repositories';
import { handleHealthCheck, handleMetrics, handlePrometheusMetrics, recordRequest, recordContainerStartup, recordContainerShutdown, getRequestCount } from './handlers/health';
import { logWithContext } from './log';
import { applyRateLimit, addRateLimitHeaders, checkRateLimit, getClientIdentifier, getCategoryFromPath } from './rate_limit';
import {
  captureError,
  captureMessageLevel,
  addRequestBreadcrumb,
  extractRequestContext,
  withPerformanceTracking,
  setSentryTags,
  getSentryConfig,
  isSentryEnabled,
  initSentry
} from './sentry';
import type { GitHubAppConfig, Repository, Env, InteractiveSessionState } from './types';

/**
 * Rewrites a request with a new pathname while preserving other properties
 */
function rewriteRequestPath(request: Request, newPathname: string): Request {
  const url = new URL(request.url);
  url.pathname = newPathname;

  // Preserve the body if it exists (needed for POST requests)
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body;

  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body,
    cf: request.cf
  });
}

export class GitHubAppConfigDO {
  private storage: DurableObjectStorage;
  private encryptionKey: string | null = null;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
    this.initializeTables();
    logWithContext('DURABLE_OBJECT', 'GitHubAppConfigDO initialized with SQLite');
  }

  /**
   * Set the encryption key for this Durable Object instance.
   * This must be called before any encrypt/decrypt operations.
   */
  private ensureEncryptionKey(): void {
    if (!this.encryptionKey) {
      throw new Error(
        'Encryption key not set. The DO must receive the encryption key via internal request. ' +
        'This is a critical configuration error.'
      );
    }
  }

  private setEncryptionKey(key: string): void {
    this.encryptionKey = key;
    logWithContext('DURABLE_OBJECT', 'Encryption key set for DO');
  }

  private initializeTables(): void {
    logWithContext('DURABLE_OBJECT', 'Initializing SQLite tables');

    // Create github_app_config table
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS github_app_config (
        id INTEGER PRIMARY KEY,
        app_id TEXT NOT NULL,
        private_key TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        installation_id TEXT,
        owner_login TEXT NOT NULL,
        owner_type TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        permissions TEXT NOT NULL,
        events TEXT NOT NULL,
        repositories TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_webhook_at TEXT,
        webhook_count INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);

    // Create installation_tokens table
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS installation_tokens (
        id INTEGER PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    logWithContext('DURABLE_OBJECT', 'SQLite tables initialized successfully');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    logWithContext('DURABLE_OBJECT', 'Processing request', {
      method: request.method,
      pathname: url.pathname
    });

    // Set encryption key (must be called before any encrypt/decrypt operations)
    if (url.pathname === '/set-encryption-key' && request.method === 'POST') {
      const { encryptionKey } = await request.json() as { encryptionKey: string };
      if (!encryptionKey) {
        return new Response('encryptionKey is required', { status: 400 });
      }
      this.setEncryptionKey(encryptionKey);
      return new Response('OK');
    }

    if (url.pathname === '/store' && request.method === 'POST') {
      logWithContext('DURABLE_OBJECT', 'Storing app config');

      const config = await request.json() as GitHubAppConfig;

      logWithContext('DURABLE_OBJECT', 'App config received', {
        appId: config.appId,
        repositoryCount: config.repositories.length,
        owner: config.owner.login
      });

      await this.storeAppConfig(config);

      logWithContext('DURABLE_OBJECT', 'App config stored successfully');
      return new Response('OK');
    }

    if (url.pathname === '/get' && request.method === 'GET') {
      logWithContext('DURABLE_OBJECT', 'Retrieving app config');

      const config = await this.getAppConfig();

      logWithContext('DURABLE_OBJECT', 'App config retrieved', {
        hasConfig: !!config,
        appId: config?.appId,
        repositoryCount: config?.repositories.length
      });

      return new Response(JSON.stringify(config));
    }

    if (url.pathname === '/get-credentials' && request.method === 'GET') {
      logWithContext('DURABLE_OBJECT', 'Retrieving and decrypting credentials');

      const credentials = await this.getDecryptedCredentials();

      logWithContext('DURABLE_OBJECT', 'Credentials retrieved', {
        hasPrivateKey: !!credentials?.privateKey,
        hasWebhookSecret: !!credentials?.webhookSecret
      });

      return new Response(JSON.stringify(credentials));
    }

    if (url.pathname === '/log-webhook' && request.method === 'POST') {
      const webhookData = await request.json() as { event: string; delivery: string; timestamp: string };

      logWithContext('DURABLE_OBJECT', 'Logging webhook event', {
        event: webhookData.event,
        delivery: webhookData.delivery
      });

      await this.logWebhook(webhookData.event);
      return new Response('OK');
    }

    if (url.pathname === '/update-installation' && request.method === 'POST') {
      const installationData = await request.json() as { installationId: string; repositories: Repository[]; owner: any };

      logWithContext('DURABLE_OBJECT', 'Updating installation', {
        installationId: installationData.installationId,
        repositoryCount: installationData.repositories.length,
        owner: installationData.owner.login
      });

      await this.updateInstallation(installationData.installationId, installationData.repositories);

      // Also update owner information
      const config = await this.getAppConfig();
      if (config) {
        config.owner = installationData.owner;
        await this.storeAppConfig(config);

        logWithContext('DURABLE_OBJECT', 'Installation updated successfully');
      }

      return new Response('OK');
    }

    if (url.pathname === '/add-repository' && request.method === 'POST') {
      const repo = await request.json() as Repository;
      await this.addRepository(repo);
      return new Response('OK');
    }

    if (url.pathname.startsWith('/remove-repository/') && request.method === 'DELETE') {
      const repoId = parseInt(url.pathname.split('/').pop() || '0');
      await this.removeRepository(repoId);
      return new Response('OK');
    }

    if (url.pathname === '/get-installation-token' && request.method === 'GET') {
      logWithContext('DURABLE_OBJECT', 'Generating installation token');

      const token = await this.getInstallationToken();

      logWithContext('DURABLE_OBJECT', 'Installation token generated', {
        hasToken: !!token
      });

      return new Response(JSON.stringify({ token }));
    }

    if (url.pathname === '/generate-installation-token' && request.method === 'POST') {
      const body = await request.json() as { installationId: string };
      logWithContext('DURABLE_OBJECT', 'Generating installation token for specific ID', {
        installationId: body.installationId
      });

      const config = await this.getAppConfig();
      if (!config || !config.appId) {
        return new Response(JSON.stringify({ error: 'App not configured' }), { status: 400 });
      }

      const credentials = await this.getDecryptedCredentials();
      if (!credentials?.privateKey) {
        return new Response(JSON.stringify({ error: 'Credentials not found' }), { status: 400 });
      }

      const result = await generateInstallationToken(
        config.appId,
        credentials.privateKey,
        body.installationId
      );

      if (!result) {
        return new Response(JSON.stringify({ error: 'Failed to generate token' }), { status: 500 });
      }

      return new Response(JSON.stringify({ token: result.token }));
    }

    if (url.pathname === '/get-webhook-stats' && request.method === 'GET') {
      const stats = await this.getWebhookStats();
      return new Response(JSON.stringify(stats));
    }

    if (url.pathname === '/delete' && request.method === 'POST') {
      logWithContext('DURABLE_OBJECT', 'Deleting app config');
      // Clear the config by deleting the row
      this.storage.sql.exec('DELETE FROM github_app_config WHERE id = 1');
      // Also clear cached installation tokens
      this.storage.sql.exec('DELETE FROM installation_tokens');
      return new Response('OK');
    }

    if (url.pathname === '/sync-installation' && request.method === 'POST') {
      logWithContext('DURABLE_OBJECT', 'Syncing installation from GitHub');

      try {
        // Get the current config
        const config = await this.getAppConfig();
        if (!config || !config.installationId) {
          return new Response(JSON.stringify({ error: 'No installation found' }), { status: 400 });
        }

        // Get installation token
        const token = await this.getInstallationToken();
        if (!token) {
          return new Response(JSON.stringify({ error: 'Failed to get installation token' }), { status: 500 });
        }

        // Fetch repositories from GitHub
        const githubResponse = await fetch('https://api.github.com/installation/repositories', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Worker-GitHub-Integration'
          }
        });

        if (!githubResponse.ok) {
          throw new Error(`GitHub API error: ${githubResponse.status}`);
        }

        const githubData = await githubResponse.json() as any;
        const repositories: Repository[] = githubData.repositories.map((repo: any) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private
        }));

        logWithContext('DURABLE_OBJECT', 'Repositories fetched from GitHub', {
          count: repositories.length
        });

        // Update the stored config
        config.repositories = repositories;
        await this.storeAppConfig(config);

        return new Response(JSON.stringify({
          success: true,
          repositories,
          count: repositories.length
        }));
      } catch (error) {
        logWithContext('DURABLE_OBJECT', 'Error syncing installation', {
          error: error instanceof Error ? error.message : String(error)
        });
        return new Response(JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error'
        }), { status: 500 });
      }
    }

    logWithContext('DURABLE_OBJECT', 'Unknown endpoint requested', {
      method: request.method,
      pathname: url.pathname
    });

    return new Response('Not Found', { status: 404 });
  }

  async storeAppConfig(config: GitHubAppConfig): Promise<void> {
    await this.storeAppConfigSQLite(config);
  }

  private async storeAppConfigSQLite(config: GitHubAppConfig): Promise<void> {
    logWithContext('DURABLE_OBJECT', 'Writing app config to SQLite storage', {
      appId: config.appId,
      dataSize: JSON.stringify(config).length
    });

    const now = new Date().toISOString();

    this.storage.sql.exec(
      `INSERT OR REPLACE INTO github_app_config (
        id, app_id, private_key, webhook_secret, installation_id,
        owner_login, owner_type, owner_id, permissions, events,
        repositories, created_at, last_webhook_at, webhook_count, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      config.appId,
      config.privateKey,
      config.webhookSecret,
      config.installationId || null,
      config.owner.login,
      config.owner.type,
      config.owner.id,
      JSON.stringify(config.permissions),
      JSON.stringify(config.events),
      JSON.stringify(config.repositories),
      config.createdAt,
      config.lastWebhookAt || null,
      config.webhookCount || 0,
      now
    );

    logWithContext('DURABLE_OBJECT', 'App config stored successfully in SQLite');
  }

  async getAppConfig(): Promise<GitHubAppConfig | null> {
    logWithContext('DURABLE_OBJECT', 'Reading app config from SQLite storage');

    const cursor = this.storage.sql.exec('SELECT * FROM github_app_config WHERE id = 1 LIMIT 1');
    const results = cursor.toArray();

    if (results.length === 0) {
      logWithContext('DURABLE_OBJECT', 'No app config found in SQLite storage');
      return null;
    }

    const row = results[0];

    const config: GitHubAppConfig = {
      appId: row.app_id as string,
      privateKey: row.private_key as string,
      webhookSecret: row.webhook_secret as string,
      installationId: row.installation_id as string || undefined,
      owner: {
        login: row.owner_login as string,
        type: row.owner_type as "User" | "Organization",
        id: row.owner_id as number
      },
      permissions: JSON.parse(row.permissions as string),
      events: JSON.parse(row.events as string),
      repositories: JSON.parse(row.repositories as string),
      createdAt: row.created_at as string,
      lastWebhookAt: row.last_webhook_at as string || undefined,
      webhookCount: row.webhook_count as number || 0
    };

    logWithContext('DURABLE_OBJECT', 'App config retrieved from SQLite storage', {
      hasConfig: true,
      appId: config.appId,
      repositoryCount: config.repositories.length
    });

    return config;
  }

  async updateInstallation(installationId: string, repositories: Repository[]): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      config.installationId = installationId;
      config.repositories = repositories;
      await this.storeAppConfig(config);
    }
  }

  async logWebhook(_event: string): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      config.lastWebhookAt = new Date().toISOString();
      config.webhookCount = (config.webhookCount || 0) + 1;
      await this.storeAppConfig(config);
    }
  }

  async addRepository(repo: Repository): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      // Check if repository already exists
      const exists = config.repositories.some(r => r.id === repo.id);
      if (!exists) {
        config.repositories.push(repo);
        await this.storeAppConfig(config);
      }
    }
  }

  async removeRepository(repoId: number): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      config.repositories = config.repositories.filter(r => r.id !== repoId);
      await this.storeAppConfig(config);
    }
  }

  async getDecryptedCredentials(): Promise<{ privateKey: string; webhookSecret: string } | null> {
    const config = await this.getAppConfig();
    if (!config) {
      logWithContext('DURABLE_OBJECT', 'Cannot decrypt credentials - no config found');
      return null;
    }

    try {
      logWithContext('DURABLE_OBJECT', 'Decrypting credentials');

      this.ensureEncryptionKey();
      const privateKey = await decrypt(config.privateKey, this.encryptionKey!);
      const webhookSecret = await decrypt(config.webhookSecret, this.encryptionKey!);

      logWithContext('DURABLE_OBJECT', 'Credentials decrypted successfully');
      return { privateKey, webhookSecret };
    } catch (error) {
      logWithContext('DURABLE_OBJECT', 'Failed to decrypt credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async getInstallationToken(): Promise<string | null> {
    const config = await this.getAppConfig();
    if (!config || !config.installationId) {
      logWithContext('DURABLE_OBJECT', 'Cannot generate token - missing config or installation ID', {
        hasConfig: !!config,
        hasInstallationId: !!config?.installationId
      });
      return null;
    }

    try {
      // Check if we have a cached token that's still valid in SQLite
      const cachedToken = await this.getCachedInstallationToken();

      if (cachedToken) {
        const expiresAt = new Date(cachedToken.expires_at);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();

        logWithContext('DURABLE_OBJECT', 'Checking cached token from SQLite', {
          expiresAt: cachedToken.expires_at,
          timeUntilExpiryMs: timeUntilExpiry
        });

        // Check if token expires in more than 5 minutes
        if (timeUntilExpiry > 5 * 60 * 1000) {
          logWithContext('DURABLE_OBJECT', 'Using cached installation token from SQLite');
          return cachedToken.token;
        } else {
          logWithContext('DURABLE_OBJECT', 'Cached token expired or expiring soon');
        }
      } else {
        logWithContext('DURABLE_OBJECT', 'No cached token found in SQLite');
      }

      // Generate new token
      logWithContext('DURABLE_OBJECT', 'Generating new installation token');

      const credentials = await this.getDecryptedCredentials();
      if (!credentials) {
        logWithContext('DURABLE_OBJECT', 'Cannot generate token - missing credentials');
        return null;
      }

      const tokenData = await generateInstallationToken(
        config.appId,
        credentials.privateKey,
        config.installationId
      );

      if (tokenData) {
        // Cache the token in SQLite
        logWithContext('DURABLE_OBJECT', 'Caching new installation token in SQLite', {
          expiresAt: tokenData.expires_at
        });

        await this.storeInstallationTokenSQLite(tokenData.token, tokenData.expires_at);
        return tokenData.token;
      }

      logWithContext('DURABLE_OBJECT', 'Failed to generate installation token');
      return null;
    } catch (error) {
      logWithContext('DURABLE_OBJECT', 'Error generating installation token', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async getCachedInstallationToken(): Promise<{ token: string; expires_at: string } | null> {
    const cursor = this.storage.sql.exec('SELECT * FROM installation_tokens ORDER BY created_at DESC LIMIT 1');
    const results = cursor.toArray();

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      token: row.token as string,
      expires_at: row.expires_at as string
    };
  }

  private async storeInstallationTokenSQLite(token: string, expiresAt: string): Promise<void> {
    const now = new Date().toISOString();

    // Clean up old tokens first
    this.storage.sql.exec('DELETE FROM installation_tokens WHERE expires_at < ?', now);

    // Store new token
    this.storage.sql.exec(
      'INSERT INTO installation_tokens (token, expires_at, created_at) VALUES (?, ?, ?)',
      token,
      expiresAt,
      now
    );
  }

  // SQLite-specific enhancement methods
  async getWebhookStats(): Promise<{ totalWebhooks: number; lastWebhookAt: string | null }> {
    const cursor = this.storage.sql.exec(`
      SELECT webhook_count, last_webhook_at
      FROM github_app_config
      WHERE id = 1
      LIMIT 1
    `);
    const results = cursor.toArray();

    if (results.length === 0) {
      return { totalWebhooks: 0, lastWebhookAt: null };
    }

    const row = results[0];
    return {
      totalWebhooks: row.webhook_count as number || 0,
      lastWebhookAt: row.last_webhook_at as string || null
    };
  }

  async cleanupExpiredTokens(): Promise<number> {
    const now = new Date().toISOString();
    const cursor = this.storage.sql.exec(
      'DELETE FROM installation_tokens WHERE expires_at < ?',
      now
    );

    const deletedCount = cursor.rowsWritten || 0;
    logWithContext('DURABLE_OBJECT', 'Cleaned up expired tokens', {
      deletedCount,
      timestamp: now
    });

    return deletedCount;
  }

  async getAllRepositories(): Promise<Repository[]> {
    const config = await this.getAppConfig();
    return config?.repositories || [];
  }

  async getInstallationStats(): Promise<{
    appId: string | null;
    repositoryCount: number;
    installationId: string | null;
    createdAt: string | null;
  }> {
    const config = await this.getAppConfig();

    return {
      appId: config?.appId || null,
      repositoryCount: config?.repositories.length || 0,
      installationId: config?.installationId || null,
      createdAt: config?.createdAt || null
    };
  }
}

/**
 * Helper function to ensure the GitHubAppConfigDO has the encryption key set.
 * This must be called before any operations that require encryption/decryption.
 *
 * Durable Objects don't persist instance variables across restarts, so we need
 * to re-set the encryption key after each worker restart.
 */
export async function ensureDOEncryptionKey(doStub: DurableObjectStub, encryptionKey: string): Promise<void> {
  await doStub.fetch(new Request('http://internal/set-encryption-key', {
    method: 'POST',
    body: JSON.stringify({ encryptionKey })
  }));
}

/**
 * Interactive Session Durable Object
 * Manages state for interactive Claude Code sessions
 */
export class InteractiveSessionDO {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
    this.initializeTables();
    logWithContext('SESSION_DO', 'InteractiveSessionDO initialized');
  }

  private initializeTables(): void {
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        repository_url TEXT,
        repository_name TEXT,
        repository_branch TEXT,
        current_turn INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        completed_at INTEGER,
        error_message TEXT
      )
    `);

    // Conversation history table for multi-turn sessions
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        turn_number INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      )
    `);

    // Index for faster message queries
    this.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_messages_session_id
      ON session_messages(session_id, timestamp)
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Create or update session
    if (url.pathname === '/create' && request.method === 'POST') {
      const sessionData = await request.json() as InteractiveSessionState;
      await this.createSession(sessionData);
      return new Response('OK');
    }

    // Update session status
    if (url.pathname === '/update' && request.method === 'POST') {
      const { sessionId, status, currentTurn } = await request.json() as {
        sessionId: string;
        status: InteractiveSessionState['status'];
        currentTurn?: number;
      };
      await this.updateSessionStatus(sessionId, status, currentTurn);
      return new Response('OK');
    }

    // Get session status
    if (url.pathname === '/get' && request.method === 'GET') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        return new Response('sessionId required', { status: 400 });
      }
      const session = await this.getSession(sessionId);
      return new Response(JSON.stringify(session || null));
    }

    // End session
    if (url.pathname === '/end' && request.method === 'POST') {
      const { sessionId } = await request.json() as { sessionId: string };
      await this.endSession(sessionId);
      return new Response('OK');
    }

    // Clean up old sessions
    if (url.pathname === '/cleanup' && request.method === 'POST') {
      const count = await this.cleanupOldSessions();
      return new Response(JSON.stringify({ deleted: count }));
    }

    // Get session with messages
    if (url.pathname === '/get-with-messages' && request.method === 'GET') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        return new Response('sessionId required', { status: 400 });
      }
      const session = await this.getSessionWithMessages(sessionId);
      return new Response(JSON.stringify(session));
    }

    // Add message to session
    if (url.pathname === '/add-message' && request.method === 'POST') {
      const { sessionId, role, content, turnNumber } = await request.json() as {
        sessionId: string;
        role: 'user' | 'assistant';
        content: string;
        turnNumber: number;
      };
      await this.addMessage(sessionId, role, content, turnNumber);
      return new Response('OK');
    }

    return new Response('Not Found', { status: 404 });
  }

  private async createSession(session: InteractiveSessionState): Promise<void> {
    this.storage.sql.exec(
      `INSERT INTO sessions (
        session_id, status, repository_url, repository_name, repository_branch,
        current_turn, created_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      session.sessionId,
      session.status,
      session.repository?.url || null,
      session.repository?.name || null,
      session.repository?.branch || null,
      session.currentTurn,
      session.createdAt,
      session.lastActivityAt
    );

    logWithContext('SESSION_DO', 'Session created', { sessionId: session.sessionId });
  }

  private async updateSessionStatus(
    sessionId: string,
    status: InteractiveSessionState['status'],
    currentTurn?: number
  ): Promise<void> {
    const now = Date.now();
    const updates = ['last_activity_at = ?', 'status = ?'];
    const values: any[] = [now, status];

    if (currentTurn !== undefined) {
      updates.push('current_turn = ?');
      values.push(currentTurn);
    }

    values.push(sessionId);

    this.storage.sql.exec(
      `UPDATE sessions SET ${updates.join(', ')} WHERE session_id = ?`,
      ...values
    );

    if (status === 'completed' || status === 'error') {
      this.storage.sql.exec(
        'UPDATE sessions SET completed_at = ? WHERE session_id = ?',
        now,
        sessionId
      );
    }

    logWithContext('SESSION_DO', 'Session updated', { sessionId, status });
  }

  private async getSession(sessionId: string): Promise<InteractiveSessionState | null> {
    const cursor = this.storage.sql.exec(
      'SELECT * FROM sessions WHERE session_id = ? LIMIT 1',
      sessionId
    );
    const results = cursor.toArray();

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    return {
      sessionId: row.session_id as string,
      status: row.status as InteractiveSessionState['status'],
      repository: row.repository_name ? {
        url: row.repository_url as string,
        name: row.repository_name as string,
        branch: row.repository_branch as string | undefined
      } : undefined,
      currentTurn: row.current_turn as number,
      createdAt: row.created_at as number,
      lastActivityAt: row.last_activity_at as number,
      completedAt: row.completed_at as number | undefined,
      errorMessage: row.error_message as string | undefined
    };
  }

  private async endSession(sessionId: string): Promise<void> {
    const now = Date.now();
    this.storage.sql.exec(
      `UPDATE sessions SET status = 'completed', completed_at = ?, last_activity_at = ? WHERE session_id = ?`,
      now,
      now,
      sessionId
    );

    logWithContext('SESSION_DO', 'Session ended', { sessionId });
  }

  private async cleanupOldSessions(maxAge = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAge;
    const cursor = this.storage.sql.exec(
      'DELETE FROM sessions WHERE completed_at IS NOT NULL AND completed_at < ?',
      cutoff
    );
    const deleted = cursor.rowsWritten || 0;

    if (deleted > 0) {
      logWithContext('SESSION_DO', 'Cleaned up old sessions', { deleted });
    }

    return deleted;
  }

  // Add a message to a session
  private async addMessage(sessionId: string, role: 'user' | 'assistant', content: string, turnNumber: number): Promise<void> {
    const now = Date.now();
    this.storage.sql.exec(
      `INSERT INTO session_messages (session_id, role, content, timestamp, turn_number) VALUES (?, ?, ?, ?, ?)`,
      sessionId,
      role,
      content,
      now,
      turnNumber
    );
  }

  // Get all messages for a session
  private async getMessages(sessionId: string): Promise<Array<{ role: string; content: string; timestamp: number }>> {
    const cursor = this.storage.sql.exec(
      `SELECT role, content, timestamp FROM session_messages WHERE session_id = ? ORDER BY timestamp ASC`,
      sessionId
    );
    const results = cursor.toArray();

    return results.map(row => ({
      role: row.role as string,
      content: row.content as string,
      timestamp: row.timestamp as number
    }));
  }

  // Get full session state including messages
  private async getSessionWithMessages(sessionId: string): Promise<InteractiveSessionState & { messages?: Array<{ role: string; content: string; timestamp: number }> } | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const messages = await this.getMessages(sessionId);
    return { ...session, messages };
  }
}

export class MyContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  // Extended timeout for Claude Code processing - complex AI tasks can take several minutes
  // Maximum allowed by Cloudflare Containers is 10 minutes
  sleepAfter = '300s'; // 5 minutes for complex Claude Code analysis
  envVars: Record<string, string> = {
    MESSAGE: 'I was passed in via the container class!',
    // Base URL for Anthropic API proxy (can be overridden via request)
    // Note: API keys are passed dynamically via request body, not hardcoded here
    ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
  };

  // Override fetch to handle environment variable setting for specific requests
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    logWithContext('CONTAINER', 'Container request received', {
      method: request.method,
      pathname: url.pathname,
      headers: Object.fromEntries(request.headers.entries())
    });

    // Handle process-issue requests by setting environment variables
    if (url.pathname === '/process-issue' && request.method === 'POST') {
      logWithContext('CONTAINER', 'Processing issue request');

      try {
        const issueContext = await request.json() as Record<string, any>;

        logWithContext('CONTAINER', 'Issue context received', {
          issueId: issueContext.ISSUE_ID,
          repository: issueContext.REPOSITORY_NAME,
          envVarCount: Object.keys(issueContext).length
        });

        // Set environment variables for this container instance
        let envVarsSet = 0;
        Object.entries(issueContext).forEach(([key, value]) => {
          if (typeof value === 'string') {
            this.envVars[key] = value;
            envVarsSet++;
          }
        });

        logWithContext('CONTAINER', 'Environment variables set', {
          envVarsSet,
          totalEnvVars: Object.keys(issueContext).length
        });

        logWithContext('CONTAINER', 'Forwarding request to container');

        // Create a new request with the JSON data to avoid ReadableStream being disturbed
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(issueContext)
        });

        const response = await super.fetch(newRequest);

        logWithContext('CONTAINER', 'Container response received', {
          status: response.status,
          statusText: response.statusText
        });

        return response;
      } catch (error) {
        logWithContext('CONTAINER', 'Error processing issue request', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        return new Response(JSON.stringify({
          error: 'Failed to process issue context',
          message: (error as Error).message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle interactive-session requests by setting environment variables
    if (url.pathname === '/interactive-session' && request.method === 'POST') {
      logWithContext('CONTAINER', 'Processing interactive session request');

      try {
        const sessionConfig = await request.json() as Record<string, any>;

        logWithContext('CONTAINER', 'Session config received', {
          sessionId: sessionConfig.sessionId,
          hasRepository: !!sessionConfig.repository,
          hasGithubToken: !!sessionConfig.githubToken,
          hasApiKey: !!sessionConfig.anthropicApiKey
        });

        // Set environment variables for this container instance
        const envMap: Record<string, string> = {
          ANTHROPIC_API_KEY: sessionConfig.anthropicApiKey || '',
          GITHUB_TOKEN: sessionConfig.githubToken || '',
          SESSION_ID: sessionConfig.sessionId || '',
          PROMPT: sessionConfig.prompt || '',
        };

        // Add repository info if provided
        if (sessionConfig.repository) {
          envMap.REPOSITORY_URL = sessionConfig.repository.url || '';
          envMap.REPOSITORY_NAME = sessionConfig.repository.name || '';
          envMap.REPOSITORY_BRANCH = sessionConfig.repository.branch || 'main';
        }

        // Add options as env vars
        if (sessionConfig.options) {
          if (sessionConfig.options.maxTurns) envMap.MAX_TURNS = String(sessionConfig.options.maxTurns);
          if (sessionConfig.options.permissionMode) envMap.PERMISSION_MODE = sessionConfig.options.permissionMode;
          if (sessionConfig.options.createPR !== undefined) envMap.CREATE_PR = String(sessionConfig.options.createPR);
        }

        // Set the environment variables on the container
        let envVarsSet = 0;
        Object.entries(envMap).forEach(([key, value]) => {
          if (typeof value === 'string' && value) {
            this.envVars[key] = value;
            envVarsSet++;
          }
        });

        logWithContext('CONTAINER', 'Environment variables set for interactive session', {
          envVarsSet,
          totalEnvVars: Object.keys(envMap).length
        });

        logWithContext('CONTAINER', 'Forwarding interactive session request to container');

        // Create a new request with the JSON data
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(sessionConfig)
        });

        const response = await super.fetch(newRequest);

        logWithContext('CONTAINER', 'Interactive session container response received', {
          status: response.status,
          statusText: response.statusText
        });

        return response;
      } catch (error) {
        logWithContext('CONTAINER', 'Error processing interactive session request', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });

        return new Response(JSON.stringify({
          error: 'Failed to process interactive session',
          message: (error as Error).message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // For all other requests, use default behavior
    logWithContext('CONTAINER', 'Using default container behavior');
    return super.fetch(request);
  }

  onStart() {
    recordContainerStartup();
    logWithContext('CONTAINER_LIFECYCLE', 'Container started successfully', {
      port: this.defaultPort,
      sleepAfter: this.sleepAfter
    });
  }

  onStop() {
    recordContainerShutdown();
    logWithContext('CONTAINER_LIFECYCLE', 'Container shut down successfully');
  }

  onError(error: unknown) {
    logWithContext('CONTAINER_LIFECYCLE', 'Container error occurred', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Log all incoming requests
    logWithContext('MAIN_HANDLER', 'Incoming request', {
      method: request.method,
      pathname,
      origin: url.origin,
      userAgent: request.headers.get('user-agent'),
      contentType: request.headers.get('content-type'),
      referer: request.headers.get('referer'),
      cfRay: request.headers.get('cf-ray'),
      cfCountry: request.headers.get('cf-ipcountry')
    });

    // Initialize Sentry for error tracking
    initSentry(env, request);

    // Apply rate limiting (skip for OPTIONS requests and health checks)
    let rateLimitInfo: { limit: number; remaining: number; resetAt: number } | null = null;
    if (request.method !== 'OPTIONS' && pathname !== '/health') {
      const identifier = getClientIdentifier(request);
      const category = getCategoryFromPath(pathname);
      const result = await checkRateLimit(env, identifier, category);

      rateLimitInfo = {
        limit: result.limit,
        remaining: result.remaining,
        resetAt: result.resetAt
      };

      if (!result.allowed) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          message: result.error,
          limit: result.limit,
          resetAt: result.resetAt
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetAt.toString(),
            'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString()
          }
        });
      }
    }

    // Ensure encryption key is set in the GitHubAppConfigDO for this request
    // This is required for decrypting stored credentials
    if (env.ENCRYPTION_KEY) {
      try {
        const configDO = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
        const configDOStub = (env.GITHUB_APP_CONFIG as any).get(configDO);
        await ensureDOEncryptionKey(configDOStub, env.ENCRYPTION_KEY);
      } catch (error) {
        logWithContext('MAIN_HANDLER', 'Failed to set encryption key in DO', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    let response: Response;
    let routeMatched = false;

    try {
      // GitHub App Setup Routes
      if (pathname === '/gh-setup') {
        logWithContext('MAIN_HANDLER', 'Routing to GitHub setup');
        routeMatched = true;
        response = await handleGitHubSetup(request, url.origin);
      }

      else if (pathname === '/gh-setup/callback') {
        logWithContext('MAIN_HANDLER', 'Routing to OAuth callback');
        routeMatched = true;
        response = await handleOAuthCallback(request, url, env);
      }

      // Re-encrypt credentials endpoint (for when ENCRYPTION_KEY changes)
      else if (pathname === '/gh-setup/re-encrypt' && request.method === 'GET') {
        logWithContext('MAIN_HANDLER', 'Serving re-encrypt page');
        routeMatched = true;
        response = await handleReEncryptPage();
      }

      else if (pathname === '/gh-setup/re-encrypt' && request.method === 'POST') {
        logWithContext('MAIN_HANDLER', 'Processing re-encrypt request');
        routeMatched = true;
        response = await handleReEncrypt(request, env);
      }

      // Clear GitHub App configuration
      else if (pathname === '/gh-setup/clear' && request.method === 'POST') {
        logWithContext('MAIN_HANDLER', 'Clearing GitHub App configuration');
        routeMatched = true;
        response = await handleClearConfig(env);
      }

      // Add repositories - redirect to GitHub installation page
      else if (pathname === '/gh-setup/add-repositories') {
        logWithContext('MAIN_HANDLER', 'Routing to add repositories');
        routeMatched = true;
        response = await handleAddRepositories(request, url.origin, env);
      }

      // Repository callback - after GitHub installation
      else if (pathname === '/gh-setup/repo-callback') {
        logWithContext('MAIN_HANDLER', 'Routing to repo callback');
        routeMatched = true;
        response = await handleRepoCallback(request, url, env);
      }

      // Refresh repositories from GitHub
      else if (pathname === '/api/repositories/refresh' && request.method === 'POST') {
        logWithContext('MAIN_HANDLER', 'Refreshing repositories');
        routeMatched = true;
        response = await handleRefreshRepositories(request, env);
      }

      // Status endpoint to check stored configurations
      else if (pathname === '/gh-status') {
        logWithContext('MAIN_HANDLER', 'Routing to GitHub status');
        routeMatched = true;
        response = await handleGitHubStatus(request, env);
      }

      // Debug endpoint to test the DO's get-installation-token endpoint
      else if (pathname === '/debug-get-token') {
        logWithContext('MAIN_HANDLER', 'Debug get-installation-token endpoint');
        routeMatched = true;

        try {
          const configId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
          const configDO = (env.GITHUB_APP_CONFIG as any).get(configId);

          const tokenResponse = await configDO.fetch(new Request('http://internal/get-installation-token'));
          const tokenData = tokenResponse.ok ? await tokenResponse.json() : null;
          const responseStatus = tokenResponse.status;
          const responseText = !tokenResponse.ok ? await tokenResponse.text() : null;

          // Also get the config to see what's stored
          const configResponse = await configDO.fetch(new Request('http://internal/get'));
          const config = await configResponse.json();

          response = new Response(JSON.stringify({
            tokenResponse: {
              status: responseStatus,
              ok: tokenResponse.ok,
              data: tokenData,
              error: responseText
            },
            config: {
              appId: config.appId,
              installationId: config.installationId,
              repositoryCount: config.repositories?.length || 0
            }
          }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          response = new Response(JSON.stringify({
            error: error.message,
            stack: error.stack
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Debug endpoint to test installation token generation
      else if (pathname === '/debug-install-token') {
        logWithContext('MAIN_HANDLER', 'Debug install token generation');
        routeMatched = true;

        const installationId = url.searchParams.get('installation_id');

        if (!installationId) {
          response = new Response(JSON.stringify({ error: 'Missing installation_id parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          try {
            const configId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
            const configDO = (env.GITHUB_APP_CONFIG as any).get(configId);

            const tokenResponse = await configDO.fetch(new Request('http://internal/generate-installation-token', {
              method: 'POST',
              body: JSON.stringify({ installationId })
            }));

            const tokenData = tokenResponse.ok ? await tokenResponse.json() : null;
            const responseStatus = tokenResponse.status;
            const responseText = !tokenResponse.ok ? await tokenResponse.text() : null;

            // Try to fetch repositories
            let repos: any[] = [];
            let reposError = null;

            if (tokenData?.token) {
              try {
                const installResponse = await fetch(`https://api.github.com/installation/repositories`, {
                  headers: {
                    'Authorization': `Bearer ${tokenData.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Claude-Code-Worker'
                  }
                });

                if (installResponse.ok) {
                  const installData = await installResponse.json() as any;
                  repos = installData.repositories || [];
                } else {
                  reposError = {
                    status: installResponse.status,
                    statusText: installResponse.statusText,
                    text: await installResponse.text()
                  };
                }
              } catch (e: any) {
                reposError = { message: e.message };
              }
            }

            // Get raw response text for debugging
            const rawResponseText = await fetch(`https://api.github.com/installation/repositories`, {
              headers: {
                'Authorization': `Bearer ${tokenData.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Claude-Code-Worker'
              }
            }).then(r => r.text());

            response = new Response(JSON.stringify({
              installationId,
              tokenResponse: {
                status: responseStatus,
                ok: tokenResponse.ok,
                data: tokenData,
                error: responseText
              },
              repositories: {
                count: repos.length,
                names: repos.map((r: any) => r.full_name),
                error: reposError,
                rawResponse: rawResponseText
              }
            }, null, 2), {
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (error: any) {
            response = new Response(JSON.stringify({
              error: error.message,
              stack: error.stack
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      }

      // Installation complete redirect handler
      else if (pathname === '/install-complete') {
        logWithContext('MAIN_HANDLER', 'Installation complete redirect', {
          installationId: url.searchParams.get('installation_id'),
          setupAction: url.searchParams.get('setup_action')
        });
        routeMatched = true;

        const installationId = url.searchParams.get('installation_id');
        const setupAction = url.searchParams.get('setup_action');

        if (installationId && setupAction === 'install') {
          // Fire and forget: fetch repository list and update DO
          (async () => {
            try {
              const configId = (env.GITHUB_APP_CONFIG as any).idFromName('github-app-config');
              const configDO = (env.GITHUB_APP_CONFIG as any).get(configId);

              // Generate installation token for the specific installation ID
              const tokenResponse = await configDO.fetch(new Request('http://internal/generate-installation-token', {
                method: 'POST',
                body: JSON.stringify({ installationId })
              }));
              const tokenData = tokenResponse.ok ? await tokenResponse.json() : null;

              if (tokenData?.token) {
                const installResponse = await fetch(`https://api.github.com/installation/repositories`, {
                  headers: {
                    'Authorization': `Bearer ${tokenData.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Claude-Code-Worker'
                  }
                });

                if (installResponse.ok) {
                  const installData = await installResponse.json() as {
                    repositories?: any[];
                    installation?: { account?: { login?: string; id?: number; type?: string } }
                  };
                  const repos = installData.repositories || [];
                  const account = installData.installation?.account;

                  await configDO.fetch(new Request('http://internal/update-installation', {
                    method: 'POST',
                    body: JSON.stringify({
                      installationId,
                      repositories: repos.map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        full_name: r.full_name,
                        private: r.private
                      })),
                      owner: account ? {
                        login: account.login,
                        id: account.id,
                        type: account.type || 'User'
                      } : { login: 'unknown', id: 0, type: 'User' }
                    })
                  }));

                  logWithContext('INSTALL_COMPLETE', 'Updated installation with repositories', {
                    repositoryCount: repos.length,
                    owner: account?.login
                  });
                }
              }
            } catch (error) {
              logWithContext('INSTALL_COMPLETE', 'Failed to update installation state', {
                error: error instanceof Error ? error.message : String(error)
              });
            }
          })();

          response = new Response(`
<!DOCTYPE html>
<html>
<head>
    <title>GitHub App Installed Successfully!</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
        }
        .success { color: #28a745; }
        .info-box {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .btn {
            display: inline-block;
            background: #0969da;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <h1 class="success">GitHub App Installed Successfully!</h1>
    <p><strong>Installation ID:</strong> ${installationId}</p>

    <div class="info-box">
        <h3>What's Next?</h3>
        <p>Your GitHub App is now installed and ready to process issues!</p>
        <p>Create a new issue in any connected repository to test the integration.</p>
    </div>

    <p>
        <a href="/gh-status" class="btn">Check System Status</a>
    </p>
</body>
</html>`, {
            headers: { 'Content-Type': 'text/html' }
          });
        } else {
          response = new Response('Invalid installation request', { status: 400 });
        }
      }

      // Dashboard API endpoints
      else if (pathname.startsWith('/api/')) {
        logWithContext('MAIN_HANDLER', 'Routing to dashboard API');
        routeMatched = true;
        response = await handleDashboardAPI(request, env);
      }

      // GitHub webhook endpoint
      else if (pathname === '/webhooks/github') {
        logWithContext('MAIN_HANDLER', 'Routing to GitHub webhook handler');
        routeMatched = true;
        response = await handleGitHubWebhook(request, env);
      }

      // Health and monitoring endpoints
      else if (pathname === '/health' || pathname === '/healthz') {
        logWithContext('MAIN_HANDLER', 'Routing to health check');
        routeMatched = true;
        response = await handleHealthCheck(request, env);
      }

      else if (pathname === '/metrics') {
        logWithContext('MAIN_HANDLER', 'Routing to metrics');
        routeMatched = true;
        response = await handleMetrics(request, env);
      }

      else if (pathname === '/metrics/prometheus') {
        logWithContext('MAIN_HANDLER', 'Routing to Prometheus metrics');
        routeMatched = true;
        response = await handlePrometheusMetrics(request);
      }

      // Debug endpoint to inspect env (non-production only)
      else if (pathname === '/debug-env') {
        if (env.ENVIRONMENT === 'production') {
          routeMatched = true;
          response = new Response('Debug endpoints are disabled in production', { status: 404 });
        } else {
          logWithContext('MAIN_HANDLER', 'Debug env inspection');
          routeMatched = true;
          const envInfo = {
            hasAnthropicKey: 'ANTHROPIC_API_KEY' in env,
            anthropicKeyTruthy: !!env.ANTHROPIC_API_KEY,
            anthropicKeyPrefix: env.ANTHROPIC_API_KEY ? String(env.ANTHROPIC_API_KEY).substring(0, 10) + '...' : 'none',
            hasEncryptionKey: 'ENCRYPTION_KEY' in env,
            encryptionKeyTruthy: !!env.ENCRYPTION_KEY,
            hasRateLimitKV: 'RATE_LIMIT_KV' in env,
            hasMyContainer: 'MY_CONTAINER' in env,
            hasGitHubConfig: 'GITHUB_APP_CONFIG' in env,
            environment: env.ENVIRONMENT,
            allKeys: Object.keys(env)
          };
          response = new Response(JSON.stringify(envInfo, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Test mode endpoints (for UI testing without real backend)
      else if (pathname === "/api/test/enable") {
        logWithContext("MAIN_HANDLER", "Test mode enable endpoint");
        routeMatched = true;
        response = Response.json({
          message: "Test mode is enabled via query parameter or header",
          instructions: {
            queryParameter: "Add ?test=true to any request URL",
            header: "Add X-Test-Mode: true header to any request"
          },
          endpoints: [
            "GET /api/repositories?test=true - Mock repositories",
            "GET /api/stats?test=true - Mock statistics",
            "GET /api/status?test=true - Mock status",
            "GET /api/tasks?test=true - Mock tasks",
            "GET /api/sessions?test=true - Mock sessions",
            "GET /api/issues?test=true - Mock issues",
            "POST /interactive/start?test=true - Mock SSE stream"
          ]
        });
      }


      // Container routes
      else if (pathname.startsWith('/container')) {
        // Debug endpoint - only available in non-production environments
        if (env.ENVIRONMENT === 'production') {
          routeMatched = true;
          response = new Response('Debug endpoints are disabled in production', { status: 404 });
        } else {
          logWithContext('MAIN_HANDLER', 'Routing to basic container');
          routeMatched = true;
          let id = (env.MY_CONTAINER as any).idFromName('container');
          let container = (env.MY_CONTAINER as any).get(id);

          // Map /container/* to container's internal routes
          let containerPath = '/';
          if (pathname === '/container' || pathname === '/container/') {
            containerPath = '/container';
          } else if (pathname.startsWith('/container/process-issue')) {
            containerPath = '/process-issue';
          } else if (pathname.startsWith('/container/interactive-session')) {
            containerPath = '/interactive-session';
          }

          const rewrittenRequest = rewriteRequestPath(request, containerPath);
          response = await containerFetch(container, rewrittenRequest, {
            containerName: 'container',
            route: containerPath
          });
        }
      }

      else if (pathname.startsWith('/error')) {
        // Debug endpoint - only available in non-production environments
        if (env.ENVIRONMENT === 'production') {
          routeMatched = true;
          response = new Response('Debug endpoints are disabled in production', { status: 404 });
        } else {
          logWithContext('MAIN_HANDLER', 'Routing to error test container');
          routeMatched = true;
          let id = (env.MY_CONTAINER as any).idFromName('error-test');
          let container = (env.MY_CONTAINER as any).get(id);

          // Map /error/* to container's /error endpoint
          const rewrittenRequest = rewriteRequestPath(request, '/error');
          response = await containerFetch(container, rewrittenRequest, {
            containerName: 'error-test',
            route: '/error'
          });
        }
      }

      else if (pathname.startsWith('/lb')) {
        // Debug endpoint - only available in non-production environments
        if (env.ENVIRONMENT === 'production') {
          routeMatched = true;
          response = new Response('Debug endpoints are disabled in production', { status: 404 });
        } else {
          logWithContext('MAIN_HANDLER', 'Routing to load balanced containers');
          routeMatched = true;
          let container = await loadBalance(env.MY_CONTAINER as any, 3);

          // Map /lb to container's health endpoint
          const rewrittenRequest = rewriteRequestPath(request, '/container');
          response = await containerFetch(container, rewrittenRequest, {
            containerName: 'load-balanced',
            route: '/container'
          });
        }
      }

      else if (pathname.startsWith('/singleton')) {
        // Debug endpoint - only available in non-production environments
        if (env.ENVIRONMENT === 'production') {
          routeMatched = true;
          response = new Response('Debug endpoints are disabled in production', { status: 404 });
        } else {
          logWithContext('MAIN_HANDLER', 'Routing to singleton container');
          routeMatched = true;
          const container = getContainer(env.MY_CONTAINER as any);

          // Map /singleton to container's health endpoint
          const rewrittenRequest = rewriteRequestPath(request, '/container');
          response = await containerFetch(container, rewrittenRequest, {
            containerName: 'singleton',
            route: '/container'
          });
        }
      }

      // Interactive mode endpoints
      else if (pathname.startsWith('/interactive/')) {
        logWithContext('MAIN_HANDLER', 'Routing to interactive mode handler');
        routeMatched = true;
        response = await handleInteractiveRequest(request, env);
      }

      // Dashboard static files (Expo SPA app)
      // Serve from root path and all unmatched routes for client-side routing
      // Important: This must come AFTER all API/worker routes to catch SPA routes
      else if (
        pathname === '/' ||
        pathname.startsWith('/_expo/') ||
        pathname.startsWith('/assets/') ||
        pathname.startsWith('/dashboard')
      ) {
        logWithContext('MAIN_HANDLER', 'Routing to dashboard static files (SPA)');
        routeMatched = true;
        response = await serveDashboard(request, env);
      }

      // Default home page (should only be reached for unknown API routes)
      else {
        logWithContext('MAIN_HANDLER', 'Unknown route, serving home page');
        routeMatched = true;
        const isProduction = env.ENVIRONMENT === 'production';
        const debugSection = isProduction ? '' : `
Container Testing Routes:
- /container - Basic container health check
- /lb - Load balancing over multiple containers
- /error - Test error handling
- /singleton - Single container instance
`;
        response = new Response(`
🤖 Claude Code Container Integration

Setup Instructions:
1. Configure Claude Code: /claude-setup
2. Setup GitHub Integration: /gh-setup
${debugSection}Interactive Mode:
- POST /interactive/start - Start an interactive Claude Code session
- GET /interactive/status?sessionId={id} - Check session status
- DELETE /interactive/{sessionId} - End a session

Once both setups are complete, create GitHub issues to trigger automatic Claude Code processing!
        `);
      }

      const processingTime = Date.now() - startTime;

      // Record metrics
      recordRequest(pathname, response.status, processingTime);

      // Create new response with metrics headers (container responses have immutable headers)
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('X-Response-Time', `${processingTime}ms`);
      responseHeaders.set('X-Request-Count', getRequestCount().toString());

      // Add rate limit headers if available
      if (rateLimitInfo) {
        responseHeaders.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
        responseHeaders.set('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
        responseHeaders.set('X-RateLimit-Reset', rateLimitInfo.resetAt.toString());
      }

      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });

      logWithContext('MAIN_HANDLER', 'Request completed successfully', {
        pathname,
        method: request.method,
        status: response.status,
        statusText: response.statusText,
        processingTimeMs: processingTime,
        routeMatched
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      // Capture error in Sentry
      captureError(error, {
        tags: {
          pathname,
          method: request.method,
          routeMatched: routeMatched.toString(),
          environment: env.ENVIRONMENT || 'unknown'
        },
        extra: {
          processingTimeMs: processingTime,
          userAgent: request.headers.get('user-agent'),
          cfRay: request.headers.get('cf-ray')
        }
      });

      logWithContext('MAIN_HANDLER', 'Request failed with error', {
        pathname,
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        processingTimeMs: processingTime,
        routeMatched
      });

      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: isSentryEnabled(env) ? 'Error has been logged' : error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
};
