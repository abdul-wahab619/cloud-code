/**
 * AccessiblePressable Component
 *
 * A fully accessible pressable component with comprehensive support for:
 * - Accessibility labels and hints
 * - Accessibility roles and states
 * - Screen reader announcements
 * - Keyboard navigation (web)
 * - Focus management
 * - Custom accessibility actions
 * - Test mode helpers
 *
 * This is a lower-level component than AccessibleButton and provides more
 * flexibility for custom interactive elements.
 */

import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  PressableStateCallbackType,
  AccessibilityState,
  AccessibilityActionEvent,
  AccessibilityActionName,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import {
  a11y,
  generateTestId,
  logA11yAction,
  isTestMode,
  requestFocus,
} from '../lib/accessibility';

// ============================================================================
// TYPES
// ============================================================================

export interface AccessiblePressableProps {
  /** Content to render inside the pressable */
  children: React.ReactNode | ((state: PressableStateCallbackType) => React.ReactNode);
  /** Primary accessibility label */
  accessibilityLabel: string;
  /** Additional hint for screen readers */
  accessibilityHint?: string;
  /** Accessibility role */
  accessibilityRole?:
    | 'none'
    | 'button'
    | 'link'
    | 'search'
    | 'image'
    | 'text'
    | 'adjustable'
    | 'imagebutton'
    | 'header'
    | 'summary'
    | 'alert'
    | 'checkbox'
    | 'combobox'
    | 'menu'
    | 'menuitem'
    | 'progressbar'
    | 'radio'
    | 'radiogroup'
    | 'scrollbar'
    | 'spinbutton'
    | 'switch'
    | 'tab'
    | 'tablist'
    | 'timer'
    | 'toolbar'
    | 'list';
  /** Accessibility state */
  accessibilityState?: AccessibilityState;
  /** Accessibility value (for sliders, progress bars, etc.) */
  accessibilityValue?: { text?: string; min?: number; max?: number; now?: number };
  /** Callback when pressed */
  onPress?: (event: GestureResponderEvent) => void;
  /** Callback when long pressed */
  onLongPress?: (event: GestureResponderEvent) => void;
  /** Press in callback */
  onPressIn?: (event: GestureResponderEvent) => void;
  /** Press out callback */
  onPressOut?: (event: GestureResponderEvent) => void;
  /** Whether the pressable is disabled */
  disabled?: boolean;
  /** Custom styles */
  style?: any;
  /** Style callback for pressed/pressed states */
  styleState?: (state: PressableStateCallbackType) => any;
  /** Test ID for testing */
  testID?: string;
  /** Callback for accessibility tap */
  onAccessibilityTap?: () => void;
  /** Callback for magic tap (iOS) */
  onMagicTap?: () => void;
  /** Callback for escape key (Android) */
  onEscape?: () => void;
  /** Custom accessibility actions */
  accessibilityActions?: Array<{ name: AccessibilityActionName; label?: string }>;
  /** Callback when accessibility action is performed */
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  /** Whether this element should be accessible */
  accessible?: boolean;
  /** Live region announcement priority */
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  /** Whether to announce screen reader focus */
  announceFocus?: boolean;
  /** Focus strategy */
  focusable?: boolean;
  /** Web: Tab index */
  tabIndex?: number;
  /** Web: ARIA label */
  ariaLabel?: string;
  /** Web: ARIA describedby */
  ariaDescribedBy?: string;
  /** Semantic component type */
  semanticType?:
    | 'navigation'
    | 'header'
    | 'main'
    | 'footer'
    | 'aside'
    | 'section'
    | 'article'
    | 'figure'
    | 'dialog'
    | 'alertdialog'
    | 'tooltip';
  /** Minimum touch target size (default 44) */
  minTouchTarget?: number;
  /** Haptic feedback on press */
  hapticFeedback?: boolean;
  /** Announce action to screen readers */
  announceAction?: boolean;
  /** Custom announcement message */
  announceMessage?: string;
  /** Should trap focus (for modals) */
  trapFocus?: boolean;
  /** Ref for focus management */
  focusRef?: React.RefObject<any>;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Layout callback for measurements */
  onLayout?: (event: LayoutChangeEvent) => void;
}

export interface AccessiblePressableRef {
  /** Focus the pressable */
  focus: () => Promise<boolean>;
  /** Check if focused */
  isFocused: () => boolean;
  /** Get the underlying node handle */
  getHandle: () => any;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusRing: {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineColor: '#6366f1',
    outlineOffset: 2,
  },
  minTouchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
});

// ============================================================================
// COMPONENT
// ============================================================================

export const AccessiblePressable = forwardRef<
  AccessiblePressableRef,
  AccessiblePressableProps
>(function AccessiblePressable(
  {
    children,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole = 'button',
    accessibilityState: customAccessibilityState,
    accessibilityValue,
    onPress,
    onLongPress,
    onPressIn,
    onPressOut,
    disabled = false,
    style,
    styleState,
    testID,
    onAccessibilityTap,
    onMagicTap,
    onEscape,
    accessibilityActions,
    onAccessibilityAction,
    accessible = true,
    accessibilityLiveRegion = 'polite',
    announceFocus = false,
    focusable,
    tabIndex,
    ariaLabel,
    ariaDescribedBy,
    semanticType,
    minTouchTarget = 44,
    hapticFeedback = false,
    announceAction = false,
    announceMessage,
    trapFocus = false,
    focusRef: externalFocusRef,
    autoFocus = false,
    onLayout,
  },
  ref
) {
  const internalRef = useRef<any>(null);
  const isFocusedRef = useRef(false);

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    focus: async () => {
      const result = await requestFocus(internalRef);
      if (result && announceFocus) {
        a11y.announce(`Focused on ${accessibilityLabel}`);
      }
      return result;
    },
    isFocused: () => isFocusedRef.current,
    getHandle: () => internalRef.current,
  }));

  // Also sync with external focus ref
  useImperativeHandle(externalFocusRef, () => ({
    focus: async () => {
      const result = await requestFocus(internalRef);
      if (result && announceFocus) {
        a11y.announce(`Focused on ${accessibilityLabel}`);
      }
      return result;
    },
    isFocused: () => isFocusedRef.current,
    getHandle: () => internalRef.current,
  }));

  // Auto-focus on mount
  React.useEffect(() => {
    if (autoFocus && internalRef.current) {
      requestFocus(internalRef);
    }
  }, [autoFocus]);

  // Generate test ID if in test mode
  const generatedTestID = testID || (isTestMode() ? generateTestId('pressable', accessibilityLabel) : undefined);

  // Build accessibility state
  const accessibilityState: AccessibilityState = {
    disabled,
    ...customAccessibilityState,
  };

  // Build default accessibility actions
  const defaultActions: Array<{ name: AccessibilityActionName; label?: string }> = [
    { name: 'activate', label: 'Activate' },
  ];

  // Combine custom actions with defaults
  const combinedActions = accessibilityActions
    ? [...defaultActions, ...accessibilityActions]
    : defaultActions;

  // Handle press with accessibility features
  const handlePress = (event: GestureResponderEvent) => {
    if (disabled) {
      logA11yAction('AccessiblePressable', 'press blocked', {
        accessibilityLabel,
        disabled,
      });
      return;
    }

    logA11yAction('AccessiblePressable', 'pressed', { accessibilityLabel });

    if (announceAction) {
      const message = announceMessage || `${accessibilityLabel} activated`;
      a11y.announce(message, accessibilityLiveRegion === 'assertive' ? 'assertive' : 'polite');
    }

    onPress?.(event);
  };

  // Handle long press with accessibility features
  const handleLongPress = (event: GestureResponderEvent) => {
    if (disabled) return;

    logA11yAction('AccessiblePressable', 'long pressed', { accessibilityLabel });

    if (announceAction) {
      const message = `${accessibilityLabel} long press activated`;
      a11y.announce(message, 'polite');
    }

    onLongPress?.(event);
  };

  // Handle press in
  const handlePressIn = (event: GestureResponderEvent) => {
    isFocusedRef.current = true;
    logA11yAction('AccessiblePressable', 'press in', { accessibilityLabel });
    onPressIn?.(event);
  };

  // Handle press out
  const handlePressOut = (event: GestureResponderEvent) => {
    isFocusedRef.current = false;
    logA11yAction('AccessiblePressable', 'press out', { accessibilityLabel });
    onPressOut?.(event);
  };

  // Handle accessibility tap
  const handleAccessibilityTap = () => {
    logA11yAction('AccessiblePressable', 'accessibility tap', { accessibilityLabel });
    onAccessibilityTap?.();
  };

  // Handle magic tap (iOS - performs default action)
  const handleMagicTap = () => {
    logA11yAction('AccessiblePressable', 'magic tap', { accessibilityLabel });
    onMagicTap?.();
  };

  // Handle accessibility action
  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    logA11yAction('AccessiblePressable', 'accessibility action', {
      accessibilityLabel,
      action: event.nativeEvent.actionName,
    });

    if (onAccessibilityAction) {
      onAccessibilityAction(event);
    } else {
      // Default action handling
      switch (event.nativeEvent.actionName) {
        case 'activate':
          if (onPress && !disabled) {
            onPress({} as GestureResponderEvent);
          }
          break;
        case 'longpress':
          if (onLongPress && !disabled) {
            onLongPress({} as GestureResponderEvent);
          }
          break;
        case 'escape':
          if (onEscape) {
            onEscape();
          }
          break;
        default:
          break;
      }
    }
  };

  // Style callback for press states
  const getStyle = (state: PressableStateCallbackType) => {
    const baseStyle: any[] = [
      styles.container,
      minTouchTarget > 0 && styles.minTouchTarget,
      { minHeight: minTouchTarget, minWidth: minTouchTarget },
      style,
    ];

    if (styleState) {
      baseStyle.push(styleState(state));
    }

    // Note: Focus ring would need custom implementation using useFocus hook

    // Add opacity for disabled/pressed
    if (disabled) {
      baseStyle.push({ opacity: 0.5 });
    } else if (state.pressed) {
      baseStyle.push({ opacity: 0.8 });
    }

    return baseStyle;
  };

  // Build props for web-specific attributes
  const webProps: Record<string, any> = {};
  if (tabIndex !== undefined) {
    webProps.tabIndex = tabIndex;
  }
  if (ariaLabel) {
    webProps['aria-label'] = ariaLabel;
  }
  if (ariaDescribedBy) {
    webProps['aria-describedby'] = ariaDescribedBy;
  }
  if (focusable !== undefined) {
    webProps.focusable = focusable;
  }

  return (
    <Pressable
      ref={internalRef}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      testID={generatedTestID}
      accessibilityLabel={ariaLabel || accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityValue={accessibilityValue}
      accessibilityActions={combinedActions}
      onAccessibilityAction={handleAccessibilityAction}
      onAccessibilityTap={onAccessibilityTap ? handleAccessibilityTap : undefined}
      onMagicTap={onMagicTap ? handleMagicTap : undefined}
      accessible={accessible}
      accessibilityLiveRegion={accessibilityLiveRegion}
      style={getStyle}
      onLayout={onLayout}
      {...webProps}
    >
      {typeof children === 'function'
        ? (state: PressableStateCallbackType) => children(state)
        : children}
    </Pressable>
  );
});

// ============================================================================
// HOOK: Use Accessible Pressable Ref
// ============================================================================

/**
 * Hook to manage focus for an AccessiblePressable
 */
export function useAccessiblePressableRef() {
  const ref = React.useRef<AccessiblePressableRef>(null);

  const focus = React.useCallback(async () => {
    if (ref.current) {
      await ref.current.focus();
    }
  }, []);

  const isFocused = React.useCallback(() => {
    return ref.current?.isFocused() ?? false;
  }, []);

  return { ref, focus, isFocused };
}

// ============================================================================
// CONVENIENCE COMPONENTS
// ============================================================================

/**
 * Accessible card pressable
 */
export function AccessibleCard({
  children,
  title,
  selected,
  onPress,
  ...props
}: Omit<AccessiblePressableProps, 'accessibilityLabel' | 'accessibilityRole'> & {
  title: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <AccessiblePressable
      {...props}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={props.accessibilityState || { selected }}
      accessibilityHint={selected ? 'Selected, double tap to view details' : 'Double tap to select'}
      onPress={onPress}
      style={[props.style, styles.minTouchTarget]}
    >
      {children}
    </AccessiblePressable>
  );
}

/**
 * Accessible list item pressable
 */
export function AccessibleListItem({
  children,
  label,
  position,
  total,
  selected,
  onPress,
  ...props
}: Omit<AccessiblePressableProps, 'accessibilityLabel' | 'accessibilityRole'> & {
  label: string;
  position?: number;
  total?: number;
  selected?: boolean;
  onPress: () => void;
}) {
  const positionText =
    position !== undefined && total !== undefined
      ? `Item ${position} of ${total}`
      : position !== undefined
        ? `Item ${position}`
        : undefined;

  return (
    <AccessiblePressable
      {...props}
      accessibilityLabel={positionText ? `${label}, ${positionText}` : label}
      accessibilityRole="button"
      accessibilityState={props.accessibilityState || { selected }}
      accessibilityHint={
        selected
          ? 'Selected, double tap to view details'
          : 'Double tap to select and view details'
      }
      onPress={onPress}
      style={[props.style, styles.minTouchTarget]}
    >
      {children}
    </AccessiblePressable>
  );
}

/**
 * Accessible menu item pressable
 */
export function AccessibleMenuItem({
  children,
  label,
  disabled,
  destructive = false,
  onPress,
  ...props
}: Omit<AccessiblePressableProps, 'accessibilityLabel' | 'accessibilityRole'> & {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <AccessiblePressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="menuitem"
      accessibilityState={props.accessibilityState || { disabled }}
      accessibilityHint={
        destructive
          ? 'Destructive action, double tap to confirm'
          : disabled
            ? 'Disabled'
            : 'Double tap to activate'
      }
      onPress={onPress}
      disabled={disabled}
      announceAction
      announceMessage={destructive ? `${label} confirmed` : undefined}
      style={[props.style, styles.minTouchTarget]}
    >
      {children}
    </AccessiblePressable>
  );
}

/**
 * Accessible tab pressable
 */
export function AccessibleTab({
  children,
  label,
  selected,
  panelId,
  onPress,
  ...props
}: Omit<AccessiblePressableProps, 'accessibilityLabel' | 'accessibilityRole'> & {
  label: string;
  selected: boolean;
  panelId?: string;
  onPress: () => void;
}) {
  return (
    <AccessiblePressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={props.accessibilityState || { selected, disabled: false }}
      accessibilityHint={selected ? 'Current tab' : 'Double tap to switch to this tab'}
      onPress={onPress}
      announceAction
      announceMessage={`Switched to ${label} tab`}
      style={[props.style, styles.minTouchTarget]}
    >
      {children}
    </AccessiblePressable>
  );
}

/**
 * Accessible checkbox pressable
 */
export function AccessibleCheckbox({
  children,
  label,
  checked = false,
  onValueChange,
  disabled,
  ...props
}: Omit<AccessiblePressableProps, 'accessibilityLabel' | 'accessibilityRole' | 'accessibilityState'> & {
  label: string;
  checked: boolean;
  onValueChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <AccessiblePressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityHint={`Double tap to ${checked ? 'uncheck' : 'check'}`}
      accessibilityValue={{ text: checked ? 'Checked' : 'Unchecked' }}
      onPress={() => !disabled && onValueChange(!checked)}
      disabled={disabled}
      announceAction
      announceMessage={`${label} ${checked ? 'unchecked' : 'checked'}`}
      style={[props.style, styles.minTouchTarget]}
    >
      {children}
    </AccessiblePressable>
  );
}

/**
 * Accessible radio button pressable
 */
export function AccessibleRadio({
  children,
  label,
  checked = false,
  groupName,
  onValueChange,
  disabled,
  ...props
}: Omit<AccessiblePressableProps, 'accessibilityLabel' | 'accessibilityRole' | 'accessibilityState'> & {
  label: string;
  checked: boolean;
  groupName?: string;
  onValueChange: () => void;
  disabled?: boolean;
}) {
  const fullLabel = groupName ? `${label}, ${groupName}` : label;

  return (
    <AccessiblePressable
      {...props}
      accessibilityLabel={fullLabel}
      accessibilityRole="radio"
      accessibilityState={{ selected: checked, disabled }}
      accessibilityHint={`Double tap to select ${label.toLowerCase()}`}
      onPress={() => !disabled && onValueChange()}
      disabled={disabled}
      announceAction
      announceMessage={`${label} selected`}
      style={[props.style, styles.minTouchTarget]}
    >
      {children}
    </AccessiblePressable>
  );
}

/**
 * Accessible link pressable
 */
export function AccessibleLink({
  children,
  label,
  href,
  external = false,
  onPress,
  ...props
}: Omit<AccessiblePressableProps, 'accessibilityLabel' | 'accessibilityRole'> & {
  label: string;
  href?: string;
  external?: boolean;
  onPress: () => void;
}) {
  return (
    <AccessiblePressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="link"
      accessibilityHint={external ? 'Opens in new window, double tap to visit' : 'Double tap to visit'}
      onPress={onPress}
      announceAction
      announceMessage={`Opening ${label}`}
      style={[props.style, { minHeight: 44 }]}
    >
      {children}
    </AccessiblePressable>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AccessiblePressable;
