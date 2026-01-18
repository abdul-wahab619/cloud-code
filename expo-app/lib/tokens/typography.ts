/**
 * Design Token: Typography
 * Centralized typography scale for consistent text styling
 */

import { Platform } from 'react-native';

// Font family configuration
export const fontFamily = {
  // Primary font family
  regular: Platform.select({
    ios: 'SF Pro Text',
    android: 'Roboto',
    web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  }),
  // Monospace font
  mono: Platform.select({
    ios: 'SF Mono',
    android: 'Roboto Mono',
    web: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", "Droid Sans Mono", "Source Code Pro", monospace',
  }),
  // Medium weight
  medium: Platform.select({
    ios: 'SF Pro Text',
    android: 'Roboto Medium',
    web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  }),
  // Semibold weight
  semibold: Platform.select({
    ios: 'SF Pro Text',
    android: 'Roboto',
    web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  }),
  // Bold weight
  bold: Platform.select({
    ios: 'SF Pro Display',
    android: 'Roboto',
    web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  }),
} as const;

// Font sizes (in points)
export const fontSize = {
  // Display sizes
  displayLarge: 36,
  displayMedium: 30,
  displaySmall: 24,

  // Heading sizes
  headlineLarge: 22,
  headlineMedium: 20,
  headlineSmall: 18,

  // Title sizes
  titleLarge: 17,
  titleMedium: 16,
  titleSmall: 15,

  // Body sizes
  bodyLarge: 16,
  bodyMedium: 14,
  bodySmall: 13,

  // Label sizes
  labelLarge: 14,
  labelMedium: 12,
  labelSmall: 11,

  // Caption sizes
  caption: 12,
  overline: 10,
} as const;

// Line heights (relative to font size)
export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// Font weights
export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;

// Letter spacing
export const letterSpacing = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
} as const;

// Text style presets
export const textStyle = {
  // Display text
  displayLarge: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.displayLarge,
    fontWeight: fontWeight.bold,
    lineHeight: fontSize.displayLarge * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  displayMedium: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.displayMedium,
    fontWeight: fontWeight.bold,
    lineHeight: fontSize.displayMedium * lineHeight.tight,
  },
  displaySmall: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.displaySmall,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.displaySmall * lineHeight.tight,
  },

  // Headlines
  headlineLarge: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.headlineLarge,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.headlineLarge * lineHeight.normal,
  },
  headlineMedium: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.headlineMedium,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.headlineMedium * lineHeight.normal,
  },
  headlineSmall: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.headlineSmall,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.headlineSmall * lineHeight.normal,
  },

  // Titles
  titleLarge: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.titleLarge,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.titleLarge * lineHeight.normal,
  },
  titleMedium: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.titleMedium,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.titleMedium * lineHeight.normal,
  },
  titleSmall: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.titleSmall,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.titleSmall * lineHeight.normal,
  },

  // Body text
  bodyLarge: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.bodyLarge * lineHeight.normal,
  },
  bodyMedium: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyMedium,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.bodyMedium * lineHeight.normal,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySmall,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.bodySmall * lineHeight.normal,
  },

  // Labels
  labelLarge: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.labelLarge,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.labelLarge * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  },
  labelMedium: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.labelMedium,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.labelMedium * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  },
  labelSmall: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.labelSmall,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.labelSmall * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase' as const,
  },

  // Monospace (code)
  code: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.bodySmall,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.bodySmall * lineHeight.normal,
  },

  // Caption
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
} as const;

export type TextStyleKey = keyof typeof textStyle;
