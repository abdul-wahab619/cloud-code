/**
 * Toggle Switch Component
 * A customizable toggle switch with haptic feedback and animation support
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  GestureResponderEvent,
} from 'react-native';
import { colors } from '../lib/styles';
import { spacing, borderRadius, touchTarget } from '../lib/tokens/spacing';
import { haptics } from '../lib/haptics';

export interface ToggleProps {
  /** Whether the toggle is on or off */
  value: boolean;
  /** Callback when toggle value changes */
  onValueChange: (value: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant */
  variant?: 'primary' | 'success' | 'warning' | 'error';
  /** Haptic feedback type */
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  /** Additional style for the container */
  style?: any;
  /** Test ID for testing */
  testID?: string;
  /** Accessibility label */
  accessibilityLabel?: string;
}

const sizes = {
  sm: {
    width: 36,
    height: 20,
    thumb: 16,
  },
  md: {
    width: 44,
    height: 24,
    thumb: 20,
  },
  lg: {
    width: 52,
    height: 28,
    thumb: 24,
  },
} as const;

const variantColors = {
  primary: colors.brand,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
} as const;

export function Toggle({
  value,
  onValueChange,
  disabled = false,
  size = 'md',
  variant = 'primary',
  haptic = 'light',
  style,
  testID,
  accessibilityLabel,
}: ToggleProps) {
  const [animatedValue] = useState(new Animated.Value(value ? 1 : 0));

  const handlePress = (event: GestureResponderEvent) => {
    if (disabled) return;

    // Trigger haptic feedback
    if (haptic !== 'none') {
      haptics.toggle();
    }

    const newValue = !value;
    onValueChange(newValue);

    // Animate the thumb
    Animated.timing(animatedValue, {
      toValue: newValue ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const sizeConfig = sizes[size];
  const trackColor = variantColors[variant];

  // Calculate thumb position
  const thumbPosition = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [
      spacing[1], // Left position
      sizeConfig.width - sizeConfig.thumb - spacing[1], // Right position
    ],
  });

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pressable,
        { minHeight: touchTarget.min },
      ]}
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: value ? 'On' : 'Off' }}
    >
      <View
        style={[
          styles.track,
          {
            width: sizeConfig.width,
            height: sizeConfig.height,
            backgroundColor: value ? trackColor : colors.muted,
            opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          },
          style,
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: sizeConfig.thumb,
              height: sizeConfig.thumb,
              transform: [{ translateX: thumbPosition }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    borderRadius: 9999,
    justifyContent: 'center',
    padding: 2,
  },
  thumb: {
    backgroundColor: colors.background,
    borderRadius: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 1,
  },
});

export default Toggle;
