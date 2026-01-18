/**
 * Offline Storage Layer
 * AsyncStorage wrapper with type safety and error handling
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, Issue, RepositoryDetail } from './types';

// Storage keys
export const STORAGE_KEYS = {
  // Session data
  SESSION_DRAFT: 'session_draft',
  ACTIVE_SESSION: 'active_session',
  SESSION_HISTORY: 'session_history',

  // Cached data
  CACHED_REPOSITORIES: 'cached_repositories',
  CACHED_ISSUES: 'cached_issues',
  CACHED_STATS: 'cached_stats',

  // Settings
  SELECTED_REPOS: 'selected_repos',
  NOTIFICATION_PREFS: 'notification_prefs',
  THEME_PREF: 'theme_preference',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  OFFLINE_MODE_ENABLED: 'offline_mode_enabled',

  // Offline state
  OFFLINE_QUEUE: 'offline_queue',
  LAST_SYNC: 'last_sync',
  IS_OFFLINE: 'is_offline',
} as const;

// Storage item metadata
interface StorageItem<T> {
  data: T;
  timestamp: number;
  version: number;
}

// Queue item for offline actions
interface QueueItem {
  id: string;
  action: string;
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

/**
 * Safe AsyncStorage wrapper with error handling
 */
class StorageManager {
  /**
   * Get item from storage
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;

      const item: StorageItem<T> = JSON.parse(raw);
      return item.data;
    } catch (error) {
      console.error(`Storage get error for key "${key}":`, error);
      return null;
    }
  }

  /**
   * Set item in storage
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<boolean> {
    try {
      const item: StorageItem<T> = {
        data,
        timestamp: Date.now(),
        version: 1,
      };
      await AsyncStorage.setItem(key, JSON.stringify(item));
      return true;
    } catch (error) {
      console.error(`Storage set error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Remove item from storage
   */
  async remove(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Storage remove error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Check if item exists
   */
  async has(key: string): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value !== null;
    } catch (error) {
      console.error(`Storage has error for key "${key}":`, error);
      return false;
    }
  }

  /**
   * Clear all storage
   */
  async clear(): Promise<boolean> {
    try {
      await AsyncStorage.clear();
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  /**
   * Get all keys
   */
  async keys(): Promise<string[]> {
    try {
      return await AsyncStorage.getAllKeys() as string[];
    } catch (error) {
      console.error('Storage keys error:', error);
      return [];
    }
  }

  /**
   * Get multiple items
   */
  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    try {
      const pairs = await AsyncStorage.multiGet(keys);
      for (const [key, raw] of pairs) {
        if (raw) {
          try {
            const item: StorageItem<T> = JSON.parse(raw);
            result.set(key, item.data);
          } catch {
            // Skip invalid items
          }
        }
      }
    } catch (error) {
      console.error('Storage multiGet error:', error);
    }
    return result;
  }

  /**
   * Set multiple items
   */
  async multiSet<T>(items: Record<string, T>): Promise<boolean> {
    try {
      const pairs: [string, string][] = Object.entries(items).map(([key, data]) => {
        const item: StorageItem<T> = {
          data,
          timestamp: Date.now(),
          version: 1,
        };
        return [key, JSON.stringify(item)];
      });
      await AsyncStorage.multiSet(pairs);
      return true;
    } catch (error) {
      console.error('Storage multiSet error:', error);
      return false;
    }
  }

  /**
   * Remove multiple items
   */
  async multiRemove(keys: string[]): Promise<boolean> {
    try {
      await AsyncStorage.multiRemove(keys);
      return true;
    } catch (error) {
      console.error('Storage multiRemove error:', error);
      return false;
    }
  }
}

// Singleton instance
const storage = new StorageManager();

/**
 * Session draft storage
 */
export const sessionDraftStorage = {
  save: async (prompt: string, repository?: string): Promise<void> => {
    await storage.set(STORAGE_KEYS.SESSION_DRAFT, { prompt, repository });
  },

  get: async (): Promise<{ prompt: string; repository?: string } | null> => {
    return await storage.get<{ prompt: string; repository?: string }>(STORAGE_KEYS.SESSION_DRAFT);
  },

  clear: async (): Promise<void> => {
    await storage.remove(STORAGE_KEYS.SESSION_DRAFT);
  },
};

/**
 * Active session storage for persistence
 */
export const activeSessionStorage = {
  save: async (session: {
    id: string;
    prompt: string;
    output: string[];
    status: 'starting' | 'running' | 'completed' | 'error';
    repository?: string;
    startTime?: number;
    lastUpdateTime?: number;
  }): Promise<void> => {
    await storage.set(STORAGE_KEYS.ACTIVE_SESSION, session);
  },

  get: async (): Promise<{
    id: string;
    prompt: string;
    output: string[];
    status: 'starting' | 'running' | 'completed' | 'error';
    repository?: string;
    startTime?: number;
    lastUpdateTime?: number;
  } | null> => {
    return await storage.get(STORAGE_KEYS.ACTIVE_SESSION);
  },

  clear: async (): Promise<void> => {
    await storage.remove(STORAGE_KEYS.ACTIVE_SESSION);
  },
};

/**
 * Session history storage
 */
export const sessionHistoryStorage = {
  add: async (session: Session): Promise<void> => {
    const history = await sessionHistoryStorage.getAll();
    const newHistory = [session, ...history].slice(0, 50); // Keep last 50
    await storage.set(STORAGE_KEYS.SESSION_HISTORY, newHistory);
  },

  getAll: async (): Promise<Session[]> => {
    return (await storage.get<Session[]>(STORAGE_KEYS.SESSION_HISTORY)) || [];
  },

  clear: async (): Promise<void> => {
    await storage.remove(STORAGE_KEYS.SESSION_HISTORY);
  },
};

/**
 * Cached data storage
 */
export const cacheStorage = {
  saveRepositories: async (repos: RepositoryDetail[]): Promise<void> => {
    await storage.set(STORAGE_KEYS.CACHED_REPOSITORIES, repos, 5 * 60 * 1000); // 5 min TTL
  },

  getRepositories: async (): Promise<RepositoryDetail[] | null> => {
    return await storage.get<RepositoryDetail[]>(STORAGE_KEYS.CACHED_REPOSITORIES);
  },

  saveIssues: async (issues: Issue[]): Promise<void> => {
    await storage.set(STORAGE_KEYS.CACHED_ISSUES, issues, 5 * 60 * 1000);
  },

  getIssues: async (): Promise<Issue[] | null> => {
    return await storage.get<Issue[]>(STORAGE_KEYS.CACHED_ISSUES);
  },

  clearCache: async (): Promise<void> => {
    await storage.multiRemove([
      STORAGE_KEYS.CACHED_REPOSITORIES,
      STORAGE_KEYS.CACHED_ISSUES,
      STORAGE_KEYS.CACHED_STATS,
    ]);
  },

  getCacheSize: async (): Promise<number> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      let totalSize = 0;
      for (const key of keys) {
        if (key.startsWith('cached_') || key.includes('cache')) {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            totalSize += raw.length;
          }
        }
      }
      return totalSize;
    } catch {
      return 0;
    }
  },
};

/**
 * Settings storage
 */
export const settingsStorage = {
  saveSelectedRepos: async (repos: string[]): Promise<void> => {
    await storage.set(STORAGE_KEYS.SELECTED_REPOS, repos);
  },

  getSelectedRepos: async (): Promise<string[]> => {
    return (await storage.get<string[]>(STORAGE_KEYS.SELECTED_REPOS)) || [];
  },

  saveNotificationPrefs: async (prefs: {
    sessionComplete: boolean;
    prStatus: boolean;
    errorAlerts: boolean;
  }): Promise<void> => {
    await storage.set(STORAGE_KEYS.NOTIFICATION_PREFS, prefs);
  },

  getNotificationPrefs: async (): Promise<{
    sessionComplete: boolean;
    prStatus: boolean;
    errorAlerts: boolean;
  } | null> => {
    return await storage.get(STORAGE_KEYS.NOTIFICATION_PREFS);
  },

  saveTheme: async (theme: 'light' | 'dark' | 'system'): Promise<void> => {
    await storage.set(STORAGE_KEYS.THEME_PREF, theme);
  },

  getTheme: async (): Promise<'light' | 'dark' | 'system'> => {
    return (await storage.get<'light' | 'dark' | 'system'>(STORAGE_KEYS.THEME_PREF)) || 'system';
  },

  saveBiometricEnabled: async (enabled: boolean): Promise<void> => {
    await storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled);
  },

  getBiometricEnabled: async (): Promise<boolean> => {
    return (await storage.get<boolean>(STORAGE_KEYS.BIOMETRIC_ENABLED)) ?? false;
  },

  saveOfflineModeEnabled: async (enabled: boolean): Promise<void> => {
    await storage.set(STORAGE_KEYS.OFFLINE_MODE_ENABLED, enabled);
  },

  getOfflineModeEnabled: async (): Promise<boolean> => {
    return (await storage.get<boolean>(STORAGE_KEYS.OFFLINE_MODE_ENABLED)) ?? false;
  },

  clearAllSettings: async (): Promise<void> => {
    await storage.multiRemove([
      STORAGE_KEYS.SELECTED_REPOS,
      STORAGE_KEYS.NOTIFICATION_PREFS,
      STORAGE_KEYS.THEME_PREF,
      STORAGE_KEYS.BIOMETRIC_ENABLED,
      STORAGE_KEYS.OFFLINE_MODE_ENABLED,
    ]);
  },
};

/**
 * Offline queue storage
 */
export const offlineQueue = {
  add: async (action: string, payload: unknown): Promise<void> => {
    const queue = await offlineQueue.getAll();
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    };
    await storage.set(STORAGE_KEYS.OFFLINE_QUEUE, [...queue, item]);
  },

  getAll: async (): Promise<QueueItem[]> => {
    return (await storage.get<QueueItem[]>(STORAGE_KEYS.OFFLINE_QUEUE)) || [];
  },

  remove: async (id: string): Promise<void> => {
    const queue = await offlineQueue.getAll();
    const filtered = queue.filter(item => item.id !== id);
    await storage.set(STORAGE_KEYS.OFFLINE_QUEUE, filtered);
  },

  clear: async (): Promise<void> => {
    await storage.remove(STORAGE_KEYS.OFFLINE_QUEUE);
  },
};

/**
 * Offline state management
 */
export const offlineState = {
  isOffline: async (): Promise<boolean> => {
    return (await storage.get<boolean>(STORAGE_KEYS.IS_OFFLINE)) || false;
  },

  setOffline: async (offline: boolean): Promise<void> => {
    await storage.set(STORAGE_KEYS.IS_OFFLINE, offline);
  },

  getLastSync: async (): Promise<number | null> => {
    return await storage.get<number>(STORAGE_KEYS.LAST_SYNC);
  },

  updateLastSync: async (): Promise<void> => {
    await storage.set(STORAGE_KEYS.LAST_SYNC, Date.now());
  },
};

// Export the storage manager for advanced use
export { storage };
