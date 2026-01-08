/**
 * Design Token: Spacing
 * Centralized spacing scale based on 4px base unit
 */

// Base spacing unit (4px)
const BASE = 4;

// Spacing scale (multiples of base unit)
export const spacing = {
  0: 0,
  0.5: BASE * 0.5,   // 2px
  1: BASE * 1,       // 4px
  1.5: BASE * 1.5,   // 6px
  2: BASE * 2,       // 8px
  2.5: BASE * 2.5,   // 10px
  3: BASE * 3,       // 12px
  3.5: BASE * 3.5,   // 14px
  4: BASE * 4,       // 16px
  5: BASE * 5,       // 20px
  6: BASE * 6,       // 24px
  7: BASE * 7,       // 28px
  8: BASE * 8,       // 32px
  9: BASE * 9,       // 36px
  10: BASE * 10,     // 40px
  11: BASE * 11,     // 44px
  12: BASE * 12,     // 48px
  14: BASE * 14,     // 56px
  16: BASE * 16,     // 64px
  18: BASE * 18,     // 72px
  20: BASE * 20,     // 80px
  24: BASE * 24,     // 96px
  28: BASE * 28,     // 112px
  32: BASE * 32,     // 128px
  36: BASE * 36,     // 144px
  40: BASE * 40,     // 160px
  44: BASE * 44,     // 176px
  48: BASE * 48,     // 192px
  52: BASE * 52,     // 208px
  56: BASE * 56,     // 224px
  60: BASE * 60,     // 240px
  64: BASE * 64,     // 256px
  72: BASE * 72,     // 288px
  80: BASE * 80,     // 320px
  96: BASE * 96,     // 384px
} as const;

// Common spacing presets
export const space = {
  // Padding
  p: {
    xs: spacing[1],      // 4px
    sm: spacing[2],      // 8px
    md: spacing[3],      // 12px
    lg: spacing[4],      // 16px
    xl: spacing[5],      // 20px
    '2xl': spacing[6],   // 24px
    '3xl': spacing[8],   // 32px
  },
  // Padding X (horizontal)
  px: {
    xs: spacing[1],      // 4px
    sm: spacing[2],      // 8px
    md: spacing[3],      // 12px
    lg: spacing[4],      // 16px
    xl: spacing[5],      // 20px
    '2xl': spacing[6],   // 24px
  },
  // Padding Y (vertical)
  py: {
    xs: spacing[1],      // 4px
    sm: spacing[2],      // 8px
    md: spacing[3],      // 12px
    lg: spacing[4],      // 16px
    xl: spacing[5],      // 20px
    '2xl': spacing[6],   // 24px
  },
  // Margin
  m: {
    xs: spacing[1],      // 4px
    sm: spacing[2],      // 8px
    md: spacing[3],      // 12px
    lg: spacing[4],      // 16px
    xl: spacing[5],      // 20px
    '2xl': spacing[6],   // 24px
  },
  // Margin X (horizontal)
  mx: {
    auto: 'auto' as const,
    xs: spacing[1],
    sm: spacing[2],
    md: spacing[3],
    lg: spacing[4],
    xl: spacing[5],
  },
  // Margin Y (vertical)
  my: {
    xs: spacing[1],
    sm: spacing[2],
    md: spacing[3],
    lg: spacing[4],
    xl: spacing[5],
  },
  // Gap (for flex/grid)
  gap: {
    xs: spacing[1],      // 4px
    sm: spacing[2],      // 8px
    md: spacing[3],      // 12px
    lg: spacing[4],      // 16px
    xl: spacing[5],      // 20px
    '2xl': spacing[6],   // 24px
  },
} as const;

// Border radius
export const borderRadius = {
  none: 0,
  xs: spacing[0.5],       // 2px
  sm: spacing[1],         // 4px
  md: spacing[1.5],       // 6px
  lg: spacing[2],         // 8px
  xl: spacing[3],         // 12px
  '2xl': spacing[4],      // 16px
  '3xl': spacing[5],      // 20px
  full: 9999,            // Pill shape
} as const;

// Icon sizes
export const iconSize = {
  xs: spacing[2],         // 8px
  sm: spacing[3],         // 12px
  md: spacing[4],         // 16px
  lg: spacing[5],         // 20px
  xl: spacing[6],         // 24px
  '2xl': spacing[8],      // 32px
  '3xl': spacing[10],     // 40px
} as const;

// Touch target minimum size (44pt - Apple HIG)
export const touchTarget = {
  min: spacing[11],       // 44px
  comfortable: spacing[12], // 48px
} as const;

export type SpacingValue = keyof typeof spacing;
