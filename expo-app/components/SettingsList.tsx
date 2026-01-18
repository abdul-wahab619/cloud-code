/**
 * Settings List Component
 * Reusable settings list items with various configurations
 */

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../lib/styles';
import { spacing } from '../lib/tokens/spacing';
import { haptics } from '../lib/haptics';
import { Toggle } from './Toggle';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';

export interface SettingItem {
  id: string;
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  type?: 'button' | 'toggle' | 'info';
  value?: boolean;
  onPress?: () => void;
  onValueChange?: (value: boolean) => void;
  destructive?: boolean;
  rightElement?: React.ReactNode;
}

interface SettingsListProps {
  items: SettingItem[];
  style?: any;
  showDividers?: boolean;
}

export function SettingsList({ items, style, showDividers = true }: SettingsListProps) {
  return (
    <View style={[styles.container, style]}>
      {items.map((item, index) => (
        <SettingItem
          key={item.id}
          {...item}
          showDivider={showDividers && index < items.length - 1}
        />
      ))}
    </View>
  );
}

interface SettingItemProps extends SettingItem {
  showDivider: boolean;
}

function SettingItem({
  title,
  description,
  icon,
  type = 'button',
  value,
  onPress,
  onValueChange,
  destructive = false,
  rightElement,
  showDivider,
}: SettingItemProps) {
  const handlePress = () => {
    if (type === 'button' && onPress) {
      haptics.buttonPress();
      onPress();
    }
  };

  const Wrapper = type === 'button' ? Pressable : View;
  const wrapperProps =
    type === 'button'
      ? {
          onPress: handlePress,
          style: ({ pressed }: { pressed: boolean }) => [
            styles.itemContainer,
            pressed && styles.pressed,
          ],
        }
      : { style: styles.itemContainer };

  return (
    <>
      <Wrapper {...wrapperProps}>
        {icon && (
          <View style={styles.iconContainer}>
            <Ionicons
              name={icon}
              size={20}
              color={destructive ? colors.error : colors.mutedForeground}
            />
          </View>
        )}
        <View style={styles.contentContainer}>
          <Text
            style={[
              styles.title,
              destructive && styles.destructiveText,
              type === 'info' && styles.infoTitle,
            ]}
          >
            {title}
          </Text>
          {description && (
            <Text style={styles.description}>{description}</Text>
          )}
        </View>
        <View style={styles.rightContainer}>
          {type === 'toggle' && onValueChange && (
            <Toggle
              value={value ?? false}
              onValueChange={onValueChange}
              accessibilityLabel={`Toggle ${title}`}
            />
          )}
          {type === 'button' && !rightElement && (
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          )}
          {rightElement && rightElement}
        </View>
      </Wrapper>
      {showDivider && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
    gap: spacing[0.5],
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  infoTitle: {
    fontWeight: '400',
    color: colors.mutedForeground,
  },
  description: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  rightContainer: {
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 56, // Align after icon container
  },
  destructiveText: {
    color: colors.error,
  },
});
