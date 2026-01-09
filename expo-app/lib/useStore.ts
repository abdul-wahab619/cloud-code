import React from 'react';
import { create } from 'zustand';
import type {
  DashboardStats,
  Task,
  Session,
  Issue,
  GitHubStatus,
  RepositoryDetail,
  UserAccount,
  AuthTokens,
  LoginCredentials,
  RegisterCredentials,
} from './types';
import { api } from './api';
import { cacheStorage, sessionDraftStorage, settingsStorage, offlineState } from './offlineStorage';
import { sessionPersistence } from './sessionPersistence';
import { syncManager, type SyncResult } from './syncManager';
import { userService } from './userService';

// Re-export types for convenience
export type {
  DashboardStats,
  Task,
  Session,
  Issue,
  GitHubStatus,
  RepositoryDetail,
  UserAccount,
  AuthTokens,
  LoginCredentials,
  RegisterCredentials,
};

interface AppState {
  // Data
  stats: DashboardStats | null;
  tasks: Task[];
  sessions: Session[];
  issues: Issue[];
  repositories: RepositoryDetail[];
  status: GitHubStatus | null;

  // User authentication
  user: UserAccount | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;

  // UI state
  isLoading: boolean;
  isConfigured: boolean;
  selectedIssueFilter: 'All' | 'Open' | 'Processing' | 'Completed';
  isOffline: boolean;
  isSyncing: boolean;

  // Selected repositories for sessions
  selectedRepositories: string[];

  // Active session
  currentSession: {
    id: string;
    prompt: string;
    output: string[];
    status: 'starting' | 'running' | 'completed' | 'error';
  } | null;

  // Actions
  refresh: () => Promise<void>;
  setStats: (stats: DashboardStats) => void;
  setTasks: (tasks: Task[]) => void;
  setSessions: (sessions: Session[]) => void;
  setIssues: (issues: Issue[]) => void;
  setRepositories: (repos: RepositoryDetail[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setSelectedIssueFilter: (filter: 'All' | 'Open' | 'Processing' | 'Completed') => void;

  // Session actions
  setCurrentSession: (session: AppState['currentSession']) => void;
  appendSessionOutput: (output: string) => void;
  clearCurrentSession: () => void;

  // Offline actions
  setOfflineMode: (offline: boolean) => void;
  sync: () => Promise<SyncResult>;

  // Selected repositories
  setSelectedRepositories: (repos: string[]) => void;

  // Initialize with offline data
  initializeFromCache: () => Promise<void>;

  // Authentication actions
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  register: (credentials: RegisterCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<UserAccount>) => Promise<void>;
  canCreateSession: () => boolean;
  canAddRepository: () => boolean;
}

export const useAppStore = create<AppState>((set, get) => {
  // Initialize connection status listener
  syncManager.onConnectionChange((isOnline) => {
    set({ isOffline: !isOnline });
    offlineState.setOffline(!isOnline);
  });

  return {
    // Initial state
    stats: null,
    tasks: [],
    sessions: [],
    issues: [],
    repositories: [],
    status: null,
    user: null,
    isAuthenticated: false,
    isAuthenticating: false,
    isLoading: false,
    isConfigured: false,
    selectedIssueFilter: 'All',
    currentSession: null,
    isOffline: false,
    isSyncing: false,
    selectedRepositories: [],

    // Actions
    setStats: (stats) => {
      set({ stats });
      cacheStorage.saveIssues = async () => {}; // Would cache to storage
    },

    setTasks: (tasks) => set({ tasks }),

    setSessions: (sessions) => set({ sessions }),

    setIssues: (issues) => {
      set({ issues });
      cacheStorage.saveIssues(issues).catch(console.error);
    },

    setRepositories: (repositories) => {
      set({ repositories });
      cacheStorage.saveRepositories(repositories).catch(console.error);
    },

    setIsLoading: (isLoading) => set({ isLoading }),

    setSelectedIssueFilter: (filter) => set({ selectedIssueFilter: filter }),

    setCurrentSession: (session) => {
      set({ currentSession: session, sessions: [] });
      // Persist session state
      if (session) {
        sessionPersistence.startSession(
          session.prompt,
          get().selectedRepositories,
          session.id
        ).catch(console.error);
      }
    },

    appendSessionOutput: (output) => {
      set((state) => ({
        currentSession: state.currentSession
          ? { ...state.currentSession, output: [...state.currentSession.output, output] }
          : null,
      }));
      // Persist output
      sessionPersistence.appendOutput(output);
    },

    clearCurrentSession: async () => {
      set({ currentSession: null });
      await sessionPersistence.clearSession();
      await sessionDraftStorage.clear();
    },

    setOfflineMode: (offline) => {
      set({ isOffline: offline });
      offlineState.setOffline(offline);
    },

    sync: async () => {
      const result = await syncManager.forceSync();
      set({ isSyncing: false });
      return result;
    },

    setSelectedRepositories: async (repos) => {
      set({ selectedRepositories: repos });
      await settingsStorage.saveSelectedRepos(repos);
    },

    // Initialize from cache
    initializeFromCache: async () => {
      // Load cached user session
      const savedUser = await userService.getUser();
      const savedTokens = await userService.getTokens();
      if (savedUser && savedTokens) {
        set({
          user: savedUser,
          isAuthenticated: true,
        });
        // Refresh user data from server
        try {
          const freshUser = await userService.getCurrentUser();
          if (freshUser) {
            set({ user: freshUser });
            await userService.saveUser(freshUser);
          }
        } catch {
          // Server unavailable, use cached data
        }
      }

      // Load cached repositories
      const cachedRepos = await cacheStorage.getRepositories();
      if (cachedRepos && cachedRepos.length > 0) {
        set({ repositories: cachedRepos });
      }

      // Load cached issues
      const cachedIssues = await cacheStorage.getIssues();
      if (cachedIssues && cachedIssues.length > 0) {
        set({ issues: cachedIssues });
      }

      // Load selected repositories
      const selectedRepos = await settingsStorage.getSelectedRepos();
      if (selectedRepos.length > 0) {
        set({ selectedRepositories: selectedRepos });
      }

      // Load offline state
      const offline = await offlineState.isOffline();
      set({ isOffline: offline });

      // Initialize session persistence
      await sessionPersistence.initialize();

      // Check for restorable session
      if (sessionPersistence.hasRestorableSession()) {
        const savedState = sessionPersistence.getState();
        if (savedState) {
          set({
            currentSession: {
              id: savedState.id,
              prompt: savedState.prompt,
              output: savedState.output,
              status: savedState.status,
            },
            selectedRepositories: savedState.selectedRepos,
          });
        }
      }

      // Start periodic sync
      syncManager.startPeriodicSync();
    },

    // Refresh all data
    refresh: async () => {
      set({ isLoading: true });

      try {
        const [statusRes, tasksRes, sessionsRes, issuesRes, statsRes, reposRes] = await Promise.all([
          api.getStatus().catch(() => null),
          api.getTasks().catch(() => []),
          api.getSessions().catch(() => []),
          api.getIssues().catch(() => []),
          api.getStats().catch(() => null),
          api.getRepositories().catch(() => []),
        ]);

        set({
          status: statusRes,
          tasks: tasksRes,
          sessions: sessionsRes,
          issues: issuesRes,
          stats: statsRes,
          repositories: reposRes,
          isConfigured: statusRes?.configured ?? false,
          isLoading: false,
        });

        // Cache the results
        if (reposRes) cacheStorage.saveRepositories(reposRes).catch(console.error);
        if (issuesRes) cacheStorage.saveIssues(issuesRes).catch(console.error);
      } catch (error) {
        console.error('Failed to refresh:', error);
        set({ isLoading: false });
      }
    },

    // Authentication actions
    login: async (credentials) => {
      set({ isAuthenticating: true });
      try {
        const result = await userService.login(credentials);
        if (result.success && result.user && result.tokens) {
          set({
            user: result.user,
            isAuthenticated: true,
            isAuthenticating: false,
          });
          await userService.saveTokens(result.tokens);
          await userService.saveUser(result.user);
          return { success: true };
        }
        set({ isAuthenticating: false });
        return { success: false, error: result.error || 'Login failed' };
      } catch (error) {
        set({ isAuthenticating: false });
        return { success: false, error: 'Network error' };
      }
    },

    register: async (credentials) => {
      set({ isAuthenticating: true });
      try {
        const result = await userService.register(credentials);
        if (result.success && result.user && result.tokens) {
          set({
            user: result.user,
            isAuthenticated: true,
            isAuthenticating: false,
          });
          await userService.saveTokens(result.tokens);
          await userService.saveUser(result.user);
          return { success: true };
        }
        set({ isAuthenticating: false });
        return { success: false, error: result.error || 'Registration failed' };
      } catch (error) {
        set({ isAuthenticating: false });
        return { success: false, error: 'Network error' };
      }
    },

    logout: async () => {
      set({ user: null, isAuthenticated: false });
      await userService.clearTokens();
      await userService.clearUser();
    },

    refreshUser: async () => {
      const { isAuthenticated } = get();
      if (!isAuthenticated) return;

      try {
        const user = await userService.getCurrentUser();
        if (user) {
          set({ user });
          await userService.saveUser(user);
        }
      } catch (error) {
        console.error('Failed to refresh user:', error);
      }
    },

    updateUser: async (updates) => {
      const { user } = get();
      if (!user) return;

      try {
        const updated = await userService.updateProfile(updates);
        if (updated) {
          set({ user: updated });
          await userService.saveUser(updated);
        }
      } catch (error) {
        console.error('Failed to update user:', error);
      }
    },

    canCreateSession: () => {
      const { user } = get();
      if (!user) return false;

      const { sessionsThisMonth } = user.usage;
      const { sessionsPerMonth } = user.limits;

      // Unlimited for enterprise (-1)
      if (sessionsPerMonth < 0) return true;
      return sessionsThisMonth < sessionsPerMonth;
    },

    canAddRepository: () => {
      const { user, repositories } = get();
      if (!user) return false;

      const { repositoryCount } = user.usage;
      const { repositories: maxRepos } = user.limits;

      // Unlimited for enterprise (-1)
      if (maxRepos < 0) return true;
      return repositoryCount < maxRepos;
    },
  };
});

// Hook to initialize store on app mount
export const useInitializeStore = () => {
  const initializeFromCache = useAppStore((state) => state.initializeFromCache);
  const refresh = useAppStore((state) => state.refresh);

  React.useEffect(() => {
    initializeFromCache().then(() => {
      // After loading cache, do a fresh refresh
      refresh();
    });
  }, []);
};
