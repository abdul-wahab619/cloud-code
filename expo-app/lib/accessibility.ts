/**
 * Accessibility Utilities
 *
 * Comprehensive accessibility helpers for React Native applications.
 * Provides utilities for screen readers, focus management, accessibility
 * state management, semantic annotations, and testing.
 */

import {
  AccessibilityState,
  AccessibilityActionInfo,
  AccessibilityActionName,
  Platform,
  AccessibilityInfo,
  findNodeHandle,
  UIManager,
} from 'react-native';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Screen reader enabled state
 */
export interface ScreenReaderState {
  isEnabled: boolean;
  type: 'voiceover' | 'talkback' | 'unknown';
}

/**
 * Focus element reference
 */
export interface FocusRef {
  current: any | null;
}

/**
 * Accessibility label configuration
 */
export interface AccessibilityLabelConfig {
  /** Primary label for the element */
  label: string;
  /** Additional context hint */
  hint?: string;
  /** Current state (checked, selected, etc.) */
  state?: AccessibilityState;
  /** Role of the element */
  role?: AccessibilityRole;
  /** Value for sliders, progress bars, etc. */
  value?: AccessibilityValue;
}

/**
 * Accessibility value for range-based components
 */
export interface AccessibilityValue {
  min?: number;
  max?: number;
  now?: number;
  text?: string;
}

/**
 * Standard accessibility roles from React Native
 */
export type AccessibilityRole =
  | 'none'
  | 'button'
  | 'link'
  | 'search'
  | 'image'
  | 'keyboardkey'
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
  | 'grid'
  | 'list'
  | 'listitem';

/**
 * Semantic component type for better accessibility descriptions
 */
export type SemanticComponent =
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

/**
 * Announcement priority for screen reader messages
 */
export type AnnouncementPriority = 'polite' | 'assertive';

/**
 * Test mode state for accessibility testing
 */
export interface TestModeState {
  isEnabled: boolean;
  highlightFocus: boolean;
  showLabels: boolean;
  announceActions: boolean;
}

// ============================================================================
// SCREEN READER UTILITIES
// ============================================================================

/**
 * Check if a screen reader is currently enabled
 */
export async function isScreenReaderEnabled(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isScreenReaderEnabled();
  } catch {
    return false;
  }
}

/**
 * Get detailed screen reader state
 */
export async function getScreenReaderState(): Promise<ScreenReaderState> {
  const isEnabled = await isScreenReaderEnabled();
  return {
    isEnabled,
    type: Platform.OS === 'ios' ? 'voiceover' : 'talkback',
  };
}

/**
 * Subscribe to screen reader state changes
 */
export function subscribeToScreenReaderChange(
  callback: (isEnabled: boolean) => void
): () => void {
  const handle = AccessibilityInfo.addEventListener(
    'screenReaderChanged',
    callback
  );
  return () => handle.remove();
}

/**
 * Check if reduce motion is enabled
 */
export async function isReduceMotionEnabled(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isReduceMotionEnabled();
  } catch {
    return false;
  }
}

/**
 * Check if bold text is enabled (iOS)
 */
export async function isBoldTextEnabled(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AccessibilityInfo.isBoldTextEnabled();
  } catch {
    return false;
  }
}

/**
 * Check if grayscale is enabled
 */
export async function isGrayscaleEnabled(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isGrayscaleEnabled();
  } catch {
    return false;
  }
}

/**
 * Check if invert colors is enabled
 */
export async function isInvertColorsEnabled(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isInvertColorsEnabled();
  } catch {
    return false;
  }
}

/**
 * Check if larger text is enabled
 */
export async function isLargerTextEnabled(): Promise<boolean> {
  try {
    // @ts-expect-error - isLargerTextEnabled may not be available in all RN versions
    return await AccessibilityInfo.isLargerTextEnabled?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Get all accessibility preferences at once
 */
export async function getAccessibilityPreferences(): Promise<{
  screenReaderEnabled: boolean;
  reduceMotionEnabled: boolean;
  boldTextEnabled: boolean;
  grayscaleEnabled: boolean;
  invertColorsEnabled: boolean;
  largerTextEnabled: boolean;
}> {
  const [
    screenReaderEnabled,
    reduceMotionEnabled,
    boldTextEnabled,
    grayscaleEnabled,
    invertColorsEnabled,
    largerTextEnabled,
  ] = await Promise.all([
    isScreenReaderEnabled(),
    isReduceMotionEnabled(),
    isBoldTextEnabled(),
    isGrayscaleEnabled(),
    isInvertColorsEnabled(),
    isLargerTextEnabled(),
  ]);

  return {
    screenReaderEnabled,
    reduceMotionEnabled,
    boldTextEnabled,
    grayscaleEnabled,
    invertColorsEnabled,
    largerTextEnabled,
  };
}

// ============================================================================
// ACCESSIBILITY LABEL GENERATORS
// ============================================================================

/**
 * Generate a complete accessibility label from config
 */
export function generateAccessibilityLabel(
  config: AccessibilityLabelConfig
): {
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  accessibilityRole?: AccessibilityRole;
  accessibilityValue?: AccessibilityValue;
} {
  const { label, hint, state, role, value } = config;

  const result: {
    accessibilityLabel: string;
    accessibilityHint?: string;
    accessibilityState?: AccessibilityState;
    accessibilityRole?: AccessibilityRole;
    accessibilityValue?: AccessibilityValue;
  } = {
    accessibilityLabel: label,
  };

  if (hint) {
    result.accessibilityHint = hint;
  }

  if (state && Object.keys(state).length > 0) {
    result.accessibilityState = state;
  }

  if (role) {
    result.accessibilityRole = role;
  }

  if (value) {
    result.accessibilityValue = value;
  }

  return result;
}

/**
 * Generate label for a button with action
 */
export function generateButtonLabel(
  label: string,
  action?: string
): AccessibilityLabelConfig {
  return {
    label,
    hint: action ? `Double tap to ${action}` : undefined,
    role: 'button',
  };
}

/**
 * Generate label for a toggle/switch
 */
export function generateToggleLabel(
  label: string,
  isOn: boolean
): AccessibilityLabelConfig {
  return {
    label,
    state: { checked: isOn },
    role: 'switch',
    value: { text: isOn ? 'On' : 'Off' },
  };
}

/**
 * Generate label for a checkbox
 */
export function generateCheckboxLabel(
  label: string,
  isChecked: boolean
): AccessibilityLabelConfig {
  return {
    label,
    state: { checked: isChecked },
    role: 'checkbox',
    hint: 'Double tap to toggle',
  };
}

/**
 * Generate label for a radio button
 */
export function generateRadioLabel(
  label: string,
  isSelected: boolean,
  groupName?: string
): AccessibilityLabelConfig {
  return {
    label: groupName ? `${label}, ${groupName}` : label,
    state: { selected: isSelected },
    role: 'radio',
    hint: isSelected
      ? 'Selected, double tap to deselect'
      : 'Not selected, double tap to select',
  };
}

/**
 * Generate label for a tab
 */
export function generateTabLabel(
  label: string,
  isSelected: boolean
): AccessibilityLabelConfig {
  return {
    label,
    state: { selected: isSelected },
    role: 'tab',
    hint: isSelected ? 'Current tab' : 'Double tap to switch to this tab',
  };
}

/**
 * Generate label for a progress bar
 */
export function generateProgressLabel(
  label: string,
  current: number,
  total: number
): AccessibilityLabelConfig {
  const percentage = Math.round((current / total) * 100);
  return {
    label: `${label}: ${percentage} percent`,
    role: 'progressbar',
    value: { now: current, min: 0, max: total },
  };
}

/**
 * Generate label for a slider
 */
export function generateSliderLabel(
  label: string,
  value: number,
  min: number = 0,
  max: number = 100
): AccessibilityLabelConfig {
  return {
    label: `${label}: ${value}`,
    role: 'adjustable',
    hint: `Swipe up or down to adjust. Current value: ${value}. Minimum: ${min}. Maximum: ${max}.`,
    value: { now: value, min, max },
  };
}

/**
 * Generate label for a search input
 */
export function generateSearchLabel(
  placeholder: string,
  value?: string
): AccessibilityLabelConfig {
  return {
    label: 'Search',
    hint: value ? `Current search: ${value}` : placeholder,
    role: 'search',
  };
}

/**
 * Generate label for a link
 */
export function generateLinkLabel(
  label: string,
  destination?: string
): AccessibilityLabelConfig {
  return {
    label,
    hint: destination ? `Opens ${destination}` : 'Double tap to open',
    role: 'link',
  };
}

/**
 * Generate label for an image
 */
export function generateImageLabel(
  altText: string,
  isDecorative: boolean = false
): AccessibilityLabelConfig {
  if (isDecorative) {
    return {
      label: '',
      role: 'none',
    };
  }
  return {
    label: altText,
    role: 'image',
  };
}

/**
 * Generate label for a list item with position
 */
export function generateListItemLabel(
  label: string,
  position: number,
  total: number
): AccessibilityLabelConfig {
  return {
    label: `${label}, item ${position} of ${total}`,
    role: 'listitem',
  };
}

/**
 * Generate label for a navigation element
 */
export function generateNavigationLabel(
  label: string,
  destination: string,
  isCurrent: boolean = false
): AccessibilityLabelConfig {
  return {
    label: isCurrent ? `${label}, current page` : label,
    hint: `Navigate to ${destination}`,
    role: 'link',
    state: isCurrent ? { selected: true } : undefined,
  };
}

/**
 * Generate label for an alert/banner
 */
export function generateAlertLabel(
  message: string,
  type?: 'success' | 'error' | 'warning' | 'info'
): AccessibilityLabelConfig {
  const prefix =
    type === 'success'
      ? 'Success'
      : type === 'error'
        ? 'Error'
        : type === 'warning'
          ? 'Warning'
          : type === 'info'
            ? 'Information'
            : 'Alert';

  return {
    label: `${prefix}: ${message}`,
    role: 'alert',
  };
}

/**
 * Generate label for a modal/dialog
 */
export function generateModalLabel(title: string, message?: string): AccessibilityLabelConfig {
  return {
    label: title,
    hint: message,
    role: 'none',
  };
}

// ============================================================================
// FOCUS MANAGEMENT HELPERS
// ============================================================================

/**
 * Focus a React Native component ref
 */
export function focusRef(ref: FocusRef): boolean {
  if (!ref.current) return false;

  try {
    const nodeHandle = findNodeHandle(ref.current);
    if (nodeHandle) {
      if (Platform.OS === 'android') {
        // @ts-expect-error - Platform-specific Android API
        UIManager.sendAccessibilityEvent(
          nodeHandle,
          // @ts-expect-error - Platform-specific Android API
          UIManager.AccessibilityEventTypes?.typeViewFocused
        );
      }
      return true;
    }
  } catch (error) {
    console.warn('Focus error:', error);
  }
  return false;
}

/**
 * Set accessibility focus on a component (Android)
 */
export function setAccessibilityFocus(ref: FocusRef): boolean {
  if (!ref.current || Platform.OS !== 'android') return false;

  try {
    const nodeHandle = findNodeHandle(ref.current);
    if (nodeHandle) {
      // @ts-expect-error - Platform-specific Android API
      UIManager.sendAccessibilityEvent(
        nodeHandle,
        // @ts-expect-error - Platform-specific Android API
        UIManager.AccessibilityEventTypes?.typeViewAccessibilityFocused
      );
      return true;
    }
  } catch (error) {
    console.warn('Accessibility focus error:', error);
  }
  return false;
}

/**
 * Request screen reader focus on an element
 */
export function requestFocus(ref: FocusRef): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ref.current) {
      resolve(false);
      return;
    }

    try {
      const nodeHandle = findNodeHandle(ref.current);
      if (nodeHandle) {
        // Small delay to ensure focus completes
        setTimeout(() => {
          const result = setAccessibilityFocus(ref);
          resolve(result);
        }, 100);
      } else {
        resolve(false);
      }
    } catch {
      resolve(false);
    }
  });
}

/**
 * Clear focus from current element
 */
export function clearFocus(): void {
  try {
    if (Platform.OS === 'android') {
      // @ts-expect-error - Platform-specific API
      UIManager.dismissPendingKeyboard();
    }
  } catch (error) {
    console.warn('Clear focus error:', error);
  }
}

// ============================================================================
// ACCESSIBILITY STATE HELPERS
// ============================================================================

/**
 * Create an accessibility state object
 */
export function createAccessibilityState(
  state: Partial<AccessibilityState>
): AccessibilityState {
  return state;
}

/**
 * Merge multiple accessibility states
 */
export function mergeAccessibilityStates(
  ...states: (AccessibilityState | undefined)[]
): AccessibilityState {
  return states.reduce<AccessibilityState>(
    (acc, state) => ({ ...acc, ...state }),
    {}
  ) as AccessibilityState;
}

/**
 * Create disabled state
 */
export function disabledState(isDisabled: boolean = true): AccessibilityState {
  return { disabled: isDisabled };
}

/**
 * Create selected state
 */
export function selectedState(isSelected: boolean = true): AccessibilityState {
  return { selected: isSelected };
}

/**
 * Create checked state
 */
export function checkedState(isChecked: boolean = true): AccessibilityState {
  return { checked: isChecked };
}

/**
 * Create busy/expanded state
 */
export function busyState(isBusy: boolean = true): AccessibilityState {
  return { busy: isBusy };
}

/**
 * Create expanded state
 */
export function expandedState(isExpanded: boolean = true): AccessibilityState {
  return { expanded: isExpanded };
}

/**
 * Get combined state for a disabled element
 */
export function getDisabledState(
  baseState?: AccessibilityState
): AccessibilityState {
  return mergeAccessibilityStates(baseState, disabledState());
}

/**
 * Get combined state for a loading element
 */
export function getLoadingState(
  isLoading: boolean,
  baseState?: AccessibilityState
): AccessibilityState {
  return mergeAccessibilityStates(baseState, {
    busy: isLoading,
    disabled: isLoading,
  });
}

// ============================================================================
// SEMANTIC COMPONENT ANNOTATIONS
// ============================================================================

/**
 * Get accessibility role for semantic component
 */
export function getSemanticRole(
  component: SemanticComponent
): AccessibilityRole | undefined {
  const roleMap: Record<SemanticComponent, AccessibilityRole | undefined> = {
    navigation: 'none',
    header: 'header',
    main: 'none',
    footer: 'none',
    aside: 'none',
    section: 'none',
    article: 'none',
    figure: 'image',
    dialog: 'none',
    alertdialog: 'alert',
    tooltip: 'none',
  };
  return roleMap[component];
}

/**
 * Get accessibility traits for semantic component
 */
export function getSemanticTraits(component: SemanticComponent): string[] {
  const traitsMap: Record<SemanticComponent, string[]> = {
    navigation: ['header', 'startsMediaSession'],
    header: ['header'],
    main: ['none'],
    footer: ['none'],
    aside: ['none'],
    section: ['none'],
    article: ['none'],
    figure: ['none'],
    dialog: ['modal', 'updatesFrequently'],
    alertdialog: ['alert'],
    tooltip: ['none', 'popup'],
  };
  return traitsMap[component];
}

/**
 * Create semantic component props
 */
export function createSemanticProps(component: SemanticComponent, label?: string) {
  return {
    accessibilityRole: getSemanticRole(component),
    accessibilityLabel: label,
    accessible: true,
  };
}

/**
 * Mark a region as a navigation landmark
 */
export function navigationRegion(label?: string) {
  return createSemanticProps('navigation', label || 'Navigation');
}

/**
 * Mark a region as main content
 */
export function mainRegion(label?: string) {
  return createSemanticProps('main', label || 'Main content');
}

/**
 * Mark a region as complementary content
 */
export function complementaryRegion(label?: string) {
  return createSemanticProps('aside', label || 'Additional information');
}

/**
 * Mark a region as a dialog
 */
export function dialogRegion(title: string) {
  return {
    ...createSemanticProps('dialog'),
    accessibilityLabel: title,
    accessibilityRole: 'none' as AccessibilityRole,
  };
}

// ============================================================================
// ANNOUNCEMENT UTILITIES
// ============================================================================

/**
 * Announce a message to screen readers
 * Uses a visually hidden accessibilityLiveRegion element
 */
export function announce(message: string, priority: AnnouncementPriority = 'polite'): void {
  // For React Native, we use AccessibilityInfo.announceForAccessibility
  try {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  } catch (error) {
    console.warn('Announcement failed:', error);
  }
}

/**
 * Announce a success message
 */
export function announceSuccess(message: string): void {
  announce(`Success: ${message}`, 'polite');
}

/**
 * Announce an error message
 */
export function announceError(message: string): void {
  announce(`Error: ${message}`, 'assertive');
}

/**
 * Announce a warning message
 */
export function announceWarning(message: string): void {
  announce(`Warning: ${message}`, 'assertive');
}

/**
 * Announce a state change
 */
export function announceStateChange(from: string, to: string): void {
  announce(`Changed from ${from} to ${to}`, 'polite');
}

/**
 * Announce loading started
 */
export function announceLoadingStarted(): void {
  announce('Loading', 'polite');
}

/**
 * Announce loading completed
 */
export function announceLoadingComplete(): void {
  announce('Loading complete', 'polite');
}

/**
 * Announce new content
 */
export function announceNewContent(count: number, itemType: string): void {
  announce(`${count} new ${itemType}${count > 1 ? 's' : ''} available`, 'polite');
}

/**
 * Announce list position
 */
export function announceListPosition(position: number, total: number, item?: string): void {
  const itemText = item ? `${item}, ` : '';
  announce(`${itemText}item ${position} of ${total}`, 'polite');
}

/**
 * Throttled announcement - prevents rapid announcements
 */
export class AnnouncementThrottler {
  private lastAnnouncement = 0;
  private minDelay: number;

  constructor(minDelay: number = 1000) {
    this.minDelay = minDelay;
  }

  announce(message: string, priority: AnnouncementPriority = 'polite'): void {
    const now = Date.now();
    if (now - this.lastAnnouncement >= this.minDelay) {
      announce(message, priority);
      this.lastAnnouncement = now;
    }
  }

  setMinDelay(delay: number): void {
    this.minDelay = delay;
  }
}

// ============================================================================
// TEST MODE HELPERS
// ============================================================================

/**
 * Global test mode state
 */
let testModeState: TestModeState = {
  isEnabled: false,
  highlightFocus: true,
  showLabels: true,
  announceActions: true,
};

/**
 * Enable or disable accessibility test mode
 */
export function setTestMode(enabled: boolean): void {
  testModeState.isEnabled = enabled;
  if (enabled) {
    console.info('[A11y Test Mode] Enabled');
  }
}

/**
 * Get current test mode state
 */
export function getTestModeState(): TestModeState {
  return { ...testModeState };
}

/**
 * Update test mode configuration
 */
export function updateTestModeConfig(config: Partial<TestModeState>): void {
  testModeState = { ...testModeState, ...config };
  console.info('[A11y Test Mode] Config updated:', testModeState);
}

/**
 * Check if test mode is enabled
 */
export function isTestMode(): boolean {
  return testModeState.isEnabled;
}

/**
 * Log accessibility action in test mode
 */
export function logA11yAction(
  component: string,
  action: string,
  details?: Record<string, unknown>
): void {
  if (testModeState.isEnabled && testModeState.announceActions) {
    console.info(`[A11y Test] ${component}: ${action}`, details || '');
  }
}

/**
 * Generate test ID for accessibility testing
 */
export function generateTestId(component: string, identifier: string): string {
  return `a11y-${component}-${identifier}`;
}

/**
 * Wrap a ref with test mode logging
 */
export function withTestLogging<T extends (...args: unknown[]) => unknown>(
  fn: T,
  componentName: string
): T {
  return ((...args: unknown[]) => {
    if (testModeState.isEnabled) {
      logA11yAction(componentName, 'called', { args });
    }
    return fn(...args);
  }) as T;
}

/**
 * Accessibility test helpers for use in tests
 */
export const a11yTestHelpers = {
  /**
   * Check if element is accessible
   */
  isAccessible: (element: { accessible?: boolean }): boolean => {
    return element.accessible !== false;
  },

  /**
   * Check if element has accessibility label
   */
  hasLabel: (element: { accessibilityLabel?: string }): boolean => {
    return Boolean(element.accessibilityLabel);
  },

  /**
   * Check if element has accessibility hint
   */
  hasHint: (element: { accessibilityHint?: string }): boolean => {
    return Boolean(element.accessibilityHint);
  },

  /**
   * Check if element has accessibility role
   */
  hasRole: (element: { accessibilityRole?: string }): boolean => {
    return Boolean(element.accessibilityRole);
  },

  /**
   * Get all accessibility props from an element
   */
  getA11yProps: (element: Record<string, unknown>): Record<string, unknown> => {
    const props: Record<string, unknown> = {};
    const a11yKeys = [
      'accessible',
      'accessibilityLabel',
      'accessibilityHint',
      'accessibilityRole',
      'accessibilityState',
      'accessibilityValue',
      'accessibilityLiveRegion',
      'accessibilityActions',
      'onAccessibilityAction',
      'onAccessibilityTap',
      'onMagicTap',
      'importantForAccessibility',
    ];
    for (const key of a11yKeys) {
      if (key in element) {
        props[key] = element[key];
      }
    }
    return props;
  },

  /**
   * Validate accessibility props
   */
  validateA11yProps: (
    element: Record<string, unknown>,
    requiredProps: string[] = ['accessibilityLabel']
  ): { valid: boolean; missing: string[] } => {
    const a11yProps = a11yTestHelpers.getA11yProps(element);
    const missing = requiredProps.filter(
      (prop) => !(prop in a11yProps) || a11yProps[prop] === ''
    );
    return {
      valid: missing.length === 0,
      missing,
    };
  },
};

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * All accessibility utilities in one object
 */
export const a11y = {
  // Screen reader
  isScreenReaderEnabled,
  getScreenReaderState,
  subscribeToScreenReaderChange,
  isReduceMotionEnabled,
  isBoldTextEnabled,
  isGrayscaleEnabled,
  isInvertColorsEnabled,
  isLargerTextEnabled,
  getAccessibilityPreferences,

  // Label generators
  generateAccessibilityLabel,
  generateButtonLabel,
  generateToggleLabel,
  generateCheckboxLabel,
  generateRadioLabel,
  generateTabLabel,
  generateProgressLabel,
  generateSliderLabel,
  generateSearchLabel,
  generateLinkLabel,
  generateImageLabel,
  generateListItemLabel,
  generateNavigationLabel,
  generateAlertLabel,
  generateModalLabel,

  // Focus management
  focusRef,
  setAccessibilityFocus,
  requestFocus,
  clearFocus,

  // State helpers
  createAccessibilityState,
  mergeAccessibilityStates,
  disabledState,
  selectedState,
  checkedState,
  busyState,
  expandedState,
  getDisabledState,
  getLoadingState,

  // Semantic annotations
  getSemanticRole,
  getSemanticTraits,
  createSemanticProps,
  navigationRegion,
  mainRegion,
  complementaryRegion,
  dialogRegion,

  // Announcements
  announce,
  announceSuccess,
  announceError,
  announceWarning,
  announceStateChange,
  announceLoadingStarted,
  announceLoadingComplete,
  announceNewContent,
  announceListPosition,
  AnnouncementThrottler,

  // Test mode
  setTestMode,
  getTestModeState,
  updateTestModeConfig,
  isTestMode,
  logA11yAction,
  generateTestId,
  withTestLogging,
  a11yTestHelpers,
};

export default a11y;
