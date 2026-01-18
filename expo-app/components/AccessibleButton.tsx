/**
 * AccessibleButton Component
 *
 * A fully accessible button component with comprehensive support for:
 * - Accessibility labels and hints
 * - Accessibility roles and states
 * - Screen reader announcements
 * - Keyboard navigation (web)
 * - Focus management
 * - Haptic feedback
 * - Test mode helpers
 */

import React, { useRef, forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  PressableStateCallbackType,
  AccessibilityState,
  GestureResponderEvent,
} from 'react-native';
import { colors } from '../lib/styles';
import { haptics } from '../lib/haptics';
import {
  a11y,
  AccessibilityLabelConfig,
  generateTestId,
  logA11yAction,
  isTestMode,
} from '../lib/accessibility';

// ============================================================================
// TYPES
// ============================================================================

export interface AccessibleButtonProps {
  /** Primary text label for the button */
  label: string;
  /** Additional hint for screen readers */
  accessibilityHint?: string;
  /** Accessibility role override */
  accessibilityRole?: 'button' | 'link' | 'text';
  /** Accessibility state */
  accessibilityState?: AccessibilityState;
  /** Callback when button is pressed */
  onPress?: (event: GestureResponderEvent) => void;
  /** Callback when button is long pressed */
  onLongPress?: (event: GestureResponderEvent) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether the button is in loading state */
  loading?: boolean;
  /** Icon to display before the label */
  icon?: React.ReactNode;
  /** Icon to display after the label */
  iconRight?: React.ReactNode;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Full width button */
  fullWidth?: boolean;
  /** Haptic feedback type */
  haptic?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'none';
  /** Custom styles */
  style?: any;
  /** Test ID for testing */
  testID?: string;
  /** Custom accessibility label (overrides label) */
  accessibilityLabel?: string;
  /** Accessibility value (for toggles, etc.) */
  accessibilityValue?: { text?: string; min?: number; max?: number; now?: number };
  /** Callback for accessibility tap */
  onAccessibilityTap?: () => void;
  /** Whether button is selected */
  selected?: boolean;
  /** Whether button is checked (for toggle buttons) */
  checked?: boolean;
  /** Whether button is expanded (for dropdowns, etc.) */
  expanded?: boolean;
  /** Announce button action to screen readers */
  announceAction?: boolean;
  /** Announce message */
  announceMessage?: string;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sm: {
    height: 36,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 6,
  },
  md: {
    height: 44,
    paddingHorizontal: 20,
    paddingVertical: 11,
    gap: 8,
  },
  lg: {
    height: 52,
    paddingHorizontal: 28,
    paddingVertical: 14,
    gap: 10,
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  smText: {
    fontSize: 14,
    lineHeight: 20,
  },
  mdText: {
    fontSize: 16,
    lineHeight: 22,
  },
  lgText: {
    fontSize: 18,
    lineHeight: 24,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  focusRing: {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineColor: colors.brand,
    outlineOffset: 2,
  },
});

const VARIANT_STYLES: Record<
  Exclude<AccessibleButtonProps['variant'], undefined>,
  { backgroundColor: string; borderColor?: string; color: string }
> = {
  primary: {
    backgroundColor: colors.brand,
    color: colors.background,
  },
  secondary: {
    backgroundColor: colors.secondary,
    color: colors.foreground,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    color: colors.foreground,
  },
  ghost: {
    backgroundColor: 'transparent',
    color: colors.foreground,
  },
  destructive: {
    backgroundColor: colors.error,
    color: '#fff',
  },
  success: {
    backgroundColor: colors.success,
    color: '#fff',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export const AccessibleButton = forwardRef<any, AccessibleButtonProps>(
  function AccessibleButton(
    {
      label,
      accessibilityHint,
      accessibilityRole = 'button',
      accessibilityState: customAccessibilityState,
      onPress,
      onLongPress,
      disabled = false,
      loading = false,
      icon,
      iconRight,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      haptic = 'light',
      style,
      testID,
      accessibilityLabel: customAccessibilityLabel,
      accessibilityValue,
      onAccessibilityTap,
      selected,
      checked,
      expanded,
      announceAction = false,
      announceMessage,
    },
    ref
  ) {
    const pressableRef = useRef<any>(null);

    // Generate test ID if in test mode
    const generatedTestID = testID || (isTestMode() ? generateTestId('button', label) : undefined);

    // Build accessibility state
    const accessibilityState: AccessibilityState = {
      disabled: disabled || loading,
      selected,
      checked,
      expanded,
      ...customAccessibilityState,
    };

    // Build accessibility label
    const finalAccessibilityLabel = customAccessibilityLabel || label;

    // Build accessibility hint
    const finalAccessibilityHint =
      accessibilityHint || (disabled ? 'Disabled' : 'Double tap to activate');

    // Handle press with accessibility features
    const handlePress = (event: GestureResponderEvent) => {
      if (disabled || loading) {
        logA11yAction('AccessibleButton', 'press blocked', { disabled, loading });
        return;
      }

      // Trigger haptic feedback
      if (haptic !== 'none') {
        // Map haptic string to actual haptics method
        switch (haptic) {
          case 'light':
            haptics.buttonPress();
            break;
          case 'medium':
            haptics.modalOpen();
            break;
          case 'heavy':
            // No direct equivalent, use error
            haptics.error();
            break;
          case 'success':
            haptics.success();
            break;
          case 'warning':
            haptics.warning();
            break;
          case 'error':
            haptics.error();
            break;
        }
      }

      // Log action in test mode
      logA11yAction('AccessibleButton', 'pressed', { label });

      // Announce action if enabled
      if (announceAction) {
        const message = announceMessage || `${label} activated`;
        a11y.announce(message);
      }

      onPress?.(event);
    };

    // Handle long press with accessibility features
    const handleLongPress = (event: GestureResponderEvent) => {
      if (disabled || loading) return;

      logA11yAction('AccessibleButton', 'long pressed', { label });

      if (announceAction) {
        const message = announceMessage || `${label} long press activated`;
        a11y.announce(message);
      }

      onLongPress?.(event);
    };

    // Handle accessibility tap
    const handleAccessibilityTap = () => {
      logA11yAction('AccessibleButton', 'accessibility tap', { label });
      onAccessibilityTap?.();
    };

    // Style based on variant and state
    const variantStyle = VARIANT_STYLES[variant];
    const sizeStyle = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md;
    const textSizeStyle = size === 'sm' ? styles.smText : size === 'lg' ? styles.lgText : styles.mdText;

    // Render button
    return (
      <Pressable
        ref={(r) => {
          pressableRef.current = r;
          if (typeof ref === 'function') {
            ref(r);
          } else if (ref) {
            ref.current = r;
          }
        }}
        onPress={handlePress}
        onLongPress={onLongPress ? handleLongPress : undefined}
        disabled={disabled || loading}
        testID={generatedTestID}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={finalAccessibilityLabel}
        accessibilityHint={finalAccessibilityHint}
        accessibilityState={accessibilityState}
        accessibilityValue={accessibilityValue}
        onAccessibilityTap={onAccessibilityTap ? handleAccessibilityTap : undefined}
        accessibilityLiveRegion="polite"
        accessible={true}
        style={({ pressed }: PressableStateCallbackType) => [
          styles.button,
          sizeStyle,
          variantStyle.backgroundColor && { backgroundColor: variantStyle.backgroundColor },
          variantStyle.borderColor && {
            borderWidth: 1,
            borderColor: variantStyle.borderColor,
          },
          fullWidth && styles.fullWidth,
          {
            opacity: (disabled || loading) ? 0.5 : pressed ? 0.8 : 1,
          },
          // Note: Web focus ring would need custom implementation using useFocus hook
          style,
        ]}
      >
        {loading ? (
          <Text
            style={[styles.text, textSizeStyle, { color: variantStyle.color }]}
            accessibilityElementsHidden={true}
          >
            Loading…
          </Text>
        ) : (
          <>
            {icon && <View style={styles.icon}>{icon}</View>}
            <Text
              style={[styles.text, textSizeStyle, { color: variantStyle.color }]}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            >
              {label}
            </Text>
            {iconRight && <View style={styles.icon}>{iconRight}</View>}
          </>
        )}
      </Pressable>
    );
  }
);

// ============================================================================
// CONVENIENCE COMPONENTS
// ============================================================================

/**
 * A primary accessible button
 */
export function PrimaryButton(props: Omit<AccessibleButtonProps, 'variant'>) {
  return <AccessibleButton {...props} variant="primary" />;
}

/**
 * A secondary accessible button
 */
export function SecondaryButton(props: Omit<AccessibleButtonProps, 'variant'>) {
  return <AccessibleButton {...props} variant="secondary" />;
}

/**
 * A destructive action button
 */
export function DestructiveButton(props: Omit<AccessibleButtonProps, 'variant'>) {
  return <AccessibleButton {...props} variant="destructive" haptic="error" />;
}

/**
 * A success/action confirmation button
 */
export function SuccessButton(props: Omit<AccessibleButtonProps, 'variant'>) {
  return <AccessibleButton {...props} variant="success" haptic="success" />;
}

/**
 * An icon-only accessible button
 */
export function IconButton({
  icon,
  label,
  ...props
}: Omit<AccessibleButtonProps, 'icon' | 'label'> & {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <AccessibleButton
      {...props}
      icon={icon}
      label=""
      accessibilityLabel={label}
      variant="ghost"
      size="md"
    />
  );
}

/**
 * A link-style accessible button
 */
export function LinkButton({
  label,
  onPress,
  ...props
}: Omit<AccessibleButtonProps, 'variant' | 'accessibilityRole'> & {
  label: string;
  onPress: () => void;
}) {
  return (
    <AccessibleButton
      {...props}
      label={label}
      onPress={onPress}
      variant="ghost"
      accessibilityRole="link"
      size="sm"
    />
  );
}

/**
 * A toggle button (checked/unchecked state)
 */
export function ToggleButton({
  label,
  checked = false,
  onValueChange,
  ...props
}: Omit<AccessibleButtonProps, 'checked' | 'accessibilityRole' | 'accessibilityState'> & {
  label: string;
  checked: boolean;
  onValueChange: (checked: boolean) => void;
}) {
  return (
    <AccessibleButton
      {...props}
      label={label}
      checked={checked}
      accessibilityRole="button"
      accessibilityState={{ checked }}
      accessibilityValue={{ text: checked ? 'On' : 'Off' }}
      accessibilityHint={`Double tap to ${checked ? 'turn off' : 'turn on'} ${label.toLowerCase()}`}
      onPress={() => onValueChange(!checked)}
      haptic="light"
      announceAction
      announceMessage={`${label} ${checked ? 'turned off' : 'turned on'}`}
    />
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AccessibleButton;
