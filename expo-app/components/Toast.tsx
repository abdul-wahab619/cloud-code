import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import {
  PanGestureHandler,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/styles';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onDismiss: (id: string) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const TOAST_WIDTH = SCREEN_WIDTH - 32;

const TOAST_CONFIG = {
  success: {
    bgColor: colors.success,
    iconName: 'checkmark-circle',
  },
  error: {
    bgColor: colors.error,
    iconName: 'close-circle',
  },
  warning: {
    bgColor: colors.warning,
    iconName: 'warning',
  },
  info: {
    bgColor: colors.brand,
    iconName: 'information-circle',
  },
};

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

export function Toast({ id, message, type, duration, onDismiss }: ToastProps) {
  const translateX = useRef(new Animated.Value(-TOAST_WIDTH - 16)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  const config = TOAST_CONFIG[type];
  const totalDuration = duration ?? DEFAULT_DURATIONS[type];

  useEffect(() => {
    // Slide in animation
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Progress bar animation
    progressWidth.setValue(0);
    Animated.timing(progressWidth, {
      toValue: 1,
      duration: totalDuration,
      useNativeDriver: false,
    }).start();

    // Auto-dismiss timer
    const timer = setTimeout(() => {
      handleDismiss();
    }, totalDuration);

    return () => clearTimeout(timer);
  }, [totalDuration]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -TOAST_WIDTH - 16,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss(id));
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === 4) {
      const { translationX, velocityX } = event.nativeEvent;
      const dismissThreshold = -100;

      if (translationX < dismissThreshold || velocityX < -500) {
        handleDismiss();
      } else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      }
    }
  };

  return (
    <GestureHandlerRootView style={styles.gestureWrapper}>
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={[-10, 10]}
      >
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateX }],
              opacity,
            },
          ]}
        >
          <View style={[styles.toast, { borderLeftColor: config.bgColor }]}>
            <View style={styles.contentRow}>
              <Ionicons
                name={config.iconName as any}
                size={20}
                color={config.bgColor}
                style={styles.icon}
              />
              <Text style={styles.message} numberOfLines={2}>
                {message}
              </Text>
              <Pressable
                onPress={handleDismiss}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
            <View style={styles.progressBarContainer}>
              <Animated.View
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: config.bgColor,
                    width: progressWidth.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          </View>
        </Animated.View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureWrapper: {
    width: '100%',
  },
  toastContainer: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  toast: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  message: {
    flex: 1,
    color: colors.foreground,
    fontSize: 14,
    lineHeight: 20,
    marginRight: 8,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: colors.muted,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});
