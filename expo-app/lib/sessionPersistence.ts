/**
 * Session Persistence Manager
 * Handles saving and restoring active sessions
 */

import { activeSessionStorage, sessionDraftStorage } from './offlineStorage';
import type { Session, RepositoryDetail } from './types';

// Active session state that persists across app restarts
export interface ActiveSessionState {
  id: string;
  prompt: string;
  output: string[];
  status: 'starting' | 'running' | 'completed' | 'error';
  repository?: string;
  selectedRepos: string[];
  startTime: number;
  lastUpdateTime: number;
}

// Session message for chat display
export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: boolean;
  metadata?: {
    repository?: string;
    prNumber?: number;
  };
}

/**
 * Session persistence manager
 */
class SessionPersistenceManager {
  private currentState: ActiveSessionState | null = null;
  private listeners: Set<(state: ActiveSessionState | null) => void> = new Set();

  /**
   * Initialize by loading saved session state
   */
  async initialize(): Promise<void> {
    const saved = await activeSessionStorage.get();
    if (saved) {
      // Check if session is recent (within 24 hours)
      const dayInMs = 24 * 60 * 60 * 1000;
      if (Date.now() - saved.startTime < dayInMs) {
        this.currentState = {
          ...saved,
          selectedRepos: saved.repository ? [saved.repository] : [],
        };
      } else {
        // Session is stale, clear it
        await activeSessionStorage.clear();
      }
    }
  }

  /**
   * Get current session state
   */
  getState(): ActiveSessionState | null {
    return this.currentState;
  }

  /**
   * Check if there's a restorable session
   */
  hasRestorableSession(): boolean {
    if (!this.currentState) return false;
    // Only restore sessions that weren't completed
    return this.currentState.status !== 'completed' && this.currentState.status !== 'error';
  }

  /**
   * Start a new session
   */
  async startSession(
    prompt: string,
    repositories: string[],
    sessionId: string
  ): Promise<void> {
    this.currentState = {
      id: sessionId,
      prompt,
      output: [],
      status: 'starting',
      repository: repositories[0],
      selectedRepos: repositories,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };

    await this.save();
    await sessionDraftStorage.save(prompt, repositories[0]);

    this.notifyListeners();
  }

  /**
   * Update session status
   */
  async updateStatus(status: ActiveSessionState['status']): Promise<void> {
    if (!this.currentState) return;

    this.currentState.status = status;
    this.currentState.lastUpdateTime = Date.now();

    await this.save();
    this.notifyListeners();
  }

  /**
   * Append output to current session
   */
  async appendOutput(output: string): Promise<void> {
    if (!this.currentState) return;

    this.currentState.output.push(output);
    this.currentState.lastUpdateTime = Date.now();

    // Don't save on every output (too frequent), just update in memory
    this.notifyListeners();
  }

  /**
   * Complete current session
   */
  async completeSession(success: boolean = true): Promise<void> {
    if (!this.currentState) return;

    this.currentState.status = success ? 'completed' : 'error';
    this.currentState.lastUpdateTime = Date.now();

    await this.save();
    await sessionDraftStorage.clear();

    this.notifyListeners();
  }

  /**
   * Clear current session
   */
  async clearSession(): Promise<void> {
    this.currentState = null;
    await activeSessionStorage.clear();
    await sessionDraftStorage.clear();
    this.notifyListeners();
  }

  /**
   * Restore session messages from saved state
   */
  restoreMessages(): SessionMessage[] {
    if (!this.currentState) return [];

    const messages: SessionMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: this.currentState.prompt,
        timestamp: this.currentState.startTime,
      },
    ];

    // Add system messages for output
    this.currentState.output.forEach((output, idx) => {
      messages.push({
        id: `assistant-${idx}`,
        role: 'assistant',
        content: output,
        timestamp: this.currentState!.startTime + (idx + 1) * 1000,
      });
    });

    return messages;
  }

  /**
   * Save current state to storage
   */
  private async save(): Promise<void> {
    if (this.currentState) {
      await activeSessionStorage.save({
        id: this.currentState.id,
        prompt: this.currentState.prompt,
        output: this.currentState.output,
        status: this.currentState.status,
        repository: this.currentState.repository,
      });
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: ActiveSessionState | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  /**
   * Auto-save interval (saves every 30 seconds during active sessions)
   */
  startAutoSave(): () => void {
    const interval = setInterval(async () => {
      if (this.currentState && this.currentState.status === 'running') {
        await this.save();
      }
    }, 30000);

    return () => clearInterval(interval);
  }
}

// Singleton instance
const sessionPersistence = new SessionPersistenceManager();

// Initialize on import
sessionPersistence.initialize().catch(console.error);

export { sessionPersistence };
export type { ActiveSessionState };
