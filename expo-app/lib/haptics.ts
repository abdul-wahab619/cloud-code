/**
 * Haptics Utility
 * Provides haptic feedback for enhanced UX
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback types
 */
export type HapticType =
  | 'light'      // Subtle tap feedback
  | 'medium'     // Moderate tap feedback
  | 'heavy'      // Strong tap feedback
  | 'success'    // Success indication
  | 'warning'    // Warning indication
  | 'error'      // Error indication
  | 'selection'  // Selection changed
  | 'impact'     // Impact feedback
  | 'none';      // No feedback

/**
 * Check if haptics are supported (iOS and some Android devices)
 */
export const isHapticsSupported = (): boolean => {
  return Platform.OS !== 'web';
};

/**
 * Trigger haptic feedback
 */
export const triggerHaptic = async (type: HapticType = 'light'): Promise<void> => {
  if (!isHapticsSupported()) return;

  try {
    switch (type) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'selection':
        await Haptics.selectionAsync();
        break;
      case 'impact':
        await Haptics.impactAsync();
        break;
      case 'none':
      default:
        break;
    }
  } catch (error) {
    // Silently fail if haptics aren't supported
    console.debug('Haptic feedback not available:', error);
  }
};

/**
 * Haptic presets for common actions
 */
export const haptics = {
  // Button press
  buttonPress: () => triggerHaptic('light'),

  // Toggle switch
  toggle: () => triggerHaptic('light'),

  // Selection changed (picker, etc)
  selection: () => triggerHaptic('selection'),

  // Modal open
  modalOpen: () => triggerHaptic('medium'),

  // Modal close
  modalClose: () => triggerHaptic('light'),

  // Success notification
  success: () => triggerHaptic('success'),

  // Error notification
  error: () => triggerHaptic('error'),

  // Warning notification
  warning: () => triggerHaptic('warning'),

  // Delete action
  delete: () => triggerHaptic('heavy'),

  // Refresh/pull-to-release
  refresh: () => triggerHaptic('medium'),

  // Swipe action
  swipe: () => triggerHaptic('light'),

  // Tab change
  tabChange: () => triggerHaptic('selection'),

  // Checkbox toggle
  checkbox: () => triggerHaptic('light'),

  // Card press
  cardPress: () => triggerHaptic('light'),

  // Long press
  longPress: () => triggerHaptic('medium'),

  // Shake to undo
  shakeToUndo: () => triggerHaptic('heavy'),
} as const;

/**
 * React hook for haptics
 */
export const useHaptics = () => {
  return {
    trigger: triggerHaptic,
    ...haptics,
    isSupported: isHapticsSupported(),
  };
};

export default haptics;
