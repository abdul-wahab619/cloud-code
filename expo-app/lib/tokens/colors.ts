/**
 * Design Token: Colors
 * Centralized color palette for consistent theming
 */

export const colors = {
  // Primary colors
  primary: '#6366f1',      // Indigo 500
  primaryLight: '#818cf8',  // Indigo 400
  primaryDark: '#4f46e5',   // Indigo 600

  // Secondary colors
  secondary: '#64748b',     // Slate 500
  secondaryForeground: '#f8fafc', // Slate 50

  // Brand/Accent
  brand: '#6366f1',         // Same as primary
  brandLight: '#818cf8',
  brandDark: '#4f46e5',

  // Semantic colors
  success: '#22c55e',       // Green 500
  successLight: '#86efac',
  successDark: '#16a34a',

  warning: '#f59e0b',       // Amber 500
  warningLight: '#fbbf24',
  warningDark: '#d97706',

  error: '#ef4444',         // Red 500
  errorLight: '#f87171',
  errorDark: '#dc2626',

  info: '#3b82f6',          // Blue 500
  infoLight: '#60a5fa',
  infoDark: '#2563eb',

  // Neutral grayscale (Slate)
  background: '#09090b',    // Zinc 950
  foreground: '#fafafa',    // Zinc 50
  card: '#18181b',          // Zinc 900
  cardForeground: '#fafafa',

  border: '#27272a',        // Zinc 800
  input: '#27272a',
  ring: '#6366f1',

  // Muted colors
  muted: '#27272a',         // Zinc 800
  mutedForeground: '#a1a1aa', // Zinc 400

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(255, 255, 255, 0.1)',

  // GitHub colors
  github: '#fafafa',
  githubDark: '#0d1117',

  // Status colors
  online: '#22c55e',
  offline: '#6b7280',
  busy: '#ef4444',
  away: '#f59e0b',
} as const;

export type Color = keyof typeof colors;

// Semantic color aliases for common use cases
export const semantic = {
  text: {
    primary: colors.foreground,
    secondary: colors.mutedForeground,
    disabled: colors.mutedForeground,
    inverse: colors.background,
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
  },
  background: {
    default: colors.background,
    paper: colors.card,
    elevated: colors.card,
    overlay: colors.overlay,
  },
  border: {
    default: colors.border,
    focus: colors.ring,
    error: colors.error,
    success: colors.success,
  },
  interactive: {
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  },
} as const;
