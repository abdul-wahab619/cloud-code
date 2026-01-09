/**
 * User Service
 *
 * Handles user authentication, registration, and profile management.
 * Works with the backend API for user operations and AsyncStorage
 * for local persistence of user sessions.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  UserAccount,
  AuthTokens,
  LoginCredentials,
  RegisterCredentials,
  AuthResponse,
} from './types';
import { apiClient } from './api';

// Get the base URL (same logic as in api.ts)
const getBaseURL = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://cloud-code.finhub.workers.dev';
};

// ============================================================================
// Constants
// ============================================================================

const USER_STORAGE_KEY = 'cloud_code_user';
const TOKENS_STORAGE_KEY = 'cloud_code_tokens';

// ============================================================================
// Helper Functions
// ============================================================================

const getStorage = async () => {
  if (Platform.OS === 'web') {
    return {
      getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
      removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
    };
  }
  return AsyncStorage;
};

// ============================================================================
// User Service
// ============================================================================

class UserServiceClass {
  private currentUser: UserAccount | null = null;
  private currentTokens: AuthTokens | null = null;

  // ========================================================================
  // Authentication
  // ========================================================================

  /**
   * Register a new user account
   */
  async register(credentials: RegisterCredentials): Promise<{
    success: boolean;
    user?: UserAccount;
    tokens?: AuthTokens;
    error?: string;
  }> {
    try {
      const response = await fetch(`${getBaseURL()}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Registration failed' }));
        return { success: false, error: error.error || error.message || 'Registration failed' };
      }

      const data: AuthResponse = await response.json();
      this.currentUser = data.user;
      this.currentTokens = data.tokens;

      return {
        success: true,
        user: data.user,
        tokens: data.tokens,
      };
    } catch (error) {
      console.error('[UserService] Register error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<{
    success: boolean;
    user?: UserAccount;
    tokens?: AuthTokens;
    error?: string;
  }> {
    try {
      const response = await fetch(`${getBaseURL()}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Login failed' }));
        return { success: false, error: error.error || error.message || 'Invalid credentials' };
      }

      const data: AuthResponse = await response.json();
      this.currentUser = data.user;
      this.currentTokens = data.tokens;

      return {
        success: true,
        user: data.user,
        tokens: data.tokens,
      };
    } catch (error) {
      console.error('[UserService] Login error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Logout and clear local session
   */
  async logout(): Promise<void> {
    try {
      // Notify server of logout
      const tokens = await this.getTokens();
      if (tokens) {
        await fetch(`${getBaseURL()}/api/users/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }).catch(() => {
          // Ignore logout errors
        });
      }
    } catch (error) {
      console.error('[UserService] Logout error:', error);
    } finally {
      this.currentUser = null;
      this.currentTokens = null;
      await this.clearTokens();
      await this.clearUser();
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${getBaseURL()}/api/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        return { success: false, error: error.error || 'Failed to send reset email' };
      }

      return { success: true };
    } catch (error) {
      console.error('[UserService] Password reset error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // ========================================================================
  // User Profile
  // ========================================================================

  /**
   * Get current user profile from server
   */
  async getCurrentUser(): Promise<UserAccount | null> {
    try {
      const tokens = await this.getTokens();
      if (!tokens) return null;

      const response = await fetch(`${getBaseURL()}/api/users/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, clear session
          await this.clearTokens();
          await this.clearUser();
        }
        return null;
      }

      const user: UserAccount = await response.json();
      this.currentUser = user;
      return user;
    } catch (error) {
      console.error('[UserService] Get current user error:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<Pick<UserAccount, 'name' | 'email'>>): Promise<UserAccount | null> {
    try {
      const tokens = await this.getTokens();
      if (!tokens) return null;

      const response = await fetch(`${getBaseURL()}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        return null;
      }

      const user: UserAccount = await response.json();
      this.currentUser = user;
      await this.saveUser(user);
      return user;
    } catch (error) {
      console.error('[UserService] Update profile error:', error);
      return null;
    }
  }

  // ========================================================================
  // Token Management
  // ========================================================================

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<AuthTokens | null> {
    try {
      const tokens = await this.getTokens();
      if (!tokens?.refreshToken) return null;

      const response = await fetch(`${getBaseURL()}/api/users/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!response.ok) {
        await this.clearTokens();
        return null;
      }

      const newTokens: AuthTokens = await response.json();
      this.currentTokens = newTokens;
      await this.saveTokens(newTokens);
      return newTokens;
    } catch (error) {
      console.error('[UserService] Refresh token error:', error);
      await this.clearTokens();
      return null;
    }
  }

  /**
   * Check if access token is expired and refresh if needed
   */
  async ensureValidToken(): Promise<string | null> {
    const tokens = await this.getTokens();
    if (!tokens) return null;

    const now = Date.now();
    const expiresSoon = tokens.expiresAt - now < 5 * 60 * 1000; // 5 minutes buffer

    if (expiresSoon) {
      const newTokens = await this.refreshToken();
      return newTokens?.accessToken || null;
    }

    return tokens.accessToken;
  }

  // ========================================================================
  // Local Storage
  // ========================================================================

  /**
   * Save user data to local storage
   */
  async saveUser(user: UserAccount): Promise<void> {
    try {
      const storage = await getStorage();
      await storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      this.currentUser = user;
    } catch (error) {
      console.error('[UserService] Save user error:', error);
    }
  }

  /**
   * Get user data from local storage
   */
  async getUser(): Promise<UserAccount | null> {
    if (this.currentUser) return this.currentUser;

    try {
      const storage = await getStorage();
      const data = await storage.getItem(USER_STORAGE_KEY);
      if (!data) return null;

      const user: UserAccount = JSON.parse(data as string);
      this.currentUser = user;
      return user;
    } catch (error) {
      console.error('[UserService] Get user error:', error);
      return null;
    }
  }

  /**
   * Clear user data from local storage
   */
  async clearUser(): Promise<void> {
    try {
      const storage = await getStorage();
      await storage.removeItem(USER_STORAGE_KEY);
      this.currentUser = null;
    } catch (error) {
      console.error('[UserService] Clear user error:', error);
    }
  }

  /**
   * Save auth tokens to local storage
   */
  async saveTokens(tokens: AuthTokens): Promise<void> {
    try {
      const storage = await getStorage();
      await storage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
      this.currentTokens = tokens;
    } catch (error) {
      console.error('[UserService] Save tokens error:', error);
    }
  }

  /**
   * Get auth tokens from local storage
   */
  async getTokens(): Promise<AuthTokens | null> {
    if (this.currentTokens) return this.currentTokens;

    try {
      const storage = await getStorage();
      const data = await storage.getItem(TOKENS_STORAGE_KEY);
      if (!data) return null;

      const tokens: AuthTokens = JSON.parse(data as string);
      this.currentTokens = tokens;
      return tokens;
    } catch (error) {
      console.error('[UserService] Get tokens error:', error);
      return null;
    }
  }

  /**
   * Clear auth tokens from local storage
   */
  async clearTokens(): Promise<void> {
    try {
      const storage = await getStorage();
      await storage.removeItem(TOKENS_STORAGE_KEY);
      this.currentTokens = null;
    } catch (error) {
      console.error('[UserService] Clear tokens error:', error);
    }
  }

  // ========================================================================
  // Usage Tracking
  // ========================================================================

  /**
   * Increment session usage count (call after creating a session)
   */
  async incrementSessionUsage(): Promise<void> {
    const user = await this.getUser();
    if (!user) return;

    const updated = {
      ...user,
      usage: {
        ...user.usage,
        sessionsThisMonth: user.usage.sessionsThisMonth + 1,
        totalSessions: user.usage.totalSessions + 1,
      },
      lastActiveAt: new Date().toISOString(),
    };

    await this.saveUser(updated);
    this.currentUser = updated;

    // Sync with server in background
    this.ensureValidToken().then((token) => {
      if (token) {
        fetch(`${getBaseURL()}/api/users/usage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'increment_session' }),
        }).catch(() => {
          // Ignore sync errors
        });
      }
    });
  }

  /**
   * Update repository count
   */
  async updateRepositoryCount(count: number): Promise<void> {
    const user = await this.getUser();
    if (!user) return;

    const updated = {
      ...user,
      usage: {
        ...user.usage,
        repositoryCount: count,
      },
    };

    await this.saveUser(updated);
    this.currentUser = updated;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const userService = new UserServiceClass();

export default userService;
