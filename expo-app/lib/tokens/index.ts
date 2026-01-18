/**
 * Design Tokens
 * Centralized design system tokens
 */

export * from './colors';
export * from './typography';
export * from './spacing';

// Re-export commonly used tokens
import { colors } from './colors';
import { spacing, borderRadius, iconSize } from './spacing';
import { textStyle, fontWeight, fontSize } from './typography';

export const tokens = {
  colors,
  spacing,
  borderRadius,
  iconSize,
  textStyle,
  fontWeight,
  fontSize,
} as const;
