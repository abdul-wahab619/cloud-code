/**
 * SwipeableItem Component
 * Provides swipe-to-actions for list items
 */

import React, { useRef } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
  GestureResponderGestureState,
} from 'react-native';
import { colors } from '../lib/tokens/colors';
import { triggerHaptic } from '../lib/haptics';

const SCREEN_WIDTH = Dimensions.get('window').width';
const SWIPE_THRESHOLD = 80;

export interface SwipeAction {
  label: string;
  icon: string;
  color: string;
  backgroundColor: string;
  onPress: () => void;
}

interface SwipeableItemProps {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  overswipe?: number; // How far past the action to reveal (0-1)
  enabled?: boolean;
}

export function SwipeableItem({
  children,
  leftActions = [],
  rightActions = [],
  onSwipeStart,
  onSwipeEnd,
  overswipe = 0.2,
  enabled = true,
}: SwipeableItemProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);
  const swipeDirection = useRef<'left' | 'right' | null>(null);
  const activeAction = useRef<number | null>(null);

  const totalLeftWidth = leftActions.reduce((acc, action) => acc + (action.icon ? 60 : 80), 0);
  const totalRightWidth = rightActions.reduce((acc, action) => acc + (action.icon ? 60 : 80), 0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (!enabled) return false;
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
      },
      onPanResponderGrant: () => {
        translateX.setOffset(lastOffset.current);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (!enabled) return;

        const { dx } = gestureState;

        // Determine swipe direction
        if (dx > 0 && leftActions.length > 0) {
          swipeDirection.current = 'right'; // Swiping right reveals left actions
        } else if (dx < 0 && rightActions.length > 0) {
          swipeDirection.current = 'left'; // Swiping left reveals right actions
        }

        // Constrain the translation
        let newTranslateX = dx;
        if (swipeDirection.current === 'right') {
          newTranslateX = Math.min(Math.max(dx, 0), totalLeftWidth * (1 + overswipe));
        } else if (swipeDirection.current === 'left') {
          newTranslateX = Math.max(Math.min(dx, 0), -totalRightWidth * (1 + overswipe));
        } else {
          // No actions in this direction
          newTranslateX = 0;
        }

        translateX.setValue(newTranslateX);

        // Determine which action is active
        if (swipeDirection.current === 'right') {
          const actionIndex = Math.floor(dx / (totalLeftWidth / leftActions.length));
          if (actionIndex !== activeAction.current && actionIndex >= 0 && actionIndex < leftActions.length) {
            activeAction.current = actionIndex;
            triggerHaptic('selection');
          }
        } else if (swipeDirection.current === 'left') {
          const actionIndex = Math.floor(Math.abs(dx) / (totalRightWidth / rightActions.length));
          if (actionIndex !== activeAction.current && actionIndex >= 0 && actionIndex < rightActions.length) {
            activeAction.current = actionIndex;
            triggerHaptic('selection');
          }
        }

        if (dx !== 0 && !onSwipeStart) {
          triggerHaptic('light');
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!enabled) return;

        const { dx } = gestureState;
        let shouldSnapTo = 0;
        let triggeredAction: SwipeAction | null = null;

        if (swipeDirection.current === 'right' && dx > 0) {
          // Swiping right - check left actions
          const actionWidth = totalLeftWidth / leftActions.length;
          const actionIndex = Math.floor(dx / actionWidth);
          if (dx >= actionWidth * 0.7 && actionIndex >= 0 && actionIndex < leftActions.length) {
            shouldSnapTo = (actionIndex + 1) * actionWidth;
            triggeredAction = leftActions[actionIndex];
          }
        } else if (swipeDirection.current === 'left' && dx < 0) {
          // Swiping left - check right actions
          const actionWidth = totalRightWidth / rightActions.length;
          const actionIndex = Math.floor(Math.abs(dx) / actionWidth);
          if (Math.abs(dx) >= actionWidth * 0.7 && actionIndex >= 0 && actionIndex < rightActions.length) {
            shouldSnapTo = -(actionIndex + 1) * actionWidth;
            triggeredAction = rightActions[actionIndex];
          }
        }

        // Animate to snap position or back to 0
        Animated.spring(translateX, {
          toValue: shouldSnapTo,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start(async () => {
          if (triggeredAction) {
            await new Promise(resolve => setTimeout(resolve, 100));
            triggeredAction.onPress();

            // Reset after action
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          } else {
            // Reset to 0
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start(() => {
              lastOffset.current = 0;
              swipeDirection.current = null;
              activeAction.current = null;
            });
          }
        });

        lastOffset.current = shouldSnapTo;
      },
    })
  ).current;

  const renderLeftActions = () => {
    if (leftActions.length === 0) return null;

    const actionWidth = SCREEN_WIDTH / leftActions.length;

    return (
      <View style={[styles.actionsContainer, styles.actionsLeft]}>
        {leftActions.map((action, index) => (
          <View
            key={`left-${index}`}
            style={[
              styles.actionItem,
              { backgroundColor: action.backgroundColor, width: actionWidth },
            ]}
          >
            <View style={styles.actionContent}>
              <View style={[styles.actionIcon, { backgroundColor: action.color }]}>
                <View style={[styles.actionIconLine, { backgroundColor: action.color }]} />
              </View>
              <View style={[styles.actionTextContainer]}>
                <View style={[styles.actionTextLine, { backgroundColor: action.color }]} />
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderRightActions = () => {
    if (rightActions.length === 0) return null;

    const actionWidth = SCREEN_WIDTH / rightActions.length;

    return (
      <View style={[styles.actionsContainer, styles.actionsRight]}>
        {rightActions.map((action, index) => (
          <View
            key={`right-${index}`}
            style={[
              styles.actionItem,
              { backgroundColor: action.backgroundColor, width: actionWidth },
            ]}
          >
            <View style={styles.actionContent}>
              <View style={[styles.actionIcon, { backgroundColor: action.color }]}>
                <View style={[styles.actionIconLine, { backgroundColor: action.color }]} />
              </View>
              <View style={[styles.actionTextContainer]}>
                <View style={[styles.actionTextLine, { backgroundColor: action.color }]} />
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderLeftActions()}
      {renderRightActions()}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.content,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  content: {
    backgroundColor: colors.card,
    zIndex: 1,
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 0,
  },
  actionsLeft: {
    left: 0,
  },
  actionsRight: {
    right: 0,
  },
  actionItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionContent: {
    alignItems: 'center',
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionIconLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  actionTextContainer: {
    width: 50,
  },
  actionTextLine: {
    height: 8,
    borderRadius: 4,
    width: '100%',
  },
});

export default SwipeableItem;
