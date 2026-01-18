/**
 * Theme System
 *
 * Manages light/dark theme switching with system preference support.
 */

import { useState, useEffect } from 'react';
import { Platform, Appearance, useColorScheme } from 'react-native';
import { storage } from './offlineStorage';
import { colors } from './styles';

// ============================================================================
// Types
// ============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

export interface ThemePreferences {
  mode: ThemeMode;
  useHighContrast: boolean;
  reduceMotion: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const THEME_PREFS_KEY = 'theme_preferences';

const DEFAULT_THEME_PREFS: ThemePreferences = {
  mode: 'system',
  useHighContrast: false,
  reduceMotion: false,
};

// ============================================================================
// Color Schemes
// ============================================================================

export const lightColors = {
  background: '#ffffff',
  foreground: '#09090b',
  card: '#f4f4f5',
  'card-foreground': '#09090b',
  popover: '#ffffff',
  'popover-foreground': '#09090b',
  primary: '#18181b',
  'primary-foreground': '#fafafa',
  secondary: '#f4f4f5',
  'secondary-foreground': '#18181b',
  muted: '#f4f4f5',
  'muted-foreground': '#71717a',
  accent: '#f4f4f5',
  'accent-foreground': '#18181b',
  destructive: '#ef4444',
  'destructive-foreground': '#fafafa',
  border: '#e4e4e7',
  input: '#e4e4e7',
  ring: '#18181b',
  brand: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
} as const;

export const darkColors = {
  background: '#09090b',
  foreground: '#fafafa',
  card: '#18181b',
  'card-foreground': '#fafafa',
  popover: '#09090b',
  'popover-foreground': '#fafafa',
  primary: '#fafafa',
  'primary-foreground': '#18181b',
  secondary: '#27272a',
  'secondary-foreground': '#fafafa',
  muted: '#27272a',
  'muted-foreground': '#a1a1aa',
  accent: '#27272a',
  'accent-foreground': '#fafafa',
  destructive: '#7f1d1d',
  'destructive-foreground': '#fafafa',
  border: '#27272a',
  input: '#27272a',
  ring: '#d4d4d8',
  brand: '#818cf8',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
} as const;

// ============================================================================
// Theme Utilities
// ============================================================================

/**
 * Get the effective color scheme based on theme mode preference
 */
export function getEffectiveColorScheme(mode: ThemeMode): ColorScheme {
  if (mode === 'system') {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  }
  return mode;
}

/**
 * Get colors for the current theme
 */
export function getColors(mode: ThemeMode): typeof colors {
  const scheme = getEffectiveColorScheme(mode);
  return scheme === 'dark' ? darkColors : lightColors;
}

// ============================================================================
// Theme Hook
// ============================================================================

/**
 * Hook for accessing and managing theme
 */
export function useTheme() {
  const systemColorScheme = useColorScheme();
  const [preferences, setPreferences] = useState<ThemePreferences>(DEFAULT_THEME_PREFS);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  // Listen for system appearance changes
  useEffect(() => {
    if (preferences.mode === 'system' && Platform.OS === 'web') {
      const subscription = Appearance.addChangeListener(() => {
        // Force re-render when system theme changes
        setPreferences((prev) => ({ ...prev }));
      });
      return () => subscription.remove();
    }
  }, [preferences.mode]);

  const loadPreferences = async () => {
    try {
      const saved = await storage.get<ThemePreferences>(THEME_PREFS_KEY);
      if (saved) {
        setPreferences({ ...DEFAULT_THEME_PREFS, ...saved });
      }
    } catch (error) {
      console.error('[Theme] Failed to load preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async (newPrefs: ThemePreferences) => {
    try {
      await storage.set(THEME_PREFS_KEY, newPrefs);
      setPreferences(newPrefs);
    } catch (error) {
      console.error('[Theme] Failed to save preferences:', error);
    }
  };

  const setMode = async (mode: ThemeMode) => {
    await savePreferences({ ...preferences, mode });
  };

  const toggleTheme = async () => {
    const currentScheme = getEffectiveColorScheme(preferences.mode);
    const newMode: ThemeMode = currentScheme === 'dark' ? 'light' : 'dark';
    await setMode(newMode);
  };

  const setHighContrast = async (enabled: boolean) => {
    await savePreferences({ ...preferences, useHighContrast: enabled });
  };

  const setReduceMotion = async (enabled: boolean) => {
    await savePreferences({ ...preferences, reduceMotion: enabled });
  };

  const colorScheme: ColorScheme = preferences.mode === 'system'
    ? (systemColorScheme ?? 'dark')
    : preferences.mode;

  const themeColors = colorScheme === 'dark' ? darkColors : lightColors;

  return {
    preferences,
    colorScheme,
    colors: themeColors,
    isDark: colorScheme === 'dark',
    isLoading,
    setMode,
    toggleTheme,
    setHighContrast,
    setReduceMotion,
  };
}

// ============================================================================
// Theme Provider (optional, for context-based theming)
// ============================================================================

interface ThemeContextValue {
  preferences: ThemePreferences;
  colorScheme: ColorScheme;
  colors: typeof lightColors | typeof darkColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  setHighContrast: (enabled: boolean) => Promise<void>;
  setReduceMotion: (enabled: boolean) => Promise<void>;
}

export { useTheme as default };
