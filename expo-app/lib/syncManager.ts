/**
 * Sync Manager
 * Handles background sync when connection is restored
 */

import { offlineQueue, offlineState } from './offlineStorage';
import NetInfo from '@react-native-community/netinfo';

// Sync queue item
interface SyncJob {
  id: string;
  type: 'api_request' | 'session_message' | 'repository_action';
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  payload?: unknown;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

// Sync result
interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{ job: SyncJob; error: string }>;
}

/**
 * Sync Manager class
 */
class SyncManager {
  private isSyncing: boolean = false;
  private isOnline: boolean = true;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(isOnline: boolean) => void> = new Set();

  constructor() {
    this.initializeNetworkListener();
  }

  /**
   * Initialize network state listener
   */
  private initializeNetworkListener(): void {
    // Check initial state
    NetInfo.fetch().then(state => {
      this.isOnline = state.isConnected ?? true;
      this.notifyConnectionChange();
    });

    // Listen for network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? true;

      if (wasOffline && this.isOnline) {
        // Connection restored, trigger sync
        this.notifyConnectionChange();
        this.sync().catch(console.error);
      }
    });
  }

  /**
   * Notify listeners of connection change
   */
  private notifyConnectionChange(): void {
    this.listeners.forEach(listener => listener(this.isOnline));
  }

  /**
   * Get current online status
   */
  getConnectionStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Subscribe to connection changes
   */
  onConnectionChange(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback);
    // Immediately call with current state
    callback(this.isOnline);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Add item to sync queue
   */
  async queueSync(
    type: SyncJob['type'],
    endpoint: string,
    method: SyncJob['method'] = 'POST',
    payload?: unknown,
    priority: SyncJob['priority'] = 'normal'
  ): Promise<void> {
    if (this.isOnline) {
      // If online, try to execute immediately
      try {
        await this.executeRequest(type, endpoint, method, payload);
        return;
      } catch (error) {
        // If failed, queue for later
        console.log('Request failed, queueing for sync:', error);
      }
    }

    // Add to offline queue
    await offlineQueue.add('sync_request', {
      type,
      endpoint,
      method,
      payload,
      priority,
    });

    // Update offline state
    await offlineState.setOffline(true);
  }

  /**
   * Execute a queued sync job
   */
  private async executeRequest(
    type: string,
    endpoint: string,
    method: string,
    payload?: unknown
  ): Promise<Response> {
    const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * Process offline queue and sync with server
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, processed: 0, failed: 0, errors: [] };
    }

    if (!this.isOnline) {
      return { success: false, processed: 0, failed: 0, errors: [] };
    }

    this.isSyncing = true;

    const result: SyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
    };

    try {
      const queue = await offlineQueue.getAll();

      // Sort by retry count (fewer retries = higher priority) and timestamp
      const sortedQueue = queue.sort((a, b) => {
        // Items with fewer retries should be processed first
        const retryDiff = a.retryCount - b.retryCount;
        if (retryDiff !== 0) return retryDiff;
        // Then by timestamp (older items first)
        return a.timestamp - b.timestamp;
      });

      for (const item of sortedQueue) {
        try {
          const { type, endpoint, method, payload } = item.payload as {
            type: string;
            endpoint: string;
            method: string;
            payload?: unknown;
          };

          await this.executeRequest(type, endpoint, method, payload);
          await offlineQueue.remove(item.id);
          result.processed++;
        } catch (error) {
          result.failed++;
          // Convert QueueItem to SyncJob for error reporting
          const errorJob: SyncJob = {
            id: item.id,
            type: 'api_request',
            endpoint: '',
            method: 'POST',
            payload: item.payload,
            priority: 'normal',
            timestamp: item.timestamp,
            retryCount: item.retryCount,
            maxRetries: 3,
          };
          result.errors.push({
            job: errorJob,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          // Increment retry count
          item.retryCount++;
          if (item.retryCount > 3) {
            // Max retries reached, remove from queue
            await offlineQueue.remove(item.id);
          }
        }
      }

      // Update last sync time
      await offlineState.updateLastSync();
      await offlineState.setOffline(false);
    } catch (error) {
      result.success = false;
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Start periodic sync (every 30 seconds when online)
   */
  startPeriodicSync(): () => void {
    this.syncInterval = setInterval(async () => {
      if (this.isOnline && !this.isSyncing) {
        await this.sync();
      }
    }, 30000);

    return () => {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
      }
    };
  }

  /**
   * Get sync status
   */
  getStatus(): {
    isOnline: boolean;
    isSyncing: boolean;
    queueLength: number;
    lastSync: number | null;
  } {
    offlineQueue.getAll().then(queue => ({
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      queueLength: queue.length,
      lastSync: null, // Would be fetched from storage
    }));

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      queueLength: 0,
      lastSync: null,
    };
  }

  /**
   * Force sync now
   */
  async forceSync(): Promise<SyncResult> {
    return await this.sync();
  }

  /**
   * Clear the sync queue
   */
  async clearQueue(): Promise<void> {
    await offlineQueue.clear();
  }
}

// Singleton instance
const syncManager = new SyncManager();

export { syncManager };
export type { SyncJob, SyncResult };
