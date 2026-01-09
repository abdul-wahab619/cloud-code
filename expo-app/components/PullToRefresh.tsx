/**
 * PullToRefresh Component
 * Adds pull-to-refresh functionality to any scrollable content
 */

import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
  Platform,
  PanResponderGestureState,
} from 'react-native';
import { colors } from '../lib/tokens/colors';
import { ActivityIndicator } from 'react-native';

const REFRESH_THRESHOLD = 80;
const MAX_PULL_DISTANCE = 120;

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  children: React.ReactNode;
  enabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  refreshing,
  children,
  enabled = true,
}: PullToRefreshProps) {
  const [pullPosition, setPullPosition] = useState(0);
  const [pulling, setPulling] = useState(false);
  const panY = useRef(new Animated.Value(0)).current;
  const lastY = useRef(0);
  const triggerRefresh = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => enabled && !refreshing,
      onMoveShouldSetPanResponder: () => enabled && !refreshing,
      onPanResponderGrant: (evt) => {
        lastY.current = evt.nativeEvent.pageY;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!enabled || refreshing) return;

        const { dy } = gestureState;
        const currentY = evt.nativeEvent.pageY;
        const deltaY = currentY - lastY.current;

        // Only allow pulling down (dy > 0)
        if (dy > 0) {
          const newPullPosition = Math.min(dy, MAX_PULL_DISTANCE);
          setPullPosition(newPullPosition);
          panY.setValue(newPullPosition);

          // Update rotation based on pull progress
          const progress = Math.min(newPullPosition / REFRESH_THRESHOLD, 1);
          rotation.setValue(progress);

          setPulling(true);

          // Check if we've crossed the threshold
          if (newPullPosition >= REFRESH_THRESHOLD && !triggerRefresh.current) {
            triggerRefresh.current = true;
          } else if (newPullPosition < REFRESH_THRESHOLD) {
            triggerRefresh.current = false;
          }
        }
      },
      onPanResponderRelease: async () => {
        if (!pulling) return;

        setPulling(false);

        if (triggerRefresh.current) {
          // Trigger refresh
          triggerRefresh.current = false;
          Animated.spring(panY, {
            toValue: REFRESH_THRESHOLD,
            useNativeDriver: Platform.OS !== 'web',
          }).start();

          await onRefresh();

          // Reset after refresh
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: Platform.OS !== 'web',
          }).start(() => {
            setPullPosition(0);
            rotation.setValue(0);
          });
        } else {
          // Snap back
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: Platform.OS !== 'web',
          }).start(() => {
            setPullPosition(0);
            rotation.setValue(0);
          });
        }
      },
    })
  ).current;

  const pullProgress = Math.min(pullPosition / REFRESH_THRESHOLD, 1);
  const rotation = useRef(new Animated.Value(0)).current;

  return (
    <View style={styles.container}>
      {/* Loading indicator */}
      <Animated.View
        style={[
          styles.refreshIndicator,
          {
            transform: [{ translateY: panY.interpolate({
              inputRange: [0, MAX_PULL_DISTANCE],
              outputRange: [-60, MAX_PULL_DISTANCE - 60],
            }) }],
          },
        ]}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <Animated.View
            style={{
              transform: [{ rotate: rotation.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '180deg'],
              }) }],
            }}
          >
            <View style={styles.arrow} />
          </Animated.View>
        )}
      </Animated.View>

      {/* Content with pan responder */}
      <View {...panResponder.panHandlers} style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  refreshIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
    zIndex: 10,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 12,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.brand,
  },
  content: {
    flex: 1,
  },
});

export default PullToRefresh;
